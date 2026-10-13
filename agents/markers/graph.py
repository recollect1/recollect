"""Graph markers (CLAUDE.md §7.2) and timing markers (§7.3) as pure functions.

The worker gathers the inputs from the graph (or from a voice-activity detector); nothing here
does I/O, so each marker can be tested on hand-made values.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

ORIENTATION_INTENTS = {"whats_today", "where_is", "check_dose", "who_is"}
EVENING = (16, 22)  # 16:00–22:00 household time: late-day confusion
NIGHT = (0, 5)
GENERIC_VAGUE = ("that man", "that woman", "that boy", "that girl", "that lady", "that fellow",
                 "that person", "that place", "that one", "what's his name", "what's her name")


@dataclass(frozen=True)
class KnownEntity:
    """A person or place whose relation is known, e.g. Aman, the grandson."""

    name: str
    aliases: tuple[str, ...] = ()
    #: Ways of pointing at them without the name: "my grandson", "my son's boy".
    relation_phrases: tuple[str, ...] = ()


def _count(text: str, phrase: str) -> int:
    return len(re.findall(r"(?<![a-z])" + re.escape(phrase.lower()) + r"(?![a-z])", text))


def count_references(text: str, known: list[KnownEntity]) -> tuple[int, int]:
    """(by name, by vague reference) for the known people and places in this text."""
    lowered = text.lower()
    named = sum(_count(lowered, n) for k in known for n in (k.name, *k.aliases))
    vague = sum(_count(lowered, p) for k in known for p in k.relation_phrases)
    vague += sum(_count(lowered, p) for p in GENERIC_VAGUE)
    return named, vague


def named_recall(named: int, vague: int) -> float | None:
    """Share of references made by name. None when nobody known was mentioned."""
    total = named + vague
    return round(named / total, 4) if total else None


def retell_rate(stories_retold: list[bool]) -> float | None:
    """Share of this week's stories that repeat an earlier one (a RETELLS edge, similarity ≥ 0.85)."""
    return round(sum(stories_retold) / len(stories_retold), 4) if stories_retold else None


def new_entity_rate(new_entities: int, stories: int) -> float | None:
    """New people, places and events per story."""
    return round(new_entities / stories, 4) if stories else None


def orientation(asks: list[tuple[str, int]], days: int = 1) -> dict[str, float | int | None]:
    """Orientation questions from (intent, household-local hour) pairs over `days` days."""
    hours = [hour for intent, hour in asks if intent in ORIENTATION_INTENTS]
    evening = sum(1 for h in hours if EVENING[0] <= h < EVENING[1])
    return {
        "orientation_asks": round(len(hours) / days, 4),
        "evening_orientation_share": round(evening / len(hours), 4) if hours else None,
        "night_asks": sum(1 for h in hours if NIGHT[0] <= h < NIGHT[1]),
    }


def timing_markers(voiced: list[tuple[float, float]], total_s: float, word_count: int) -> dict[str, float] | None:
    """§7.3 from voiced intervals (start, end) in seconds. The audio itself is never kept."""
    voiced = sorted((s, e) for s, e in voiced if e > s)
    voiced_s = sum(e - s for s, e in voiced)
    if not voiced or voiced_s <= 0 or total_s <= 0:
        return None
    gaps = [b[0] - a[1] for a, b in zip(voiced, voiced[1:])]
    pauses = [g for g in gaps if g >= 0.5]
    minutes = voiced_s / 60
    return {
        "pause_rate": round(len(pauses) / minutes, 4),
        "mean_pause_s": round(sum(pauses) / len(pauses), 4) if pauses else 0.0,
        "long_pause_rate": round(sum(1 for p in pauses if p >= 2.0) / minutes, 4),
        "speech_rate_wpm": round(word_count / minutes, 4),
        "phonation_ratio": round(voiced_s / total_s, 4),
    }
