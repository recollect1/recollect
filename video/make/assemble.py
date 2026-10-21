"""Cuts each recorded scene, lays its Polly narration on it, and joins them into one MP4."""
import glob
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
HERE = Path(__file__).parent
OUT = Path(sys.argv[1])
ORDER = ["s0_problem", "s1_daily", "s2_memory", "s3_evening", "s4_photo", "s5_family", "s6_engineering", "s7_close"]
SPEED = {"s1_daily": 1.25, "s2_memory": 1.25}  # long conversation scenes: waiting on Bedrock, sped up
LEAD_IN = 0.4  # seconds of picture before the narration starts

offsets = json.loads((HERE / "takes" / "offsets.json").read_text())
parts = []
for name in ORDER:
    o = offsets[name]
    speed = SPEED.get(name, 1.0)
    length = o["length"] / speed
    length = max(length, o["audio"] + LEAD_IN + 0.5)
    video = glob.glob(str(HERE / "takes" / name / "*.webm"))[0]
    part = HERE / f"part_{name}.mp4"
    delay = int(LEAD_IN * 1000)
    subprocess.run([
        FF, "-loglevel", "error", "-y",
        "-ss", str(o["start"]), "-i", video, "-i", str(HERE / f"{name}.mp3"),
        "-filter_complex",
        f"[0:v]setpts=PTS/{speed},fps=30,scale=1280:720,tpad=stop_mode=clone:stop_duration=10[v];"
        f"[1:a]adelay={delay}|{delay},apad,aresample=48000[a]",
        "-map", "[v]", "-map", "[a]", "-t", f"{length:.2f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-ac", "2", str(part),
    ], check=True)
    parts.append(part)
    print(f"{name:16s} {length:5.1f} s (speed {speed})")

listing = HERE / "parts.txt"
listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts))
OUT.parent.mkdir(parents=True, exist_ok=True)
subprocess.run([FF, "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
                "-c", "copy", "-movflags", "+faststart", str(OUT)], check=True)
err = subprocess.run([FF, "-i", str(OUT)], capture_output=True, text=True).stderr
print("final:", re.search(r"Duration: [\d:.]+", err).group(0), f"{OUT.stat().st_size / 1e6:.1f} MB", OUT)
