"""Builds the film from takes/meta.json and clips/*.mp3 → <out.mp4> (1280×720, 30 fps, H.264 + AAC).

Per scene: the pages shown (switch marks) minus the waiting-only stretches; every voiced clip placed
where it happened on that shortened timeline; short fades; then all scenes joined.

    .venv/bin/python assemble.py recollect-final.mp4
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

from tts import duration

HERE = Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
CLIPS, PARTS = HERE / "clips", HERE / "parts"
ORDER = ["s1_open", "s2_problem", "s3_solution", "s4_morning", "s5_story", "s6_recall", "s7_care",
         "s8_built", "s9_close"]
FADE = 0.25
SPEED = 1.12  # whole film, pitch kept (atempo); keeps it under 3:00 without rushing any one scene


def ranges(m: dict) -> list[tuple[str, float, float]]:
    """Visible (page, from, to) in scene time: page switches, minus cuts."""
    sw = sorted(m["switches"])
    spans = [(k, t, sw[i + 1][0] if i + 1 < len(sw) else m["end"]) for i, (t, k) in enumerate(sw)]
    out = []
    for k, a, b in spans:
        pieces = [(a, b)]
        for ca, cb in sorted(m["cuts"]):
            nxt = []
            for pa, pb in pieces:
                if cb <= pa or ca >= pb:
                    nxt.append((pa, pb))
                else:
                    if ca > pa:
                        nxt.append((pa, ca))
                    if cb < pb:
                        nxt.append((cb, pb))
            pieces = nxt
        out += [(k, pa, pb) for pa, pb in pieces if pb - pa > 0.05]
    return out


def mapper(rs):
    def out_time(t: float) -> float:
        acc = 0.0
        for _, a, b in rs:
            if t < a:
                return acc
            if t <= b:
                return acc + (t - a)
            acc += b - a
        return acc
    return out_time


def build_scene(name: str, m: dict) -> Path:
    rs = ranges(m)
    vlen = sum(b - a for _, a, b in rs)
    out_time = mapper(rs)
    events = [(out_time(t), k) for t, k in m["events"]]
    alen = max((t + duration(CLIPS / f"{k}.mp3") for t, k in events), default=0)
    total = max(vlen, alen + 0.4)
    args = [FF, "-loglevel", "error", "-y"]
    for k, a, b in rs:
        src = m["files"][k]
        off = m["offsets"][k]
        args += ["-ss", f"{off + a:.3f}", "-to", f"{off + b:.3f}", "-i", src]
    for _, k in events:
        args += ["-i", str(CLIPS / f"{k}.mp3")]
    f = []
    for i in range(len(rs)):
        f.append(f"[{i}:v]setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p[v{i}]")
    f.append("".join(f"[v{i}]" for i in range(len(rs))) + f"concat=n={len(rs)}:v=1:a=0[vc]")
    f.append(f"[vc]tpad=stop_mode=clone:stop_duration={max(total - vlen, 0) + 0.1:.3f},"
             f"fade=t=in:st=0:d={FADE},fade=t=out:st={total - FADE:.3f}:d={FADE}[vout]")
    n = len(rs)
    for j, (t, _) in enumerate(events):
        ms = int(t * 1000)
        f.append(f"[{n + j}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[a{j}]")
    if events:
        f.append("".join(f"[a{j}]" for j in range(len(events))) + f"amix=inputs={len(events)}:normalize=0:duration=longest,"
                 f"apad=whole_dur={total:.3f}[aout]")
    else:
        f.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{total:.3f}[aout]")
    part = PARTS / f"{name}.mp4"
    args += ["-filter_complex", ";".join(f), "-map", "[vout]", "-map", "[aout]", "-t", f"{total:.3f}",
             "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", str(part)]
    subprocess.run(args, check=True)
    print(f"{name:12s} {total:5.1f} s  ({len(rs)} shots, {len(events)} voiced lines)")
    return part


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else HERE / "recollect-final.mp4")
    PARTS.mkdir(exist_ok=True)
    meta = json.loads((HERE / "takes" / "meta.json").read_text())
    parts = [build_scene(n, meta[n]) for n in ORDER if n in meta]
    listing = PARTS / "list.txt"
    listing.write_text("".join(f"file '{p.resolve()}'\n" for p in parts))
    subprocess.run([FF, "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
                    "-filter_complex", f"[0:v]setpts=PTS/{SPEED}[v];[0:a]atempo={SPEED}[a]", "-map", "[v]", "-map", "[a]",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k",
                    "-movflags", "+faststart", str(out)], check=True)
    err = subprocess.run([FF, "-i", str(out)], capture_output=True, text=True).stderr
    print(f"→ {out}  {re.search(r'Duration: ([\d:.]+)', err).group(1)}")


if __name__ == "__main__":
    main()
