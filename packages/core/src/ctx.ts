import type { Embedder } from "./embed.ts";
import type { Graph } from "./graph.ts";
import { RecallIndex } from "./recall.ts";
import type { Reranker } from "./rerank.ts";
import type { Clock } from "./time.ts";
import type { Household, Person } from "./types.ts";

/** Everything a tool handler needs. Household, elder and admin are read once at boot. */
export interface Ctx {
  graph: Graph; clock: Clock; embedder: Embedder; reranker: Reranker; index: RecallIndex;
  household: Household; elder: Person; admin: Person;
}

export async function loadCtx(
  graph: Graph, clock: Clock, embedder: Embedder, reranker: Reranker,
  householdId: string): Promise<Ctx> {
  const household = await graph.get<Household>("Household", householdId);
  if (!household) throw new Error(`household ${householdId} not found — run \`pnpm seed\` first`);
  const elder = await graph.get<Person>("Person", household.elderId);
  const admin = await graph.get<Person>("Person", household.adminId);
  if (!elder || !admin) throw new Error("household is missing its elder or admin person");
  const index = new RecallIndex();
  await index.load(graph);
  return { graph, clock, embedder, reranker, index, household, elder, admin };
}
