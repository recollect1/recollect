# Final film (submitted cut)

The 2:57 submission video, made on 23 Oct from `video/FILM_PLAN.md` v2 with Shambhvi's feedback
(plain navy slides, softer timeline glow, longer graph shot, no overlapping text).

It is a re-enactment. Playwright drives the real running app, and a stand-in microphone types her
scripted words. Amazon Polly provides the voices (narrator Kajal en-IN, Gurdev Aditi, Aman Arthur,
Recollect Joanna, Hindi replies Kajal hi-IN). Every Recollect line comes from the app's actual reply:
`record.py` compares each one with the expected text and has `tts.py` re-voice any that differ
(`clips/overrides.json`).

```
python3 -m venv .venv && .venv/bin/pip install playwright boto3 imageio-ffmpeg && .venv/bin/playwright install chromium
.venv/bin/python tts.py                       # voices every line in lines.py (AWS credentials for Polly)
.venv/bin/python record.py                    # all scenes, or name some: record.py s4_hindi
.venv/bin/python assemble.py recollect-final.mp4
```

`record.py` needs `pnpm dev` running with FalkorDB, `pnpm seed` (SEED_SKIP=radio, DEMO_CLOCK=1), and
Bedrock model IDs in `.env`. Re-seed before re-recording scenes 3–9, because Ask Gurdev asks only once
a day. `assemble.py` cuts out the Bedrock waiting time, places each voice clip where it happened,
and speeds the whole film up 1.10×.
