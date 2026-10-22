// Family memory network: children and grandchildren add their own memories of her stories, and
// leave her short messages. Every memory is stored verbatim and always attributed to its speaker;
// recall prefers her own words and quotes a family member's only when none of hers answers.
import type { Ctx } from "./ctx.ts";
import { FamilyError } from "./family.ts";
import * as P from "./phrases.ts";
import { EXTRACT_QUEUE } from "./stories.ts";
import { newId, splitQuotes } from "./text.ts";
import type { FamilyMessage, Person, Quote, Session } from "./types.ts";

export const MAX_MESSAGE_CHARS = 200;

async function familyMember(ctx: Ctx, personId: string): Promise<Person> {
  const person = await ctx.graph.get<Person>("Person", personId);
  if (!person || person.id === ctx.elder.id) throw new FamilyError("no such family member");
  return person;
}

export interface FamilyMemoryInput {
  personId: string; text: string; aboutSessionId?: string; at?: Date;
  /** false: no extraction job (the seed writes its mentions by hand). */
  queued?: boolean;
}

/** Saves a family member's memory, linked to the story of hers it is about. Queued for extraction. */
export async function shareFamilyMemory(ctx: Ctx, input: FamilyMemoryInput): Promise<{ say: string; sessionId: string }> {
  const { graph } = ctx;
  const person = await familyMember(ctx, input.personId);
  const text = input.text.trim();
  if (!text) throw new FamilyError("the memory is empty");
  let about: Session | null = null;
  if (input.aboutSessionId) {
    about = await graph.get<Session>("Session", input.aboutSessionId);
    if (!about || about.speakerId !== ctx.elder.id || about.private) throw new FamilyError("no such story");
  }
  const at = (input.at ?? ctx.clock.now()).toISOString();
  const session: Session = {
    id: newId("ses"), startedAt: at, speakerId: person.id, mode: "family", private: false, hasAudio: false,
    ...(about?.storyKey ? { storyKey: about.storyKey } : {}), ...(about ? { aboutSessionId: about.id } : {}),
  };
  await graph.upsert("Session", { ...session });
  if (about) await graph.link(["Session", session.id], "ABOUT", ["Session", about.id]);
  const quotes: Quote[] = splitQuotes(text).map((t, seq) => ({
    id: newId("q"), text: t, speakerId: person.id, saidAt: at, sessionId: session.id, seq, private: false,
  }));
  for (const q of quotes) {
    await graph.upsert("Quote", { ...q });
    await graph.link(["Session", session.id], "HAS_QUOTE", ["Quote", q.id]);
  }
  await graph.upsert("Job", { id: newId("job"), queue: EXTRACT_QUEUE, sessionId: session.id, at, done: input.queued === false });
  return { say: P.familyMemorySaved(ctx.elder.name), sessionId: session.id };
}

export interface FamilyVoice { sessionId: string; name: string; relation: string; at: string; quotes: string[] }

/** Family members' memories, grouped by the story of hers they are about ("" = not linked). */
export async function familyVoices(ctx: Ctx): Promise<Map<string, FamilyVoice[]>> {
  const { graph } = ctx;
  const people = new Map((await graph.find<Person>("Person")).map((p) => [p.id, p]));
  const out = new Map<string, FamilyVoice[]>();
  const sessions = (await graph.find<Session>("Session", { mode: "family" })).sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  for (const s of sessions) {
    const quotes = (await graph.out<Quote>(["Session", s.id], "HAS_QUOTE")).map((n) => n.node).sort((a, b) => a.seq - b.seq);
    const p = people.get(s.speakerId);
    const voice: FamilyVoice = {
      sessionId: s.id, name: p?.name ?? "Family", relation: p?.relationToElder ?? p?.relation ?? "",
      at: s.startedAt, quotes: quotes.map((q) => q.text),
    };
    const key = s.aboutSessionId ?? "";
    out.set(key, [...(out.get(key) ?? []), voice]);
  }
  return out;
}

/** Sets (or, with empty text, clears) the message read to her when she asks where this person is. */
export async function setFamilyMessage(ctx: Ctx, personId: string, text: string): Promise<{ say: string }> {
  const { graph } = ctx;
  await familyMember(ctx, personId);
  const clean = text.trim();
  if (clean.length > MAX_MESSAGE_CHARS) throw new FamilyError(`keep the message under ${MAX_MESSAGE_CHARS} characters`);
  for (const m of await graph.find<FamilyMessage>("FamilyMessage", { personId })) await graph.remove("FamilyMessage", m.id);
  if (!clean) return { say: "" };
  const message: FamilyMessage = { id: newId("msg"), personId, text: clean, at: ctx.clock.now().toISOString() };
  await graph.upsert("FamilyMessage", { ...message });
  return { say: P.messageSaved(ctx.elder.name) };
}

export async function familyMessages(ctx: Ctx): Promise<FamilyMessage[]> {
  return ctx.graph.find<FamilyMessage>("FamilyMessage");
}
