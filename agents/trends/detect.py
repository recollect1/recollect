"""Trends agent (CLAUDE.md §9.3): baseline, weekly values, sustained-change flags, family card.

Everything is measured against the person's own baseline. A metric is flagged only when its
weekly value has been at least 1.5 robust standard deviations worse than baseline for the last
four weeks in a row, and the family is only told when two or more metrics are flagged — so one
bad day, one bad week, or one noisy metric never raises a card.

Pure functions over plain dicts; no I/O and no model.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from statistics import median

from common import phrases

BASELINE_DAYS = 14
MIN_BASELINE_SESSIONS = 5
BASELINE_WEEKS = 4  # for metrics that only exist per week
MIN_PHOTO_SESSIONS = 8  # 4 for a baseline + 4 recent weeks
THRESHOLD_SD = 1.5
RUN_WEEKS = 4
MIN_FLAGGED = 2

TEXT_METRICS = ("mattr", "vague_rate", "pronoun_noun_ratio", "mean_utt_len", "idea_density", "self_corrections")
#: Smallest robust SD allowed for metrics built from a handful of counts each week.
SD_FLOOR = {"retell_rate": 0.1, "named_recall": 0.05, "evening_orientation_share": 0.1, "orientation_asks": 0.5}
MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December")


@dataclass
class Series:
    metric: str
    source: str  # "stories", "weekly photo" or "daily"
    weekly: list[float | None]
    baseline: float
    sd: float
    flagged: bool = False
    #: Index of the first week of the current run of worse-than-baseline weeks.
    run_start: int | None = None


@dataclass
class Analysis:
    ready: bool
    weeks: int = 0
    week_starts: list[date] = field(default_factory=list)
    sessions: int = 0
    simulated: bool = False
    series: dict[str, Series] = field(default_factory=dict)

    @property
    def flagged(self) -> list[str]:
        return [m for m in phrases.METRICS if m in self.series and self.series[m].flagged]


def _day(stamp: str) -> date:
    return datetime.fromisoformat(stamp.replace("Z", "+00:00")).date()


def _robust(values: list[float], metric: str) -> tuple[float, float]:
    """Median and robust SD (1.4826 × MAD), with a floor so a flat baseline cannot flag noise."""
    mid = median(values)
    mad = median(abs(v - mid) for v in values)
    return mid, max(1.4826 * mad, 0.05 * abs(mid), SD_FLOOR.get(metric, 1e-9))


def _flag(series: Series) -> None:
    worse_up = phrases.METRICS[series.metric]["worse"] == "up"

    def is_worse(value: float | None) -> bool:
        if value is None:
            return False
        z = (value - series.baseline) / series.sd
        return (z if worse_up else -z) >= THRESHOLD_SD

    weekly = series.weekly
    if len(weekly) < RUN_WEEKS or not all(is_worse(v) for v in weekly[-RUN_WEEKS:]):
        return
    start = len(weekly) - RUN_WEEKS
    while start > 0 and is_worse(weekly[start - 1]):
        start -= 1
    series.flagged, series.run_start = True, start


def analyse(marker_sets: list[dict], daily: list[dict] | None = None) -> Analysis:
    """marker_sets: {at, mode, metrics{…}, retold?, simulated?}; daily: {date, orientation_asks, evening_asks}."""
    daily = daily or []
    stories = sorted((m for m in marker_sets if m.get("mode", "story") == "story"), key=lambda m: m["at"])
    photos = sorted((m for m in marker_sets if m.get("mode") == "photo_desc"), key=lambda m: m["at"])
    if not stories:
        return Analysis(ready=False)
    first = _day(stories[0]["at"])
    start = first - timedelta(days=first.weekday())  # Monday of the first week
    last = max(_day(m["at"]) for m in marker_sets)
    weeks = (last - start).days // 7 + 1
    week_of = lambda d: (d - start).days // 7  # noqa: E731

    in_baseline = [m for m in stories if (_day(m["at"]) - first).days < BASELINE_DAYS]
    analysis = Analysis(
        ready=len(in_baseline) >= MIN_BASELINE_SESSIONS and weeks >= RUN_WEEKS,
        weeks=weeks, week_starts=[start + timedelta(weeks=i) for i in range(weeks)],
        sessions=len(marker_sets), simulated=any(m.get("simulated") for m in marker_sets),
    )
    if not analysis.ready:
        return analysis

    def weekly_median(sets: list[dict], metric: str) -> list[float | None]:
        buckets: list[list[float]] = [[] for _ in range(weeks)]
        for m in sets:
            value = m["metrics"].get(metric)
            if value is not None:
                buckets[week_of(_day(m["at"]))].append(value)
        return [median(b) if b else None for b in buckets]

    def add(metric: str, source: str, weekly: list[float | None], baseline_values: list[float]) -> None:
        if len(baseline_values) < 2 or all(v is None for v in weekly):
            return
        mid, sd = _robust(baseline_values, metric)
        series = Series(metric, source, weekly, mid, sd)
        _flag(series)
        analysis.series[metric] = series

    # A fixed task gives comparable samples, so text markers prefer the weekly photo description.
    use_photos = len(photos) >= MIN_PHOTO_SESSIONS
    session_metrics = sorted({k for m in stories for k in m["metrics"]})
    for metric in session_metrics:
        if use_photos and metric in TEXT_METRICS:
            values = [m["metrics"][metric] for m in photos[:BASELINE_WEEKS] if m["metrics"].get(metric) is not None]
            add(metric, "weekly photo", weekly_median(photos, metric), values)
        else:
            values = [m["metrics"][metric] for m in in_baseline if m["metrics"].get(metric) is not None]
            add(metric, "stories", weekly_median(stories, metric), values)

    # Metrics that only exist per week take their baseline from the first four weeks.
    retold: list[list[bool]] = [[] for _ in range(weeks)]
    for m in stories:
        if "retold" in m:
            retold[week_of(_day(m["at"]))].append(bool(m["retold"]))
    retell = [sum(b) / len(b) if b else None for b in retold]
    add("retell_rate", "stories", retell, [v for v in retell[:BASELINE_WEEKS] if v is not None])

    asks: list[list[int]] = [[] for _ in range(weeks)]
    evening: list[list[int]] = [[] for _ in range(weeks)]
    for d in daily:
        w = week_of(date.fromisoformat(d["date"]))
        if 0 <= w < weeks:
            asks[w].append(d["orientation_asks"])
            evening[w].append(d.get("evening_asks", 0))
    per_day = [sum(b) / len(b) if b else None for b in asks]
    share = [sum(e) / sum(a) if a and sum(a) else None for a, e in zip(asks, evening)]
    add("orientation_asks", "daily", per_day, [v for v in per_day[:BASELINE_WEEKS] if v is not None])
    add("evening_orientation_share", "daily", share, [v for v in share[:BASELINE_WEEKS] if v is not None])
    return analysis


def trend_card(analysis: Analysis, person_id: str, name: str, created_at: str) -> dict:
    """The family card (`TrendCard` node). Wording comes only from the shared templates."""
    flagged = analysis.flagged
    card = {
        "id": f"tc-{created_at[:10]}", "personId": person_id, "createdAt": created_at,
        "weeks": analysis.weeks, "simulated": analysis.simulated, "changes": [], "kind": "stable",
    }
    if not analysis.ready:
        card["say"] = phrases.trend_not_ready(name)
    elif len(flagged) >= MIN_FLAGGED:
        since_week = min(analysis.series[m].run_start or 0 for m in flagged)
        since = MONTHS[analysis.week_starts[since_week].month - 1]
        card.update(kind="change", changes=flagged, since=since, say=phrases.trend_change(name, flagged, since))
    else:
        card["say"] = phrases.trend_stable(name, analysis.weeks)
    banned = phrases.find_banned(card["say"])
    if banned or phrases.NOT_MEDICAL not in card["say"]:
        raise ValueError(f"trend card failed the wording check: {banned}")
    return card
