# Demo video

> Made on 21 Oct, before the 22 Oct features (memory fidelity, family memories, care
> follow-through, Memory Lane, carer coach). Those are not in this cut.

`recollect-demo.mp4` (2 min 47 s, 1280×720) is not committed; it was made on 21 Oct 2026 with the
scripts in `make/` and is to be uploaded publicly for the submission.

How it was made, so the video can be described honestly:

- **Every on-screen reply is a real tool call** to the live AWS deployment
  (`https://api.34-194-181-93.sslip.io/mcp`), with Amazon Bedrock (Nova Pro) choosing tools in the
  simulator and the worker on Bedrock AgentCore growing the memory graph. Nothing is mocked.
- **Typed, not spoken.** The simulator and family page ran locally in a headless browser driven by
  `make/record.py` (Playwright). There is no microphone there, so her words are typed; the browser's
  own text-to-speech was replaced by a timer because no audio is recorded.
- **Narration is synthetic:** Amazon Polly, neural voice "Kajal" (en-IN), from `make/narration.json`.
- **Two conversation scenes play at 1.25×** (they are mostly waiting on the model).
- **Latency chips show the server's own time and the laptop's round trip** (India to us-east-1).
- The speech history on the family page and in the report is **simulated**, and labelled so.
- All people and stories are fictional.

Remake: start the simulator and family page against the deployment (`MCP_SERVER_URL` set to the api
URL, tokens and `BEDROCK_CHAT_MODEL_ID` in the environment), re-seed the deployment with
`SEED_SKIP=radio`, copy `docs/architecture.png` into `make/`, then in a venv with `playwright`,
`imageio-ffmpeg` and `boto3`: `python tts.py`, `python record.py`, `python assemble.py <out.mp4>`.
Re-seed afterwards (the recording tells the radio story and moves the demo clock).
