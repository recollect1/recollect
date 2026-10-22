// Carer coach (family only). For common hard moments, fixed and reviewed guidance, plus a
// conversation starter built from her own stories: a topic she has talked about and her exact
// words, so the suggestion is about her and not generic advice. No model writes any of it.
import type { Ctx } from "./ctx.ts";
import * as P from "./phrases.ts";
import { fmtDate } from "./time.ts";
import type { Entity, Profile, Quote, Session } from "./types.ts";

export type Situation = keyof typeof P.COACH;
const PARENT_WORDS = new Set(["mother", "father", "mum", "maa", "papa", "dad", "amma", "biji", "bauji"]);
const RELATION_WORDS = new Set([...PARENT_WORDS, "brother", "sister", "husband", "grandson", "granddaughter", "son", "daughter"]);

export interface Starter { topic: string; quote: string; date: string; say: string }
export interface CoachTip { situation: Situation; title: string; guidance: string; starter?: Starter; calm?: string }

interface Mention { entity: Entity; quote: Quote; session: Session }

async function mentions(ctx: Ctx): Promise<Mention[]> {
  const { graph, elder } = ctx;
  const out: Mention[] = [];
  const sessions = (await graph.find<Session>("Session", { speakerId: elder.id }))
    .filter((s) => s.mode === "story" && !s.private)
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  for (const s of sessions) {
    for (const n of await graph.out<Quote>(["Session", s.id], "HAS_QUOTE")) {
      for (const m of await graph.out<Entity>(["Quote", n.node.id], "MENTIONS")) out.push({ entity: m.node, quote: n.node, session: s });
    }
  }
  return out;
}

const isParent = (e: Entity) => [e.name, ...e.aliases].some((a) => PARENT_WORDS.has(a.toLowerCase().replace(/^my /, "")));
const topicOf = (e: Entity) => (RELATION_WORDS.has(e.name.toLowerCase()) ? `her ${e.name.toLowerCase()}` : e.name);

/** The entity she has talked about most among those matching, with the first sentence naming it. */
function starterFrom(ctx: Ctx, all: Mention[], match: (e: Entity) => boolean): Starter | undefined {
  const counts = new Map<string, Mention[]>();
  for (const m of all.filter((x) => match(x.entity))) counts.set(m.entity.id, [...(counts.get(m.entity.id) ?? []), m]);
  const best = [...counts.values()].sort((a, b) => b.length - a.length)[0];
  const first = best?.[0];
  if (!first) return undefined;
  const topic = topicOf(first.entity);
  const date = fmtDate(new Date(first.quote.saidAt), ctx.household.tz);
  return { topic, quote: first.quote.text, date, say: P.coachStarter(topic, first.quote.text, date) };
}

export async function carerCoach(ctx: Ctx): Promise<CoachTip[]> {
  const all = await mentions(ctx);
  const profile = await ctx.graph.get<Profile>("Profile", ctx.elder.id);
  const calm = profile?.calms[0];
  const tip = (situation: Situation, starter?: Starter, extra: Partial<CoachTip> = {}): CoachTip => ({
    situation, ...P.COACH[situation]!, ...(starter ? { starter } : {}), ...extra,
  });
  const home = starterFrom(ctx, all, (e) => e.kind === "place");
  const people = starterFrom(ctx, all, (e) => e.kind === "person" && !isParent(e));
  return [
    tip("parent", starterFrom(ctx, all, isParent)),
    tip("going_out", home),
    tip("repeats"),
    tip("evening", people, calm ? { calm } : {}),
  ];
}
