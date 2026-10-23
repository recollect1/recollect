# Handoff: the final video and submission (Shambhvi → Yash, 23 Oct 2026)

**Deadline:** Devpost closes **Fri 23 Oct, 12:00 PT = Sat 24 Oct, 00:30 IST**. Read this file, then
`video/FILM_PLAN.md` (the approved script and shot list), then build the video from it. Change
anything you think works better: the plan is the agreed starting point, not a contract.

---

## 1. What Recollect is (one paragraph for anyone new)

An **Alexa+ companion for people living with early dementia, and for their families and doctor**, on
one memory graph. For **her**: calm, identical answers to daily questions (today, tablets, where is
Aman, who is this), her life stories kept word for word, an evening calm routine, night reassurance,
Hindi as well as English. For **her family**: their own memories added to her stories, questions they
leave for her ("Ask Biji"), a weekly summary, tablets not marked, alerts, a carer check-in and coach.
For **her doctor**: with two-step consent, her everyday speech compared only with her own baseline;
a sustained four-week change gives a gentle note and a printable doctor report (never a diagnosis).
Answers about the past are **only her stored words** (no model writes them); if nothing is stored it
says so. Fictional household: Gurdev Kaur, 78, Patiala; grandson Aman (London), daughter-in-law Simran
(family admin), helper Harpreet. Full spec: `CLAUDE.md` (§19 = how the build differs).

## 2. Hackathon rules that matter for the video (checked on the official Devpost rules page)

- Alexa+ track: a self-hosted MCP server (spec 2025-11-25, Streamable HTTP) **or** a simulated Alexa+
  web app. We have both. No physical Echo, Alexa SDK or certification needed.
- Video **under 3 minutes** (judges may stop at 3:00), public on **YouTube or Vimeo**, show the project
  working, **English** (Hindi speech needs **English subtitles**), **no copyrighted music**, no third-party
  trademarks (do not show Amazon/Alexa logos; our UI uses none).
- Judges score equally on Tech implementation, Design, Potential impact, Quality of idea. "Creative"
  for Alexa+ explicitly includes state across sessions, agentic workflows, cards/MCP Apps, Agent Skills.
- Also submit: text description (`docs/devpost.md` draft), product feedback (`docs/product-feedback.md`),
  track Alexa+, mini-challenges **AWS Builder** and **Open Source** (`docs/open-source.md`), optional
  feature requests (`docs/feature-requests.md`) and friction log (`docs/friction-log.md`, up to 10% bonus).
- Repo is public with MIT visible in the About box. If we give judges a live URL with a password, put
  the login in the testing instructions and keep it running until **20 Nov**.

## 3. How Shambhvi wants the video (her feedback on the first cut — please follow)

The first cut (`video/recollect-film.mp4` on Shambhvi's laptop, not in git) was rejected because:
- **Background**: she disliked the animated gradient + floating particles. → **Plain solid dark navy**
  slides, fades only. **Keep it simple, not heavily animated.**
- **Timeline points too bright.** → Halve the glow/bloom before recording (see §6).
- **Overlapping text** in places (timeline labels piling up, labels on slides). → Check every frame.
- **She couldn't understand the project from it.** → The script must **explain what the project does
  and why it helps** the patient, family and doctor, and **sell** it. Plain words.
- **Re-enact the voice interactions**: someone "speaking to Alexa as Grandma", then the app taking the
  input and answering aloud — not silent typing.
- **Show the memory graph properly, once, for longer**: what FalkorDB stores, memories connecting
  live, what the agent is doing, and why that matters.
- **Don't rush the screens**, especially the **caregiver and doctor** parts.
- Make it feel like one integrated product that covers everything; a strong intro that grabs judges.

The approved script and shot list implementing all this is **`video/FILM_PLAN.md`** (2:53).
Shambhvi will record the **narrator** voiceover herself from that script; Grandma/Aman/Recollect lines
are re-enactment voices (Polly is fine; a teammate recording Gurdev's 8 lines would feel more human).
Put a small on-screen note: "Re-enactment: voices are synthetic, every reply is the real app."

## 4. State of the code (all on `main`, pushed)

Everything below is merged on `main` (`features` and `ui-polish` were merged in). Tests: 133 JS + 51
Python pass; grounding eval 30/30, 0 invented.

New since 21 Oct (none of it is in the old 21 Oct video):
- **UI**: Echo-Show-style simulator (device frame, cyan light bar per phase, ambient home screen, live
  captions, try-saying chips, home/clock/graph panels); dashboard family page.
- **Hindi**: household language (family page or simulator switch); fixed Hindi wording
  (`packages/core/src/phrases-hi.ts`); Hindi/Hinglish understood (simulator translates her sentence to
  one English line *before* the tool loop, shown as "Understood as: …"); stories kept verbatim.
- **Memory fidelity** (retellings vs first telling; recent vs old memory), **family memory network**
  (family memories on her stories; messages read after "where is"), **care follow-through** (5 steps to
  approve; never books or buys), **Memory Lane** card, **carer coach**, **Ask Biji** (family questions
  asked 15:00–16:30, once a day), **good morning** greeting, **this week** digest + **tablets not
  marked**, **"And you, Simran?"** carer check-in.
- **3D life timeline** (three.js) at `/timeline.html` on the family page (dev: `http://127.0.0.1:5174/timeline.html`;
  prod: `/family/timeline.html`); button "Open her life timeline" in the simulator. Points = her stories,
  placed at the year she said (gold) or the family confirmed (teal); undated float near "now"
  (violet) until the family places them in the side panel; polls every 3 s, new stories land with a burst.

## 5. Running it for the recording

**Local (no Docker):** in-memory graph, everything except the extract worker:
```bash
pnpm i
pnpm dev                      # MCP :8787, simulator :5173 (backend :8788), family :5174
```
`scripts/dev-alt.sh` runs a second copy on 8797 / 5183 / 8798 / 5184. Set `SEED_SKIP=radio` so the
radio story is not seeded and can be told live (it then lands on the timeline at **1968**). Data is
in memory: restart for a clean take. `.env` needs `BEDROCK_CHAT_MODEL_ID=us.amazon.nova-pro-v1:0`,
`DEMO_CLOCK=1`, tokens (ask Shambhvi; never show them).

**For the live memory graph (scene 5) you need the extract worker + FalkorDB.** Yash has Docker:
```bash
docker compose up -d falkordb            # FALKORDB_URL=redis://localhost:6379 in .env
SEED_SKIP=radio pnpm seed
pnpm dev                                 # also starts the Python worker (agents/.venv)
```
With `BEDROCK_EXTRACT_MODEL_ID` set (Nova Pro), the worker runs the Strands extract agent directly on
Bedrock (no AgentCore needed locally); entities appear in the simulator's **Show memory graph** panel
within seconds of a story. (The falkordb/falkordb image also ships the FalkorDB Browser UI; if you map
its port you can show a raw Cypher view of `Quote`–`MENTIONS`→`Entity` as proof it is FalkorDB.)

**AWS deployment is DOWN.** On 23 Oct the EC2 instance and the IAM roles `recollect-ec2` and
`recollect-agentcore` were found deleted (unknown who; the AgentCore runtime, ECR repo, SSM parameter
`/recollect/env` and Elastic IP 34.194.181.93 still exist). To restore: an IAM admin runs
`AWS_PROFILE=<admin> bash deploy/aws/iam/create-roles.sh` (policies in `deploy/aws/iam/`), then launch
the instance and run `deploy/aws/bootstrap.sh main 34-194-181-93.sslip.io` (see `docs/deploy-aws.md`;
the launch command is: AMI `ami-0ad664d0958c27192`, `t4g.small`, SG `sg-03867148d7e8998bf`, instance
profile `recollect-ec2`, IMDSv2 hop limit 2, 20 GB gp3 encrypted, then associate
`eipalloc-01778cb07ea87857d`). Then seed with `SEED_SKIP=radio`.

## 6. Video tooling already in the repo (`video/film/`)

Built for the first cut; reuse and adapt:
- `record.py` — Playwright recorder, scene by scene, one browser context per page (video per page).
  Key tricks:
  - **Stand-in microphone** (`INIT`): replaces `SpeechRecognition` with a fake that "hears" the next
    scripted line word by word (`window.__say.push(text)`, then click Talk). The app's real voice flow
    runs (light bar, live caption, Bedrock, tool call). Story mode uses the same (rate ~75 ms/word,
    end the text with "That's all.").
  - `speechSynthesis` is stubbed with a timer (no audio is recorded); add reply audio in post.
  - **GPU flags** `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist` → timeline at 60 fps
    (SwiftShader gives 9 fps).
  - Timeline labels move (auto-rotate): click them with `locator.dispatch_event("click")`.
  - Composite scenes record two pages at once and cut between them using marks (`S.mark`).
  - Delete old takes recursively before re-recording (`rglob`), or the wrong file gets used.
- `assemble.py` — fits each scene's picture to its narration (speed-up max 1.55×), lays the audio,
  fades, concatenates (ffmpeg via `imageio-ffmpeg`).
- `tts.py` — Amazon Polly (neural "Kajal", en-IN) per scene from `narration.json` (needs AWS creds with
  Polly; Shambhvi's profile `recollect` works).
- `m01…m14 *.html`, `film.css`, `dust.js` — the first cut's slides. **Replace the background** with a
  plain navy (`body { background: #0b1226 }`), drop `dust.js`, keep fades.
- Python venv used: `playwright`, `imageio-ffmpeg`, `boto3`.

**Before recording, in the app:**
- Timeline glow: in `apps/family/src/timeline/main.ts` lower `UnrealBloomPass` strength
  (0.85 → ~0.45), halo opacity (0.38 → ~0.22) and the orb `emissiveIntensity` (1.6 → ~1.0).
- Timeline label pile-up: neighbouring tags overlap around 1954–1958; show only the year for
  non-selected tags when close, or offset them vertically.
- Re-enactment audio: generate per line with Polly (e.g. Gurdev = Kajal/Aditi slowed with SSML
  `<prosody rate="85%">`, Aman = en-GB male "Arthur" or "Brian", Recollect = a neutral voice), and
  place each line when the caption/reply appears in the take.
- English subtitles on the Hindi lines, placed so they don't cover the app's buttons.

## 7. Submission checklist (what is left)

- [ ] Final video (≤ 3:00) per `video/FILM_PLAN.md`, Shambhvi's voiceover, upload public, link on Devpost.
- [ ] Devpost text from `docs/devpost.md` (update "What it does" with the newest features; it already
      mentions Hindi, Ask Biji, timeline, fidelity, care follow-through).
- [ ] Product feedback, friction log (32 entries) — a person must confirm they are true.
- [ ] Track Alexa+; mini-challenges AWS Builder + Open Source (`mcp-latency`, `docs/open-source.md`).
- [ ] Optional: restore AWS (§5) so judges get a live URL until 20 Nov.

## 8. Gotchas

- Never invent in the video: every reply shown must be real app output. Label simulated speech
  history and the re-enacted voices. All people are fictional.
- Banned words in family/doctor text: "diagnos…", "risk score", etc. (CLAUDE.md §1.2).
- Windows: don't write code through bash heredocs with backslash escapes (a `\b` once became a
  backspace character in App.tsx).
- The simulator's "Morning 09:00" etc. buttons move the demo clock on the server (`DEMO_CLOCK=1`).
- "Family question 15:20" only asks if a question exists (leave one on the family page first).
