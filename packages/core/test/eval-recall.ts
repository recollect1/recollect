// pnpm eval:recall — grounding eval (§15) on the seed household with the real local models.
// Pass = the right story is quoted for every answerable question, nothingRecorded for every
// unanswerable one, and every spoken quote is a verbatim passage of a stored story.
// The held-out set is printed too but does not decide pass/fail: thresholds were not tuned on it.
import { cosine, createEmbedder } from "../src/embed.ts";
import { MemoryGraph } from "../src/graph.ts";
import { nothingRecorded } from "../src/phrases.ts";
import { recall } from "../src/recall.ts";
import { createReranker } from "../src/rerank.ts";
import { FAMILY_MEMORIES, RETELLINGS, STORIES } from "../src/seed/data.ts";
import { seed } from "../src/seed/index.ts";
import { RETELL_MIN_SIMILARITY } from "../src/stories.ts";
import { systemClock } from "../src/time.ts";
import { HELD_OUT, QUESTIONS } from "./eval-questions.ts";

const ctx = await seed(new MemoryGraph(), systemClock, await createEmbedder(), await createReranker());
// Every stored telling of each story: her own (and her retellings), and family members' memories of it.
const stories = new Map<string, string[]>();
for (const s of STORIES) stories.set(s.key, [s.text]);
for (const r of RETELLINGS) stories.get(r.retellOf)?.push(r.text);
for (const m of FAMILY_MEMORIES) stories.get(m.about)?.push(m.text);
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
    const verbatim = r.found ? Boolean(got && stories.get(got)?.some((t) => t.includes(spoken))) : r.say === nothingRecorded("that");
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

// Retell detection (§7.2, scenario F): the well story told again in slightly different words.
// Informational: reports how many retold sentences reach the RETELLS similarity of 0.85.
const RETOLD = [
  "There was only one well in Rampur for the whole village.",
  "Each morning I went there with my sister Nimmo and we filled the brass pots.",
  "The rope was rough and cut our hands in the winter.",
  "One time Nimmo dropped the bucket in the well and we both ran away.",
];
console.log("\n### Retell detection on a reworded story\n");
console.log("| Retold sentence | Closest stored story | Similarity | RETELLS (≥ 0.85) |");
console.log("|---|---|---|---|");
let retells = 0;
for (const sentence of RETOLD) {
  const v = await ctx.embedder.embed(sentence);
  const best = ctx.index.all().map((q) => ({ q, sim: cosine(v, q.embedding ?? []) })).sort((a, b) => b.sim - a.sim)[0]!;
  if (best.sim >= RETELL_MIN_SIMILARITY) retells++;
  console.log(`| ${sentence} | ${best.q.storyKey} | ${best.sim.toFixed(2)} | ${best.sim >= RETELL_MIN_SIMILARITY ? "yes" : "no"} |`);
}
console.log(`\n${retells}/${RETOLD.length} reworded sentences linked as retells; a story counts as retold when any sentence links.`);

times.sort((a, b) => a - b);
const pct = (p: number) => (times[Math.min(times.length - 1, Math.floor(p * times.length))] ?? 0).toFixed(0);
console.log(`\nrecall() time on this machine: p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms, max ${pct(1)} ms`);
console.log(`Grounding eval: ${ok ? "PASS" : "FAIL"} · held-out: ${heldOutOk ? "all correct" : "see table"}`);
await ctx.embedder.dispose?.();
await ctx.reranker.dispose?.();
process.exitCode = ok ? 0 : 1; // no process.exit(): it tears down onnxruntime mid-flight (friction log 17)
