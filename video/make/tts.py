import json, re, subprocess, boto3, imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
polly = boto3.client("polly", region_name="us-east-1")
lines = json.load(open("narration.json", encoding="utf-8"))
total = 0.0
for key, text in lines.items():
    r = polly.synthesize_speech(Text=text, VoiceId="Kajal", Engine="neural", LanguageCode="en-IN", OutputFormat="mp3")
    open(f"{key}.mp3", "wb").write(r["AudioStream"].read())
    err = subprocess.run([FF, "-i", f"{key}.mp3"], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err).groups()
    d = int(h) * 3600 + int(m) * 60 + float(s); total += d
    print(f"{key:16s} {d:5.1f} s")
print(f"{'total':16s} {total:5.1f} s")
