"""uv run python -m trends — reads data/simulated/markers.json, writes the family trend card
(trend.json) and the printable doctor report (doctor-report.html) next to it.

Run `python -m synth` first. `pnpm seed` and the in-memory dev server load both files.

`uv run python -m trends --graph` runs on the live graph at FALKORDB_URL instead (trends/live.py):
every MarkerSet in, TrendCard / TrendFlag / DoctorReport out. The worker also runs it weekly.
"""

import json
import os
import sys
from pathlib import Path

if "--graph" in sys.argv:
    from trends.live import run
    from worker.store import FalkorStore

    url = os.environ.get("FALKORDB_URL") or sys.exit("FALKORDB_URL is not set")
    card = run(FalkorStore(url))
    print(card["say"] if card else "Change tracking is off: nothing written.")
    sys.exit(0)

from trends.detect import analyse, trend_card
from trends.report import build_report

folder = Path(__file__).resolve().parents[2] / "data" / "simulated"
history = json.loads((folder / "markers.json").read_text(encoding="utf-8"))
# Fixed timestamp for the simulated history, so regenerating the demo files changes nothing.
created = "2026-10-12T04:30:00Z"
# Matches the seed household's Consent node (packages/core/src/seed/data.ts).
consent = {"byElderAt": "2026-07-18T05:30:00.000Z", "byFamilyAt": "2026-07-18T05:35:00.000Z"}

analysis = analyse(history["markerSets"], history["daily"])
card = trend_card(analysis, history["personId"], history["name"], created)
(folder / "trend.json").write_text(json.dumps(card, indent=1) + "\n", encoding="utf-8", newline="\n")
report = build_report(analysis, card, history["name"], history["daily"], consent, created)
(folder / "doctor-report.html").write_text(report, encoding="utf-8", newline="\n")
print(card["say"])
print(f"Wrote trend.json and doctor-report.html to {folder}")
