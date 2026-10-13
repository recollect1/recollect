// pnpm eval:recall — grounding eval (§15) on the seed household with the real local models.
// Pass = the right story is quoted for every answerable question, nothingRecorded for every
// unanswerable one, and every spoken quote is a verbatim passage of a stored story.
// The held-out set is printed too but does not decide pass/fail: thresholds were not tuned on it.
import { createEmbedder } from "../src/embed.ts";
import { MemoryGraph } from "../src/graph.ts";
import { nothingRecorded } from "../src/phrases.ts";
import { recall } from "../src/recall.ts";
import { createReranker } from "../src/rerank.ts";
import { STORIES } from "../src/seed/data.ts";
import { seed } from "../src/seed/index.ts";
import { systemClock } from "../src/time.ts";
import { HELD_OUT, QUESTIONS } from "./eval-questions.ts";

const ctx = await seed(new MemoryGraph(), systemClock, await createEmbedder(), await createReranker());
const stories = new Map(STORIES.map((s) => [s.key, s.text]));
const NOTHING = "nothingRecorded";
const times: number[] = [];

async function run(title: string, questions: [string, string | null][]) {
  let right = 0, refused = 0, invented = 0;
  const answerable = questions.filter(([, want]) => want).length;
  console.log(`\n### ${title}\n`);
  console.log("| # | Question | Expected | Got | §11 score | Relevance: as asked / names blanked | OK |");
  console.log("|---|---|---|---|---|---|---|");
  for (const [i, [q, want]] of questions.entries()) {
    const t0 = performance.now();
    const r = await recall(ctx, q, "elder");
    times.push(performance.now() - t0);
    const got = r.found ? (r.quotes[0]?.storyKey ?? "?") : null;
    const spoken = r.quotes.map((x) => x.text).join(" ");
    // Invented content = anything spoken that is not an exact passage of a stored story.
    const verbatim = r.found ? Boolean(got && stories.get(got)?.includes(spoken)) : r.say === nothingRecorded("that");
    if (!verbatim) invented++;
    if (got === want) want ? right++ : refused++;
    const rel = [r.direct, r.masked].map((x) => (x === undefined ? "–" : x.toFixed(1))).join(" / ");
    console.log(`| ${i + 1} | ${q} | ${want ?? NOTHING} | ${got ?? NOTHING} | ${r.score.toFixed(2)} | ${rel} | ${got === want ? "yes" : "NO"} |`);
  }
  console.log(`\nAnswerable: ${right}/${answerable} right story quoted`);
  console.log(`Unanswerable: ${refused}/${questions.length - answerable} ${NOTHING}`);
  console.log(`Invented content: ${invented}`);
  return right + refused === questions.length && invented === 0;
}

const ok = await run("Grounding eval (30 questions, thresholds tuned on this set)", QUESTIONS);
const heldOutOk = await run("Held-out check (10 questions, not used for tuning)", HELD_OUT);
times.sort((a, b) => a - b);
const pct = (p: number) => (times[Math.min(times.length - 1, Math.floor(p * times.length))] ?? 0).toFixed(0);
console.log(`\nrecall() time on this machine: p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms, max ${pct(1)} ms`);
console.log(`Grounding eval: ${ok ? "PASS" : "FAIL"} · held-out: ${heldOutOk ? "all correct" : "see table"}`);
process.exit(ok ? 0 : 1);
