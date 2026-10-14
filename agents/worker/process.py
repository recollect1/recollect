"""One background job = one closed session (CLAUDE.md §9.1, §9.2).

Order of work, all after the MCP tool has already answered her:
  1. Extract (Strands on Bedrock) → validate → resolve → write Entity, MENTIONS, RELATED, SAME_AS.
  2. Story prompts for new people and places, from the shared template only (max 3 open).
  3. Markers (§7.1, §7.2) — only when change tracking is on (§1.6). No model involved.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Protocol

from common.phrases import story_prompt_for
from extract.agent import Extractor
from extract.validate import Known, resolve, validate
from markers.graph import KnownEntity, count_references, named_recall, new_entity_rate
from markers.text import text_markers

EXTRACT_QUEUE = "extract"
MAX_OPEN_PROMPTS = 3


class Store(Protocol):
    def get(self, label: str, id_: str) -> dict[str, Any] | None: ...
    def find(self, label: str, **where: Any) -> list[dict[str, Any]]: ...
    def upsert(self, label: str, props: dict[str, Any]) -> None: ...
    def link(self, src: tuple[str, str], type_: str, dst: tuple[str, str], props: dict[str, Any] | None = None) -> None: ...
    def session_quotes(self, session_id: str) -> list[dict[str, Any]]: ...
    def entities(self) -> list[dict[str, Any]]: ...
    def mention_count(self, entity_id: str) -> int: ...
    def session_retold(self, session_id: str) -> bool: ...
    def open_prompts(self) -> int: ...


class NotReady(Exception):
    """The MCP server has not embedded the session yet (it does that right after the tool returns)."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def process_session(store: Store, extractor: Extractor, session_id: str, now: str | None = None) -> dict[str, Any]:
    now = now or _now()
    session = store.get("Session", session_id)
    if session is None:
        return {"skipped": "no such session"}
    quotes = store.session_quotes(session_id)
    if any(not q["embedded"] for q in quotes):
        raise NotReady(session_id)

    household = store.find("Household")[0]
    elder_id = household["elderId"]
    people = [p for p in store.find("Person") if p["id"] != elder_id]
    known = [Known(e["id"], e["name"], tuple(e["aliases"])) for e in store.entities()]
    family = [Known(p["id"], p["name"], tuple(p.get("aliases") or [])) for p in people]

    created: list[dict[str, Any]] = []
    written = {"mentions": 0, "relations": 0}
    # Weekly photo descriptions are a marker series, not life stories (§7.1b): no extraction.
    if session.get("mode") != "photo_desc":
        for q in quotes:
            proposed = extractor.extract(q["text"], [k.name for k in known])
            kept = validate(q["text"], proposed)
            ids: dict[str, str] = {}
            for e in kept.entities:
                match = resolve(e.name, known)
                if match is None:
                    entity = {"id": f"e-{uuid.uuid4()}", "kind": e.kind, "name": e.name, "aliases": [],
                              **({"year": e.year} if e.year else {})}
                    store.upsert("Entity", entity)
                    match = Known(entity["id"], e.name)
                    known.append(match)
                    created.append(entity)
                    person = resolve(e.name, family) if e.kind == "person" else None
                    if person:
                        store.link(("Entity", match.id), "SAME_AS", ("Person", person.id))
                store.link(("Quote", q["id"]), "MENTIONS", ("Entity", match.id), {"span": e.span})
                written["mentions"] += 1
                ids[e.name.lower()] = match.id
            for r in kept.relations:
                a, b = ids.get(r.source.lower()), ids.get(r.target.lower())
                if a and b:
                    store.link(("Entity", a), "RELATED", ("Entity", b), {"label": r.label})
                    written["relations"] += 1

    prompts = 0 if session.get("private") else _story_prompts(store, created)
    marker_set = _markers(store, session, quotes, people, len(created), elder_id, now)
    return {"entities": [e["name"] for e in created], **written, "prompts": prompts,
            "markerSet": marker_set["id"] if marker_set else None}


def _story_prompts(store: Store, created: list[dict[str, Any]]) -> int:
    """§9.1 step 4: a new person or place named once and never told about gets a gentle prompt."""
    room = MAX_OPEN_PROMPTS - store.open_prompts()
    made = 0
    for e in created:
        if made >= room:
            break
        if e["kind"] not in ("person", "place") or store.mention_count(e["id"]) != 1:
            continue
        store.upsert("StoryPrompt", {"id": f"sp-{uuid.uuid4()}", "text": story_prompt_for(e["name"]),
                                     "basedOnEntityId": e["id"], "used": False})
        made += 1
    return made


def _markers(store: Store, session: dict[str, Any], quotes: list[dict[str, Any]], people: list[dict[str, Any]],
             new_entities: int, elder_id: str, now: str) -> dict[str, Any] | None:
    """§7.1 + §7.2 for her own story sessions, only while change tracking is on (§1.6)."""
    if session.get("speakerId") != elder_id:
        return None
    consent = (store.find("Consent", personId=elder_id) or [{}])[0]
    if not consent.get("trackingOn"):
        return None
    utterances = [q["text"] for q in quotes]
    metrics = text_markers(utterances)
    if metrics is None:  # under 50 words: too short to compare with her baseline
        return None
    known_people = [KnownEntity(p["name"], tuple(p.get("aliases") or []), (f"my {p['relation']}",))
                    for p in people if p.get("relation")]
    named, vague = count_references(" ".join(utterances), known_people)
    graph_metrics = {"named_recall": named_recall(named, vague), "new_entity_rate": new_entity_rate(new_entities, 1)}
    marker_set = {
        "id": f"ms-{session['id']}", "sessionId": session["id"], "computedAt": now, "mode": session.get("mode", "story"),
        "simulated": False, "retold": store.session_retold(session["id"]),
        **metrics, **{k: v for k, v in graph_metrics.items() if v is not None},
    }
    store.upsert("MarkerSet", marker_set)
    store.link(("Session", session["id"]), "MEASURED", ("MarkerSet", marker_set["id"]))
    return marker_set
