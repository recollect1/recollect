"""`uv run python -m worker` — the background agent worker (CLAUDE.md §9).

Polls `Job` nodes every 2 s. Each job runs the Strands extract agent and the markers for one
session. A job that fails is retried twice more, then marked failed and logged; nothing here
can affect what an MCP tool says, because the tools answered before the job existed.
"""

from __future__ import annotations

import json
import os
import sys
import time

from extract.agent import extractor_from_env
from trends.live import run as run_trends
from worker.process import EXTRACT_QUEUE, NotReady, process_session
from worker.store import FalkorStore

POLL_S = 2.0
MAX_ATTEMPTS = 3


def log(**fields: object) -> None:
    print(json.dumps({"worker": True, **fields}), flush=True)


def run_once(store: FalkorStore, extractor) -> int:
    markers_only = extractor is None
    jobs = store.pending_jobs(EXTRACT_QUEUE, markers_only=markers_only)
    for job in jobs:
        t0 = time.perf_counter()
        try:
            summary = process_session(store, extractor, job["sessionId"], audio_ref=job.get("audioRef"))
        except NotReady:
            continue  # embedded by the MCP server within a moment; not counted as an attempt
        except Exception as e:  # noqa: BLE001 — any failure is retried, then recorded
            attempts = int(job.get("attempts") or 0) + 1
            store.upsert("Job", {"id": job["id"], "attempts": attempts, "failed": attempts >= MAX_ATTEMPTS,
                                 "lastError": str(e)[:500]})
            log(msg="job failed", job=job["id"], attempts=attempts, error=str(e)[:300])
            continue
        # Without Bedrock the job stays open for extraction later; its markers (and audio) are done.
        store.upsert("Job", {"id": job["id"], "markersDone": True} if markers_only else {"id": job["id"], "done": True, "markersDone": True})
        log(msg="job done", job=job["id"], session=job["sessionId"], ms=round((time.perf_counter() - t0) * 1000), **summary)
    return len(jobs)


TRENDS_QUEUE = "trends"
WEEK_S = 7 * 24 * 3600


def trends_due(store: FalkorStore) -> bool:
    """Weekly (§9.3): due when the newest TrendCard is a week old, or never ran on live data."""
    cards = sorted(store.find("TrendCard"), key=lambda c: c.get("createdAt", ""), reverse=True)
    if not cards:
        return True
    last = cards[0]["createdAt"].replace("Z", "+00:00")
    from datetime import datetime, timezone
    return (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds() >= WEEK_S


def run_trends_jobs(store: FalkorStore) -> None:
    """On demand (family page "Refresh") or weekly. Never touches what she hears."""
    jobs = store.pending_jobs(TRENDS_QUEUE)
    if not jobs and not trends_due(store):
        return
    try:
        card = run_trends(store)
        log(msg="trends", say=card["say"] if card else "tracking off", simulated=card["simulated"] if card else None)
    except Exception as e:  # noqa: BLE001
        log(msg="trends failed", error=str(e)[:300])
    for job in jobs:
        store.upsert("Job", {"id": job["id"], "done": True})


def main() -> None:
    url = os.environ.get("FALKORDB_URL")
    if not url:
        sys.exit("FALKORDB_URL is not set: the worker needs the shared graph.")
    extractor = extractor_from_env()
    store = FalkorStore(url)
    if extractor is None:
        log(msg="BEDROCK_EXTRACT_MODEL_ID is not set: markers only (no entity extraction until it is)")
    log(msg="worker started", extractor=extractor.name if extractor else None, poll_s=POLL_S)
    last_trends_check = 0.0
    while True:
        try:
            run_once(store, extractor)
            # Trend jobs are checked every poll; the weekly rule at most once a minute.
            if store.pending_jobs(TRENDS_QUEUE) or time.time() - last_trends_check > 60:
                last_trends_check = time.time()
                run_trends_jobs(store)
        except Exception as e:  # noqa: BLE001
            # e.g. the graph does not exist yet because nothing has been seeded: wait and retry
            # rather than exit (§9: agent failures never affect anything else).
            log(msg="poll failed; retrying", error=str(e)[:300])
            time.sleep(10)
        time.sleep(POLL_S)


if __name__ == "__main__":
    main()
