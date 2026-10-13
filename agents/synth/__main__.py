"""uv run python -m synth — writes the simulated history to data/simulated/markers.json."""

import json
from pathlib import Path

from synth.generate import generate

out = Path(__file__).resolve().parents[2] / "data" / "simulated" / "markers.json"
out.parent.mkdir(parents=True, exist_ok=True)
history = generate()
out.write_text(json.dumps(history, indent=1) + "\n", encoding="utf-8", newline="\n")
print(f"Wrote {len(history['markerSets'])} simulated marker sets over {history['weeks']} weeks to {out}")
