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

> **Status (13 Oct 2026): work in progress.** The core package and the MCP server are built and
> tested. The background agents, simulator, family page, MCP Apps cards and Agent Skill are not
> built yet. See [What exists today](#what-exists-today).

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
| FalkorDB adapter (`FalkorGraph`) | Written, **not yet run** — no Docker on the build machine |
| Latency test (`pnpm test:latency`) | Written; **not yet passing** — see [Latency](#latency) |
| `agents/extract/validate.py` — span, orphan-relation and entity-resolution checks | Built, tested (`pytest`) |
| Rest of `agents/` (Bedrock extraction call, markers, trends, synth), `apps/alexa-sim`, `apps/family`, `packages/ui-cards`, `skill/` | Not built yet |

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

Measured locally on a laptop on battery (in-memory graph), 50 calls per tool: every tool except
`recall_memory` was inside the budget in round trip (p95 13–253 ms; `whats_today` was 3 ms over).
`recall_memory` was **not**: when it finds an answer it ran at seconds, not milliseconds, under
sustained load. In isolation the two local models take about 6 ms (embedding) and 25–60 ms
(relevance check), but Windows power throttling slowed the process roughly tenfold after a second
or two of continuous work. **The latency test has not passed yet.** It needs a run on mains power
and, as the spec requires, against the deployed server.

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
