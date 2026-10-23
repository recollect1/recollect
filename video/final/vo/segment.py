"""Cuts the three voice recordings into one clip per script line (clips/<key>.mp3) using the word timings
from vo/words.json and the silences in the audio. Long pauses inside a line are shortened a little."""
import json, subprocess, sys
import numpy as np
FF = "/opt/homebrew/bin/ffmpeg"
SR = 48000
words = json.load(open("vo/words.json"))
# (file, key, first word index, last word index) — found by the word lists below
PLAN = {
 "1": [("n1a", "Gurudev", "lap,"), ("n1b", "but", "morning."), ("n1c", "This", "day."), ("n2a", "She", "answer."), ("n2b", "Her", "ones."), ("n2c", "And", "year.")],
 "2": [("n3a", "So,", "them."), ("n3b", "Calm", "both."), ("n4a", "Her", "guessed."), ("g4a", "Did", "tablet?"), ("g4b", "Where", "Aman?"), ("g4b2", "Where", "Aman?"),
       ("n4b", "She", "asked."), ("n5a", "And", "lives."), ("g5a", "I", "story."), ("g5b", "My", "radio."), ("n5b", "Her", "before."), ("n6a", "So,", "words."),
       ("g6a", "How", "Patiala?"), ("g6b", "What", "like?"), ("n6b", "If", "memory.")],
 "3": [("n7a", "Simran,", "to."), ("n7b", "Over", "simulated."), ("n7c", "When", "early."), ("n8a", "Under", "4KDV"), ("n8b", "and", "hears."),
       ("n8c", "Strans", "doctor."), ("n9a", "Dementia", "close."), ("n9b", "Recollect", "words.")],
}

def load(n):
    raw = subprocess.run([FF, "-loglevel", "error", "-i", f"/Users/yashaggarwal/Desktop/{n}.mp3", "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2)

def envelope(a, hop=0.01):
    h = int(SR * hop); m = a.mean(1); n = len(m) // h
    rms = np.sqrt((m[: n * h].reshape(n, h) ** 2).mean(1) + 1e-12)
    return 20 * np.log10(rms)

def silences(db, thr, min_len=0.25, hop=0.01):
    quiet = db < thr; out = []; i = 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]: j += 1
            if (j - i) * hop >= min_len: out.append((i * hop, j * hop))
            i = j
        else: i += 1
    return out

result = {}
START = {"g4a": 24.75, "n8b": 39.2}  # checked by hand against the audio

def trim(seg, thr):
    db = envelope(seg); loud = db > thr
    run = np.convolve(loud.astype(int), np.ones(10, int), 'same') >= 8
    idx = np.nonzero(run)[0]
    if not len(idx): return seg
    a = max(int((idx[0] * 0.01 - 0.1) * SR), 0); b = min(int((idx[-1] * 0.01 + 0.18) * SR), len(seg))
    return seg[a:b]

for n, plan in PLAN.items():
    a = load(n); db = envelope(a)
    floor = np.percentile(db, 10); thr = max(floor + 12, -50)
    gaps = silences(db, thr)
    ws = words[n]; idx = 0; spans = []
    for key, w0, w1 in plan:
        i0 = next(i for i in range(idx, len(ws)) if ws[i][0].strip() == w0)
        i1 = next(i for i in range(i0, len(ws)) if ws[i][0].strip() == w1)
        spans.append((key, ws[i0][1], ws[i1][2])); idx = i1 + 1
    cuts = []
    for k, (key, s, e) in enumerate(spans):
        nxt = spans[k + 1][1] if k + 1 < len(spans) else len(db) * 0.01
        prv = spans[k - 1][2] if k else 0.0
        # start: end of the silence just before the first word; end: start of the silence after the last word
        before = [g for g in gaps if g[1] <= s + 0.25 and g[1] >= prv - 0.1]
        after = [g for g in gaps if g[0] >= e - 0.35 and g[0] <= nxt + 0.1]
        st = (max(before, key=lambda g: g[1])[1] - 0.08) if before else s - 0.1
        en = (min(after, key=lambda g: g[0])[0] + 0.15) if after else e + 0.2
        st = START.get(key, st)
        cuts.append((key, max(st, 0), en))
    for key, st, en in cuts:
        seg = trim(a[int(st * SR): int(en * SR)].copy(), thr)
        # shorten pauses longer than 0.55 s inside the line to 0.4 s
        sdb = envelope(seg); inner = silences(sdb, thr, 0.55)
        keep = np.ones(len(seg), bool)
        for g0, g1 in inner:
            if g0 < 0.05 or g1 > len(sdb) * 0.01 - 0.05: continue
            cut0 = int((g0 + 0.2) * SR); cut1 = int((g1 - 0.2) * SR)
            if cut1 > cut0: keep[cut0:cut1] = False
        seg = seg[keep]
        f = int(0.01 * SR); ramp = np.linspace(0, 1, f)[:, None]
        seg[:f] *= ramp; seg[-f:] *= ramp[::-1]
        result[key] = (n, round(st, 2), round(en, 2), round(len(seg) / SR, 2))
        out = f"vo/{key}.wav"
        p = subprocess.run([FF, "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", out], input=seg.tobytes(), check=True)
for k, v in result.items(): print(f"{k:5s} file {v[0]}  {v[1]:6.2f}-{v[2]:6.2f}  → {v[3]:5.2f} s")
json.dump(result, open("vo/segments.json", "w"), indent=1)
