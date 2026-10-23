# Recollect film — script and shot list (v2, for approval)

Length: **2:53** (Devpost: judges may stop at 3:00). Plain look: solid dark navy background for text
slides, no particles, no gradients, fades only. Every app shot is full screen, no zoom, held long
enough to read.

Three kinds of audio:
- **NARRATOR** — your voiceover (I'll put a temporary voice in so you can hear the timing).
- **GURDEV** and **AMAN** — re-enacted lines, spoken to the app exactly as written (synthetic voices;
  a small on-screen note says "Re-enactment: voices are synthetic, every reply is the real app").
- **RECOLLECT** — the app's real reply text (the `say` from the tool), read in an assistant voice.

---

### 1 · The problem — 0:00–0:12 (text slide)
On screen, one line at a time, plain white on navy:
"57 million people live with dementia." · "It usually takes the newest memories first." ·
"Gurdev, 78, remembers her wedding in 1966 — not whether she took this morning's tablet."

NARRATOR: Fifty-seven million people live with dementia. It usually takes the newest memories first.
Gurdev can describe her wedding day in 1966, but not whether she took her tablet this morning.

### 2 · Who it hurts, and what Recollect is — 0:12–0:24 (text slide)
Three plain rows, then one line under them:
- **Her** — the same worried questions, all day
- **Her family** — far away, and they find out about changes too late
- **Her doctor** — sees her for a few minutes, a few times a year
- **Recollect: one Alexa+ companion for all three, built on one memory graph.**

NARRATOR: That hurts three people. She asks the same worried questions all day. Her family, often far
away, notices changes too late. Her doctor sees her for only a few minutes at a time. Recollect is an
Alexa Plus companion that helps all three.

### 3 · Her morning — 0:24–0:50 (simulator, full screen)
Clock jumps to 9:00; the greeting appears on the device.
NARRATOR (over the greeting): Here's her morning. Every answer comes from her family's schedule and
today's tablet log, in the same calm words every time — never medical advice.

GURDEV: Did I take my BP tablet?
RECOLLECT: Yes, you took your BP tablet at 8:10 today.
GURDEV: Who is Aman?  *(who's-who card with his photo)*
RECOLLECT: That's Aman, your grandson, Simran's son. Aman is in London and calls you on Sundays.
GURDEV: Where is Aman?
RECOLLECT: Aman is in London and calls you on Sundays.
GURDEV: Where is Aman?
RECOLLECT: Aman is in London and calls you on Sundays.
NARRATOR: Same answer. Never "you already asked."

(The light bar pulses while she speaks and her words appear as a live caption, as on a real device.)

### 4 · Her own language — 0:50–0:59 (simulator)
NARRATOR: She can speak Hindi, or mix both, and hear her own language back.
GURDEV (Hindi): अमन कहाँ है?   *(subtitle: "Where is Aman?")*
RECOLLECT (Hindi): Aman लंदन में हैं और रविवार को आपको फ़ोन करते हैं।   *(subtitle)*

### 5 · A story, and the memory graph — 0:59–1:35 (simulator, then the graph) — the centrepiece
GURDEV: I want to tell you a story.
RECOLLECT: I'm listening. Take your time, and say "that's all" when you're done.
GURDEV: My father came to visit us in Patiala in 1968, and he brought a radio. It was the first radio
in our house… *(the rest of her story scrolls in as a caption)* …That's all.
RECOLLECT: Thank you, I've kept that.

Cut to the **live memory graph** (from FalkorDB), held for ~18 s: her new story appears, then within
seconds *radio, 1968, front room, Radio Ceylon* appear and connect to *her father, Patiala, Balwant*
from stories she told weeks ago. A short label names each step as it happens.

NARRATOR: Every sentence she says is kept word for word in a FalkorDB graph. In the background, a
Strands agent on Amazon Bedrock AgentCore finds the people, places and things, and links them to what
she has already told us — this is the same father from her other stories. That graph is how Recollect
answers from her own words, notices when she retells a story, and asks her gentle questions about
people she has mentioned.

### 6 · Her words, never invented — 1:35–1:50 (simulator; role switch to Aman)
NARRATOR: Her grandson can ask too.
AMAN: How did Grandma come to Patiala?
RECOLLECT: Gurdev said on 3 August 2026: "I came to Patiala in 1966, two days after my wedding. I was
eighteen years old."  *(story card)*
GURDEV: What was my school like?
RECOLLECT: I don't have anything saved about that yet. Would you like to tell me about it?
NARRATOR: If she never said it, Recollect says so.

### 7 · Questions from the family — 1:50–2:02 (family page, then simulator)
Aman types a question on the family page; at 15:20 the device asks her.
RECOLLECT: Aman would love to know: "What was your wedding day like?" Would you tell me about it?
GURDEV: It rained all morning. My mother tied my dupatta twice, because her hands were shaking.
NARRATOR: Her answer is kept in her words, for him — and for her life timeline.

### 8 · Her life timeline — 2:02–2:12 (3D timeline, calmer lighting)
Overview, then it moves to 1966 and shows her words.
NARRATOR: Every story lands on her life timeline, at the year she said, or the year her family
confirmed. Nothing is guessed.

### 9 · For the carer and the doctor — 2:12–2:40 (family page, slow scroll, each part held)
- **Today** (held 6 s): tablets marked, visitors, "Where Aman is — asked 3 times today. Repeats are normal."
  NARRATOR: Simran, her daughter-in-law, sees the day at a glance: tablets, visitors, and which
  questions worried her.
- **Speech changes** (held 8 s): the chart against her baseline, "Simulated data" visible.
  NARRATOR: With consent from both, Recollect compares her everyday speech only with her own
  baseline — pauses, vocabulary, naming people. This history is simulated. Only a change that lasts
  four weeks is flagged, and it never diagnoses.
- **Doctor report** (held 6 s): the printable one-page report.
  NARRATOR: It becomes a one-page report for her doctor, with questions worth asking.
- **Next steps + carer** (held 6 s): approve the check-up step; "And you, Simran?"
  NARRATOR: Recollect prepares the next steps for the family to approve, and checks on the carer too.

### 10 · How it's built, and what else is inside — 2:40–2:50 (one still slide, no animation)
Left: a plain diagram — Alexa+ / simulator → MCP server (26 tools, answers in milliseconds, no AI
writes her answers) → FalkorDB memory graph ← Strands agents on Bedrock + AgentCore → family page,
doctor report, timeline. Right, "Also inside": evening calm routine · night reassurance · weekly
photo chat · Memory Lane · carer coach · memory fidelity · consent and "delete everything".
Bottom: 30/30 recall eval, 0 invented · 144 ms p95 on AWS · 133 tests · open-source mcp-latency.
NARRATOR: Under the hood: a real MCP server for Alexa Plus that answers in milliseconds, with no AI
writing what she hears; a FalkorDB memory graph; and Strands agents on Amazon Bedrock and AgentCore.

### 11 · Close — 2:50–2:53 (text slide)
"Recollect — her story, in her words. Her days, calm. Her family, a step ahead."
NARRATOR: Recollect. Her story, in her words.

---

## Fixes before recording
- Plain navy background on every slide; no particles or animated gradients; fades only.
- Timeline: glow and bloom roughly halved, so the points are no longer blinding; labels no longer
  pile on top of each other (close neighbours show the year only until selected).
- Check every frame for overlapping text (slides, timeline labels, subtitles over buttons).
- Hindi subtitles placed where they don't cover the app's buttons.
