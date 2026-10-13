// Story capture. remember_story stores verbatim quotes and returns at once; embedding and retell
// detection run after the tool has answered (processSession), then the extract agent takes over.
import type { Ctx } from "./ctx.ts";
import { cosine } from "./embed.ts";
import * as P from "./phrases.ts";
import { newId, splitQuotes } from "./text.ts";
import { isoWeek } from "./time.ts";
import type { Photo, Quote, Session, SessionMode, StoryPrompt, WeeklyPhoto } from "./types.ts";

export const RETELL_MIN_SIMILARITY = 0.85;
export const EXTRACT_QUEUE = "extract";

export interface RememberInput {
  text: string; private?: boolean; audioRef?: string; mode?: SessionMode; at?: Date; storyKey?: string;
}

export async function rememberStory(ctx: Ctx, input: RememberInput): Promise<{ say: string; sessionId: string }> {
  const { graph, elder } = ctx;
  const at = (input.at ?? ctx.clock.now()).toISOString();
  const session: Session = {
    id: newId("ses"), startedAt: at, speakerId: elder.id, mode: input.mode ?? "story",
    private: input.private ?? false, hasAudio: Boolean(input.audioRef),
    ...(input.storyKey ? { storyKey: input.storyKey } : {}),
  };
  await graph.upsert("Session", { ...session });
  const quotes: Quote[] = splitQuotes(input.text).map((text, seq) => ({
    id: newId("q"), text, speakerId: elder.id, saidAt: at, sessionId: session.id, seq, private: session.private,
  }));
  await Promise.all(quotes.map(async (q) => {
    await graph.upsert("Quote", { ...q });
    await graph.link(["Session", session.id], "HAS_QUOTE", ["Quote", q.id]);
  }));
  // Session closed: queue it for the background agents (§9). Job nodes stand in for a list so
  // the queue lives in the same graph the Python agents already read.
  await graph.upsert("Job", {
    id: newId("job"), queue: EXTRACT_QUEUE, sessionId: session.id, at, done: false,
    ...(input.audioRef ? { audioRef: input.audioRef } : {}),
  });
  return { say: session.mode === "photo_desc" ? P.photoThanks() : P.storySaved(), sessionId: session.id };
}

/**
 * After the tool has returned: embed the session's quotes, record RETELLS edges (§7.2) and refresh
 * the recall index. The repetition is a marker only — it never changes what she hears (§1.4).
 */
export async function processSession(ctx: Ctx, sessionId: string): Promise<{ retells: number }> {
  const { graph } = ctx;
  const session = await graph.get<Session>("Session", sessionId);
  const quotes = (await graph.out<Quote>(["Session", sessionId], "HAS_QUOTE")).map((n) => n.node);
  let retells = 0;
  for (const q of quotes) {
    const embedding = await ctx.embedder.embed(q.text);
    await graph.upsert("Quote", { id: q.id, embedding });
    if (session?.mode === "photo_desc") continue;
    let closest: { id: string; similarity: number } | undefined;
    for (const earlier of ctx.index.all()) {
      if (earlier.sessionId === sessionId) continue;
      const similarity = cosine(embedding, earlier.embedding ?? []);
      if (similarity >= RETELL_MIN_SIMILARITY && similarity > (closest?.similarity ?? 0))
        closest = { id: earlier.id, similarity };
    }
    if (closest) {
      await graph.link(["Quote", q.id], "RETELLS", ["Quote", closest.id], { similarity: closest.similarity });
      retells++;
    }
  }
  await ctx.index.load(graph);
  return { retells };
}

/** "Keep this private": hides her most recent session and its quotes from the family role. */
export async function keepPrivate(ctx: Ctx): Promise<{ say: string; sessionId?: string }> {
  const { graph, elder } = ctx;
  const sessions = (await graph.find<Session>("Session", { speakerId: elder.id }))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  const last = sessions[0];
  if (last) {
    await graph.upsert("Session", { id: last.id, private: true });
    const quotes = await graph.out<Quote>(["Session", last.id], "HAS_QUOTE");
    await Promise.all(quotes.map((q) => graph.upsert("Quote", { id: q.node.id, private: true })));
    await ctx.index.load(graph);
  }
  return { say: P.privateKept(), ...(last ? { sessionId: last.id } : {}) };
}

export async function storyPrompt(ctx: Ctx): Promise<{ say: string; promptId?: string }> {
  const open = (await ctx.graph.find<StoryPrompt>("StoryPrompt", { used: false }))[0];
  if (!open) return { say: P.storyPromptOpen() };
  await ctx.graph.upsert("StoryPrompt", { id: open.id, used: true });
  return { say: open.text, promptId: open.id };
}

export interface PhotoMoment { say: string; photo?: Photo; week: string; saved: boolean; sessionId?: string }

/** Weekly photo description (§7.1b): the same photo each week, never a test, no correction. */
export async function photoMoment(ctx: Ctx, text?: string): Promise<PhotoMoment> {
  const { graph, household, elder, admin } = ctx;
  const week = isoWeek(ctx.clock.now(), household.tz);
  const chosen = (await graph.find<WeeklyPhoto>("WeeklyPhoto")).sort((a, b) => (a.week < b.week ? 1 : -1))[0];
  const photo = chosen ? await graph.get<Photo>("Photo", chosen.photoId) : null;
  if (!chosen || !photo) return { say: P.noPhotoYet(admin.name), week, saved: false };
  if (!text?.trim()) return { say: P.weeklyPhotoPrompt(elder.name), photo, week, saved: false };
  const { say, sessionId } = await rememberStory(ctx, { text, mode: "photo_desc" });
  await graph.upsert("WeeklyPhoto", { id: `wp-${week}`, photoId: photo.id, week, sessionId });
  return { say, photo, week, saved: true, sessionId };
}
