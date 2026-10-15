# Handoff — for Shambhvi (Yash, 15 Oct 2026)

Your 13 Oct handoff asked for FalkorDB, latency, the agent worker, cards, simulator and family page.
All of that is built and tested, plus the P1 features (night reassurance, timing markers, live graph
panel), AgentCore packaging and deploy files. Graph Hacks is no longer on the plan; Oct 15–23 is all
Recollect. This page lists what is left. `CLAUDE.md` §19 has every place the build differs from the
spec, and `docs/friction-log.md` entries 16–18 are new.

What changed since your last commit, in order: `git log --oneline 3e804ec..main`.

Also new: our Open Source mini-challenge entry, https://github.com/yash4428/mcp-latency (a CLI that
measures MCP tool latency against the Alexa+ 500 ms budget). Devpost fields: `docs/open-source.md`.

## Run it

```
pnpm i && (cd agents && uv sync)
cp .env.example .env              # two different tokens; DEMO_CLOCK=1 for the demo
docker compose up -d falkordb
pnpm seed
pnpm dev                          # MCP :8787 · simulator :5173 · family :5174 · worker
```

Tests: `pnpm test` (75, add `FALKORDB_URL=redis://localhost:6379` to run core and family tests on
FalkorDB), `(cd agents && uv run pytest)` (43), `pnpm eval:recall`, `pnpm test:latency`.
Simulator debug buttons (real tool calls, no voice model): http://localhost:5173/?debug

## Verified on 14–15 Oct (macOS, Docker)

- `FalkorGraph`: seed and every core/family test pass on FalkorDB, unchanged.
- Latency: every elder tool well under budget, locally and in the `deploy/mcp-server.Dockerfile`
  container (worst p95 about 15 ms).
- In the browser: the five MCP Apps cards, evening routine at 17:00, night reassurance and the family
  alert at 03:00, the family page, the live graph panel.
- Images: MCP server, web (password gate, family proxy) and worker run locally.

## Left, needs a person

1. **AWS**: billing, Bedrock model access in `AWS_REGION`, an IAM user key (not root). Then set
   `BEDROCK_CHAT_MODEL_ID` and `BEDROCK_EXTRACT_MODEL_ID` and try the simulator's voice loop and the
   worker's extraction live. Nothing has called Bedrock yet.
2. **AgentCore**: push `deploy/agentcore.Dockerfile` and create the runtime (`docs/deploy.md`).
3. **Railway**: four services per `docs/deploy.md`; then `pnpm test:latency` against the URL.
4. **Microphone**: push-to-talk, story mode and full-voice recording in a real browser.
5. **Claude Desktop** clip, the **video**, the Devpost text, and confirming every friction-log and
   product-feedback entry.
6. **GitHub**: add `yash4428` as a collaborator on `recollect1/recollect` so the local commits can be
   pushed.

## Rules that are easy to break

- No model call inside an MCP tool handler; no model-written memory, medicine or trend sentence.
  New wording goes in `phrases.ts` (or `trend-phrases.json` if Python needs it) with a test.
- Anything from `data/simulated/` must show "Simulated data" where it is displayed.
- Audio is analysed then deleted; the worker deletes it even on failure, the simulator after an hour.
- `CLAUDE.md` §19 lists every place the build differs from the spec. Keep it current.
