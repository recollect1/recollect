# Friction log

Written as issues happened during the build. Each entry: the task (**Doing**), what we expected and
what happened (**Problem**), a **Severity** (High: blocked us or risked a wrong answer to her; Medium:
cost hours; Low: an annoyance), the workaround (**Fix**) and, where we have one, a **Suggestion**.

## 1. pnpm install scripts fail on a deep Windows path (12 Oct)
**Severity:** Medium.
**Doing:** `pnpm install` in a project folder whose own path was 217 characters long.
**Problem:** `onnxruntime-node`, `protobufjs`, `sharp` and `esbuild` postinstall scripts failed with
`ELIFECYCLE … exit code -4058` (ENOENT). The package folders were 277–290 characters deep, past the
260-character limit that install scripts still hit even with `LongPathsEnabled = 1`.
**Fix:** moved the repo to a shorter path. The error names no path and no length; it took three
tries to see the cause.

## 2. `pnpm` inside package scripts needs `corepack enable` (13 Oct)
**Severity:** Low.
**Doing:** running `corepack pnpm eval:recall`, where the root script calls `pnpm --filter …`.
**Problem:** `'pnpm' is not recognized` — corepack runs pnpm without putting it on PATH, so nested
`pnpm` calls fail.
**Fix:** a shim on PATH for the session. Contributors need `corepack enable` (admin on Windows) or a
global pnpm.

## 3. Entity overlap alone returns real but irrelevant quotes (13 Oct)
**Severity:** High.
**Doing:** the grounding eval with the §11 score, 0.6 × cosine + 0.4 × entity overlap.
**Problem:** 20/20 answerable, but 4 of 10 unanswerable questions failed. "What was my mother's
name?" scored 0.57 and returned "My mother made sarson ka saag every winter." A real quote, so
nothing invented, but not an answer. No threshold separates these from true answers (answerable
questions scored as low as 0.47).
**Fix:** added a relevance check after the §11 score (entry 4).

## 4. A cross-encoder's raw score does not reject "same person, different fact" (13 Oct)
**Severity:** Medium.
**Doing:** using `Xenova/ms-marco-MiniLM-L-6-v2` as the relevance check.
**Problem:** it picks the right sentence almost every time, but its score does not separate the
classes: correct answers scored as low as −2.5, wrong ones as high as −0.5.
**Fix:** score each candidate twice — the question as asked, and the question with known names
replaced by pronouns. With names blanked, wrong answers fell to −10 or lower while right ones
stayed above −7.4. Thresholds 0.5 (as asked) and −8.5 (blanked). A held-out set of 10 questions
written afterwards passed 10/10.

## 5. Two ONNX inferences at once cause multi-second spikes (13 Oct)
**Severity:** High.
**Doing:** running the two relevance passes with `Promise.all`.
**Problem:** recall p95 went from under 300 ms to 4.6 s. Two sessions each spinning a full thread
pool fight for the same cores.
**Fix:** never run inferences concurrently; background embedding goes through a single queue;
thread pool limited to two threads with spinning off (`ONNX_THREADS`).

## 6. Windows battery "best power efficiency" throttles the server about tenfold (13 Oct)
**Severity:** Medium.
**Doing:** the latency test, 50 calls per tool, on a laptop on battery.
**Problem:** the first one or two seconds of work run at full speed (embedding 5 ms, eight
relevance pairs 26–57 ms); after that the same calls take ten times longer (embedding 50 ms,
relevance over 400 ms). `recall_memory` measured at seconds.
**Fix:** none in code. Latency must be measured on mains power and against the deployed server.
The latency test has not passed yet.

## 7. Dropbox syncs `node_modules` (13 Oct)
**Severity:** Low.
**Doing:** developing in a Dropbox folder.
**Problem:** Dropbox started uploading every file in `node_modules`, using most of a CPU core and
slowing test collection to 88 s.
**Fix:** marked the three `node_modules` folders with Dropbox's `com.dropbox.ignored` stream.

## 8. MCP TypeScript SDK: `registerTool` callback type with a generic schema (13 Oct)
**Severity:** Low.
**Doing:** a small wrapper that registers tools from a generic Zod shape and adds timing.
**Problem:** `ToolCallback<InputArgs>` is conditional on the schema generic, so a wrapper that is
itself generic over the shape cannot satisfy it without a cast, although the runtime shapes match.
**Fix:** `handler as never` in one place (`apps/mcp-server/src/tools.ts`).

## 9. The spec's own seed contradicts two demo scenarios (13 Oct)
**Severity:** Low.
**Problem:** scenario E expects "What did my mother cook?" to find nothing, but the seed includes
her mother's saag and scenario I talks about it. Scenario C tells the radio story live, but the
radio story is also a seed story.
**Fix:** E now uses a question with nothing stored ("What was my school like?"); "What did my
mother cook?" is an answerable eval question. `SEED_SKIP=radio` leaves the radio story out so it
can be told live.

## 10. No Docker on the build machine (12 Oct)
**Severity:** Medium.
**Problem:** FalkorDB could not be started locally, so nothing could be tested against it.
**Fix:** core talks to a small graph interface with two adapters. Tests and the eval run on the
in-memory adapter. The FalkorDB adapter is written but has not been run.
**Update (14 Oct):** run on a machine with Docker. `pnpm seed` and all 35 core tests passed
against FalkorDB with no adapter changes.

## 11. Stateless Streamable HTTP and GET (13 Oct)
**Severity:** Low.
**Doing:** serving `POST /mcp` with a fresh server and transport per request, so each request can
be bound to the role of its bearer token.
**Problem:** in stateless mode there is no stream for `GET /mcp` to serve; the SDK example answers
405, which is not obvious from the spec's "POST/GET /mcp".
**Fix:** `GET` and `DELETE` return 405 with `Allow: POST`.

## 12. Trend wording had to live in one file for two languages (13 Oct)
**Severity:** Low.
**Doing:** writing the Python trends agent, which must produce the same family sentences as
the TypeScript phrase templates.
**Problem:** two copies of fixed wording would drift, and the wording is a safety rule.
**Fix:** moved the banned list, trend templates and per-metric phrases into
`packages/core/src/trend-phrases.json`, read by both sides, with a test that the TypeScript
functions and the shared templates agree. Importing JSON in ESM needed `with { type: "json" }`.

## 13. A weekly share built from five stories is too noisy to flag (13 Oct)
**Severity:** Medium.
**Doing:** flagging `retell_rate` on the simulated history.
**Problem:** with five stories a week the share moves in steps of 0.2, so random draws gave
weeks of 0.8, 0.6, 0.2, 0.0 during a steady drift, and four weeks in a row never happened.
The same lumpiness made `orientation_asks` swing by more than 3 SD with no real change,
because its baseline spread was close to zero.
**Fix:** the generator now sets how many of a week's stories are retells instead of drawing
each one; count-based metrics get a minimum spread. Real data will have the same problem: a
person who tells two stories a week cannot produce a stable weekly share.

## 14. A once-a-week sample needs a large change to show (13 Oct)
**Severity:** Medium.
**Doing:** using the weekly photo description as the comparable sample for text markers (§7.1b).
**Problem:** one sample a week, with a 5% floor on the spread, did not flag the vocabulary drift
the spec describes (0.72 to 0.63) four weeks running.
**Fix:** the simulated drift was made larger (to 0.59). This is a property of the method, not
only of the demo: with one sample a week, only a clear change is visible.

## 15. No `uv`, and Python 3.12 not installed (13 Oct)
**Severity:** Low.
**Doing:** running the Python tests.
**Problem:** the machine has Python 3.11 and 3.13 and no `uv`; the spec's commands use `uv`.
**Fix:** a plain `venv` on 3.13 with `pytest`. The agents so far use only the standard
library, so nothing else was needed. `uv sync` has not been run on this project.

## 16. `pnpm seed` ignores `.env` (14 Oct)
**Severity:** Low.
**Doing:** seeding FalkorDB after `cp .env.example .env`, which sets `FALKORDB_URL`.
**Expected:** the seed writes to FalkorDB. **Actual:** "FALKORDB_URL is not set. Nothing to seed",
exit 1. The package scripts run plain `tsx`, which does not read `.env`.
**Workaround:** `FALKORDB_URL=redis://localhost:6379 pnpm seed` (as the handoff says).
**Fix (15 Oct):** the package scripts now run `tsx --env-file-if-exists=../../.env`.
**Suggestion:** a "missing env var" message could mention that `.env` is not read automatically.

## 17. onnxruntime aborts when `pnpm eval:recall` exits (14 Oct)
**Severity:** Medium.
**Doing:** running the grounding eval on macOS (Apple silicon, Node 22).
**Expected:** a clean exit after the results. **Actual:** the eval prints PASS, then the process
dies with `libc++abi: terminating due to uncaught exception of type std::__1::system_error: mutex
lock failed: Invalid argument`. It happens when the process exits while an ONNX session is live.
**Fix (15 Oct):** `dispose()` both models, then let Node exit on its own (`process.exitCode`).
Disposing alone was not enough: `process.exit()` right after `dispose()` still aborted (exit 134).
**Suggestion (onnxruntime-node):** release sessions in an exit hook, or document that
`process.exit()` with a live or just-released session aborts the process.

## 18. MCP Apps 2.x requires the v2 MCP SDK (14 Oct)
**Severity:** High.
**Doing:** adding MCP Apps cards to a server built on `@modelcontextprotocol/sdk` 1.32.
**Expected:** the latest `@modelcontextprotocol/ext-apps` works with the SDK named in its docs.
**Actual:** ext-apps 2.x is typed against the v2 split SDK (`@modelcontextprotocol/server`,
`client`, `core`) and peers on zod 4; using it would mean migrating the server. Nothing in the
install output says so; it shows up in the type imports.
**Workaround:** pinned ext-apps `^1.7.5`, whose peer range is `@modelcontextprotocol/sdk ^1.29`.
**Suggestion:** state the required SDK major in the ext-apps README and as a peer dependency.

## 19. The MCP Apps cards were missing on a fresh clone (15 Oct)
**Severity:** Medium.
**Doing:** cloning the merged repo on a second machine (Windows) and running `pnpm test`.
**Problem:** one test failed with `ENOENT … packages/ui-cards/dist/story-card.html`. The cards are
build output, `dist/` is git-ignored, and only the MCP server's `predev` script and the Dockerfile
built them, so `pnpm test` on a clean checkout could not pass.
**Fix:** a root `postinstall` builds the cards on every `pnpm i` (`pnpm build:cards` by hand).

## 20. `pnpm dev` on Windows: no `uv`, no FalkorDB, and orphaned processes (15 Oct)
**Severity:** Medium.
**Doing:** running the full stack on Windows without Docker or `uv`.
**Problem:** the worker command failed (`'uv' is not recognized`), and it would have had nothing to
read anyway, since without FalkorDB the graph lives inside the MCP server process. Stopping the
launcher killed only the shells it had started; on Windows their children (tsx, vite) keep running.
**Fix:** `scripts/dev.mjs` skips the worker with a message when `FALKORDB_URL` is empty, falls back
to `agents/.venv` when `uv` is missing, and stops each child's whole process tree with `taskkill /T`
on Windows. The Ctrl+C path on Windows has not been exercised by hand yet.

## 21. First Bedrock run: Anthropic models were gated, Nova Pro worked (15 Oct)
**Severity:** High.
**Doing:** the first live run of the simulator's Converse loop and the Strands extract agent, on
Shambhvi's AWS account in `us-east-1`.
**Problem:** `list-foundation-models` listed Claude Haiku 4.5 and 5.5 as ACTIVE, but calling them
failed. Haiku 4.5: `ResourceNotFoundException: Model use case details have not been submitted for
this account`. Haiku 5.5: `AccessDeniedException: … is not available for this account`. Neither
shows up until you call the model.
**Fix:** Amazon Nova models need no form. Nova Pro (`us.amazon.nova-pro-v1:0`) for both the voice
loop and extraction. To use Claude later, submit the Anthropic use-case form in the Bedrock console.

## 22. Nova 2 Lite returned `null` where the schema wanted a list (15 Oct)
**Severity:** Medium.
**Doing:** structured extraction with Strands (`structured_output(ExtractionOut, …)`) on Nova 2 Lite.
**Problem:** the first sentence failed Pydantic validation (`entities: Input should be a valid list,
input_value=None`), and after allowing `null` it found nothing on sentences that clearly name people
and things. Nova Pro on the same sentences found father, Patiala, the radio and 1968.
**Fix:** `ExtractionOut` treats `null` as an empty list (so a model quirk cannot fail a job), and
extraction uses Nova Pro.

## 23. "Your next tablet" named a dose missed nine hours earlier (15 Oct)
**Severity:** High.
**Doing:** the first live voice-loop run, at 17:34, asking "What day is it today?".
**Problem:** the answer ended "Your next tablet is your sugar tablet, at 8:00": the first unmarked
dose of the day, however long ago. For someone with memory loss that invites a late or double dose.
The unit tests ran at 09:00, where the old rule happened to be right.
**Fix:** "next tablet" names only a dose that is upcoming or at most 60 minutes late; missed doses
stay on the family page. Tested at 17:30, 20:45 and 21:30.

## 24. Git Bash rewrote `/dev/xvda` into a Windows path (15 Oct)
**Severity:** Low.
**Doing:** `aws ec2 run-instances --block-device-mappings 'DeviceName=/dev/xvda,…'` from Git Bash.
**Problem:** `InvalidBlockDeviceMapping: Invalid device name C:/Program Files/Git/dev/xvda`. MSYS
path conversion rewrites anything that looks like a Unix path, even inside a quoted argument. The
security group and Elastic IP had already been created, so the failure was half-way through.
**Fix:** `MSYS_NO_PATHCONV=1` for every AWS CLI call from Git Bash.

## 25. AgentCore needs to create a service-linked role on first use (16 Oct)
**Severity:** Medium.
**Doing:** `create-agent-runtime` as the scoped `recollect-deploy` user.
**Problem:** "Failed creating service linked role. Please verify that the calling role has sufficient
permissions to create a service linked role." The deploy docs list the execution role's permissions
but not this one-time permission for the caller, and the error does not name the service.
**Fix:** allowed `iam:CreateServiceLinkedRole` only where `iam:AWSServiceName` is
`*.bedrock-agentcore.amazonaws.com`.

## 26. One AgentCore session per call meant a cold start per sentence (16 Oct)
**Severity:** High.
**Doing:** the first calls to the deployed extract agent.
**Problem:** correct answers, but 11–12 s per sentence, against 1–3 s calling Bedrock directly. The
client used a new `runtimeSessionId` for every call, and each new session starts a new microVM. A
six-sentence story would have taken over a minute; scenario C needs about 10 s.
**Fix:** one session per worker, renewed hourly (the agent is stateless). Now 1–3 s per sentence;
the radio story reaches the graph in about 8 s end to end.

## 27. The seed raced the worker (16 Oct)
**Severity:** Medium.
**Doing:** seeding the deployed graph while the worker was running.
**Problem:** the worker extracted a seeded story, adding junk entities to it. The seed saved each
story (which queues a job) and marked the job done a moment later; the worker polls every 2 s and
took one in the gap. Locally the worker had never run during a seed.
**Fix:** `rememberStory({ queued: false })` creates the job already done. Tested.

## 28. Extraction proposed pronouns, verbs, bare years and whole sentences (16 Oct)
**Severity:** Medium.
**Doing:** live extraction with Nova Pro on the seed stories.
**Problem:** entities named "I", "bring", "1968" and "I was eighteen years old." All were exact
substrings of the quote, so the span check let them through.
**Fix:** the prompt now says what an event is; validation drops pronouns, bare numbers and names over
five words or with sentence punctuation. Tested.

## 29. The latency budget cannot be met from India (16 Oct)
**Severity:** High.
**Doing:** `pnpm test:latency` against the deployed URL in us-east-1, from a laptop in India.
**Problem:** every call failed (p95 336–409 ms) while the server's own time was p95 3–85 ms: about
280 ms is the network round trip.
**Fix:** none needed for Alexa+, which calls from AWS. Measured again from inside AWS through the same
public HTTPS endpoint: passes, worst p95 144 ms. Both results are in the README.

## 30. The worker image did not carry the simulated history (21 Oct)
**Severity:** Low.
**Doing:** recording the demo video against the live deployment.
**Problem:** the doctor report the worker had just regenerated said "0 questions … 0 of 0 tablets".
`trends/live.py` merges the simulated daily counts from `data/simulated/markers.json`, but the worker
Dockerfile copies only `agents/`, so the file was missing in the container and the merge silently
did nothing. Tests ran from the repo, where the file exists.
**Fix:** the worker image copies the file. Regenerated report: 309 questions, 320 of 336 tablets.

## 31. Latency chips looked red from India (21 Oct)
**Severity:** Low.
**Doing:** the same recording, with the simulator in India and the server in us-east-1.
**Problem:** the simulator's latency chips showed 300–1,400 ms in amber and red: round trips
dominated by the network, while the server itself took 2–30 ms. That would have told viewers the
tools were slow.
**Fix:** chips and the strip now show the server's own time (coloured against the budget) next to
the round trip, both labelled.

## 32. Nova and Hindi in tool calls (23 Oct)
**Severity:** High.
**Doing:** Hindi and Hinglish in the simulator's Converse loop (`us.amazon.nova-pro-v1:0`), with tool
descriptions asking for lookup arguments in English.
**Problem:** two failures. Some Hindi sentences made Bedrock return "Model produced invalid sequence
as part of ToolUse" (no reply at all), and the failed turn stayed in the history, so the next turn
answered four questions at once. When we asked Nova to translate the question first, it sometimes
added an explanation, or for "what was my school like?" a whole made-up essay about a school, which
then reached recall and matched an unrelated story.
**Fix:** her sentence is translated to one English line before the tool loop, cut to the first line
and a word limit, and shown on screen; a failed turn is removed from the history. Her own words
(stories, her day) are passed to the tools exactly as she said them. Unit tests cover all three.
**Suggestion:** document Devanagari in tool-use arguments for Nova, and a "translation only" mode.
