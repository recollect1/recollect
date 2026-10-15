"""Extract agent, step 2 (CLAUDE.md §9.1): validate what the model proposed before it is stored.

The model only proposes. Nothing it returns reaches the graph unless it passes these checks:
  - an entity is kept only if its span is exactly a substring of the quote (§6 invariant);
  - a relation is kept only if both ends survived;
  - a kept entity is resolved to an existing one by name, alias, or a small spelling difference.

Pure functions, no I/O, so they are tested without Bedrock or a graph.
"""

from __future__ import annotations

from dataclasses import dataclass, field

KINDS = {"person", "place", "event", "thing"}
MAX_EDITS = 2
# Below this length two edits can turn one name into another ("Aman" -> "Amar"), so short
# names must match exactly.
MIN_FUZZY_LEN = 6


@dataclass(frozen=True)
class Proposed:
    """An entity as proposed by the model for one quote."""

    kind: str
    name: str
    span: str
    year: int | None = None


@dataclass(frozen=True)
class Relation:
    source: str
    target: str
    label: str


@dataclass(frozen=True)
class Known:
    """An entity already in the graph."""

    id: str
    name: str
    aliases: tuple[str, ...] = ()


@dataclass
class Extraction:
    entities: list[Proposed] = field(default_factory=list)
    relations: list[Relation] = field(default_factory=list)


def _norm(text: str) -> str:
    return " ".join(text.lower().split())


def validate(quote: str, extraction: Extraction) -> Extraction:
    """Drop entities whose span is not in the quote, then relations left without both ends."""
    kept: list[Proposed] = []
    seen: set[tuple[str, str]] = set()
    for e in extraction.entities:
        if e.kind not in KINDS or not e.name.strip() or not e.span:
            continue
        if e.span not in quote:
            continue
        # A bare number ("1968") is a year or a count, never a person, place, event or thing.
        if _norm(e.name).replace(" ", "").isdigit():
            continue
        key = (_norm(e.name), e.span)
        if key in seen:
            continue
        seen.add(key)
        kept.append(e)
    names = {_norm(e.name) for e in kept}
    relations = [
        r
        for r in extraction.relations
        if r.label.strip() and _norm(r.source) in names and _norm(r.target) in names
        and _norm(r.source) != _norm(r.target)
    ]
    return Extraction(kept, relations)


def edit_distance(a: str, b: str, limit: int = MAX_EDITS) -> int:
    """Levenshtein distance, cut off early once it must exceed `limit`."""
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        if min(current) > limit:
            return limit + 1
        previous = current
    return previous[-1]


def resolve(name: str, known: list[Known]) -> Known | None:
    """The existing entity this name refers to, or None if it is new.

    Exact name or alias first. Otherwise a spelling within two edits, but only for longer names
    and only when exactly one existing entity is that close.
    """
    want = _norm(name)
    for k in known:
        if want in {_norm(k.name), *(_norm(a) for a in k.aliases)}:
            return k
    if len(want) < MIN_FUZZY_LEN:
        return None
    close = [
        k
        for k in known
        if any(
            len(_norm(n)) >= MIN_FUZZY_LEN and edit_distance(want, _norm(n)) <= MAX_EDITS
            for n in (k.name, *k.aliases)
        )
    ]
    return close[0] if len(close) == 1 else None
