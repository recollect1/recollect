"""Voices every line in lines.py with Amazon Polly → clips/<key>.mp3, and prints durations.

    python tts.py              # all lines (skips ones already voiced with the same text)
    python tts.py r3b r6a      # just these
Overrides from record.py (the app's real reply text) live in clips/overrides.json.
"""
import json
import re
import subprocess
import sys
from html import escape
from pathlib import Path

import boto3
import imageio_ffmpeg

from lines import LINES, VOICES

HERE = Path(__file__).parent
CLIPS = HERE / "clips"
CLIPS.mkdir(exist_ok=True)
FF = imageio_ffmpeg.get_ffmpeg_exe()
polly = boto3.client("polly", region_name="us-east-1")


def duration(path: Path) -> float:
    err = subprocess.run([FF, "-i", str(path)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def text_of(key: str) -> tuple[str, str]:
    overrides_file = CLIPS / "overrides.json"
    overrides = json.loads(overrides_file.read_text()) if overrides_file.exists() else {}
    who, text = LINES[key]
    return who, overrides.get(key, text)


def voice(key: str) -> float:
    who, text = text_of(key)
    vid, engine, lang, rate = VOICES[who]
    mp3, stamp = CLIPS / f"{key}.mp3", CLIPS / f"{key}.txt"
    if mp3.exists() and stamp.exists() and stamp.read_text() == text:
        return duration(mp3)
    body = f'<speak><prosody rate="{rate}">{escape(text)}</prosody></speak>' if rate else f"<speak>{escape(text)}</speak>"
    r = polly.synthesize_speech(Text=body, TextType="ssml", VoiceId=vid, Engine=engine, LanguageCode=lang, OutputFormat="mp3")
    mp3.write_bytes(r["AudioStream"].read())
    stamp.write_text(text)
    return duration(mp3)


def durations() -> dict[str, float]:
    return {k: duration(CLIPS / f"{k}.mp3") for k in LINES if (CLIPS / f"{k}.mp3").exists()}


if __name__ == "__main__":
    keys = sys.argv[1:] or list(LINES)
    total = {"narr": 0.0, "other": 0.0}
    for k in keys:
        d = voice(k)
        total["narr" if LINES[k][0] == "narr" else "other"] += d
        print(f"{k:6s} {LINES[k][0]:9s} {d:5.1f} s")
    print(f"narration {total['narr']:.1f} s · dialogue {total['other']:.1f} s")
    (CLIPS / "durations.json").write_text(json.dumps(durations(), indent=1))
