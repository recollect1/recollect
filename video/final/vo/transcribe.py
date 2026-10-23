import json, subprocess, sys
import numpy as np
from faster_whisper import WhisperModel
m = WhisperModel("small.en", device="cpu", compute_type="int8")
out = {}
for n in ["1", "2", "3"]:
    raw = subprocess.run(["/opt/homebrew/bin/ffmpeg", "-loglevel", "error", "-i", f"/Users/yashaggarwal/Desktop/{n}.mp3", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    audio = np.frombuffer(raw, np.float32)
    segs, _ = m.transcribe(audio, word_timestamps=True, vad_filter=False, beam_size=5)
    words = [(w.word, round(w.start, 2), round(w.end, 2)) for s in segs for w in s.words]
    out[n] = words
    print(f"--- {n}")
    print(" ".join(f"{w}[{a}]" for w, a, b in words))
json.dump(out, open("vo/words.json", "w"))
