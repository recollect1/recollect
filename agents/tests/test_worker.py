"""Worker orchestration (§9.1, §9.2) with a scripted extractor standing in for Bedrock.

The scripted extractor is a test double only; the running worker always uses Strands on Bedrock.
It deliberately proposes a name that is not in the sentence, to prove validation drops it.
"""

from __future__ import annotations

import os
import uuid
from typing import Any

import pytest

from common.phrases import story_prompt_for
from extract.validate import Extraction, Proposed, Relation
from worker.process import NotReady, process_session

RADIO = (
    "In 1983 we listened to the cricket on our radio in the courtyard, the whole street came. "
    "My son Kuldeep sat on the floor next to Bansal uncle and nobody went to sleep that night. "
    "When Kapil Dev lifted the cup, Bansal uncle ran out into the street and gave laddoos to everyone "
    "he could find, even the policeman at the corner of our lane in Patiala."
)


class ScriptedExtractor:
    name = "test:scripted"

    def extract(self, quote: str, known_names: list[str]) -> Extraction:
        ents = [Proposed("place", "Lord's", "Lord's")]  # hallucinated: not in any sentence
        for kind, name in [("thing", "radio"), ("person", "Kuldeep"), ("person", "Kapil Dev"),
                           ("person", "Bansal uncle"), ("place", "Patiala"), ("event", "cricket")]:
            if name in quote:
                ents.append(Proposed(kind, name, name, 1983 if name == "cricket" else None))
        rels = [Relation("Kuldeep", "radio", "listened_to"), Relation("Lord's", "radio", "heard_on")]
        return Extraction(ents, rels)


class MemoryStore:
    """In-memory stand-in for FalkorStore with the same method surface."""

    def __init__(self) -> None:
        self.nodes: dict[str, dict[str, dict[str, Any]]] = {}
        self.edges: list[tuple[tuple[str, str], str, tuple[str, str], dict[str, Any]]] = []

    def get(self, label, id_):
        return self.nodes.get(label, {}).get(id_)

    def find(self, label, **where):
        return [n for n in self.nodes.get(label, {}).values() if all(n.get(k) == v for k, v in where.items())]

    def upsert(self, label, props):
        self.nodes.setdefault(label, {}).setdefault(props["id"], {}).update({k: v for k, v in props.items() if v is not None})

    def link(self, src, type_, dst, props=None):
        self.edges = [e for e in self.edges if not (e[0] == src and e[1] == type_ and e[2] == dst)]
        self.edges.append((src, type_, dst, props or {}))

    def session_quotes(self, session_id):
        qs = [self.nodes["Quote"][d[1]] for s, t, d, _ in self.edges if t == "HAS_QUOTE" and s == ("Session", session_id)]
        return [{"id": q["id"], "text": q["text"], "seq": q["seq"], "embedded": bool(q.get("embedding"))}
                for q in sorted(qs, key=lambda q: q["seq"])]

    def entities(self):
        return [{"id": e["id"], "name": e["name"], "kind": e["kind"], "aliases": e.get("aliases", [])}
                for e in self.nodes.get("Entity", {}).values()]

    def mention_count(self, entity_id):
        return len({s for s, t, d, _ in self.edges if t == "MENTIONS" and d == ("Entity", entity_id)})

    def session_retold(self, session_id):
        return False

    def open_prompts(self):
        return len(self.find("StoryPrompt", used=False))


def build(store, tracking: bool = True, embedded: bool = True, mode: str = "story") -> str:
    store.upsert("Household", {"id": "hh", "name": "Kaur", "tz": "Asia/Kolkata", "elderId": "p-gurdev", "adminId": "p-simran"})
    store.upsert("Person", {"id": "p-gurdev", "name": "Gurdev", "role": "elder", "relation": "self", "aliases": []})
    store.upsert("Person", {"id": "p-kuldeep", "name": "Kuldeep", "role": "family", "relation": "son", "aliases": []})
    store.upsert("Entity", {"id": "e-patiala", "kind": "place", "name": "Patiala", "aliases": []})
    store.upsert("Consent", {"id": "c", "personId": "p-gurdev", "trackingOn": tracking, "fullVoiceOn": False})
    sid = f"ses-{uuid.uuid4()}"
    store.upsert("Session", {"id": sid, "startedAt": "2026-10-14T05:30:00.000Z", "speakerId": "p-gurdev",
                             "mode": mode, "private": False, "hasAudio": False})
    for seq, text in enumerate(s.strip() + ("." if not s.strip().endswith(".") else "") for s in RADIO.split(". ")):
        qid = f"q-{uuid.uuid4()}"
        store.upsert("Quote", {"id": qid, "text": text, "seq": seq, "sessionId": sid, "private": False,
                               **({"embedding": [0.1, 0.2]} if embedded else {})})
        store.link(("Session", sid), "HAS_QUOTE", ("Quote", qid))
    return sid


def test_extracts_validates_links_and_prompts():
    store = MemoryStore()
    sid = build(store)
    out = process_session(store, ScriptedExtractor(), sid, now="2026-10-14T06:00:00.000Z")
    names = {e["name"] for e in store.nodes["Entity"].values()}
    assert "Lord's" not in names  # hallucinated span dropped by validate()
    assert {"radio", "Kuldeep", "Kapil Dev", "Bansal uncle", "cricket"} <= names
    assert sum(1 for e in store.nodes["Entity"].values() if e["name"] == "Patiala") == 1  # resolved, not duplicated
    # Every MENTIONS span is a substring of its quote (§6 invariant).
    for src, t, _, props in store.edges:
        if t == "MENTIONS":
            assert props["span"] in store.nodes["Quote"][src[1]]["text"]
    kuldeep = next(e for e in store.nodes["Entity"].values() if e["name"] == "Kuldeep")
    assert (("Entity", kuldeep["id"]), "SAME_AS", ("Person", "p-kuldeep")) in [(s, t, d) for s, t, d, _ in store.edges]
    assert not any(t == "RELATED" and p.get("label") == "heard_on" for _, t, _, p in store.edges)  # orphan relation dropped
    # Story prompts use the shared template only, at most three open.
    prompts = store.find("StoryPrompt", used=False)
    assert 1 <= len(prompts) <= 3
    assert all(p["text"] == story_prompt_for(store.get("Entity", p["basedOnEntityId"])["name"]) for p in prompts)
    # Markers written, not simulated.
    ms = store.get("MarkerSet", f"ms-{sid}")
    assert ms and ms["simulated"] is False and "mattr" in ms and "new_entity_rate" in ms
    assert out["markerSet"] == ms["id"]


def test_no_markers_without_consent():
    store = MemoryStore()
    sid = build(store, tracking=False)
    out = process_session(store, ScriptedExtractor(), sid)
    assert out["markerSet"] is None and "MarkerSet" not in store.nodes
    assert out["entities"]  # life memory still grows; only change tracking is off


def test_waits_until_the_server_has_embedded_the_session():
    store = MemoryStore()
    sid = build(store, embedded=False)
    with pytest.raises(NotReady):
        process_session(store, ScriptedExtractor(), sid)


def test_photo_descriptions_are_measured_not_extracted():
    store = MemoryStore()
    sid = build(store, mode="photo_desc")
    out = process_session(store, ScriptedExtractor(), sid)
    assert out["entities"] == [] and out["markerSet"]


@pytest.mark.skipif(not os.environ.get("FALKORDB_URL"), reason="needs FalkorDB (FALKORDB_URL)")
def test_against_falkordb():
    from worker.store import FalkorStore

    store = FalkorStore(os.environ["FALKORDB_URL"], graph="recollect_worker_test")
    store._g.query("MATCH (n) DELETE n")
    sid = build(store)
    out = process_session(store, ScriptedExtractor(), sid)
    assert "Kapil Dev" in out["entities"] and out["markerSet"]
    rows = store._g.ro_query("MATCH (q:Quote)-[m:MENTIONS]->(e:Entity) RETURN q.text, m.span").result_set
    assert rows and all(span in text for text, span in rows)
    store._g.delete()


def _wav(path, parts):
    import wave

    import numpy as np

    from tests.test_vad import RATE, recording
    audio = recording(parts)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())


def test_full_voice_adds_timing_markers_and_deletes_the_audio(tmp_path, monkeypatch):
    from worker import process as proc
    monkeypatch.setattr(proc, "AUDIO_DIR", tmp_path)
    _wav(tmp_path / "a1.wav", [("speech", 3.0), ("pause", 2.5), ("speech", 2.0)])
    store = MemoryStore()
    sid = build(store)
    store.upsert("Consent", {"id": "c", "personId": "p-gurdev", "trackingOn": True, "fullVoiceOn": True})
    out = process_session(store, ScriptedExtractor(), sid, audio_ref="a1.wav")
    ms = store.get("MarkerSet", out["markerSet"])
    assert ms["long_pause_rate"] > 0 and 0 < ms["phonation_ratio"] < 1 and ms["speech_rate_wpm"] > 0
    assert not (tmp_path / "a1.wav").exists()


def test_audio_is_deleted_unanalysed_without_full_voice_consent(tmp_path, monkeypatch):
    from worker import process as proc
    monkeypatch.setattr(proc, "AUDIO_DIR", tmp_path)
    _wav(tmp_path / "a2.wav", [("speech", 2.0)])
    store = MemoryStore()
    sid = build(store)  # trackingOn, fullVoiceOn false
    out = process_session(store, ScriptedExtractor(), sid, audio_ref="a2.wav")
    assert "pause_rate" not in store.get("MarkerSet", out["markerSet"])
    assert not (tmp_path / "a2.wav").exists()


def test_audio_ref_cannot_escape_the_audio_folder(tmp_path, monkeypatch):
    from worker import process as proc
    monkeypatch.setattr(proc, "AUDIO_DIR", tmp_path / "audio")
    outside = tmp_path / "keep.wav"
    outside.write_bytes(b"x")
    store = MemoryStore()
    process_session(store, ScriptedExtractor(), build(store), audio_ref="../keep.wav")
    assert outside.exists()


def test_without_bedrock_markers_still_run_and_audio_is_deleted(tmp_path, monkeypatch):
    from worker import process as proc
    monkeypatch.setattr(proc, "AUDIO_DIR", tmp_path)
    _wav(tmp_path / "a3.wav", [("speech", 2.0)])
    store = MemoryStore()
    sid = build(store)
    out = process_session(store, None, sid, audio_ref="a3.wav")
    assert out["entities"] == [] and out["markerSet"]
    assert not (tmp_path / "a3.wav").exists()
