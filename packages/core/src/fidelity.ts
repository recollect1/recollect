// Memory Fidelity Engine. Two family-only views built from the graph; nothing here is ever said to
// her, and nothing quizzes or corrects her.
//
// 1. Retell consistency: when she tells a story again, the details she named (people, places,
//    things, years) are compared with her first telling: kept, dropped, added, years that changed,
//    and a person who may have been swapped for another.
// 2. Recent vs long ago: a gentle "tell me about your day" chat. Her words are saved and she always
//    hears the same thanks; silently, the people she names are compared with who actually visited or
//    called today. Alongside, how much detail her stories from long ago carry. In memory loss, recent
//    memories often fade before old ones (Ribot's law); this compares her only with herself.
import type { Ctx } from "./ctx.ts";
import { familyVoices } from "./network.ts";
import * as P from "./phrases.ts";
import { rememberStory } from "./stories.ts";
import { newId, normalise } from "./text.ts";
import { fmtDate, localParts, minutesOfDay, parseHHMM } from "./time.ts";
import type { Consent, Entity, Person, Quote, RecentRecall, Session, Visit } from "./types.ts";

const YEAR = /\b(1[89]\d\d|20\d\d)\b/g;
const WINDOW_DAYS = 28;
const MIN_CHATS = 4;

interface Telling { session: Session; quotes: Quote[]; entities: Map<string, Entity>; years: Set<string> }

async function telling(ctx: Ctx, session: Session): Promise<Telling> {
  const quotes = (await ctx.graph.out<Quote>(["Session", session.id], "HAS_QUOTE")).map((n) => n.node).sort((a, b) => a.seq - b.seq);
  const entities = new Map<string, Entity>();
  const years = new Set<string>();
  for (const q of quotes) {
    for (const m of await ctx.graph.out<Entity>(["Quote", q.id], "MENTIONS")) entities.set(m.node.id, m.node);
    for (const y of q.text.match(YEAR) ?? []) years.add(y);
  }
  return { session, quotes, entities, years };
}

export interface RetellComparison {
  storyKey?: string;
  first: { sessionId: string; at: string; date: string; opening: string };
  retold: { sessionId: string; at: string; date: string; opening: string };
  kept: string[]; dropped: string[]; added: string[];
  years: { first: string[]; retold: string[] } | null;
  /** [first telling, retelling]: a person she named before, and a different one in the same story now. */
  possibleSwaps: [string, string][];
  /** Details that a family member's own memory of this story also names. */
  confirmedByFamily: string[];
  consistency: number; say: string;
}

/** Pairs each retelling with her first telling of the same story (same story key, or RETELLS edges). */
export async function retellComparisons(ctx: Ctx): Promise<RetellComparison[]> {
  const { graph, elder, household } = ctx;
  const sessions = (await graph.find<Session>("Session", { speakerId: elder.id }))
    .filter((s) => s.mode === "story" && !s.private)
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const quoteSession = new Map<string, string>();
  for (const s of sessions) for (const n of await graph.out<Quote>(["Session", s.id], "HAS_QUOTE")) quoteSession.set(n.node.id, s.id);

  const firstOf = new Map<string, string>(); // retelling session id -> first telling session id
  for (const s of sessions) {
    let first: Session | undefined;
    if (s.storyKey) first = sessions.find((x) => x.storyKey === s.storyKey && x.startedAt < s.startedAt);
    if (!first) {
      for (const n of await graph.out<Quote>(["Session", s.id], "HAS_QUOTE")) {
        for (const r of await graph.out<Quote>(["Quote", n.node.id], "RETELLS")) {
          const earlier = byId.get(quoteSession.get(r.node.id) ?? "");
          if (earlier && earlier.startedAt < s.startedAt && (!first || earlier.startedAt < first.startedAt)) first = earlier;
        }
      }
    }
    if (first) firstOf.set(s.id, firstOf.get(first.id) ?? first.id);
  }

  const voices = await familyVoices(ctx);
  const out: RetellComparison[] = [];
  for (const [retoldId, firstId] of firstOf) {
    const a = await telling(ctx, byId.get(firstId)!);
    const b = await telling(ctx, byId.get(retoldId)!);
    const name = (e: Entity) => e.name;
    const kept = [...a.entities.values()].filter((e) => b.entities.has(e.id)).map(name);
    const dropped = [...a.entities.values()].filter((e) => !b.entities.has(e.id));
    const added = [...b.entities.values()].filter((e) => !a.entities.has(e.id));
    const possibleSwaps: [string, string][] = [];
    for (const d of dropped.filter((e) => e.kind === "person")) {
      const instead = added.find((e) => e.kind === "person" && !possibleSwaps.some(([, x]) => x === e.name));
      if (instead) possibleSwaps.push([d.name, instead.name]);
    }
    const yearsChanged = a.years.size > 0 && b.years.size > 0 && [...a.years].sort().join() !== [...b.years].sort().join();
    const familyNames = new Set<string>();
    for (const v of [...(voices.get(firstId) ?? []), ...(voices.get(retoldId) ?? [])]) {
      for (const n of await graph.out<Quote>(["Session", v.sessionId], "HAS_QUOTE"))
        for (const m of await graph.out<Entity>(["Quote", n.node.id], "MENTIONS")) familyNames.add(m.node.name);
    }
    const total = kept.length + dropped.length;
    const show = (t: Telling) => ({
      sessionId: t.session.id, at: t.session.startedAt, date: fmtDate(new Date(t.session.startedAt), household.tz),
      opening: t.quotes[0]?.text ?? "",
    });
    out.push({
      ...(b.session.storyKey ? { storyKey: b.session.storyKey } : {}),
      first: show(a), retold: show(b), kept, dropped: dropped.map(name), added: added.map(name),
      years: yearsChanged ? { first: [...a.years], retold: [...b.years] } : null,
      possibleSwaps,
      confirmedByFamily: [...a.entities.values(), ...b.entities.values()].map(name).filter((n, i, xs) => familyNames.has(n) && xs.indexOf(n) === i),
      consistency: total ? Math.round((kept.length / total) * 100) / 100 : 1,
      say: P.retellSummary(ctx.elder.name, kept.length, total),
    });
  }
  return out.sort((x, y) => (x.retold.at < y.retold.at ? 1 : -1));
}

/** Who was due to visit or call today, by now. */
async function expectedToday(ctx: Ctx): Promise<Person[]> {
  const now = ctx.clock.now();
  const { weekday } = localParts(now, ctx.household.tz);
  const nowMin = minutesOfDay(now, ctx.household.tz);
  const people = new Map((await ctx.graph.find<Person>("Person")).map((p) => [p.id, p]));
  return (await ctx.graph.find<Visit>("Visit"))
    .filter((v) => v.daysOfWeek.includes(weekday) && parseHHMM(v.time) <= nowMin)
    .map((v) => people.get(v.personId))
    .filter((p): p is Person => Boolean(p));
}

/** People she names in what she said: by name, alias or relation ("my grandson"). */
async function peopleNamed(ctx: Ctx, text: string): Promise<Person[]> {
  const said = normalise(text);
  const people = (await ctx.graph.find<Person>("Person")).filter((p) => p.id !== ctx.elder.id);
  return people.filter((p) => [p.name, p.relation, ...p.aliases].some((a) => a && said.includes(normalise(a))));
}

/**
 * The elder's "tell me about your day" chat. Without an answer: the gentle prompt. With one: her
 * words are kept and she hears the same thanks whatever she said. While change tracking is on, the
 * people she named are compared, silently, with who was due to visit or call.
 */
export async function todayChat(ctx: Ctx, answer?: string): Promise<{ say: string; saved: boolean }> {
  if (!answer?.trim()) return { say: P.todayChatPrompt(ctx.elder.name), saved: false };
  const { sessionId } = await rememberStory(ctx, { text: answer, mode: "daily", queued: false });
  const consent = (await ctx.graph.find<Consent>("Consent", { personId: ctx.elder.id }))[0];
  const expected = await expectedToday(ctx);
  if (consent?.trackingOn && expected.length) {
    const mentioned = await peopleNamed(ctx, answer);
    const record: RecentRecall = {
      id: newId("rr"), at: ctx.clock.now().toISOString(), sessionId, simulated: false,
      expected: expected.map((p) => p.name), mentioned: mentioned.map((p) => p.name),
      matched: mentioned.some((p) => expected.some((e) => e.id === p.id)),
    };
    await ctx.graph.upsert("RecentRecall", { ...record });
  }
  return { say: P.todayChatThanks(), saved: true };
}

export interface RecentVsOld {
  say: string; ready: boolean; simulated: boolean;
  recent: { named: number; chats: number };
  /** Mean distinct people, places and things per story she has told. */
  perStory: number;
  weekly: { week: string; named: number; chats: number }[];
}

export async function recentVsOld(ctx: Ctx): Promise<RecentVsOld> {
  const { graph, elder } = ctx;
  const all = (await graph.find<RecentRecall>("RecentRecall")).sort((a, b) => (a.at < b.at ? -1 : 1));
  const latest = all.at(-1);
  const since = latest ? new Date(new Date(latest.at).getTime() - WINDOW_DAYS * 86400000).toISOString() : "";
  const window = all.filter((r) => r.at > since);
  const named = window.filter((r) => r.matched).length;

  const stories = (await graph.find<Session>("Session", { speakerId: elder.id })).filter((s) => s.mode === "story");
  let details = 0;
  for (const s of stories) details += (await telling(ctx, s)).entities.size;
  const perStory = stories.length ? Math.round((details / stories.length) * 10) / 10 : 0;

  const weeks = new Map<string, { named: number; chats: number }>();
  for (const r of all) {
    const d = new Date(r.at);
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
    const key = monday.toISOString().slice(0, 10);
    const w = weeks.get(key) ?? { named: 0, chats: 0 };
    w.chats++; if (r.matched) w.named++;
    weeks.set(key, w);
  }
  const ready = window.length >= MIN_CHATS && stories.length > 0;
  return {
    say: ready ? P.recentVsOld(elder.name, named, window.length, perStory) : P.recentNotReady(elder.name),
    ready, simulated: all.some((r) => r.simulated),
    recent: { named, chats: window.length }, perStory,
    weekly: [...weeks].map(([week, w]) => ({ week, ...w })),
  };
}

export interface FidelityView { retells: RetellComparison[]; recentVsOld: RecentVsOld }

export async function fidelityView(ctx: Ctx): Promise<FidelityView> {
  return { retells: await retellComparisons(ctx), recentVsOld: await recentVsOld(ctx) };
}

/** Exposed for the "who visited" check in tests. */
export const _internals = { expectedToday, peopleNamed };
