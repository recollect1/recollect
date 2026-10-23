# Devpost submission — final text (23 Oct 2026)

Paste each section into the matching Devpost field.

---

## Elevator pitch

An Alexa+ companion for people living with dementia: it answers her worried questions the same calm way every time, gives her memories back in her own words, and quietly tells her family and doctor when something changes.

---

## About the project

## Inspiration

Dementia usually takes the newest memories first. Gurdev, the grandmother in our demo, can describe her wedding day in 1966: the bus to Patiala, the trunk on her lap. She cannot remember whether she took her blood-pressure tablet an hour ago. **57 million people live with dementia (WHO, 2021), and nearly 10 million more are diagnosed every year.** Behind almost every one of them is a family.

Living with it hurts three people in different ways:

- **The person living with dementia** spends the day in small, frightening uncertainties. *Did I take my tablet? What day is it? Where is my grandson?* She asks again and again, and she can feel people tiring of the answer. Being told "you already asked" or being corrected makes the anxiety worse, and late afternoons ("sundowning") and nights are often the hardest.
- **Her family and carers** are tired, busy, or far away. Answering the same question for the twentieth time wears people down. A grandson in London cannot see how she is, and the small changes that matter go unnoticed until they become a crisis. Her stories, her life, start disappearing before anyone writes them down.
- **Her doctor** sees her for ten minutes, a few times a year. The everyday conversations where change shows first never reach the consulting room. Research on speech in Alzheimer's disease shows that vocabulary, vague words, pauses and naming change gradually, but no one measures them at home.

We wanted something that lives where she already is, in her home and in her voice, and that makes life a little easier for all three of them. Alexa+ can now call outside tools through MCP, so we built **Recollect**.

## What it does

Recollect is an Alexa+ companion built on **one memory graph**. That graph does three jobs.

### 1. For her: calm answers, every time

- *"Did I take my BP tablet?"* → **"Yes, you took your BP tablet at 8:10 today."** The answer comes from the tablet log her family keeps. It is never guessed and never medical advice.
- *"Where is Aman?"* asked three times gets **the same gentle answer three times**. Recollect never says "you already asked." The repeats are logged silently for the family.
- *"Who's this?"* shows a who's-who card with a photo: "That's Aman, your grandson, Simran's son."
- At dusk an **evening calm routine** turns on the lights, plays familiar music and keeps every reply to one short sentence. At night, if she wants to "go to the market", Recollect reassures her ("It's night time and everyone is asleep. You're safe at home.") and alerts the family if she keeps trying to go out.
- She can speak **English, Hindi, or a mix**, and hears fixed, reviewed wording in her own language.

### 2. Her life story, in her own words

- She says *"I want to tell you a story"* and talks. Every sentence is **kept exactly as she said it**, with the date.
- When a memory slips away, she can ask *"How did I come to Patiala?"* and hear it back: **You told me on 3 August 2026: "I came to Patiala in 1966, two days after my wedding. I was eighteen years old."**
- If she never told it, Recollect says so: **"I don't have anything saved about that yet. Would you like to tell me about it?"** **It never invents a memory.** No AI model writes an answer about her past.
- Her family can explore her life on a live 3D **life timeline**. Each story sits at the year she said, or the year the family confirmed. Nothing is guessed.

### 3. For her family and her doctor: early, gentle notice of change

- **The family page** shows her day at a glance: tablets taken and missed, stories told, and the questions she kept coming back to ("asked 3 times today: repeats are normal"). It also has her stories, a printable **"This is me"** profile for carers and hospitals, a carer check-in and a coach with "what to say" suggestions, and **two-step consent** with "delete everything".
- **Speech changes, measured only against herself.** With consent from her and a family admin, everyday conversations become a natural speech sample. Recollect tracks vocabulary variety, vague words, pronouns, pauses, how often she names the people she loves, and how often she retells the same story. It compares them **only with her own baseline**.
- A change is flagged only when it **lasts four weeks on two or more markers**, so one bad day never raises an alarm. The family then gets a gentle card ("Worth mentioning at the next check-up. This is not a medical assessment."), and her **doctor gets a printable one-page report**: weekly charts against her baseline band, questions worth asking, tablet adherence and how often she asked orientation questions.
- **It never diagnoses.** A banned-word list ("diagnosis", "risk score", "signs of dementia"…) is tested over every sentence Recollect can produce.

## How we built it

### The MCP server (Alexa+)

A self-hosted **MCP server** (TypeScript, Streamable HTTP, protocol **2025-11-25**) with **26 tools**: 16 for her, 14 for her family, a few shared. Role tokens separate her tools from the family's. Five tools return **MCP Apps** cards (story, today, who's-who, speech trend, photo).

**No model runs inside a tool.** Every sentence she hears about memories, medicines or trends comes from fixed templates or from her own stored words. So every tool answers in milliseconds: slowest p95 **144 ms** measured against our AWS deployment, inside the Alexa+ 500 ms budget.

### The memory graph: FalkorDB

Everything Recollect knows about a household lives in **one FalkorDB graph**, queried with Cypher. We mapped her memories like this:

```
(Session)-[:HAS_QUOTE]->(Quote {text, saidAt, private})      her exact sentence, with the date
(Quote)-[:MENTIONS {span}]->(Entity {kind, name, year})      the person, place, event or thing it is about
(Entity)-[:SAME_AS]->(Person)                               "my grandson" in a story = Aman in the family
(Entity)-[:RELATED {label}]->(Entity)                       her father -[brought]-> the radio
(Quote)-[:RETELLS {similarity}]->(Quote)                    the same story told again
(Person)-[:LOGGED]->(DoseEvent)-[:OF]->(Medicine)           today's tablets
(Person)-[:ASKED]->(AskEvent)                               the questions she asks
(Session)-[:MEASURED]->(MarkerSet)                          speech markers, never audio
```

Mapping memories as a graph instead of a pile of text is what makes Recollect trustworthy:

- **Finding the right memory.** A question that names Patiala or her father starts at those entities and walks the `MENTIONS` edges to the sentences that mention them. Recall then scores each candidate:

$$\text{score}(q, s) = 0.6 \cdot \cos(\mathbf{e}_q, \mathbf{e}_s) + 0.4 \cdot \text{overlap}(\text{entities}_q, \text{entities}_{\text{story}(s)})$$

  A local relevance classifier then checks the question twice, once as asked and once with the names hidden, so sharing a name with a story is never enough. The classifier can only *choose* among stored quotes or answer "nothing saved"; it never produces text.
- **Every link points at her real words.** Each `MENTIONS` edge carries the span of text it came from, and the span must appear exactly in her quote. Entities that fail this check are dropped.
- **Noticing retold stories.** A new story that closely matches an earlier one gets a `RETELLS` edge. That drives the retelling marker, and lets the family see what stayed and what changed between tellings. She is never told.
- **One source for every view.** Her life timeline, the family page, the trend card and the doctor's report all read the same graph, so nothing is copied or re-summarised along the way.
- **Live.** In the demo, a story told aloud reaches the graph within seconds, linked to her father, Patiala and the radio she has mentioned before.

### Background agents on AWS

After she has been answered, background agents grow the graph:

- **Extract agent:** a **Strands Agents** agent on **Amazon Bedrock** (Amazon Nova Pro, structured output, temperature 0), hosted on **Bedrock AgentCore Runtime**, proposes the people, places, events and things in each sentence. A deterministic validator decides what reaches the graph.
- **Markers agent:** computes text, graph and (with consent) timing markers per session, and deletes any audio after analysis.
- **Trends agent:** builds her baseline and flags sustained change. For each metric $m$ it uses the baseline median $\tilde{x}_m$ and a robust spread $\sigma_m = 1.4826 \cdot \text{MAD}_m$, and flags a weekly value $x_{m,w}$ only when

$$\frac{x_{m,w} - \tilde{x}_m}{\sigma_m} \ge 1.5 \text{ (in the worse direction) for 4 consecutive weeks,}$$

  on at least **two** metrics before any family card appears. Vocabulary variety uses the moving-average type–token ratio, $\text{MATTR} = \frac{1}{N-W+1}\sum_{i=1}^{N-W+1} \frac{\text{types}(w_i \dots w_{i+W-1})}{W}$ with $W = 50$.

### The Alexa+ simulator and family page

- **Alexa+ simulator** (React): a real MCP client. Amazon Bedrock Converse picks the tool, and the simulator speaks the tool's answer **verbatim**, discarding the model's own text. It has push-to-talk, story mode, MCP Apps cards, a latency strip, a simulated home (lights, speaker) and a live memory-graph panel.
- **Family page** (React) with the doctor report, the "This is me" profile and the 3D life timeline (three.js).
- **Agent Skill** (`skill/SKILL.md`) that teaches any assistant how to support someone with memory loss using these tools.

### Evidence

| Check | Result |
|---|---|
| Grounding eval (30 questions: 20 answerable, 10 not) | **30/30**, **0 invented** answers |
| Held-out questions written after tuning | 10/10, 0 invented |
| Tests | 133 TypeScript + 51 Python, all passing |
| Latency on AWS (50 calls per tool) | slowest p95 **144 ms** (budget 500 ms) |

## Challenges we ran into

- **Never inventing a memory.** Matching on names alone returned real but wrong quotes: "What was my mother's name?" got a sentence about her mother's cooking. The fix was to check every question twice, once with the names blanked out, so a shared name is never enough. "Nothing saved" turned out to be one of the most important answers Recollect gives.
- **A safety bug that only appeared in the evening.** In our first live run at 17:34, "What day is it?" ended with "your next tablet is at 8:00", a dose missed nine hours earlier. For someone with memory loss that invites a double dose. Now only a dose that is upcoming or at most an hour late is ever offered as "next"; missed doses go to the family page instead.
- **Speed.** Running two local inferences at once pushed recall from under 300 ms to 4.6 s, and a new AgentCore session per call cost 11–12 s per sentence. We serialised inference and reused AgentCore sessions; a story now reaches the graph in about 8 s.
- **Honest change detection.** Weekly speech samples are small and noisy. We flag only sustained, multi-marker change against her own baseline, and test that a bad week, a single noisy marker or a recovered dip never raises a card.
- **Hindi in tool calls.** Some Hindi sentences broke tool use on Nova. We now translate her question to one English line before the tool loop, but pass her stories exactly as she said them, never translated.

## What we learned

In a health-adjacent assistant, most of the safety comes from **what the model is not allowed to do**. Models choose tools and propose graph links; fixed wording and her own words do the talking. We also learned that the gentlest design is often a refusal to act on something: never correcting her, never mentioning a repeat, and never diagnosing. A graph made those rules enforceable, because every answer can be traced back to a sentence she actually said.

## What's next

A pilot with families and carers (with ethics review), consented on-device acoustic features if Alexa+ offers them, more languages (Punjabi first), and speech markers validated per language.

*All people in this project are fictional. The 12-week speech history is simulated and labelled so on screen. Recollect is not a medical device and makes no diagnosis.*

---

## Built with

typescript · node.js · python · model-context-protocol · mcp-apps · alexa · falkordb · cypher · amazon-bedrock · amazon-nova · strands-agents · amazon-bedrock-agentcore · amazon-polly · amazon-sns · amazon-ec2 · amazon-ecr · aws-iam · aws-systems-manager · react · vite · three.js · transformers.js · onnx-runtime · docker · caddy

---

## "Try it out" links

- https://github.com/recollect1/recollect
- https://github.com/yash4428/mcp-latency
- <your YouTube/Vimeo video link>

---

## Code repository URL

https://github.com/recollect1/recollect

---

## AWS Builder: which AWS services did you incorporate and how?

- **Amazon Bedrock (Converse API, Amazon Nova Pro `us.amazon.nova-pro-v1:0`).** Used in two places:
  1. The Alexa+ simulator's conversation loop. Our 26 MCP tools are mapped to Bedrock `toolConfig`, with at most 4 tool calls per turn. The tool's `say` field is spoken verbatim and the model's own text is discarded, and `toolChoice: any` is forced when a memory or medicine question would otherwise be answered without a tool (`apps/alexa-sim/server/converse.ts`).
  2. The model behind our extract agent.
- **Strands Agents SDK.** The extract agent (`agents/extract/agent.py`): one `Agent` with `BedrockModel` per sentence, Pydantic structured output, temperature 0. It turns her sentences into people, places, events and things for the FalkorDB memory graph. It only *proposes* entities; a deterministic validator (`agents/extract/validate.py`) keeps only those whose text appears exactly in her words.
- **Amazon Bedrock AgentCore Runtime.** Hosts the extract agent (`agents/agentcore_app.py`, `BedrockAgentCoreApp`, arm64 container). The worker calls it with `InvokeAgentRuntime` (`agents/extract/agentcore.py`). Reusing one runtime session per worker cut extraction from 11–12 s to 1–3 s per sentence, so a story told aloud reaches the graph in about 8 seconds.
- **Amazon EC2, Amazon ECR, AWS IAM, AWS Systems Manager Parameter Store.** Our deployment (16–21 Oct): one EC2 host running FalkorDB, the MCP server, the web apps, the agent worker and Caddy for HTTPS, from images in ECR. AWS access was only through the instance role (no keys on the host), with secrets in Parameter Store (`deploy/aws/`, `docs/deploy-aws.md`). Measured from inside AWS, every tool passed the Alexa+ budget: slowest p95 144 ms.
- **Amazon SNS.** Optional SMS to the family when a night-time alert is raised, sent in the background after the tool has answered (`apps/mcp-server/src/sms.ts`). Built; switched off in the demo.
- **Amazon Polly.** Recollect's voice in our demo video (neural voices via SSML).

Design rule across all of them: **no model runs inside an MCP tool handler, and no model writes a sentence about her memories, medicines or speech trends.** Bedrock chooses tools and proposes graph links; her own words and fixed templates do the talking.

---

## Open Source Mini Challenge

**Yes.**

- **Contribution URL:** https://github.com/yash4428/mcp-latency
- **Project repository URL:** https://github.com/recollect1/recollect
- **GitHub username:** yash4428

**What we did.** `mcp-latency` is a new, MIT-licensed command-line tool and library, created during the hackathon. It measures how fast an MCP server's tools answer, checked against a latency budget. It defaults to the Alexa+ rule: every tool round trip under 500 ms, with p95 under 250 ms.

**How it works.**
- It connects to any Streamable HTTP MCP server as a real MCP client (the official TypeScript SDK), warms up, then calls each tool many times in sequence, the way turns happen in a voice conversation.
- It reports p50, p95 and max round-trip times, plus the server's own handler time when the server reports one in `_meta`, as a Markdown table or JSON.
- It exits with code 1 when any tool is over budget or returns an error, so it can block a deploy in CI.
- It is safe by default: unless you name the calls to make, it only calls tools the server marks `readOnlyHint` and that need no arguments, so it never writes data on someone else's server.
- It is tested in GitHub Actions against a local MCP server with fast, slow, failing, writing and argument-taking tools.

**Why it matters.** Every Alexa+ integration is an MCP server, and Alexa+ drops a tool that takes 500 ms or more in the middle of a spoken conversation. Builders had no standard way to check this before shipping. We built it while proving Recollect's latency, and made it general so any team can run one command against their own server.

---

## Feature requests

**1. Consented on-device acoustic features for health and care add-ons — Important**
A real Alexa+ add-on receives transcript text, not audio. For care add-ons, the timing of speech matters as much as the words: longer and more frequent pauses are among the most studied speech changes in Alzheimer's disease. With explicit consent, let an add-on receive per-utterance acoustic *statistics* computed on the device, never audio: utterance duration, voiced duration, number and total length of pauses of 0.5 s or more, and word count.
*Why it matters to us:* Recollect's full-voice mode computes exactly these markers today, but it can only run in our own simulator. Statistics instead of audio keep anything identifiable on the device, and the consent is easy to explain to a family.

**2. A public Alexa+ web simulator for builders — Important**
A hosted simulator that connects to a remote MCP server, shows tool calls with timings, and renders MCP Apps cards.
*Why it matters to us:* we had to build our own Echo-Show-style MCP client to test the add-on. That cost days, and still can't reproduce real Alexa+ behaviour, such as how it calls tools and enforces the round-trip budget.

**3. A latency check for MCP tools in the Alexa+ developer console — Nice-to-have**
Alexa+ requires each tool round trip under 500 ms, but there is no official way to check this before submitting. A check in the developer console, run against the registered endpoint, would catch slow tools before customers do.
*Why it matters to us:* we wrote `mcp-latency` (our Open Source entry) to fill this gap for ourselves.

---

## Friction log

*(32 entries with severities are in `docs/friction-log.md`; the most important ones below.)*

**1. Bedrock: models listed as ACTIVE but not callable — High**
- **Task:** first live run of the simulator's Converse loop and the Strands extract agent in `us-east-1`.
- **Steps:** `aws bedrock list-foundation-models` showed Claude Haiku 4.5 and 5.5 as ACTIVE, so we called them.
- **Expected vs actual:** we expected the calls to work. Haiku 4.5 returned `ResourceNotFoundException: Model use case details have not been submitted for this account`, and Haiku 5.5 returned `AccessDeniedException`. Neither problem shows until you call the model.
- **Workaround:** switched to Amazon Nova Pro, which needs no form, for both the voice loop and extraction.
- **Suggestion:** show "use-case form required" or "not available for this account" in `list-foundation-models` and in the console model list.

**2. AgentCore: a new session per call means a cold start per sentence — High**
- **Task:** calling our extract agent deployed on AgentCore Runtime from the worker.
- **Steps:** called `InvokeAgentRuntime` with a new `runtimeSessionId` per call, as in the examples.
- **Expected vs actual:** we expected 1–3 s per sentence, as when calling Bedrock directly. Each call took 11–12 s, because every new session starts a new microVM. A six-sentence story would take over a minute.
- **Workaround:** one session per worker, renewed hourly (the agent is stateless). Now 1–3 s per sentence, about 8 s for a whole story.
- **Suggestion:** document the cost of a new session prominently, and give guidance on reusing sessions for stateless agents.

**3. AgentCore needs a service-linked role on first use — Medium**
- **Task:** first deploy of the extract agent to AgentCore Runtime with a scoped deploy user (`recollect-deploy`).
- **Steps:** ran `create-agent-runtime` with the execution-role permissions the deploy docs list.
- **Expected vs actual:** we expected the runtime to be created. It failed with "Failed creating service linked role. Please verify that the calling role has sufficient permissions to create a service linked role." The docs don't list this one-time permission for the caller, and the error doesn't name the service.
- **Workaround:** allowed `iam:CreateServiceLinkedRole` only where `iam:AWSServiceName` is `*.bedrock-agentcore.amazonaws.com`.
- **Suggestion:** list this permission in the AgentCore deploy docs, and name the service in the error.

**4. Nova Pro and Hindi in tool calls — High**
- **Task:** Hindi and Hinglish in the Converse tool loop.
- **Steps:** passed her Hindi sentence straight into the tool loop, with tool descriptions asking for English lookup arguments.
- **Expected vs actual:** we expected tool calls with English arguments. Some sentences returned "Model produced invalid sequence as part of ToolUse", and the failed turn stayed in the history. When we asked the model to translate first, it sometimes added explanations or made-up text that then reached recall.
- **Workaround:** translate to one English line before the tool loop, cut to the first line and a word limit, show it on screen, and drop failed turns from the history. Her stories are passed exactly as she said them.
- **Suggestion:** document Devanagari in tool-use arguments for Nova, and offer a "translation only" mode.

**5. MCP Apps 2.x silently requires the v2 MCP SDK — High**
- **Task:** adding MCP Apps cards to a server on `@modelcontextprotocol/sdk` 1.32.
- **Steps:** installed the latest `@modelcontextprotocol/ext-apps`.
- **Expected vs actual:** we expected it to work with the SDK named in its docs. 2.x is typed against the v2 split SDK and zod 4, and nothing in the install output says so.
- **Workaround:** pinned ext-apps `^1.7.5`.
- **Suggestion:** state the required SDK major in the README and as a peer dependency.

**6. The Alexa+ latency budget can't be checked from outside the US — High**
- **Task:** `pnpm test:latency` against our deployment in us-east-1, from India.
- **Steps:** ran 50 calls per tool through the public HTTPS endpoint.
- **Expected vs actual:** we expected a pass, since the server time was p95 3–85 ms. Every tool failed at p95 336–409 ms, because about 280 ms is network.
- **Workaround:** measured from inside AWS through the same endpoint: passes, slowest p95 144 ms.
- **Suggestion:** say which region Alexa+ calls tools from, and offer an official latency check (our feature request 3).

**7. A "next tablet" answer that only failed in the evening — High (our own bug, caught in a live run)**
- **Task:** first live voice run at 17:34: "What day is it today?"
- **Expected vs actual:** we expected the next upcoming dose. It named the first unmarked dose of the day, missed nine hours earlier, which could invite a double dose. Our unit tests had only run at 09:00.
- **Workaround:** "next" names only a dose that is upcoming or at most 60 minutes late; missed doses go to the family page. Tested at 17:30, 20:45 and 21:30.
- **Suggestion (for builders):** test time-dependent voice answers at several clock times. The Alexa+ docs could include this in their testing guidance.

---

## Project testing link / testing instructions

**Repository:** https://github.com/recollect1/recollect. Our AWS deployment ran from 16 to 21 Oct and has been taken down, so please run it locally. It needs Node 22, pnpm, Docker, and Python 3.12 with `uv`:

```
pnpm i && (cd agents && uv sync)
cp .env.example .env          # demo tokens: ELDER_TOKEN=change-me-elder, FAMILY_TOKEN=change-me-family; set DEMO_CLOCK=1
docker compose up -d falkordb
pnpm seed
pnpm dev                      # Alexa+ simulator http://localhost:5173 · family page http://localhost:5174 · MCP http://localhost:8787/mcp
```

- **No credentials are needed for the MCP server, the family page or the tests.** The Alexa+ simulator's voice loop and story extraction need Amazon Bedrock access: put AWS keys in `.env` and set `BEDROCK_CHAT_MODEL_ID` and `BEDROCK_EXTRACT_MODEL_ID` (we used `us.amazon.nova-pro-v1:0`). Without Bedrock, open the simulator with `?debug` to make real tool calls directly.
- **MCP endpoint:** `http://localhost:8787/mcp`, with `Authorization: Bearer change-me-elder` (her tools) or `Bearer change-me-family` (family tools). It works with any MCP client (a stdio bridge for Claude Desktop is described in `docs/claude-desktop.md`).
- **Try in the simulator (as Gurdev):**
  1. "Did I take my BP tablet?"
  2. "Where is Aman?" three times
  3. "I want to tell you a story" (then say "that's all" at the end) and open the memory graph panel
  4. "How did I come to Patiala?"
  5. "What was my school like?" (nothing saved)
  6. The demo clock buttons: Evening 17:00 and Night 03:00
- **Family page:** Today, Speech changes, then "Open doctor report", "This is me", and the life timeline.
- **Reproduce our numbers:** `pnpm test`, `(cd agents && uv run pytest)`, `pnpm eval:recall`, `pnpm test:latency`.
