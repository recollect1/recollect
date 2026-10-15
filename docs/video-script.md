# Demo video script (under 3 minutes)

Follows the CLAUDE.md §15 timeline. Draft, 15 Oct: the voice loop has not run against Bedrock yet,
so every scene below says what to do with voice and what to do if Bedrock is still unavailable on
the day (type the line into the simulator's text box, or use the `?debug` buttons, which are real
MCP tool calls). Do not present a typed or debug call as voice.

Rules for the recording: English only, no copyrighted music (the simulator's "familiar music" must
be a royalty-free track), "Simulated data" visible whenever the trend or report is on screen, and
no real patient data anywhere. Everyone in the demo is fictional.

## Before recording

```
pnpm i
# .env: two different tokens, DEMO_CLOCK=1, FALKORDB_URL set, BEDROCK_* set if available
docker compose up -d falkordb
SEED_SKIP=radio pnpm seed        # radio story left out so it can be told live (scenario C)
pnpm dev
```

Open three windows: the simulator (http://localhost:5173), the family page
(http://localhost:5174) and, for 2:20, a terminal. Turn on "Show memory graph" in the simulator
before scene C. Set the demo clock to "Morning 09:00". Log the 8:10 BP dose before you start
recording (say or type "I've just taken my BP tablet" with the clock at 08:10), so scene A starts
from a logged dose.

## 0:00–0:20 · The problem (voice-over, no screen needed)

> "Gurdev is 78 and lives with early memory loss. She asks the same questions every day, her
> grandson lives in London, and when her memory changes, the family usually notices months too
> late. Recollect is an Alexa+ companion that keeps her life in her own words, answers everyday
> questions the same calm way every time, and quietly tells the family when her speech changes."

## 0:20–0:55 · Scenarios A, H, B (simulator, Gurdev)

1. **A.** Say: "Did I take my BP tablet?" → "Yes, you took your BP tablet at 8:10 today."
   Point at the transcript line *spoken verbatim from tool `say`* and the latency chip.
2. **H.** Say: "Who's Aman?" → the who's-who card with his photo: "That's Aman, your grandson,
   Simran's son. Aman is in London and calls you on Sundays."
3. **B.** Say "Where is Aman?" three times. Same words each time. Cut to the family page, Today:
   "where Aman is (asked 3 times today)" and "Repeats are normal; Recollect answers the same way
   every time."

Voice-over: "Same words every time. She is never told she already asked."

## 0:55–1:25 · Scenarios C, D, E (simulator)

1. **C.** Say "I want to tell you a story", then tell the radio story (text in
   `packages/core/src/seed/data.ts`, key `radio`). → "Thank you, I've kept that." With Bedrock
   connected, the memory graph panel gains Radio, 1968, her father and Patiala within seconds.
   Without Bedrock the story is saved and recallable, but no new entities appear: skip the graph shot.
2. **D.** Switch the role to **Aman (family)**. Ask: "How did Grandma come to Patiala?" → "Gurdev
   said on 3 August 2026: …" with the story card showing her own words and the date.
3. **E.** Back to Gurdev. Ask: "What was my school like?" → "I don't have anything saved about that
   yet. Would you like to tell me about it?"

Voice-over: "Every answer about her past is her own words, with the date she said them. If nothing
is saved, Recollect says so. No model ever writes these answers."

## 1:25–1:45 · Scenario I (simulator)

Click **Evening 17:00**. The simulated home panel turns on the living-room light and the speaker;
Recollect says "It's evening, Gurdev. Shall we have some tea and talk about your mother's saag?"
Ask one more question to show the one-sentence evening replies.

Voice-over: "Late afternoon is often the hardest time. Recollect softens the evening on its own."

## 1:45–2:20 · Scenarios J, G, L (simulator, then family page)

1. **J.** Back to **Morning 09:00**. Say "Can we do the photo?" (or the `photo_moment` debug button)
   → the weekly photo card and "Gurdev, would you tell me about this photo? There's no right or
   wrong answer." Describe it in one or two sentences → "Thank you, I loved hearing that."
2. **G.** Family page, Speech changes: the **Simulated data** label and the card "Since August,
   Gurdev pauses longer, uses fewer different words, names familiar people less often and retells
   the same stories more often. Worth mentioning at the next check-up. This is not a medical
   assessment." Click **Open doctor report**; scroll past the charts with the grey baseline band.
3. **L.** Family page, This is me: approve one suggested fact, then **Print**.

Voice-over: "The same photo every week gives a fair comparison. Recollect compares her only with
herself, needs four weeks in a row before it says anything, and never diagnoses. This history is
simulated for the demo."

## 2:20–2:45 · Engineering

- Simulator latency strip (green chips, running p95).
- Terminal: the grounding eval summary (`docs/eval-recall-latest.md`: 20/20 answerable, 10/10
  nothing saved, 0 invented) and `pnpm test:latency` against the deployed URL, once it has passed.
- Claude Desktop with Recollect as a remote MCP connector answering one question (about 10 s).
- One line on the agents: Strands extract agent on Bedrock (AgentCore Runtime if deployed),
  markers and trends in the worker. Only claim what has actually run by recording day.

## 2:45–3:00 · Impact and consent

> "Change tracking only starts when Gurdev and her family both say yes, and she can stop it any
> time by saying so. Audio is analysed and deleted. Recollect keeps her story in her own words,
> keeps her days calm, and gives her family an early, honest signal to take to her doctor."

End card: repo URL, "All people and data in this demo are fictional. Speech trends shown are
simulated. Recollect is not a medical device."
