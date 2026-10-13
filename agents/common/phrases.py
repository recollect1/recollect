"""Trend wording for the family (CLAUDE.md §8), read from the same file the TypeScript side uses.

No model writes trend sentences. These functions only fill fixed templates.
"""

from __future__ import annotations

import json
from pathlib import Path

_SHARED = Path(__file__).resolve().parents[2] / "packages" / "core" / "src" / "trend-phrases.json"
_DATA = json.loads(_SHARED.read_text(encoding="utf-8"))

NOT_MEDICAL: str = _DATA["notMedical"]
BANNED_CLAIMS: list[str] = _DATA["bannedClaims"]
METRICS: dict[str, dict[str, str]] = _DATA["metrics"]
_TEMPLATES: dict[str, str] = _DATA["templates"]


def find_banned(text: str) -> list[str]:
    """Banned claims (§1.2) present in the text, case-insensitive."""
    lowered = text.lower()
    return [w for w in BANNED_CLAIMS if w in lowered]


def _list_of(items: list[str]) -> str:
    if len(items) <= 1:
        return items[0] if items else ""
    return f"{', '.join(items[:-1])} and {items[-1]}"


def trend_stable(name: str, weeks: int) -> str:
    return _TEMPLATES["trendStable"].format(name=name, weeks=weeks, notMedical=NOT_MEDICAL)


def trend_change(name: str, metrics: list[str], since: str) -> str:
    changes = _list_of([METRICS[m]["phrase"] for m in metrics])
    return _TEMPLATES["trendChange"].format(name=name, since=since, changes=changes, notMedical=NOT_MEDICAL)


def trend_not_ready(name: str) -> str:
    return _TEMPLATES["trendNotReady"].format(name=name, notMedical=NOT_MEDICAL)
