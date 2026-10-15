# Devpost draft — Recollect

Draft, 15 Oct. Everything marked **[confirm]** must be true on submission day or be cut. The
human submitting this owns every sentence in it (CLAUDE.md §18.4).

**Track:** Alexa+ · **Mini-challenge:** AWS Builder · **Repo:** https://github.com/recollect1/recollect

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

## How we built it

- **MCP server** (TypeScript, Streamable HTTP, protocol 2025-11-25): 16 tools, role tokens for
  her and her family, five **MCP Apps** cards (story, today, who's-who, trend, photo).
- **Memory graph** on **FalkorDB**, with local in-process embeddings and a small local relevance
  classifier, so a memory answer never waits on a model: every tool answers in milliseconds,
  inside the Alexa+ 500 ms budget.
- **Background agents** (Python): a **Strands Agents** extract agent on **Amazon Bedrock** turns her
  sentences into people, places and events, validated so every link points at words she actually
  said; it is packaged for **Bedrock AgentCore Runtime** **[confirm deployed]**. Marker and trend
  agents compute speech markers and the family card; **Amazon SNS** sends the night alert by SMS
  **[confirm]**.
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
about 10–40 ms locally **[confirm against the deployed URL]**). The family gets a careful, printable
signal instead of an alarm.

## What we learned

Most of the safety in a health-adjacent assistant comes from what the model is *not* allowed to do:
fixed wording for memories, medicines and trends, and models used only where a mistake can be caught.

## What's next

A pilot with families and carers (with ethics review), on-device acoustic features if Alexa+ offers
them (our feature request), and more languages.

## Built with

TypeScript · Node.js · Python · Model Context Protocol · MCP Apps · FalkorDB · Hugging Face
Transformers.js · Amazon Bedrock · Strands Agents · Amazon Bedrock AgentCore **[confirm]** ·
Amazon SNS **[confirm]** · React · Vite · Railway **[confirm]**

## Notes for the submitter

- All people and data are fictional; the speech history is simulated and labelled so.
- Feature requests and product feedback: `docs/feature-requests.md`, `docs/product-feedback.md`.
- Open Source mini-challenge fields: `docs/open-source.md`.
