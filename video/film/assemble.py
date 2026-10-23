"""Builds the film: each scene's recorded segments (fitted to its narration, sped up at most 1.55x),
the Polly narration laid over it, short fades, then all scenes joined into one MP4."""
import json, re, subprocess, sys
from pathlib import Path
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
HERE = Path(__file__).parent
OUT = Path(sys.argv[1])
ORDER = ["m01_open", "m02_problem", "m03_intro", "m04_daily", "m05_hindi", "m06_story", "m07_graph", "m08_recall",
         "m09_ask", "m10_evening", "m11_timeline", "m12_family", "m13_arch", "m14_close"]
CARDS = {"m01_open", "m02_problem", "m03_intro", "m13_arch", "m14_close"}
LEAD, TAIL, MAX_SPEED = 0.4, 0.55, 1.55
FONT = "C\\:/Windows/Fonts/segoeuib.ttf"

meta = json.loads((HERE / "takes" / "meta.json").read_text())
aws = sorted((HERE.parent / "video" / "takes" / "s2_memory").glob("*.webm"))[0]
meta["m07_graph"] = {"segments": [{"file": str(aws), "from": 8.8, "to": 18.3}], "label":
                     "Recorded live on our AWS deployment (21 Oct) · extract agent on Bedrock AgentCore growing the memory graph"}


def dur(path: Path) -> float:
    err = subprocess.run([FF, "-i", str(path)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


parts, total = [], 0.0
for name in ORDER:
    m = meta[name]
    audio = dur(HERE / f"{name}.mp3")
    picture = sum(s["to"] - s["from"] for s in m["segments"])
    target = audio + LEAD + TAIL
    speed = 1.0 if name in CARDS else min(MAX_SPEED, max(1.0, picture / target))
    length = max(target, picture / speed) if name not in CARDS else target
    args, chains = [], []
    for i, s in enumerate(m["segments"]):
        args += ["-ss", f"{s['from']:.2f}", "-t", f"{s['to'] - s['from']:.2f}", "-i", s["file"]]
        chains.append(f"[{i}:v]setpts=(PTS-STARTPTS)/{speed:.3f},fps=30,scale=1280:720,setsar=1[v{i}]")
    k = len(m["segments"])
    args += ["-i", str(HERE / f"{name}.mp3")]
    vf = ";".join(chains) + ";" + "".join(f"[v{i}]" for i in range(k)) + f"concat=n={k}:v=1:a=0[cat]"
    post = f"tpad=stop_mode=clone:stop_duration=20,trim=duration={length:.2f}"
    if "label" in m:
        post += (f",drawbox=x=0:y=ih-54:w=iw:h=54:color=black@0.72:t=fill,drawtext=fontfile='{FONT}':text='{m['label']}':"
                 "fontcolor=white:fontsize=22:x=(w-text_w)/2:y=h-38")
    fade_in = 0.45 if name in CARDS or name in ("m04_daily", "m07_graph") else 0.15
    post += f",fade=t=in:st=0:d={fade_in},fade=t=out:st={length - 0.3:.2f}:d=0.3"
    vf += f";[cat]{post}[v];[{k}:a]adelay={int(LEAD * 1000)}|{int(LEAD * 1000)},apad,aresample=48000[a]"
    part = HERE / f"part_{name}.mp4"
    subprocess.run([FF, "-loglevel", "error", "-y", *args, "-filter_complex", vf, "-map", "[v]", "-map", "[a]",
                    "-t", f"{length:.2f}", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "160k", "-ac", "2", str(part)], check=True)
    parts.append(part)
    total += length
    print(f"{name:14s} {length:5.1f} s  speed {speed:.2f}  (picture {picture:.1f}, narration {audio:.1f})")

listing = HERE / "parts.txt"
listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts))
OUT.parent.mkdir(parents=True, exist_ok=True)
subprocess.run([FF, "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy",
                "-movflags", "+faststart", str(OUT)], check=True)
print(f"total {total:.1f} s →", OUT, f"{OUT.stat().st_size / 1e6:.1f} MB")
