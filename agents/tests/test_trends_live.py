"""Trends on the live graph (§9.3) with the in-memory store double."""

import json

from tests.test_worker import MemoryStore
from trends.live import SIMULATED_DAILY, daily_counts, marker_sets, run


def seeded(tracking: bool = True) -> MemoryStore:
    store = MemoryStore()
    store.upsert("Household", {"id": "hh", "name": "Kaur", "tz": "Asia/Kolkata", "elderId": "p-gurdev", "adminId": "p-simran"})
    store.upsert("Person", {"id": "p-gurdev", "name": "Gurdev", "role": "elder", "relation": "self", "aliases": []})
    store.upsert("Consent", {"id": "c", "personId": "p-gurdev", "trackingOn": tracking, "fullVoiceOn": False,
                             "byElderAt": "2026-07-18T05:30:00.000Z", "byFamilyAt": None})
    history = json.loads(SIMULATED_DAILY.read_text(encoding="utf-8"))
    for m in history["markerSets"]:  # same flattening the TypeScript seed does
        store.upsert("MarkerSet", {"id": m["id"], "sessionId": m["sessionId"], "computedAt": m["at"], "mode": m["mode"],
                                   "simulated": True, "retold": m.get("retold", False), **m["metrics"]})
    store.upsert("Schedule", {"id": "s1", "medicineId": "m", "time": "08:00"})
    store.upsert("AskEvent", {"id": "a1", "intent": "where_is", "detail": "Aman", "at": "2026-10-14T12:00:00.000Z"})
    store.upsert("AskEvent", {"id": "a2", "intent": "recall", "detail": "x", "at": "2026-10-14T12:00:00.000Z"})
    return store


def test_reads_graph_marker_sets_back_into_analysis_shape():
    sets = marker_sets(seeded())
    assert len(sets) == 72 and all(s["simulated"] for s in sets)
    assert "mattr" in sets[0]["metrics"] and "id" not in sets[0]["metrics"]


def test_daily_counts_use_household_time_and_orientation_intents_only():
    d = daily_counts(seeded(), "Asia/Kolkata")
    assert d == [{"date": "2026-10-14", "simulated": False, "orientation_asks": 1, "evening_asks": 1,
                  "doses_due": 1, "doses_taken": 0}]  # 12:00Z is 17:30 IST: evening


def test_writes_card_flags_and_report_labelled_simulated():
    store = seeded()
    card = run(store, now="2026-10-15T04:30:00Z")
    assert card and card["kind"] == "change" and card["simulated"]
    assert store.get("TrendCard", card["id"])["say"] == card["say"]
    flags = store.find("TrendFlag", status="active")
    assert sorted(f["metric"] for f in flags) == sorted(card["changes"])
    report = store.get("DoctorReport", "report-latest")["html"]
    assert "Simulated data" in report and "not a medical assessment" in report


def test_nothing_written_while_tracking_is_off():
    store = seeded(tracking=False)
    assert run(store) is None
    assert store.find("TrendCard") == [] and store.find("DoctorReport") == []
