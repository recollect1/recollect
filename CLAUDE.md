# CLAUDE.md — Recollect build spec

**Recollect** is an Alexa+ companion for people living with early dementia or Alzheimer's,
and for their families. It does three things on one memory graph:

1. **Keeps their life memory** — stories, people and places, stored in their own words and
   linked in a graph. Answers about the past are always real quotes, never invented.
2. **Supports daily life** — did I take my tablet, what day is it, who is this, where is my
   grandson — with the same calm answer every time; an evening calm routine for late-day
   confusion ("sundowning"); a printable "This is me" profile for carers and hospitals.
3. **Notices change over time** — the same everyday conversations become a natural speech
   sample. Recollect tracks memory-related speech markers against the person's **own
   baseline** and tells the family, gently, when a sustained change is worth mentioning to a
   doctor. It never diagnoses.

Entry: Amazon "Build, Ship, Shape" hackathon — **Alexa+ track** + **AWS Builder**
mini-challenge, plus the **Open Source** mini-challenge (`mcp-latency`, §15). Submit
**Oct 23, 2026 evening IST** (deadline Oct 24, 00:30 IST).

Read this whole file before writing code. If an installed SDK's real API differs from this
file, the SDK wins: fix the code, update this file, add a friction-log entry (§15).

---

## 1. Non-negotiable rules

1. **Never invent a memory.** Answers about the past are built only from stored `Quote`
   nodes (verbatim words, speaker, date). Nothing relevant stored → say so (`nothingRecorded`).
   No model writes the spoken answer to a memory question.
2. **Never diagnose.** Recollect "tracks changes in speech against the person's own baseline."
   It never says it detects, predicts, screens for, treats or slows dementia or Alzheimer's.
   Banned in every family card, report and spoken line (case-insensitive): `diagnos`,
   `dementia detected`, `alzheimer's detected`, `you have`, `signs of dementia`, `risk score`,
   `cognitive decline detected`, `screening result`. Every report carries the line
   "This is not a medical assessment."
3. **No LLM call inside an MCP tool handler.** Alexa+ requires tool round-trip < 500 ms.
   Our budget: **p95 < 250 ms**, no call ≥ 500 ms. Extraction, speech analysis and report
   writing run in background agents after the tool returns.
4. **Same calm answer every time.** Daily-memory tools never say "you already asked."
   Repeats are logged silently.
5. **Medicine wording** only from §8 templates. Banned in any medicine response: `safe to`,
   `you can take`, `it's fine`, `no problem`, `stop taking`, `increase`, `decrease`,
   `double`, `skip`.
6. **Consent and control.** Change tracking is off until the person and a family admin both
   turn it on. The person can say "stop tracking my speech" or "keep this private" at any
   time. Family sees trends and counts, never private stories or raw audio. Audio is
   analysed then deleted; only numeric features are kept. "Delete everything" works.
7. **Honest demo data.** All people, stories and speech histories are fictional. Any
   multi-week trend shown is synthetic or acted and labelled "simulated data" on screen.
   No real patient recordings. Do not vendor licence-restricted corpora (e.g. DementiaBank).
8. **Real MCP on both ends.** Real Streamable HTTP MCP server (spec 2025-11-25+); the
   simulator is a real MCP client. Never fake a tool call in the UI.
9. **MIT license** at repo root from the first commit; public GitHub repo.
10. **Scope.** Not in this build: Parkinson's or motor-speech analysis, Ring, Fire TV, Bee,
    payments, drug-interaction checks, non-English speech, voice cloning, real Alexa+
    certification.

---

## 2. The two analysis modes (state this in the README and submission)

A real Alexa+ add-on receives **text**, not the user's audio. So:

| Mode | Where | Input | Markers |
|---|---|---|---|
| **Alexa-native** | Works within real Alexa+ limits | Transcript text passed to MCP tools | Text + graph markers (§7.1, §7.2) |
| **Full voice** | Recollect simulator and family page only, with explicit consent | Browser audio recorded during story mode | Adds timing markers (§7.3) |

Submit a **feature request** to Amazon: "consented on-device acoustic features (pause and
speech-rate statistics, not audio) for health and care add-ons." Priority: Important.

---

## 2b. Feature priorities (from the PRD)

**P0 — must ship:** tell a story · grounded recall · honest "nothing saved" · self-building
graph · family listening · keep private · what's today · dose check/log · where is ·
same calm answer · **who's who cards** · **evening calm routine** · two-step consent · text
markers · graph markers · **weekly photo description** · **evening-confusion marker** ·
baseline + trends · family trend card · doctor report · family page · **"This is me"
profile** · Alexa+ simulator · latency strip + evals · Claude Desktop check · Agent Skill.

**P1 — if P0 is green by Oct 21:** story prompts · photos on story cards · **night-time
reassurance** · timing markers (full-voice) · live graph panel.

**P2 — only if time is left:** her own music playlist · carer check-in with "what to say"
suggestions.

---

## 3. Stack

- **MCP server:** Node.js 22, TypeScript strict, pnpm workspaces, `@modelcontextprotocol/sdk`
  (Streamable HTTP), `zod`, `vitest`. MCP Apps cards via `@modelcontextprotocol/ext-apps`
  (copy its `basic-host` and `basic-server-vanillajs` examples).
- **Graph:** FalkorDB (Docker locally, Railway in prod), `falkordb` npm client, Cypher;
  vector index on quote embeddings (fallback: in-process array — the seed is small).
- **Embeddings in tools** (allowed, not an LLM): local sentence-embedding model in-process via
  `@huggingface/transformers` (MiniLM-class ONNX), warmed at boot, < 40 ms per query.
- **Background agents:** Python 3.12, **Strands Agents SDK**, models on **Amazon Bedrock**
  (IDs from env: `BEDROCK_EXTRACT_MODEL_ID`, `BEDROCK_REPORT_MODEL_ID`). Deploy on
  **Bedrock AgentCore Runtime**; fallback is a plain Railway worker until AgentCore works.
  Long-lived per-person preferences in **AgentCore Memory** if time allows.
- **Speech analysis:** Python — `numpy`, `soundfile`, `webrtcvad` (or energy-based VAD) for
  pauses; plain-Python text metrics (no heavy NLP dependency unless needed; `spacy` small
  English model allowed for part-of-speech counts).
- **Simulator (Alexa+ web) and family page:** Vite + React; the simulator's server route calls
  Bedrock Converse. AWS keys never reach the browser.
- **Report charts:** inline SVG in the family page and the HTML doctor report.

---

## 4. Repo layout

```
recollect/
  LICENSE  README.md  CLAUDE.md  docker-compose.yml  .env.example
  docs/  friction-log.md  product-feedback.md  feature-requests.md  architecture.png
  packages/
    core/                # TS: graph client, schema, phrases, recall, daily, seed
      src/graph.ts  src/schema.cypher  src/embed.ts  src/phrases.ts
      src/recall.ts  src/daily.ts  src/seed/  test/
    ui-cards/            # MCP Apps: story card, today card, family trend card
  agents/                # Python, Strands
    extract/             # quote → entities, relations, story prompts (§9.1)
    markers/             # text, graph and timing markers per session (§7)
    trends/              # baseline, change detection, family card + doctor report (§9.3)
    synth/               # synthetic 12-week history generator for the demo (§12)
    tests/
  apps/
    mcp-server/          # Streamable HTTP MCP server
    alexa-sim/           # Echo-Show-style MCP client, voice, story mode, audio capture
    family/              # family page: setup, consent, stories, today, trends, report
  skill/                 # Recollect Agent Skill (SKILL.md + examples)
```

---

## 5. Seed household (fictional)

- **Gurdev Kaur, 78**, Patiala, lives with her son's family. Early-stage memory loss. Speaks
  English to Recollect. (All names fictional.)
- **Aman**, grandson in London, calls on Sundays. **Simran**, daughter-in-law, family admin.
  **Harpreet**, home helper, Mon–Sat 10:00.
- Medicines (generic names, family-written purpose): BP tablet 8:00 and 20:00; sugar tablet
  8:00; calcium 14:00.
- 6 seed stories (60–150 words, her voice): arriving in Patiala after her wedding, the village
  well, her brother Jagdish, the first radio in the house, Aman's birth, her mother's saag.
- A synthetic 12-week speech-marker history (§12) labelled `simulated: true`.

Demo scenarios the seed must support:

- A. "Did I take my BP tablet?" after an 8:10 log → "Yes, at 8:10."
- B. "Where is Aman?" × 3 → identical calm answer; family page shows "asked 3 times today."
- C. Live story: she tells the radio story → saved instantly → graph gains Radio, 1968, her
  father, Patiala within ~10 s.
- D. Aman (family role) asks "How did Grandma come to Patiala?" → her words + date, story card.
- E. "What was my school like?" with nothing stored → `nothingRecorded`. (Proves no invention.)
  (Was "What did my mother cook?", but the seed includes her mother's saag — see §19.)
- F. She tells the well story again (third time this month) → Recollect thanks her warmly as
  usual; the repetition is recorded as a marker, never mentioned to her.
- G. Family trend card (simulated history): "Over 8 weeks, Gurdev pauses longer and names
  people less often than in August. Worth mentioning at her next check-up." → open doctor report.
- H. "Who's this?" / "Who's Aman?" → who's-who card: photo, "Aman, your grandson, Simran's
  son, lives in London."
- I. 5 pm (demo clock can be fast-forwarded): simulated lights turn on, familiar music starts,
  "It's evening, Gurdev. Shall we have some tea and talk about your mother's saag?"
- J. Weekly photo moment: "Would you tell me about this photo?" (same family photo each week)
  → saved as a `photo_desc` session for comparable markers.
- K. (P1) 3 am: "I need to go to the market" → "It's three at night and everyone is asleep.
  The market opens in the morning." Dim light on; a repeat or "I'm going out" → family alert.
- L. Family page → "This is me" printable profile built from the graph.

---

## 6. Graph model

Nodes:
`Household{id,name,tz}` · `Person{id,name,role:'elder'|'family'|'helper',aliases[],relation,statusLine?}` ·
`Session{id,startedAt,speakerId,mode:'story'|'daily'|'family',private,hasAudio}` ·
`Quote{id,text,speakerId,saidAt,sessionId,embedding,private}` ·
`Entity{id,kind:'person'|'place'|'event'|'thing',name,aliases[],year?}` · `Photo{id,url,caption}` ·
`StoryPrompt{id,text,basedOnEntityId,used}` · `Medicine{id,name,purpose,aliases[]}` ·
`Schedule{id,time,qty}` · `DoseEvent{id,at}` · `Visit{id,personId,daysOfWeek[],time}` ·
`AskEvent{id,intent,at}` · `MarkerSet{id,sessionId,computedAt,simulated,…metrics}` ·
`Baseline{id,personId,from,to,…stats}` · `TrendFlag{id,metric,direction,since,weeks,status}` ·
`Consent{id,personId,trackingOn,byElderAt,byFamilyAt}` ·
`Profile{personId,preferredName,likes[],calms[],upsets[],routines[],communicationTips[]}`
(family-written + facts confirmed from stories) · `WeeklyPhoto{id,photoId,week,sessionId}` ·
`Device{id,kind:'light'|'speaker',room,state}` (simulated home) ·
`RoutineEvent{id,kind:'evening'|'night',at,actions[],escalated}`

Person gains `photoUrl` and `relationToElder` (e.g. "grandson, Simran's son") for who's-who.

Edges:
`(Session)-[:HAS_QUOTE]->(Quote)` · `(Quote)-[:MENTIONS {span}]->(Entity)` ·
`(Quote)-[:RETELLS {similarity}]->(Quote)` (same story told again) ·
`(Entity)-[:SAME_AS]->(Person)` · `(Entity)-[:RELATED {label}]->(Entity)` ·
`(Photo)-[:DEPICTS]->(Entity)` · `(Person)-[:TAKES]->(Schedule)-[:OF]->(Medicine)` ·
`(Person)-[:LOGGED]->(DoseEvent)-[:OF]->(Medicine)` · `(Person)-[:ASKED]->(AskEvent)` ·
`(Session)-[:MEASURED]->(MarkerSet)` · `(TrendFlag)-[:ABOUT]->(Person)`

Indexes on every `id`, `Entity.name`, `Quote.saidAt`, `DoseEvent.at`, `AskEvent.at`,
`MarkerSet.computedAt`, vector index on `Quote.embedding`.

Invariant: every `MENTIONS` span is a substring of its quote (enforced in §9.1).

---

## 7. Speech markers (background only, per session)

All markers are compared with the person's own baseline. None is meaningful alone. Cite the
general research basis in the README (linguistic changes such as reduced vocabulary
diversity, more pronouns and vague words, and longer pauses are widely studied in
Alzheimer's speech research) without claiming clinical validity.

### 7.1 Text markers (Alexa-native mode)

Computed from the elder's own utterances in a session (skip sessions < 50 words):

- `mattr` — moving-average type-token ratio, window 50 words (vocabulary diversity)
- `vague_rate` — per 100 words: thing, stuff, something, whatsit, that one, you know
- `pronoun_noun_ratio` — pronouns ÷ nouns
- `mean_utt_len` — mean words per utterance
- `idea_density` — propositions per 10 words, approximated as (verbs + adjectives +
  adverbs + prepositions + conjunctions) ÷ words × 10
- `self_corrections` — per 100 words ("no, I mean", "what's it called")

### 7.2 Graph markers (the graph's unique contribution)

- `retell_rate` — stories this week whose quote embedding similarity to an earlier quote is
  ≥ 0.85 (creates `RETELLS`); counted per week
- `named_recall` — for known people/places mentioned this week: share referred to by name vs.
  by vague reference ("that man", "my son's boy") when the entity's `relation` is known
- `new_entity_rate` — new people/places/events per story (narrative richness)
- `orientation_asks` — daily count of `AskEvent` intents `whats_today`, `where_is`,
  `check_dose`, `who_is`
- `evening_orientation_share` — share of orientation asks made 16:00–22:00 (late-day
  confusion); also counts night asks 00:00–05:00

### 7.1b Weekly photo description
Once a week Recollect shows the same family photo and asks her to describe it (never a test,
no right answers, no follow-up correction). These `photo_desc` sessions get their own weekly
marker series; trends prefer them when ≥ 4 exist, because a fixed task gives comparable samples
(as in published picture-description research).

### 7.3 Timing markers (full-voice mode, simulator only, consent required)

From the recorded story-mode audio (16 kHz mono), then the audio is deleted:

- `pause_rate` — pauses ≥ 0.5 s per minute of speech
- `mean_pause_s`, `long_pause_rate` (≥ 2 s per minute)
- `speech_rate_wpm` — words ÷ voiced minutes (word count from the transcript)
- `phonation_ratio` — voiced time ÷ total time

---

## 8. Phrase templates (`packages/core/src/phrases.ts`)

All spoken sentences come from here. Tests enforce §1.2 and §1.5 banned words, and that memory
answers contain a stored quote or `nothingRecorded`.

- `fromTheirWords(quote, speakerName, date)` → to elder: `You told me on {date}: "{quote}"`;
  to family: `{name} said on {date}: "{quote}"`
- `nothingRecorded(topic)` → `I don't have anything saved about {topic} yet. Would you like to tell me about it?`
- `storySaved()` → `Thank you, I've kept that.` (identical for retold stories)
- `doseTaken(name, time)` → `Yes, you took your {name} at {time} today.`
- `doseNotYet(name, due)` → `Your {name} is due at {due}. It isn't marked as taken yet.`
- `doseLogged(name, time)` → `Noted, {name} at {time}.`
- `doseAlreadyLogged(name, time)` → `Your {name} was already marked at {time} today. If you're unsure, please ask Simran.`
- `today(...)` → `It's {weekday}, {d} {month}. {visitor line}. {next dose line}`
- `personStatus(name, statusLine)` → `{name} {statusLine}.`
- `privateKept()` → `Alright, I'll keep that just for you.`
- `trackingPaused()` → `Okay, I've stopped tracking your speech. You can turn it back on with Simran any time.`
- `whoIs(name, relationToElder, extra?)` → `That's {name}, your {relation}. {extra}` (extra = status line)
- `whoIsUnknown()` → `I'm not sure who that is. Simran can add them for me.`
- `eveningHello(name, offer)` → `It's evening, {name}. {offer}` (offer from Profile.calms, e.g. "Shall we put on your music?")
- `nightReassure(name)` → `It's night time, {name}, and everyone is asleep. You're safe at home. Let's rest until morning.`
- `nightPlaceReassure(place)` → `The {place} opens in the morning. We can go after breakfast.`
- `weeklyPhotoPrompt(name)` → `{name}, would you tell me about this photo? There's no right or wrong answer.`
- `photoThanks()` → `Thank you, I loved hearing that.`
- Family trend lines (family page and cards only, never spoken to the elder):
  - `trendStable(name, weeks)` → `{name}'s speech has stayed close to their usual pattern over the last {weeks} weeks.`
  - `trendChange(name, changes[], since)` → `Since {since}, {name} {change list}. Worth mentioning at the next check-up. This is not a medical assessment.`
  - change phrases, one per metric, e.g. `pauses longer`, `uses fewer different words`,
    `names familiar people less often`, `retells the same stories more often`

Never vary wording based on repeat counts.

---

## 9. Background agents (`agents/`, Strands on AgentCore)

Triggered by a queue (FalkorDB list, poll every 2 s) when a session closes.

### 9.1 Extract agent
1. Bedrock (tool-use JSON schema): per quote → entities `{kind,name,year?,span}` and relations
   `{from,to,label}`.
2. Validate: drop entities whose span isn't exactly in the quote; drop orphan relations;
   resolve to existing entities (alias / ≤ 2 edits); link family via `SAME_AS`.
3. Write entities, `MENTIONS`, `RELATED`; embed quotes; create `RETELLS` edges (§7.2).
4. Story prompts for entities mentioned once with no story ("You mentioned your brother
   Jagdish. Where did he live?"); max 3 open.
5. Emit SSE so the graph view grows live.

### 9.2 Markers agent
Computes §7.1–7.3 for the session (no LLM needed), writes a `MarkerSet`. Deletes audio after.

### 9.3 Trends agent (weekly, and on demand for the demo)
1. **Baseline** = first 14 days with ≥ 5 qualifying sessions: per-metric median and MAD.
2. **Weekly value** = median of that week's sessions.
3. **Flag** a metric only when its weekly value is ≥ 1.5 robust SD from baseline in the
   "worse" direction for **4 consecutive weeks** (avoid alarms from a bad day).
4. ≥ 2 flagged metrics → `TrendFlag` + family trend card via `trendChange`; otherwise
   `trendStable`. The report agent may use Bedrock only to order and format template
   sentences — never to add claims; output is checked against the §1.2 banned list.
5. **Doctor report** (HTML, printable): consent dates, sessions analysed, per-metric weekly
   chart vs. baseline band, flagged metrics, orientation-question counts, dose adherence,
   "simulated data" banner when applicable, and "This is not a medical assessment."

### 9.4 Routine agent
- **Evening calm** (P0): at the household's local dusk minus 30 min (or 17:00 if unknown),
  write a `RoutineEvent`: turn on simulated lights, queue familiar music (royalty-free demo
  tracks, or P2 playlist), set a short-reply flag that the simulator reads, and have the next
  greeting use `eveningHello`. No news or TV prompts after 16:00.
- **Night reassurance** (P1): between 00:00–05:00, intents about leaving or going somewhere get
  `nightReassure` / `nightPlaceReassure` and a dim simulated light. Two such asks within
  30 min, or any "I'm going out", → family alert (in-app + SNS SMS if configured). Never
  claims to replace emergency services.
- **Weekly photo** (P0): schedules the weekly photo prompt for a calm daytime moment.

### 9.5 "This is me" builder (P0)
Builds a one-page printable profile from `Profile` (family-written) plus facts the family has
confirmed from stories (important people, places, routines, likes, what calms, what upsets,
how to talk with her). Family must approve each story-derived fact before it appears.

Agent failures never affect tool responses. Retry twice, then log.

---

## 10. MCP server (`apps/mcp-server`)

- `POST/GET /mcp` (Streamable HTTP), `/healthz`. Bearer token → `{householdId, role}`
  (`ELDER_TOKEN`, `FAMILY_TOKEN`).
- Boot: pool, schema, warm embeddings, test recall. Log negotiated protocol version.
- Every result includes `_meta: {"recollect/latencyMs": n}`; JSON log lines `{tool, ms, ok}`.

| Tool | Role | Input | Does | Writes |
|---|---|---|---|---|
| `remember_story` | elder | `{text, private?, audioRef?}` | stores verbatim quotes, closes session → agents | Session, Quote |
| `recall_memory` | both | `{question}` | grounded recall (§11); `say`, quotes, story card | AskEvent (elder) |
| `whats_today` | elder | `{}` | date, visitors, next dose; today card | AskEvent |
| `check_dose` / `log_dose` | elder | `{medicine?}` / `{medicine, at?}` | taken/not yet; log or already-logged | DoseEvent |
| `where_is` | elder | `{person}` | family-written status | AskEvent |
| `keep_private` | elder | `{}` | marks last session private | Session |
| `pause_tracking` | elder | `{}` | turns change tracking off | Consent |
| `story_prompt` | both | `{}` | next open prompt | StoryPrompt |
| `family_summary` | family | `{date?}` | doses, stories, repeated questions | — |
| `speech_trend` | family | `{weeks?}` | latest stored trend card (never computed in the call) | — |
| `who_is` | both | `{name?, photoId?}` | who's-who card from the family graph | AskEvent (elder) |
| `photo_moment` | elder | `{text?}` | without text: returns the weekly photo + `weeklyPhotoPrompt`; with text: saves a `photo_desc` session | Session, Quote |
| `routine_state` | both | `{}` | current routine (evening/night/none), short-reply flag, device states — read by the simulator | — |
| `this_is_me` | family | `{}` | the latest approved profile as a printable card | — |

Tool descriptions are voice-first and end with: "Read the `say` field exactly as written."
`recall_memory`, `whats_today`, `speech_trend`, `who_is` and `photo_moment` declare MCP Apps
cards via `_meta.ui.resourceUri` (`ui://recollect/story-card`, `ui://recollect/today-card`,
`ui://recollect/trend-card`, `ui://recollect/who-card`, `ui://recollect/photo-card`) with
matching `structuredContent`.

---

## 11. Grounded recall (`packages/core/src/recall.ts`)

1. Embed question locally. 2. Entity hits via in-memory alias map. 3. Candidates = quotes
mentioning hit entities ∪ top-8 by vector similarity; exclude `private` for family.
4. Score = 0.6·cosine + 0.4·entity overlap; keep ≥ `RECALL_MIN_SCORE` (start 0.45, tune on the
eval). 5. None → `nothingRecorded`. 6. Else `fromTheirWords`, 1–2 quotes, ≤ 45 words, cut at a
sentence boundary, **text copied, never rewritten**. The simulator speaks `say` verbatim.

---

## 12. Demo data generator (`agents/synth`)

Generates a 12-week history for Gurdev: ~5 sessions/week of `MarkerSet`s with
`simulated: true`. Weeks 1–4 near a baseline with noise; from week 6 a gradual drift in
`mean_pause_s`, `named_recall`, `retell_rate`, `mattr`. Deterministic seed. The family page
shows a "Simulated data" banner whenever any shown point is simulated. Optionally the team
records two short acted samples ("week 1" and "week 12" style), labelled acted, to show the
full-voice pipeline running live.

---

## 13. Front ends

**Alexa+ simulator** (Echo Show look: light ring, transcript, card area)
- Server route holds AWS credentials; MCP client: initialize → tools/list → Bedrock Converse
  tool loop (≤ 4 calls/turn). Speak a tool's `say` directly, bypassing model text.
- System prompt: warm, calm, ≤ 2 short sentences; read `say` exactly; never add facts about the
  past; never comment on repeated questions; never mention speech tracking to the elder.
- Push-to-talk (Web Speech API, en-IN) + text fallback; TTS replies.
- Story mode: "I want to tell you a story" → listen until a 4 s pause or "that's all"; if
  full-voice consent is on, record audio in parallel and upload with the transcript.
- MCP Apps via AppBridge; fallback renders `structuredContent`.
- **Latency strip** (ms per call, running p95; green < 250, amber < 500, red ≥ 500).
- **Live graph panel** (toggle): entities and `RETELLS` edges appear as agents write.
- Role switch: Gurdev (elder) / Aman (family).
- **Simulated home panel**: living-room light, bedroom night light, speaker — reflect
  `routine_state`; a demo clock that can jump to 17:00 or 03:00 for scenarios I and K.
- Short-reply mode during the evening routine (≤ 1 sentence).

**Family page**
- Setup: status lines, helper schedule, medicines + aliases, photos.
- **Consent**: two-step on/off for change tracking and for full-voice mode, with plain
  explanations; delete-everything button.
- Stories (private hidden), story prompts, today (doses, stories told, repeated questions
  with "Repeats are normal; Recollect answers the same way every time").
- **Trends**: per-metric weekly chart with the baseline band, the current trend card, and
  "Open doctor report."
- **People**: photos, names and relationships for who's-who cards.
- **"This is me"**: edit the profile, approve story-derived facts, print.
- **Weekly photo**: choose the photo used every week.
- (P2) **Carer check-in**: weekly "How are you doing?" for the admin, respite reminder, and
  "what to say" suggestions for common moments (e.g. asking for a parent who has died —
  suggest comfort and redirection, not correction). Fixed, reviewed text only.

Also verify the same server in **Claude Desktop** as a remote MCP connector; record ~10 s.

---

## 14. Agent Skill (`skill/`)

A `SKILL.md` that teaches any assistant how to support someone with memory loss using the
Recollect MCP tools: speak briefly and warmly, read `say` verbatim, never correct or quiz the
person, never mention repetition, offer a story prompt when conversation stalls, escalate to
family for anything medical. Include 6 example exchanges. The Alexa+ rules list Agent Skills
as a creative feature; mention it in the submission.

---

## 15. Tests, evals, submission

**Tests and evals**
- Phrases: banned-word tests (§1.2, §1.5) over every template output; same-answer test
  (`where_is` × 5 → identical `say`).
- **Grounding eval** (`pnpm eval:recall`): 30 questions on the seed (20 answerable, 10 not);
  pass = right story quoted for all answerable, `nothingRecorded` for all others, 0 invented
  content. Table in README.
- **Marker tests**: unit tests on hand-made transcripts with known values (e.g. a 100-word
  text with 5 vague words → `vague_rate` = 5); retell detection on paraphrased seed stories.
- **Trend tests**: synthetic histories — stable → no flag; one bad week → no flag; 4-week
  sustained drift on 2 metrics → flag; drift on 1 metric → no flag.
- Extraction property test: every stored span is a substring of its quote.
- Routine tests: demo clock at 17:00 → evening `RoutineEvent` with lights on and short-reply
  flag; 03:00 + two "going out" asks → one family alert (P1).
- `who_is` returns the right relation for every seeded person; unknown → `whoIsUnknown`.
- "This is me" contains only family-written or family-approved facts.
- **Latency** (`pnpm test:latency`): each elder tool 50× against the deployed URL; fail if any
  p95 ≥ 250 ms or any call ≥ 500 ms.

**Submission checklist**
- [ ] Public repo, MIT visible in About; README: what/who/why, the two analysis modes,
      architecture image, ≤ 5 setup commands, demo tokens, eval/latency results, AWS
      integrations section (Strands, AgentCore, Bedrock — file paths), safety and consent.
- [ ] Video < 3 min, public, English, no copyrighted music:
      0:00–0:20 the problem (memory loss, family far away, change noticed too late) ·
      0:20–0:55 scenarios A, H, B (dose, who's-who card, same calm answer) ·
      0:55–1:25 C, D, E (live story, graph grows, her own words, "nothing saved" proof) ·
      1:25–1:45 I (evening routine: lights, music, short replies) ·
      1:45–2:20 J + G + L (weekly photo series, family trend card, doctor report, This is me;
      "simulated data" visible) ·
      2:20–2:45 engineering: latency strip, agents, Claude Desktop, eval table ·
      2:45–3:00 impact, consent, next steps.
- [ ] Track **Alexa+**; mini-challenge **AWS Builder** (describe services in product feedback).
- [ ] "Built in the window": new repo, Oct 2026. If any NeuroVoice code or ideas are reused,
      say exactly what was reused and what is new.
- [ ] `docs/product-feedback.md` for MCP SDK, ext-apps, Bedrock, Strands, AgentCore.
- [ ] `docs/friction-log.md` ≥ 8 entries, written as issues happen (up to 10% bonus).
- [ ] `docs/feature-requests.md` — consented acoustic features for care add-ons; a public
      Alexa+ web simulator for builders.
- [x] **Open Source** mini-challenge: `mcp-latency` (https://github.com/yash4428/mcp-latency), a
      new MIT CLI that measures MCP tool latency against the Alexa+ budget. Devpost fields in
      `docs/open-source.md`.

---

## 16. Plan (IST)

| Dates | Must be done |
|---|---|
| Oct 12–14 | repo + MIT, compose, schema, seed, phrases + tests, core tools, recall + embeddings, extract agent, grounding eval passing, latency test passing, markers, synth history, trends + doctor report, Agent Skill, worker, cards, simulator, family page |
| Oct 15 | P1: night reassurance + family alert, timing markers from story-mode audio, live graph panel; deploy files; docs (AWS integrations, architecture); Open Source entry `mcp-latency` published |
| Oct 16–17 | Bedrock live run (worker + simulator voice loop), Railway deploy, `pnpm test:latency` against the deployed URL, Claude Desktop check; Amazon office hours if blocked |
| Oct 18–21 | microphone test in a real browser, AgentCore deploy of the worker if access allows, polish, video script |
| Oct 22 | record video, README, feedback, friction log |
| Oct 23 | submit in the evening; add reviewers; confirm video is public |

Cut first if late: P2 → night reassurance → timing markers (keep text + graph markers) →
graph panel → photos on story cards → `story_prompt`. Never cut: grounding eval, latency
test, consent, "not a medical assessment."

---

## 17. Env and commands

```
FALKORDB_URL=redis://localhost:6379
ELDER_TOKEN=change-me-elder
FAMILY_TOKEN=change-me-family
AWS_REGION=us-east-1
BEDROCK_CHAT_MODEL_ID=
BEDROCK_EXTRACT_MODEL_ID=
BEDROCK_REPORT_MODEL_ID=
RECALL_MIN_SCORE=0.45
RECALL_DIRECT_MIN=0.5
RECALL_MASKED_MIN=-8.5
ONNX_THREADS=2
DEMO_CLOCK=
SEED_SKIP=
MCP_SERVER_URL=http://localhost:8787/mcp
```

```
pnpm i && (cd agents && uv sync)
docker compose up -d falkordb
pnpm seed && (cd agents && uv run python -m synth)
pnpm dev              # mcp-server :8787, alexa-sim :5173, family :5174
(cd agents && uv run python -m worker)
pnpm test && (cd agents && uv run pytest)
pnpm eval:recall
pnpm test:latency
```

Deploy: Railway — `falkordb`, `mcp-server` in one region; agents on AgentCore Runtime (or a
Railway worker as fallback); simulator and family page on Vercel or Railway.

---

## 18. Working agreement for Claude Code

Built end to end by Claude Code, in this order: §4 scaffold → §5–6 → §8 → §10 core tools →
§11 → §9.1 → §15 eval → §7 + §9.2–9.3 + §12 → §9.4–9.5 → §13 → §14 → §15 docs.
Build P0 first (§2b); start P1 only when every P0 test is green.

**Only the human can do these — ask, never fake or silently stub:**
1. AWS account with billing (hackathon credits ran out Oct 7), Bedrock model access in
   `AWS_REGION`, AgentCore access, IAM keys in `.env`.
2. Railway login and deploy.
3. Testing voice and audio capture in a real browser with a microphone.
4. Recording acted speech samples (if used), the demo video, and the Devpost text.
5. Adding Recollect to Claude Desktop for the clip.
6. Confirming every friction-log and feedback entry is true.

When blocked, say exactly what's needed and continue with work that doesn't depend on it
(local seed; mock Bedrock in local dev only — never in the demo path).

- One section at a time; its tests green before the next.
- No new dependencies beyond §3 without a one-line reason in the commit.
- `phrases.ts` changes always come with test updates in the same commit.
- Never let model-generated text reach the speaker for memory, medicine or trend statements.
- When an SDK disagrees with this file: fix code, update this file, log friction.

---

## 19. Where the build differs from this file (keep current)

Recorded as the code was written. Each has a friction-log entry where one applies.

- **Graph access (§3, §6).** Core talks to a small `Graph` interface (`packages/core/src/graph.ts`)
  with two adapters: `FalkorGraph` (Cypher) and `MemoryGraph` (tests, the eval, and local dev when
  `FALKORDB_URL` is empty). `FalkorGraph` first ran on 14 Oct: the seed and the core suite pass on
  FalkorDB unchanged (`core.test.ts` uses graph `recollect_test` when `FALKORDB_URL` is set).
- **Recall (§11).** Entity overlap is counted per story, not per sentence, so "She cooked it
  slowly" still belongs to the mother named a sentence earlier. After the §11 score, a local
  cross-encoder (`Xenova/ms-marco-MiniLM-L-6-v2`, a classifier, same library as the embedder)
  checks relevance: first the question as asked (`RECALL_DIRECT_MIN`), and if that does not pass,
  the question with known names replaced by pronouns (`RECALL_MASKED_MIN`). It only selects among
  stored quotes or causes `nothingRecorded`; it never produces text. Without it, 4 of 10
  unanswerable eval questions returned a real but irrelevant quote.
- **Quotes.** A story is stored as one `Quote` per sentence, with `seq` for order. `Session` has
  an extra mode `photo_desc`; those sessions are excluded from recall and retell detection.
- **Embedding and RETELLS (§9.1 step 3)** run in the MCP server right after the tool has
  answered (`processSession`), through a one-at-a-time queue, so a story is recallable within
  seconds without the Python agents. Entities and relations still come from the extract agent.
- **Queue (§9).** `Job{queue, sessionId, done}` nodes in the graph, not a Redis list.
- **Routines (§9.4).** Evening and night state is computed in `routine_state` from the clock
  (`packages/core/src/daily.ts`), which also writes the day's `RoutineEvent`. Night reassurance and the
  family alert are the `night_reassure` tool (see "Night reassurance" below).
- **Demo clock.** `POST /demo/clock {"at": "17:00"}` with the family token, only when `DEMO_CLOCK=1`.
- **Seed (§5).** All six stories are seeded; `SEED_SKIP=radio` leaves the radio story out so
  scenario C can be told live. Scenario E's question changed (see §5).
- **Extra nodes.** `TrendCard` (the stored family card that `speech_trend` reads) and `Job`.
  `Visit` has `kind: visit | call`; `Consent` has `fullVoiceOn`; `Profile` has `approvedFacts`.
- **Extra phrase templates** beyond §8: `medicineUnknown`, `visitorComes`, `visitorCalls`,
  `noVisitors`, `nextDose`, `noMoreDoses`, `storyPromptFor`, `storyPromptOpen`, `noPhotoYet`,
  `trendNotReady`, `trackingOff`, `familySummary`, `repeatLine`, `thisIsMeReady`,
  `thisIsMeMissing`. The family admin's name is a parameter, not the literal "Simran".
- **MCP Apps cards (§10).** `packages/ui-cards` builds five single-file cards (story, today, who,
  trend, photo) with `@modelcontextprotocol/ext-apps` **1.7.x**, which works with the v1 MCP SDK
  this server uses (ext-apps 2.x needs SDK v2). The five tools declare them via
  `_meta.ui.resourceUri`; `whats_today` also returns `admin` for the card's call button. Seed
  photos are inline SVG drawings (data URIs): the `/photos/...` URLs pointed at files that did
  not exist, and cards cannot fetch anyway. `GET /mcp` returns 405 (stateless server).
- **ONNX threads.** Both local models run with `ONNX_THREADS` threads (default 2), spinning off,
  and never concurrently (friction log 5).
- **Agents.** Pure functions with tests: `extract/validate.py` (§9.1 step 2), `markers/`
  (§7.1–7.3 maths), `synth/` (§12), `trends/` (§9.3, including the doctor report).
  **Worker** (`python -m worker`, 14 Oct): polls `Job` nodes every 2 s; per session runs the
  Strands extract agent (`extract/agent.py`: `Agent` + `BedrockModel`, Pydantic structured
  output, one fresh agent per quote, temperature 0), then `validate` + `resolve`, writes
  `Entity`/`MENTIONS {span}`/`RELATED`/`SAME_AS`, story prompts (§9.1 step 4) and a `MarkerSet`
  (§9.2, only while `Consent.trackingOn`). It waits until the MCP server has embedded the
  session, skips extraction for `photo_desc`, retries twice then sets `Job.failed`. Seeded jobs are
  marked done by the seed (their mentions are hand-written). The MCP server reloads its recall
  index when the count of done jobs changes (3 s timer). Tested with a scripted extractor
  (tests only) in memory and on FalkorDB; **not yet run against Bedrock** (needs AWS access).
  It runs as a plain process (the spec's Railway fallback); no AgentCore code yet.
- **`storyPromptFor`** wording moved into `trend-phrases.json` (`templates.storyPromptFor`) so the
  Python worker and `phrases.ts` use the same template.
- **Trend wording is shared.** `packages/core/src/trend-phrases.json` holds the banned list, the
  trend templates and, per metric, its change phrase, worse direction and chart label.
  `phrases.ts` and `agents/common/phrases.py` both read it; a TS test checks they agree.
  It adds `long_pause_rate` and `phonation_ratio` phrases.
- **Simulated history.** `python -m synth` writes `data/simulated/markers.json`; `python -m trends`
  writes `trend.json` and `doctor-report.html` beside it. The seed loads the marker sets and the
  card into the graph (`loadSimulated`), so `speech_trend` works without the Python side
  running. The history starts Mon 20 Jul 2026; seed consent dates moved to 18 Jul to precede it.
  The mattr drift is 0.13 (not subtle) so a once-a-week photo sample can show it.
- **Trends (§9.3).** `retell_rate` is the share of a week's stories that are retells, not a
  count. Per-week metrics (`retell_rate`, `orientation_asks`, `evening_orientation_share`) take
  their baseline from the first 4 weekly values, since 14 days gives only two. Robust SD has a
  floor (5% of the median, or a fixed minimum for count-based metrics). The photo series is
  used for text markers once 8 photo sessions exist (4 for its baseline, 4 recent), not 4.
  `since` is the month in which the earliest flagged run began. Bedrock is not used to format
  the report: it is templates only.
- **Markers (§7.1).** Parts of speech come from closed word lists and suffix rules; no spaCy.
- **Doctor report route.** `GET /report/doctor` with the family token serves the generated HTML.
- **Simulator (`apps/alexa-sim`, 14 Oct).** Node backend (holds AWS keys and MCP tokens) + Vite/React
  page. MCP SDK v1 client per role; Bedrock Converse loop (≤ 4 tool calls) that speaks a tool's `say`
  verbatim and discards model text; a memory/medicine/today question answered without a tool is
  retried with `toolChoice: any`. Story mode, push-to-talk (en-IN), cards via AppBridge with a
  `structuredContent` fallback, latency strip, simulated home panel from `routine_state`, demo clock
  buttons (proxy to `POST /demo/clock`), one-sentence replies while `shortReplies` is set. `?debug`
  adds real direct tool calls. Not built yet: audio capture (P1 timing markers), live graph panel
  (P1). **Not yet run against Bedrock.**
- **Family page (`apps/family`, 14 Oct).** Vite/React; reads and writes through `/api/family/*` on the
  MCP server (family token; the Vite dev proxy adds it so the browser never holds it). Sections:
  today, speech changes (trend card, "Simulated data" label, doctor report link), stories (private
  ones counted, not shown) and prompts, people (status lines, photos), medicines, weekly photo,
  "This is me" (edit, approve story-derived facts, print), consent. **Two-step consent** is done on
  this page: step 1 records that she said yes (the family confirms it, ideally with her present),
  step 2 is the admin's own yes; turning off clears both. She can turn it off herself with
  `pause_tracking`; there is no spoken "turn it back on" (by design). Polls every 15 s (no SSE).
- **Cards are built on install** (root `postinstall`, also `pnpm build:cards`): `dist/` is not
  committed, and before 15 Oct only the Dockerfile built it, so tests failed on a fresh clone.
- **`pnpm dev`** runs `scripts/dev.mjs`: loads `.env` and starts the MCP server, the simulator
  (backend + Vite) and the family page. `pnpm dev:server` runs the MCP server alone.
- **Night reassurance (§9.4 P1, 15 Oct).** Elder tool `night_reassure {text}` (the routine table had no
  tool for it). 00:00–05:00: `nightReassure` (+ `nightPlaceReassure` when she names a place), bedroom
  light dim, `AskEvent` intent `night_out`. Two asks within 30 min or "I'm going out" → one
  `FamilyAlert` node (shown on the family page with an acknowledge button) + an escalated night
  `RoutineEvent`; SMS through Amazon SNS in the background only when `SNS_TOPIC_ARN` is set.
  Daytime: `goingOutDaytime`. New phrases `goingOutDaytime`, `nightAlert`, `NOT_EMERGENCY`.
- **Timing markers / full-voice mode (§7.3 P1, 15 Oct).** The simulator records story-mode audio only
  when `Consent.fullVoiceOn` (checked server-side again on upload), converts it in the browser to 16 kHz
  mono WAV, and the backend writes it to `.audio/` with an `audioRef` on the job. The worker runs an
  energy VAD (`agents/markers/vad.py`, numpy only, no webrtcvad) into `timing_markers`, adds the five
  timing metrics to the `MarkerSet`, and deletes the file in every case (consent off → deleted
  unanalysed). The simulator also deletes any audio older than `AUDIO_TTL_MIN` (60). Local only: the
  audio folder must be shared by the simulator and the worker (production would use S3 with a
  lifecycle rule). Not yet tested with a real microphone.
- **Worker without Bedrock** runs markers only (`Job.markersDone`), leaving the job open for
  extraction once `BEDROCK_EXTRACT_MODEL_ID` is set. `pnpm dev` now also starts the worker.
- **Live graph panel (§13 P1, 15 Oct).** `GET /api/graph` (either token; private stories left out for
  family) from `packages/core/src/graph-view.ts`: stories, entities, mentions, RELATED and story-level
  RETELLS. The simulator panel polls it every 3 s while open (no SSE).
- **AgentCore (15 Oct).** `agents/agentcore_app.py` wraps the extract agent in `BedrockAgentCoreApp`
  (`/invocations` takes `{quote, known_names}`, returns validated entities); the worker uses it via
  `InvokeAgentRuntime` (`extract/agentcore.py`) when `AGENTCORE_RUNTIME_ARN` is set, else Strands on
  Bedrock directly. Only the extract agent runs there; markers stay in the worker (no model needed).
- **Deploy (15 Oct).** `deploy/` has Dockerfiles for the MCP server, web (simulator at `/` and family
  page at `/family` in one Node service behind `WEB_PASSWORD`, proxying `/api/family/*` and
  `/report/doctor` with the family token), worker and AgentCore (arm64). Steps in `docs/deploy.md`.
- **Trends on the live graph (§9.3, 15 Oct).** `python -m trends --graph` (`agents/trends/live.py`)
  reads every MarkerSet and AskEvent/DoseEvent from FalkorDB, runs the same analysis, and writes the
  TrendCard, TrendFlags (`ABOUT` the elder) and a `DoctorReport{html}` node; nothing while tracking is
  off. The worker runs it weekly and for `trends` jobs (family page "Recalculate now").
  `/report/doctor` serves the graph's report, falling back to the demo file.
- **Not built yet (15 Oct):** weekly photo scheduling (§9.4 P0; `photo_moment` is on demand only).
- **Not deployed yet (15 Oct):** AgentCore, hosting (Railway or AWS), no Bedrock call made yet.
  **Needs a human:** Bedrock model access and IAM keys (the worker and the simulator's voice loop
  have not run against Bedrock), Railway login, microphone test, Claude Desktop clip, video.
- **Handoff:** `docs/handoff.md` lists what to run first on a machine with Docker.
- **Latency:** `pnpm test:latency` passes locally on FalkorDB (14 Oct, worst p95 38 ms); not yet
  run against a deployed server.
