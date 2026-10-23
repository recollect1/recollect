# Devpost submission — Recollect

Paste-ready, updated 23 Oct. Every field below goes into Devpost as written. The human submitting
this owns every sentence in it (CLAUDE.md §18.4).

## Fields

**Project name:** Recollect

**Tagline (elevator pitch):** An Alexa+ companion for people with early memory loss: it keeps her
life story in her own words, answers her daily questions the same calm way every time, and tells her
family, gently, when her speech changes.

**Track:** Alexa+ · **Mini-challenges:** AWS Builder, Open Source (`mcp-latency`, fields in
`docs/open-source.md`)

**Repo:** https://github.com/recollect1/recollect (MIT)

**Video:** <YouTube or Vimeo link, public> — file `video/final/recollect-under3.mp4`, 2:58, English.

**About the video:** The opening, the architecture and the close are animations. The voice conversations are a re-enactment. The narrator and Gurdev are voiced by our team;
Recollect's voice is Amazon Polly, and the microphone is replaced by her scripted words. Every reply
on screen and every Recollect line you hear is the real app's answer, recorded live from the running
system (local FalkorDB, MCP server, Strands worker on Amazon Bedrock with Nova Pro). All people are
fictional. The 12-week speech history is simulated and labelled "Simulated data" on screen.

**Testing instructions (for judges):** Run it locally in five commands (Node 22, pnpm, Docker,
Python 3.12 with `uv`):

```
pnpm i && (cd agents && uv sync)
cp .env.example .env          # set ELDER_TOKEN and FAMILY_TOKEN; DEMO_CLOCK=1
docker compose up -d falkordb
pnpm seed
pnpm dev                      # simulator http://localhost:5173 · family page http://localhost:5174
```

Without AWS keys, everything except the simulator's voice loop and story extraction works; the
simulator's `?debug` mode makes real tool calls directly. With Bedrock access, set
`BEDROCK_CHAT_MODEL_ID` and `BEDROCK_EXTRACT_MODEL_ID` (we used `us.amazon.nova-pro-v1:0`).
Try: "Did I take my BP tablet?", "Where is Aman?" (three times), "I want to tell you a story", then
switch to Aman and ask "How did Grandma come to Patiala?" `pnpm eval:recall` and `pnpm test:latency`
reproduce the numbers below. The AWS deployment we measured on 20–21 Oct has since been taken down.

## Inspiration

People living with early memory loss ask the same questions many times a day, and their families,
often far away, notice changes months late. We wanted an Alexa+ companion that keeps a person's
life story in their own words, answers everyday questions calmly and identically every time, and
gives the family an honest, early signal to take to a doctor — without ever diagnosing.

## What it does

- **Keeps her life memory.** She tells Recollect a story; it is saved verbatim and linked in a graph
  of people, places and events. Questions about her past are answered only with her own words and
  the date she said them. If nothing is saved, Recollect says so. No model writes these answers.
- **Supports daily life.** What day it is, who is visiting, whether a tablet was taken, where her
  grandson is, who someone is (with a photo card) — the same words every time, and she is never told
  she already asked. An evening routine dims the lights, plays familiar music and keeps replies to
  one sentence. At night, if she wants to go out, Recollect reassures her and alerts the family.
- **Notices change over time.** Everyday conversations become a speech sample. Recollect tracks
  vocabulary variety, vague words, pauses, how often she names familiar people and how often she
  retells a story, always against her **own** baseline. Only a change sustained for four weeks on two
  or more markers reaches the family, as a gentle card and a printable report for her doctor. It
  never diagnoses: every card says "This is not a medical assessment."
- **For the family:** a page with today's tablets, repeated questions ("repeats are normal"), her
  stories, a two-step consent switch, a printable "This is me" profile for carers, and "delete
  everything".

- **Memory fidelity and family.** Retold stories are compared with her first telling (what stayed,
  what changed) and a short "tell me about your day" chat sets her recent memory beside her long-ago
  memory, without ever quizzing or correcting her. Family members add their own memories to her
  stories (always attributed), leave a message read to her when she asks for them, and get a carer
  coach built from her own stories. A Memory Lane card replays her best stories with photos and
  family voices.
- **Care follow-through.** After a sustained change, Recollect prepares a pre-visit summary,
  questions for the doctor, a calendar invitation, a printable memory book and a tablet list to
  check with the pharmacy. The family approves each one; Recollect never books or buys anything.

- **Her first language.** She can speak Hindi, English or Hinglish, and hear fixed, reviewed
  Hindi wording for her day. Stories told in Hindi are kept word for word, never translated.

- **Her life in time, and her family's questions.** A live 3D timeline places each story at the
  year she said, or the year her family confirmed, never guessed. Grandchildren leave questions;
  Recollect asks her one at a calm moment and keeps her answer in her own words for them.

## How we built it

- **MCP server** (TypeScript, Streamable HTTP, protocol 2025-11-25): 26 tools (16 for her, 14 for
  her family, a few shared), role tokens, five **MCP Apps** cards (story, today, who's-who, trend, photo).
- **Memory graph** on **FalkorDB**, with local in-process embeddings and a small local relevance
  classifier, so a memory answer never waits on a model: every tool answers in milliseconds,
  inside the Alexa+ 500 ms budget.
- **Background agents** (Python): a **Strands Agents** extract agent on **Amazon Bedrock** turns her
  sentences into people, places and events, validated so every link points at words she actually
  said. It runs on **Bedrock AgentCore Runtime** with Amazon Nova Pro: a story told on the live
  deployment reaches the graph in about 8 seconds. Marker and trend agents compute speech markers
  and the family card. Night-time alerts to the family appear on the family page (SMS through
  Amazon SNS is built but not switched on).
- **Deployed on AWS:** one EC2 host (FalkorDB, MCP server, web, worker, HTTPS), AWS access only
  through IAM roles, secrets in SSM Parameter Store; narration for our video by **Amazon Polly**.
- **Alexa+ simulator** (React): a real MCP client with a Bedrock Converse tool loop that speaks a
  tool's answer verbatim and throws away the model's own text, a latency strip, a simulated home and
  a live memory-graph panel.
- **Agent Skill** (`skill/SKILL.md`) teaching any assistant how to use the tools with someone who has
  memory loss.

## Challenges we ran into

- **Grounding.** Matching on names alone returned real but irrelevant quotes ("What was my mother's
  name?" got a sentence about her cooking). We added a relevance check that asks the question twice,
  once with the names blanked out, so sharing a name is never enough. Grounding eval: 20/20
  answerable questions quoted the right story, 10/10 unanswerable ones said "nothing saved", 0
  invented; a held-out set written after tuning passed 10/10.
- **Honest trend detection.** Weekly samples are small and noisy; we flag only sustained,
  multi-marker change against the person's own baseline, and test that a bad week, a single noisy
  marker or a recovered dip never raises a card.
- Full list in `docs/friction-log.md`.

## Accomplishments we're proud of

Nothing she hears about her past is invented. Every tool is fast enough for Alexa+ (slowest p95
144 ms against the live deployment, measured from inside AWS). The family gets a careful, printable
signal instead of an alarm.

## What we learned

Most of the safety in a health-adjacent assistant comes from what the model is *not* allowed to do:
fixed wording for memories, medicines and trends, and models used only where a mistake can be caught.

## What's next

A pilot with families and carers (with ethics review), on-device acoustic features if Alexa+ offers
them (our feature request), and more of her language: Punjabi, Hindi questions about Hindi stories,
and speech markers validated per language. Memory Lane on Fire TV in the evening, and Ring telling
her who is at the door with the who's-who card.

## Built with

TypeScript · Node.js · Python · Model Context Protocol · MCP Apps · FalkorDB · Hugging Face
Transformers.js · Amazon Bedrock · Strands Agents · Amazon Bedrock AgentCore ·
Amazon EC2 · AWS Systems Manager · Amazon ECR · Amazon Polly · React · Vite · Caddy

## AWS Builder: services used

Amazon Bedrock (Converse, Nova Pro) for the extract agent and the simulator's conversation loop ·
Strands Agents SDK for the extract agent · Amazon Bedrock AgentCore Runtime hosting it · Amazon EC2,
ECR, IAM roles and SSM Parameter Store for the deployment · Amazon SNS for night alerts (built,
switched off) · Amazon Polly for Recollect's voice in the video. File paths are in the README's AWS section;
our experience with each is in `docs/product-feedback.md`.

## Before you press submit

- [ ] Upload `video/final/recollect-final.mp4` to YouTube or Vimeo as **Public**, paste the link above.
- [ ] Tracks: Alexa+; mini-challenges AWS Builder and Open Source (`docs/open-source.md`).
- [ ] Attach or link `docs/product-feedback.md`, `docs/friction-log.md`, `docs/feature-requests.md`
      (read them once: you are confirming they are true).
- [ ] Add teammates on Devpost; confirm the repo is public with MIT in About.
- [ ] Deadline: Sat 24 Oct 2026, 00:30 IST.
