"""Trends agent on the live graph (CLAUDE.md §9.3): `python -m trends --graph`, and weekly from the worker.

Reads every MarkerSet (the simulated demo history and the worker's live ones), builds daily
orientation and dose counts from AskEvent / DoseEvent, runs the same analysis as the file mode, and
writes the TrendCard, TrendFlags and the printable DoctorReport back into the graph. Templates only;
nothing runs while change tracking is off (§1.6).
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol
from zoneinfo import ZoneInfo

from markers.graph import EVENING, ORIENTATION_INTENTS
from trends.detect import analyse, trend_card
from trends.report import build_report

SIMULATED_DAILY = Path(__file__).resolve().parents[2] / "data" / "simulated" / "markers.json"
BASE_KEYS = {"id", "sessionId", "computedAt", "mode", "simulated", "retold"}


class Store(Protocol):
    def find(self, label: str, **where: Any) -> list[dict[str, Any]]: ...
    def upsert(self, label: str, props: dict[str, Any]) -> None: ...
    def link(self, src: tuple[str, str], type_: str, dst: tuple[str, str], props: dict[str, Any] | None = None) -> None: ...


def marker_sets(store: Store) -> list[dict[str, Any]]:
    """Graph MarkerSets (flat properties) → the shape `analyse` takes."""
    out = []
    for m in store.find("MarkerSet"):
        out.append({
            "id": m["id"], "at": m["computedAt"], "mode": m.get("mode", "story"),
            "simulated": bool(m.get("simulated")), "retold": bool(m.get("retold")),
            "metrics": {k: v for k, v in m.items() if k not in BASE_KEYS and isinstance(v, (int, float)) and not isinstance(v, bool)},
        })
    return sorted(out, key=lambda m: m["at"])


def daily_counts(store: Store, tz: str) -> list[dict[str, Any]]:
    """Per local day: orientation questions, those asked in the evening, doses due and taken."""
    zone = ZoneInfo(tz)
    day = lambda iso: datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(zone)  # noqa: E731
    days: dict[str, dict[str, Any]] = defaultdict(lambda: {"orientation_asks": 0, "evening_asks": 0, "doses_due": 0, "doses_taken": 0})
    for a in store.find("AskEvent"):
        if a.get("intent") not in ORIENTATION_INTENTS:
            continue
        t = day(a["at"])
        d = days[t.date().isoformat()]
        d["orientation_asks"] += 1
        if EVENING[0] <= t.hour < EVENING[1]:
            d["evening_asks"] += 1
    for e in store.find("DoseEvent"):
        days[day(e["at"]).date().isoformat()]["doses_taken"] += 1
    per_day_due = len(store.find("Schedule"))
    for d in days.values():
        d["doses_due"] = max(per_day_due, d["doses_taken"])
    return [{"date": k, "simulated": False, **v} for k, v in sorted(days.items())]


def run(store: Store, now: str | None = None) -> dict[str, Any] | None:
    """Analyse and write the card, flags and report. Returns the card, or None when tracking is off."""
    now = now or datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    household = store.find("Household")[0]
    elder = next(p for p in store.find("Person") if p["id"] == household["elderId"])
    consent = (store.find("Consent", personId=elder["id"]) or [{}])[0]
    if not consent.get("trackingOn"):
        return None

    sets = marker_sets(store)
    daily = daily_counts(store, household["tz"])
    if any(m["simulated"] for m in sets) and SIMULATED_DAILY.exists():
        # The demo history is simulated; its daily counts come from the same generator.
        simulated_daily = json.loads(SIMULATED_DAILY.read_text(encoding="utf-8"))["daily"]
        live_dates = {d["date"] for d in daily}
        daily = sorted([d for d in simulated_daily if d["date"] not in live_dates] + daily, key=lambda d: d["date"])

    analysis = analyse(sets, daily)
    card = trend_card(analysis, elder["id"], elder["name"], now)
    store.upsert("TrendCard", card)
    for metric in card["changes"]:
        flag = {"id": f"tf-{metric}", "metric": metric, "direction": "worse", "since": card.get("since", ""),
                "weeks": card["weeks"], "status": "active", "updatedAt": now, "simulated": card["simulated"]}
        store.upsert("TrendFlag", flag)
        store.link(("TrendFlag", flag["id"]), "ABOUT", ("Person", elder["id"]))
    for old in store.find("TrendFlag", status="active"):
        if old["metric"] not in card["changes"]:
            store.upsert("TrendFlag", {"id": old["id"], "status": "cleared", "updatedAt": now})
    report = build_report(analysis, card, elder["name"], daily,
                          {"byElderAt": consent.get("byElderAt") or "", "byFamilyAt": consent.get("byFamilyAt") or ""}, now)
    store.upsert("DoctorReport", {"id": "report-latest", "createdAt": now, "simulated": card["simulated"], "html": report})
    return card
