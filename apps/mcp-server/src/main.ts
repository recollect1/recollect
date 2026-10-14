// Boot: graph, schema, warm local models, test recall, listen (§10).
import {
  createEmbedder, createReranker, DemoClock, loadCtx, openGraph, recall, seed, seedData, systemClock,
  type Ctx,
} from "@recollect/core";
import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 8787);
const tokens = { elder: process.env.ELDER_TOKEN ?? "", family: process.env.FAMILY_TOKEN ?? "" };
if (!tokens.elder || !tokens.family || tokens.elder === tokens.family) {
  console.error("Set ELDER_TOKEN and FAMILY_TOKEN to two different values (see .env.example).");
  process.exit(1);
}

const demoClock = process.env.DEMO_CLOCK === "1" ? new DemoClock() : undefined;
const clock = demoClock ?? systemClock;
const graph = await openGraph();
const [embedder, reranker] = [await createEmbedder(), await createReranker()];

let ctx: Ctx;
if (process.env.FALKORDB_URL) {
  ctx = await loadCtx(graph, clock, embedder, reranker, seedData.HOUSEHOLD.id);
} else {
  // No FalkorDB: local development on an in-memory graph that is seeded now and lost on exit.
  console.warn("FALKORDB_URL is not set — using an in-memory graph with the fictional seed household.");
  ctx = await seed(graph, clock, embedder, reranker, {
    skipStories: (process.env.SEED_SKIP ?? "").split(",").filter(Boolean),
  });
}

const t0 = performance.now();
const probe = await recall(ctx, "How did I come to Patiala?", "family");
console.log(JSON.stringify({
  boot: "recall-test", found: probe.found, ms: Math.round(performance.now() - t0), quotes: ctx.index.size,
}));

// The Python worker writes entities in another process (§9.1). When it finishes a job, reload the
// recall index so new names are matched at once. Reading done-job ids is cheap; the reload is not.
if (process.env.FALKORDB_URL) {
  let doneJobs = (await graph.find("Job", { done: true })).length;
  setInterval(async () => {
    try {
      const n = (await graph.find("Job", { done: true })).length;
      if (n !== doneJobs) { doneJobs = n; await ctx.index.load(graph); }
    } catch (e) { console.error(JSON.stringify({ msg: "index refresh failed", error: String(e) })); }
  }, 3000).unref();
}

createApp({ ctx, tokens, ...(demoClock ? { demoClock } : {}) }).http.listen(port, () => {
  console.log(`Recollect MCP server on http://localhost:${port}/mcp`);
});
