# Handoff — for Yash (written 13 Oct 2026)

Everything here was built and tested **without Docker, FalkorDB, AWS or a microphone**. Your
machine has Docker, so the first job is to run what could not be run here.

## Get it running

```
corepack enable
pnpm i
cp .env.example .env            # set ELDER_TOKEN and FAMILY_TOKEN to two different values
pnpm test                       # 51 tests, offline
pnpm eval:recall                # grounding eval, downloads two small models on first run
(cd agents && uv sync && uv run pytest)    # 29 tests
```

Keep the repo on a short path, outside Dropbox/OneDrive (friction log 1 and 7).

## 1. First: run the FalkorDB adapter (never run so far)

`packages/core/src/graph.ts` has two adapters. Every test uses `MemoryGraph`. `FalkorGraph` was
written against the `falkordb` 6.8 type definitions and has **not been executed once**.

```
docker compose up -d falkordb
pnpm seed                       # needs FALKORDB_URL=redis://localhost:6379 in the environment
pnpm dev
```

Expect to fix things in `FalkorGraph`. The likely places:

- `applySchema` — the `CREATE VECTOR INDEX` statement and the "already indexed" error text.
- `upsert` — array properties (`aliases`, `daysOfWeek`, `actions`) and `vecf32($embedding)`.
- Reading nodes back — the code assumes rows shaped `{ n: { labels, properties } }` and that an
  embedding comes back as a plain number array.
- `link` — parameters named `p_<key>`.

The quickest check is to run the existing suites against it: make the `beforeEach` in
`packages/core/test/core.test.ts` use `FalkorGraph.connect(...)` + `clear()` when
`FALKORDB_URL` is set. When it passes, delete the "has not been run" notes in `README.md` and
`CLAUDE.md` §19 and add a friction-log entry for whatever was wrong.

## 2. Latency (not passing yet)

```
pnpm dev                                        # terminal 1
ELDER_TOKEN=<your elder token> pnpm test:latency   # terminal 2
```

On Shambhvi's laptop (battery, power-saving) `recall_memory` ran at seconds under 50 back-to-back
calls; unthrottled it is about 6 ms to embed plus 25–60 ms for the relevance check. Run it on
mains power, then against the deployed URL (`MCP_SERVER_URL=...`). The test writes probe data:
re-seed afterwards. If recall is still over budget, lower `RERANK_K` in `recall.ts` from 4 to 3
and re-run `pnpm eval:recall` to confirm it still passes.

## 3. What is built

| Area | Where | State |
|---|---|---|
| Phrases, banned-word tests | `packages/core/src/phrases.ts`, `trend-phrases.json` | Done |
| Grounded recall + eval | `packages/core/src/recall.ts`, `rerank.ts`, `test/eval-recall.ts` | Passing 30/30, held-out 10/10 |
| Daily tools, routines, who's-who, weekly photo | `packages/core/src/daily.ts`, `stories.ts` | Done |
| MCP server, 15 tools, role tokens, demo clock, doctor-report route | `apps/mcp-server` | Done on the in-memory graph |
| Extract validation | `agents/extract/validate.py` | Done |
| Text, graph and timing marker maths | `agents/markers/` | Done (pure functions) |
| Simulated 12-week history | `agents/synth/`, output in `data/simulated/` | Done |
| Baseline, flags, family card, doctor report | `agents/trends/` | Done |
| Agent Skill | `skill/SKILL.md` | Done |

## 4. What is not built, in the order CLAUDE.md wants it

1. **Agent worker** (`agents/worker`): poll `Job` nodes (`done: false`), and for each session
   - call Bedrock for entities and relations (§9.1 step 1), pass the result through
     `extract.validate.validate` and `resolve`, write `Entity`, `MENTIONS`, `RELATED`, `SAME_AS`;
   - gather the session's utterances and call `markers.text.text_markers`, plus the graph
     markers, and write a `MarkerSet`;
   - mark the job done. Needs the `falkordb` Python client and AWS keys. Use Strands; if its
     real API differs from CLAUDE.md, the SDK wins — update the file and log the friction.
   - After the worker writes entities, the MCP server must refresh its recall index
     (`ctx.index.load(graph)`); today it only refreshes after its own writes. Add a timer.
2. **Story prompts from extraction** (§9.1 step 4): use `storyPromptFor` wording only.
3. **Timing markers from audio** (P1): `markers.graph.timing_markers` takes voiced intervals;
   the missing piece is the voice-activity detector that produces them, and deleting the audio.
4. **MCP Apps cards** (`packages/ui-cards`) and declaring `_meta.ui.resourceUri` on the five tools.
5. **Alexa+ simulator** (`apps/alexa-sim`) and **family page** (`apps/family`). The server
   already has what they need: `routine_state`, `POST /demo/clock`, `GET /report/doctor`,
   `family_summary`, `speech_trend`, `this_is_me`.
6. Two-step consent switch-on, "delete everything", night-time family alert (P1).
7. Deploy (Railway), Claude Desktop check, video, Devpost text.

## 5. Rules that are easy to break

- No LLM call inside an MCP tool handler, and no model-written sentence for memory, medicine or
  trend statements. New spoken wording goes in `phrases.ts` with a test in the same commit.
- Trend wording lives in `packages/core/src/trend-phrases.json` and is read by both languages.
  A new metric needs an entry there or the trends agent raises `KeyError`.
- Anything from `data/simulated/` must show "Simulated data" wherever it is displayed.
- Regenerating demo data: `uv run python -m synth && uv run python -m trends`. Both are
  deterministic, so the files should not change unless the code did.
- `CLAUDE.md` §19 lists every place the build differs from the spec. Keep it current.
- The friction log and product feedback need a human to confirm each entry is true.
