"""§15 trend tests on synthetic histories, plus checks on the demo generator."""

from datetime import date, datetime, time, timedelta, timezone

from common import phrases
from synth.generate import DRIFT_FROM_WEEK, generate
from trends.detect import analyse, trend_card

START = date(2026, 7, 20)
BASE = {"mean_pause_s": 0.8, "mattr": 0.72, "named_recall": 0.9, "vague_rate": 1.5}
#: Tiny, fixed wobble so the baseline has a spread without randomness.
WOBBLE = (-0.02, 0.01, 0.0, 0.02, -0.01)


def history(weeks: int = 10, change=lambda week, metric, value: value) -> list[dict]:
    """Five stories a week. `change` may alter a metric's value in a given week (1-based)."""
    sets = []
    for week in range(1, weeks + 1):
        for i in range(5):
            day = START + timedelta(weeks=week - 1, days=i)
            metrics = {m: change(week, m, v * (1 + WOBBLE[(i + week) % 5])) for m, v in BASE.items()}
            sets.append({
                "at": datetime.combine(day, time(5, 30), timezone.utc).isoformat(),
                "mode": "story", "metrics": metrics, "retold": False,
            })
    return sets


def card_for(sets, daily=None):
    return trend_card(analyse(sets, daily), "p-gurdev", "Gurdev", "2026-10-12T00:00:00Z")


def test_stable_history_raises_no_flag():
    a = analyse(history())
    assert a.ready and a.flagged == []
    card = card_for(history())
    assert card["kind"] == "stable"
    assert card["say"] == "Gurdev's speech has stayed close to their usual pattern over the last 10 weeks. This is not a medical assessment."


def test_one_bad_week_raises_no_flag():
    bad = lambda week, metric, value: value * 2 if week == 10 and metric in ("mean_pause_s", "vague_rate") else value
    assert analyse(history(change=bad)).flagged == []
    three = lambda week, metric, value: value * 2 if week >= 8 and metric in ("mean_pause_s", "vague_rate") else value
    assert analyse(history(change=three)).flagged == []  # three weeks is still not four


def test_four_week_drift_on_two_metrics_raises_the_card():
    def drift(week, metric, value):
        if week >= 7 and metric == "mean_pause_s":
            return value * 1.5
        if week >= 6 and metric == "named_recall":
            return value * 0.7
        return value

    a = analyse(history(change=drift))
    assert a.flagged == ["mean_pause_s", "named_recall"]
    assert a.series["mean_pause_s"].run_start == 6 and a.series["named_recall"].run_start == 5
    card = card_for(history(change=drift))
    assert card["kind"] == "change" and card["changes"] == ["mean_pause_s", "named_recall"]
    # Week 6 starts on 24 August 2026.
    assert card["say"] == ("Since August, Gurdev pauses longer and names familiar people less often. "
                           "Worth mentioning at the next check-up. This is not a medical assessment.")


def test_drift_on_one_metric_only_stays_stable():
    drift = lambda week, metric, value: value * 1.5 if week >= 6 and metric == "mean_pause_s" else value
    assert analyse(history(change=drift)).flagged == ["mean_pause_s"]
    assert card_for(history(change=drift))["kind"] == "stable"


def test_a_change_in_the_better_direction_is_never_flagged():
    better = lambda week, metric, value: value * 0.5 if week >= 6 and metric in ("mean_pause_s", "vague_rate") else value
    assert analyse(history(change=better)).flagged == []


def test_a_drift_that_recovered_is_not_flagged():
    past = lambda week, metric, value: value * 1.5 if 3 <= week <= 8 and metric in ("mean_pause_s", "vague_rate") else value
    assert analyse(history(change=past)).flagged == []


def test_too_little_data_gives_the_not_ready_card():
    few = history(weeks=1)[:4]
    assert not analyse(few).ready
    assert card_for(few)["say"] == phrases.trend_not_ready("Gurdev")
    assert not analyse([]).ready


def test_weekly_metrics_retells_and_orientation():
    sets = history()
    for s in sets:
        week = (datetime.fromisoformat(s["at"]).date() - START).days // 7 + 1
        s["retold"] = week >= 6  # every story from week 6 repeats an earlier one
    daily = []
    for d in range(70):
        late = d >= 35
        daily.append({"date": (START + timedelta(days=d)).isoformat(),
                      "orientation_asks": 9 if late else 3, "evening_asks": 6 if late else 1})
    a = analyse(sets, daily)
    assert a.flagged == ["retell_rate", "orientation_asks", "evening_orientation_share"]
    assert a.series["retell_rate"].weekly[-1] == 1.0
    assert a.series["orientation_asks"].weekly[0] == 3


def test_text_markers_prefer_the_weekly_photo_series():
    sets = history()
    for week in range(1, 11):
        day = START + timedelta(weeks=week - 1, days=2)
        sets.append({"at": datetime.combine(day, time(9, 30), timezone.utc).isoformat(), "mode": "photo_desc",
                     "metrics": {"mattr": 0.72 if week < 6 else 0.5, "vague_rate": 1.5 + 0.01 * (week % 2)}})
    a = analyse(sets)
    assert a.series["mattr"].source == "weekly photo" and a.series["mattr"].flagged
    assert a.series["mean_pause_s"].source == "stories"  # timing never comes from the photo task here


def test_every_card_passes_the_wording_rules():
    for sets in (history(), history(weeks=1)[:3]):
        say = card_for(sets)["say"]
        assert phrases.find_banned(say) == [] and phrases.NOT_MEDICAL in say


def test_synth_is_deterministic_labelled_and_drifts_as_specified():
    h = generate()
    assert h == generate() and h != generate(seed=8)
    assert h["simulated"] is True and all(m["simulated"] for m in h["markerSets"])
    assert len(h["markerSets"]) == 12 * 6 and len(h["daily"]) == 84
    a = analyse(h["markerSets"], h["daily"])
    assert a.ready and a.simulated and a.weeks == 12
    # Exactly the four markers §12 says drift, and none of the stable ones.
    assert a.flagged == ["mean_pause_s", "mattr", "named_recall", "retell_rate"]
    # A run may begin one noisy week before the drift itself does, never earlier.
    assert all(a.series[m].run_start >= DRIFT_FROM_WEEK - 2 for m in a.flagged)
    card = trend_card(a, h["personId"], h["name"], "2026-10-12T00:00:00Z")
    assert card["simulated"] is True and card["kind"] == "change"
    assert card["say"].startswith("Since August, Gurdev pauses longer, uses fewer different words,")
