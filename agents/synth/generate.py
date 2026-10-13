"""Demo data generator (CLAUDE.md §12): a SIMULATED 12-week speech-marker history for Gurdev.

Nothing here comes from a real person. Every record carries `simulated: true`, and every screen
or report that shows one of these points must say "Simulated data" (§1.7).

Weeks 1–5 sit near a baseline with noise. From week 6 four markers drift gradually:
mean_pause_s, named_recall, retell_rate (through `retold`) and mattr. Deterministic for a seed.
"""

from __future__ import annotations

import random
from datetime import date, datetime, time, timedelta, timezone

START = date(2026, 7, 20)  # a Monday, two days after the seed household's consent
WEEKS = 12
DRIFT_FROM_WEEK = 6
STORY_DAYS = (0, 1, 2, 3, 4)  # Monday–Friday, 11:00 household time
PHOTO_DAY = 2  # Wednesday, 15:00
IST = timezone(timedelta(hours=5, minutes=30))

#: (baseline mean, noise SD) for markers that stay stable.
STABLE = {
    "vague_rate": (1.5, 0.4), "pronoun_noun_ratio": (0.55, 0.05), "mean_utt_len": (11.0, 0.9),
    "idea_density": (4.8, 0.2), "self_corrections": (0.6, 0.25),
}
STABLE_STORY_ONLY = {
    "pause_rate": (9.0, 0.9), "long_pause_rate": (0.8, 0.25), "speech_rate_wpm": (118.0, 5.0),
    "phonation_ratio": (0.68, 0.03), "new_entity_rate": (2.2, 0.5),
}


def _stamp(day: date, at: time) -> str:
    return datetime.combine(day, at, IST).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def generate(seed: int = 7) -> dict:
    rng = random.Random(seed)
    noisy = lambda mean, sd, low=0.0: round(max(low, rng.gauss(mean, sd)), 4)  # noqa: E731
    marker_sets: list[dict] = []
    daily: list[dict] = []
    for week in range(1, WEEKS + 1):
        drift = max(0, week - DRIFT_FROM_WEEK + 1) / (WEEKS - DRIFT_FROM_WEEK + 1)  # 0 … 1
        monday = START + timedelta(weeks=week - 1)

        def text_metrics() -> dict[str, float]:
            metrics = {name: noisy(mean, sd) for name, (mean, sd) in STABLE.items()}
            metrics["mattr"] = noisy(0.72 - 0.13 * drift, 0.018)
            return metrics

        # How many of the week's five stories repeat an earlier one: rises with the drift.
        retold_count = int(len(STORY_DAYS) * (0.12 + 0.5 * drift) + rng.random())
        retold_days = set(rng.sample(STORY_DAYS, retold_count))
        for offset in STORY_DAYS:
            day = monday + timedelta(days=offset)
            metrics = text_metrics()
            metrics.update({name: noisy(mean, sd) for name, (mean, sd) in STABLE_STORY_ONLY.items()})
            metrics["mean_pause_s"] = noisy(0.80 * (1 + 0.6 * drift), 0.07)
            metrics["named_recall"] = round(min(1.0, noisy(0.92 - 0.32 * drift, 0.04)), 4)
            marker_sets.append({
                "id": f"ms-sim-w{week:02d}-s{offset + 1}", "sessionId": f"ses-sim-w{week:02d}-s{offset + 1}",
                "at": _stamp(day, time(11, 0)), "mode": "story", "simulated": True,
                "retold": offset in retold_days, "metrics": metrics,
            })
        marker_sets.append({
            "id": f"ms-sim-w{week:02d}-photo", "sessionId": f"ses-sim-w{week:02d}-photo",
            "at": _stamp(monday + timedelta(days=PHOTO_DAY), time(15, 0)), "mode": "photo_desc",
            "simulated": True, "metrics": text_metrics(),
        })
        for offset in range(7):
            asks = rng.randint(2, 5)
            daily.append({
                "date": (monday + timedelta(days=offset)).isoformat(), "simulated": True,
                "orientation_asks": asks, "evening_asks": sum(rng.random() < 0.35 for _ in range(asks)),
                "doses_due": 4, "doses_taken": 4 if rng.random() < 0.85 else 3,
            })
    return {
        "simulated": True,
        "note": "Simulated data. Fictional person; not derived from any real recording.",
        "personId": "p-gurdev", "name": "Gurdev", "seed": seed, "start": START.isoformat(), "weeks": WEEKS,
        "markerSets": marker_sets, "daily": daily,
    }
