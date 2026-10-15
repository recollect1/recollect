# Handoff — for Shambhvi (from Yash, 15 Oct 2026)

Everything from your 13 Oct handoff is built and tested, plus the P1 features, AgentCore packaging
and deploy files. Graph Hacks is no longer on the plan; Oct 15–23 is all Recollect. This page is
the current state: what is done, what is left, and who did what. `CLAUDE.md` §19 lists every place
the build differs from the spec; `docs/friction-log.md` entries 16–18 are new.

Deadline: submit **Oct 23 evening IST** (official: Oct 24, 00:30 IST).

## Who built what

| Who | Commits | What |
|---|---|---|
| Shambhvi | `b1574ef`, `173cc75`, `3e804ec` (12–13 Oct) | Scaffold; `packages/core` (graph port, schema, phrases, grounded recall + cross-encoder check, daily tools, routines, seed); MCP server (15 tools, role tokens, demo clock, doctor-report route); grounding eval; `extract/validate.py`; text, graph and timing marker maths; simulated 12-week history; trends (baseline, 4-week rule, card, doctor report); Agent Skill. |
| Yash (with Claude Code) | everything after `3e804ec` (14–15 Oct): `git log --oneline 3e804ec..main` | First run of `FalkorGraph`; latency test passing; agent worker (Strands → Bedrock, validated writes, story prompts, markers); AgentCore Runtime agent; MCP Apps cards; Alexa+ simulator; family page + family REST; night reassurance + alert; full-voice timing markers; live graph panel; trends on the live graph; deploy files; docs; Open Source entry [`mcp-latency`](https://github.com/yash4428/mcp-latency). |

## Run it

```
pnpm i && (cd agents && uv sync)
cp .env.example .env              # two different tokens; DEMO_CLOCK=1 for the demo
docker compose up -d falkordb
pnpm seed
pnpm dev                          # MCP :8787 · simulator :5173 · family :5174 · worker
```

Tests: `pnpm test` (75; add `FALKORDB_URL=redis://localhost:6379` to run the core and family tests on
FalkorDB too), `(cd agents && uv run pytest)` (47), `pnpm eval:recall`, `pnpm test:latency`.
Simulator debug buttons (real tool calls, no voice model): http://localhost:5173/?debug

## Verified on 14–15 Oct (macOS, Docker, FalkorDB)

- `FalkorGraph`: seed and every core and family test pass on FalkorDB, no adapter changes needed.
- Latency: every elder tool far under budget, locally and in the `deploy/mcp-server.Dockerfile`
  container (worst p95 about 15 ms).
- In the browser: all five MCP Apps cards, the evening routine at 17:00, night reassurance and the
  family alert at 03:00, the family page, the live graph panel.
- Images: MCP server, web (password gate, family proxy) and worker run locally.
- Trends on the live graph: `uv run python -m trends --graph` reads every MarkerSet from FalkorDB and
  writes the TrendCard, TrendFlags and a `DoctorReport` node (done on 15 Oct).

## Last thing added (15 Oct, tested, not yet tried in the browser)

- `GET /report/doctor` now serves the latest `DoctorReport` from the graph, falling back to
  `data/simulated/doctor-report.html`.
- Family page → Speech changes → **Recalculate now** queues a `trends` job; the worker also runs the
  trends agent weekly (`agents/worker/__main__.py`, `trends_due`).
- Worth a click-through: press Recalculate now with `pnpm dev` running and check the card and report.

## Left to do

**Code (small):**
1. **Weekly photo scheduling (P0, §9.4).** `photo_moment` works on demand, but nothing schedules the
   weekly prompt for a calm daytime moment. Suggested: `routine_state` returns `photoDue: true` once a
   week in a calm window (e.g. 11:00–12:00, not evening), and the simulator offers the photo then.
2. **Repo "About" description** on GitHub (one line; the MIT licence already shows).
3. *(P2, only if time)* her music playlist; carer check-in.

**Needs AWS (Yash's account) — the AWS Builder entry depends on this:**
4. Bedrock model access + an IAM user key (the CLI credentials on Yash's Mac are the root user).
   Then the first live run of the simulator's voice loop (`BEDROCK_CHAT_MODEL_ID`) and the worker's
   extraction (`BEDROCK_EXTRACT_MODEL_ID`), including scenario C (graph grows within ~10 s).
   **Nothing has called Bedrock yet.** After that, fill the "pending" sections of
   `docs/product-feedback.md`.
5. Deploy: AgentCore Runtime for the extract agent, plus hosting for FalkorDB, MCP server, web and
   worker. `docs/deploy.md` describes Railway; on AWS the simplest is one EC2 instance with Docker
   Compose (all four containers) and HTTPS, plus AgentCore. Then `pnpm test:latency` against the URL.

**Needs a person:**
6. Microphone test in Chrome: push-to-talk, story mode, full-voice recording, TTS.
7. Claude Desktop clip (~10 s). The server needs the bearer token in a header; if the connector form
   cannot send one, use a small authenticating proxy for the recording.
8. Video under 3 minutes (storyboard in `CLAUDE.md` §15), public, no copyrighted music.
9. Devpost text in our own words; tracks: Alexa+, AWS Builder, Open Source (`docs/open-source.md`).
10. Read and confirm every friction-log and product-feedback entry.

## Rules that are easy to break

- No model call inside an MCP tool handler; no model-written memory, medicine or trend sentence.
  New wording goes in `phrases.ts` (or `trend-phrases.json` if Python needs it) with a test.
- Anything from `data/simulated/` must show "Simulated data" where it is displayed.
- Audio is analysed then deleted; the worker deletes it even on failure, the simulator after an hour.
- Keep `CLAUDE.md` §19 current.
