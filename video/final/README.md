# Final film (submitted cut)

The 2:58 submission video (script v3, 23 Oct): the problem told through Gurdev, her family and her
doctor; what Recollect is; her morning, her stories and her memories given back; her family's view and
the doctor report; an animated architecture; and a close. Animated scenes are `anim/*.html` (plain navy,
no particles); `beat(n)` starts each visual beat as narration line n begins. Every spoken line is in
`lines.py`.

It is a re-enactment. Playwright drives the real running app, and a stand-in microphone types her
scripted words. Amazon Polly provides the voices (narrator Kajal en-IN, Gurdev Aditi, Aman Arthur,
Recollect Joanna, Hindi replies Kajal hi-IN). Every Recollect line comes from the app's actual reply:
`record.py` compares each one with the expected text and has `tts.py` re-voice any that differ
(`clips/overrides.json`).

```
python3 -m venv .venv && .venv/bin/pip install playwright boto3 imageio-ffmpeg && .venv/bin/playwright install chromium
.venv/bin/python tts.py                       # voices every line in lines.py (AWS credentials for Polly)
.venv/bin/python record.py                    # all scenes, or name some: record.py s8_built
.venv/bin/python assemble.py recollect-final.mp4
```

`record.py` needs `pnpm dev` running with FalkorDB, `pnpm seed` (SEED_SKIP=radio, DEMO_CLOCK=1), and
Bedrock model IDs in `.env`. Re-seed (and restart `pnpm dev`) before re-recording scenes 4–7, so the radio story is new to
the graph and the family page counts only today's questions. `assemble.py` cuts out the Bedrock waiting time, places each voice clip where it happened,
and speeds the whole film up 1.10×.
