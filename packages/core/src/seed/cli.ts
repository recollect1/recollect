// pnpm seed — clears the graph at FALKORDB_URL and loads the fictional seed household.
// Set SEED_SKIP=radio to leave the radio story out so it can be told live (scenario C).
import { createEmbedder } from "../embed.ts";
import { openGraph } from "../graph.ts";
import { createReranker } from "../rerank.ts";
import { systemClock } from "../time.ts";
import { seed } from "./index.ts";

if (!process.env.FALKORDB_URL) {
  console.error("FALKORDB_URL is not set. Nothing to seed: the in-memory graph is seeded at server boot.");
  process.exit(1);
}
const graph = await openGraph();
await graph.clear();
const ctx = await seed(graph, systemClock, await createEmbedder(), await createReranker(), {
  skipStories: (process.env.SEED_SKIP ?? "").split(",").filter(Boolean),
});
console.log(`Seeded ${ctx.household.name}: ${ctx.index.size} quotes indexed. All data is fictional.`);
await graph.close();
