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
from worker.process import EXTRACT_QUEUE, NotReady, process_session
from worker.store import FalkorStore

POLL_S = 2.0
MAX_ATTEMPTS = 3


def log(**fields: object) -> None:
    print(json.dumps({"worker": True, **fields}), flush=True)


def run_once(store: FalkorStore, extractor) -> int:
    jobs = store.pending_jobs(EXTRACT_QUEUE)
    for job in jobs:
        t0 = time.perf_counter()
        try:
            summary = process_session(store, extractor, job["sessionId"])
        except NotReady:
            continue  # embedded by the MCP server within a moment; not counted as an attempt
        except Exception as e:  # noqa: BLE001 — any failure is retried, then recorded
            attempts = int(job.get("attempts") or 0) + 1
            store.upsert("Job", {"id": job["id"], "attempts": attempts, "failed": attempts >= MAX_ATTEMPTS,
                                 "lastError": str(e)[:500]})
            log(msg="job failed", job=job["id"], attempts=attempts, error=str(e)[:300])
            continue
        store.upsert("Job", {"id": job["id"], "done": True})
        log(msg="job done", job=job["id"], session=job["sessionId"], ms=round((time.perf_counter() - t0) * 1000), **summary)
    return len(jobs)


def main() -> None:
    url = os.environ.get("FALKORDB_URL")
    if not url:
        sys.exit("FALKORDB_URL is not set: the worker needs the shared graph.")
    extractor = extractor_from_env()
    if extractor is None:
        sys.exit("BEDROCK_EXTRACT_MODEL_ID is not set: the worker needs a Bedrock model for extraction.")
    store = FalkorStore(url)
    log(msg="worker started", extractor=extractor.name, poll_s=POLL_S)
    while True:
        run_once(store, extractor)
        time.sleep(POLL_S)


if __name__ == "__main__":
    main()
