# Handoff (Shambhvi, 16 Oct 2026)

Deadline: submit **Oct 23 evening IST** (official: Oct 24, 00:30 IST). `CLAUDE.md` §19 lists every
place the build differs from the spec; `docs/friction-log.md` has 29 entries.

## Who built what

| Who | When | What |
|---|---|---|
| Shambhvi | 12–13 Oct | Scaffold, `packages/core` (graph port, phrases, grounded recall + relevance check, daily tools, seed), MCP server, grounding eval, extract validation, marker maths, simulated history, trends + doctor report, Agent Skill. |
| Yash | 14–15 Oct | First FalkorDB run, latency test, agent worker (Strands on Bedrock), AgentCore agent, MCP Apps cards, simulator, family page, night reassurance, full-voice timing markers, live graph panel, trends on the live graph, deploy files, docs, Open Source entry `mcp-latency`. |
| Shambhvi | 15–16 Oct | Windows fixes, weekly photo scheduling (last P0), Claude Desktop bridge, first live Bedrock runs, "next tablet" safety fix, AWS deployment with AgentCore, worker and extraction fixes found on the live system, video script and Devpost draft. |

## Live on AWS (16 Oct)

- **Site:** https://34-194-181-93.sslip.io — simulator at `/`, family page at `/family`, both behind a
  password (browser login, any user name). MCP endpoint `/mcp` (bearer token).
- **Where the secrets are:** `.env.aws` on Shambhvi's laptop (git-ignored) and the SSM parameter
  `/recollect/env`. Ask Shambhvi; never commit them or show them in the video.
- **Models:** Amazon Nova Pro on Bedrock for the voice loop and extraction. Claude models need the
  Anthropic use-case form in the Bedrock console first (friction log 21).
- **Extraction:** Bedrock AgentCore Runtime `recollect_extract`; a story told through `/mcp` reaches the
  graph in about 8 s (scenario C).
- **Latency:** passes from inside AWS against the public URL (worst p95 144 ms); README, Latency.
- **Operating it:** `docs/deploy-aws.md` (deploy, re-seed, AgentCore update, costs, switching off). The
  graph is seeded with `SEED_SKIP=radio` so the radio story can be told live; re-seed after any test.
- **Cost:** about US$17/month while running, plus cents of Bedrock per demo. Stop the instance after the
  hackathon (`docs/deploy-aws.md`).

## Run it locally

```
pnpm i && (cd agents && uv sync)     # pnpm i also builds the MCP Apps cards
cp .env.example .env                 # two different tokens; DEMO_CLOCK=1; Nova Pro model IDs are the default
docker compose up -d falkordb && pnpm seed
pnpm dev                             # MCP :8787 · simulator :5173 · family :5174 · worker
```

Tests: `pnpm test` (83), `(cd agents && uv run pytest)` (51), `pnpm eval:recall`, `pnpm test:latency`.
Without Docker, leave `FALKORDB_URL` empty: everything but the worker runs on an in-memory graph.

## 22 Oct: new features on branch `yash-ideas` (not pushed)

Memory fidelity engine, family memory network (shared memories, messages), care follow-through
(approve-only), Memory Lane card, carer coach; see the README section "Added on 22 Oct". Tested in
memory only. Merging to `main` and pushing redeploys AWS (the deploy pulls from GitHub); after that,
re-seed and click through the family page's new sections. The demo video predates these features.

## 23 Oct: Hindi

Gurdev can speak Hindi/Hinglish and hear Hindi (README "Her first language"). Switch it on the family
page or with the simulator's हिंदी button; use Chrome (Hindi speech recognition and voice).

## Left to do (all need a person)

1. **Microphone test** in Chrome on the deployed site: push-to-talk, story mode, full-voice recording
   (switch it on in the family page's consent section first), spoken replies.
2. **Click through the deployed site** once, especially "Photo time 11:15" (scenario J), "Evening
   17:00" (I), "Night 03:00" + "I need to go to the market" (K), and the family page's Recalculate now.
3. **Claude Desktop clip** (~10 s): `docs/claude-desktop.md`; point `MCP_SERVER_URL` at the deployed `/mcp`.
4. **Video** under 3 minutes: `docs/video-script.md`. Re-seed before recording.
5. **Devpost text** in our own words: draft in `docs/devpost.md` (items marked [confirm]); Open Source
   fields in `docs/open-source.md`.
6. **Confirm** every friction-log and product-feedback entry is true.
7. **GitHub:** the repo's one-line "About" description; add `yash4428` as a collaborator if not done.
8. *(P2, only if time)* her music playlist; carer check-in.

## Rules that are easy to break

- No model call inside an MCP tool handler; no model-written memory, medicine or trend sentence.
  New wording goes in `phrases.ts` (or `trend-phrases.json` if Python needs it) with a test.
- Anything from `data/simulated/` must show "Simulated data" where it is displayed.
- Audio is analysed then deleted; the worker deletes it even on failure, the simulator after an hour.
- Keep `CLAUDE.md` §19 current.
