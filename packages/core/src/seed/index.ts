// Loads the fictional seed household (§5) into a graph. Idempotent for the fixed-id nodes;
// run against an empty graph (the CLI clears first) so stories are not duplicated.
import { existsSync, readFileSync } from "node:fs";
import { loadCtx, type Ctx } from "../ctx.ts";
import type { Embedder } from "../embed.ts";
import type { Graph } from "../graph.ts";
import type { Reranker } from "../rerank.ts";
import { storyPromptFor } from "../phrases.ts";
import { processSession, rememberStory } from "../stories.ts";
import { hasSpan } from "../text.ts";
import type { Clock } from "../time.ts";
import type { Quote } from "../types.ts";
import {
  CONSENT, DEVICES, ENTITIES, HOUSEHOLD, MEDICINES, PEOPLE, PHOTOS, PROFILE, SAME_AS, SCHEDULES,
  STORIES, VISITS, WEEKLY_PHOTO_ID,
} from "./data.ts";

/** Output of `python -m synth` and `python -m trends`: the SIMULATED 12-week history (§12). */
const SIMULATED = new URL("../../../../data/simulated/", import.meta.url);

interface SimulatedHistory {
  markerSets: { id: string; sessionId: string; at: string; mode: string; simulated: boolean; retold?: boolean; metrics: Record<string, number> }[];
}

/** Loads the simulated marker history and its trend card, when they have been generated. */
export async function loadSimulated(graph: Graph): Promise<number> {
  const markers = new URL("markers.json", SIMULATED), trend = new URL("trend.json", SIMULATED);
  if (!existsSync(markers) || !existsSync(trend)) return 0;
  const history = JSON.parse(readFileSync(markers, "utf8")) as SimulatedHistory;
  for (const { metrics, at, ...rest } of history.markerSets) {
    if (!rest.simulated) throw new Error(`${rest.id} is not labelled simulated`);
    await graph.upsert("MarkerSet", { ...rest, computedAt: at, ...metrics });
  }
  const card = JSON.parse(readFileSync(trend, "utf8")) as { id: string; simulated: boolean };
  if (!card.simulated) throw new Error("the seeded trend card is not labelled simulated");
  await graph.upsert("TrendCard", { ...card });
  return history.markerSets.length;
}

export interface SeedOptions {
  /** Story keys to leave out, e.g. ["radio"] so scenario C can be told live. */
  skipStories?: string[];
}

export async function seed(
  graph: Graph, clock: Clock, embedder: Embedder, reranker: Reranker, opts: SeedOptions = {},
): Promise<Ctx> {
  await graph.upsert("Household", { ...HOUSEHOLD });
  for (const p of PEOPLE) await graph.upsert("Person", { ...p });
  for (const v of VISITS) await graph.upsert("Visit", { ...v });
  for (const m of MEDICINES) await graph.upsert("Medicine", { ...m });
  for (const s of SCHEDULES) {
    await graph.upsert("Schedule", { ...s });
    await graph.link(["Person", HOUSEHOLD.elderId], "TAKES", ["Schedule", s.id]);
    await graph.link(["Schedule", s.id], "OF", ["Medicine", s.medicineId]);
  }
  for (const e of ENTITIES) await graph.upsert("Entity", { ...e });
  for (const [entityId, personId] of SAME_AS) await graph.link(["Entity", entityId], "SAME_AS", ["Person", personId]);
  for (const { depicts, ...photo } of PHOTOS) {
    await graph.upsert("Photo", { ...photo });
    for (const entityId of depicts) await graph.link(["Photo", photo.id], "DEPICTS", ["Entity", entityId]);
  }
  await graph.upsert("WeeklyPhoto", { id: "wp-chosen", photoId: WEEKLY_PHOTO_ID, week: "0000-W00" });
  await graph.upsert("Profile", { ...PROFILE });
  for (const d of DEVICES) await graph.upsert("Device", { ...d });
  await graph.upsert("Consent", { ...CONSENT });

  const ctx = await loadCtx(graph, clock, embedder, reranker, HOUSEHOLD.id);
  const mentioned = new Map<string, number>();
  for (const story of STORIES) {
    if (opts.skipStories?.includes(story.key)) continue;
    // Told at 11:00 household time on the story's date.
    const at = new Date(`${story.toldOn}T05:30:00.000Z`);
    const { sessionId } = await rememberStory(ctx, { text: story.text, at, storyKey: story.key });
    const quotes = (await graph.out<Quote>(["Session", sessionId], "HAS_QUOTE")).map((n) => n.node);
    for (const [span, entityId] of story.mentions) {
      for (const q of quotes.filter((q) => hasSpan(q.text, span))) {
        await graph.link(["Quote", q.id], "MENTIONS", ["Entity", entityId], { span });
        mentioned.set(entityId, (mentioned.get(entityId) ?? 0) + 1);
      }
    }
    await processSession(ctx, sessionId);
  }
  // One open story prompt: a person she has named in only one story (§9.1 step 4).
  const once = ENTITIES.find((e) => e.id === "e-nimmo" && mentioned.has(e.id));
  if (once) {
    await graph.upsert("StoryPrompt", {
      id: "sp-nimmo", text: storyPromptFor(`your sister ${once.name}`), basedOnEntityId: once.id, used: false,
    });
  }
  await loadSimulated(graph);
  await ctx.index.load(graph);
  return ctx;
}
