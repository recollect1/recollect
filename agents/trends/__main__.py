"""uv run python -m trends — reads data/simulated/markers.json, writes the family trend card
(trend.json) and the printable doctor report (doctor-report.html) next to it.

Run `python -m synth` first. `pnpm seed` and the in-memory dev server load both files.
"""

import json
from pathlib import Path

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
