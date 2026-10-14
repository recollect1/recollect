# Recollect

An Alexa+ companion for people living with early dementia or Alzheimer's, and for their families.
One memory graph does three jobs:

1. **Keeps their life memory.** Stories, people and places are stored in their own words. Answers
   about the past are always real quotes with the date they were said — never invented.
2. **Supports daily life.** "Did I take my tablet?", "What day is it?", "Who is this?", "Where is
   my grandson?" get the same calm answer every time. Repeats are logged silently, never mentioned.
3. **Notices change over time.** Everyday conversations become a speech sample that is compared
   with the person's **own baseline**. Recollect tells the family, gently, when a sustained change
   is worth mentioning to a doctor. **It never diagnoses. This is not a medical assessment.**

Built for Amazon's "Build, Ship, Shape" hackathon — Alexa+ track, AWS Builder mini-challenge.
All people, stories and speech histories in this repository are **fictional**.

> **Status (14 Oct 2026): work in progress.** The core package, the MCP server, the marker and
> trend maths, the simulated history, the doctor report and the Agent Skill are built and tested.
> The core suite also passes against FalkorDB. The agent worker (Strands on Bedrock, graph
> writes) is built and tested with a scripted extractor, but has not run against Bedrock yet.
> The simulator is built (not yet run against Bedrock); the family page is not built yet. See [What exists today](#what-exists-today).

## The two analysis modes

A real Alexa+ add-on receives **text**, not the user's audio. So Recollect has two modes:

| Mode | Where | Input | Markers |
|---|---|---|---|
| **Alexa-native** | Works within real Alexa+ limits | Transcript text passed to MCP tools | Text and graph markers |
| **Full voice** | Recollect simulator and family page only, with explicit consent | Browser audio recorded in story mode | Adds timing markers (pauses, speech rate) |

## What exists today

| Part | State |
|---|---|
| `packages/core` — graph port, schema, phrase templates, grounded recall, daily tools, seed | Built, tested |
| `apps/mcp-server` — Streamable HTTP MCP server, 15 tools, role tokens | Built, tested with a real MCP client |
| Grounding eval (`pnpm eval:recall`) | Passing, table below |
| FalkorDB adapter (`FalkorGraph`) | Built; seed and the 35-test core suite pass against FalkorDB (`FALKORDB_URL=redis://localhost:6379 pnpm test`) |
| Latency test (`pnpm test:latency`) | Passing locally on FalkorDB; deployed run still to do — see [Latency](#latency) |
| `agents/extract/validate.py` — span, orphan-relation and entity-resolution checks | Built, tested (`pytest`) |
| `agents/markers` — text, graph and timing marker maths | Built, tested |
| `agents/synth` — simulated 12-week history (`data/simulated/markers.json`) | Built, tested |
| `agents/trends` — baseline, sustained-change flags, family card, printable doctor report | Built, tested |
| `skill/SKILL.md` — Agent Skill with six example exchanges | Written |
| `agents/worker` + `agents/extract/agent.py` — Strands Agent on Bedrock extracts entities; validated graph writes, story prompts, marker sets | Built, tested (scripted extractor, in memory and on FalkorDB); **not yet run against Bedrock** |
| Audio capture for timing markers | Not built yet |
| `packages/ui-cards` — MCP Apps cards: story, today, who's-who, trend, photo | Built; served by the MCP server, tested |
| `apps/alexa-sim` — Echo-Show-style simulator: real MCP client, Bedrock Converse loop speaking `say` verbatim, story mode, cards, latency strip, simulated home, demo clock | Built; Converse loop tested with a stubbed Bedrock sender; **not yet run against Bedrock** |
| `apps/family` | Not built yet |

Picking this up? Start with [docs/handoff.md](docs/handoff.md).

### How change tracking decides

`agents/trends/detect.py`. The baseline is the person's own first 14 days (at least 5
conversations): a median and a robust spread per marker. Each week's value is the median of that
week. A marker is flagged only when it has been 1.5 robust standard deviations worse than
baseline for **four weeks in a row**, and the family is told only when **two or more** markers
are flagged. One bad day, one bad week or one noisy marker never raises a card. Tested on
synthetic histories: stable, one bad week, three bad weeks, drift on one marker, drift that
recovered, and a change for the better all raise nothing.

The demo history is **simulated** and labelled so everywhere it appears. On it, the card reads:
"Since August, Gurdev pauses longer, uses fewer different words, names familiar people less
often and retells the same stories more often. Worth mentioning at the next check-up. This is
not a medical assessment." The report is at `data/simulated/doctor-report.html`.

Limits: parts of speech come from word lists and suffix rules, not a tagger, so
`pronoun_noun_ratio` and `idea_density` are rough; they are only ever compared with the same
person's earlier values. None of this has been run on real speech, and no marker has clinical
validity.

## Setup

```
pnpm i
cp .env.example .env          # set ELDER_TOKEN and FAMILY_TOKEN
docker compose up -d falkordb
pnpm seed
pnpm dev                      # MCP server on http://localhost:8787/mcp
```

No Docker? Leave `FALKORDB_URL` empty and `pnpm dev` runs on an in-memory graph seeded at boot
(local development only; data is lost on exit).

The first run downloads two small local ONNX models (about 50 MB together) from Hugging Face.

```
pnpm test            # unit and MCP server tests, offline
pnpm eval:recall     # grounding eval with the real local models
pnpm test:latency    # 50 calls per elder tool against MCP_SERVER_URL
(cd agents && uv run pytest)
```

Demo tokens are whatever you set in `.env`: `ELDER_TOKEN` gets Gurdev's tools, `FAMILY_TOKEN` gets
the family's. Send one as `Authorization: Bearer <token>`.

## How grounded recall works

No model writes the spoken answer to a memory question (`packages/core/src/recall.ts`):

1. Embed the question locally (MiniLM, in-process) and find the people, places and things it names.
2. Candidates = sentences from stories that mention those entities, plus the top 8 by vector
   similarity. Score = 0.6 × cosine + 0.4 × entity overlap; below 0.45 → "nothing saved".
3. **Relevance check.** A small local cross-encoder (a classifier, not a generative model) asks
   whether a candidate answers the question — once as asked, and once with the names blanked out.
   Sharing a name is not an answer: "Where did Aman go to university?" must not return the story
   of his birth.
4. The answer is one or two of her sentences, at most 45 words, copied verbatim with the date:
   `You told me on 3 August 2026: "…"`. Otherwise:
   `I don't have anything saved about that yet. Would you like to tell me about it?`

### Grounding eval

`pnpm eval:recall`, seed household, real local models. Full table: [docs/eval-recall-latest.md](docs/eval-recall-latest.md).

| Set | Answerable: right story quoted | Unanswerable: "nothing saved" | Invented content |
|---|---|---|---|
| 30 questions (thresholds tuned on this set) | 20 / 20 | 10 / 10 | 0 |
| 10 held-out questions (written after tuning, never tuned on) | 6 / 6 | 4 / 4 | 0 |

Five of the unanswerable questions name a person she *has* talked about ("What was my mother's
name?"). Those are the hard case; the first version of recall failed four of them.
Limits: 40 questions on six stories is a small test, and the thresholds are fitted to it.

### Latency

Budget: p95 under 250 ms and no call at 500 ms or over, per tool, measured through a real MCP client.

Measured 14 Oct 2026 on a MacBook (Apple silicon, mains power) against FalkorDB in Docker,
50 calls per tool, round trip through the MCP SDK client:

| Tool | p50 ms | p95 ms | max ms | server p95 ms |
|---|---|---|---|---|
| remember_story | 3 | 7 | 16 | 6 |
| recall_memory (found) | 9 | 12 | 14 | 9 |
| recall_memory (nothing saved) | 1 | 2 | 4 | 1 |
| whats_today | 2 | 8 | 14 | 7 |
| check_dose | 2 | 8 | 9 | 8 |
| log_dose | 1 | 7 | 8 | 6 |
| where_is | 2 | 10 | 11 | 9 |
| who_is | 2 | 11 | 12 | 10 |
| keep_private | 24 | 38 | 39 | 37 |
| pause_tracking | 1 | 1 | 2 | 1 |
| story_prompt | 1 | 1 | 2 | 0 |
| photo_moment | 1 | 1 | 1 | 1 |
| routine_state | 1 | 1 | 3 | 1 |

**Passes locally.** An earlier run on a Windows laptop on battery did not pass: power throttling
slowed `recall_memory` roughly tenfold under sustained load (friction log 6). The spec asks for a
run against the deployed server; that is still to do.

## Safety and consent

- **Never invents a memory.** Enforced by construction and by the eval above.
- **Never diagnoses.** Trend wording comes from fixed templates; a banned-word list is tested over
  every template (`packages/core/test/phrases.test.ts`). Every trend line ends
  "This is not a medical assessment."
- **Medicines:** fixed wording only; no advice. Unknown tablet → "please ask Simran".
- **Consent and control:** change tracking needs both the person and a family admin. "Stop tracking
  my speech" and "keep this private" work at any time. Family sees counts and trends, never private
  stories or audio.
- **Demo data is fictional**, and any multi-week trend shown is simulated and labelled so.

## Research basis

Reduced vocabulary diversity, more pronouns and vague words, and longer pauses are widely studied
linguistic changes in Alzheimer's speech research. Recollect compares these markers only with the
person's own earlier speech and makes no claim of clinical validity.

## AWS integrations

Planned, not built yet: Strands Agents SDK for the background agents (`agents/`), Amazon Bedrock
for extraction and report formatting, Bedrock AgentCore Runtime for hosting them. This section will
list file paths once they exist.

## License

MIT — see [LICENSE](LICENSE).
