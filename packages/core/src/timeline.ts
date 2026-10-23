// Her life on a timeline, built only from what is stored: each story she told is placed at the year
// she said in her own words, or else at a year the family confirmed on the family page; anything
// else stays "undated" (never guessed). Every point carries her verbatim sentences. Family members'
// memories hang off the story they are about. Private stories are left out for the family (§1.6).
import type { Ctx } from "./ctx.ts";
import { FamilyError } from "./family.ts";
import { fmtDate } from "./time.ts";
import type { Entity, FamilyQuestion, Person, Photo, Quote, Session } from "./types.ts";

const YEAR = /\b(1[89]\d{2}|20\d{2})\b/;

export interface TimelineEvent {
  id: string; storyKey?: string; title: string;
  year: number | null;
  /** "said": a year in her own words (quoted in yearQuote); "family": confirmed by a family member. */
  yearSource: "said" | "family" | null; yearQuote?: string; yearBy?: string;
  toldAt: string; toldOn: string;
  quotes: string[];
  entities: { id: string; name: string; kind: string }[];
  photoUrl?: string;
  /** Session id of the first telling, when this is a retelling. */
  retellOf?: string;
  answers?: { question: string; asker: string };
  voices: { sessionId: string; name: string; relation: string; quotes: string[]; toldOn: string }[];
}

export interface Timeline {
  elder: string; from: number | null; to: number;
  events: TimelineEvent[];
  /** People, places and things named in more than one story: drawn as threads across time. */
  threads: { entityId: string; name: string; kind: string; events: string[] }[];
  updatedAt: string;
}

export async function lifeTimeline(ctx: Ctx, role: "elder" | "family"): Promise<Timeline> {
  const { graph, elder, household } = ctx;
  const [sessions, people, entities, photos, questions] = await Promise.all([
    graph.find<Session>("Session"), graph.find<Person>("Person"), graph.find<Entity>("Entity"),
    graph.find<Photo>("Photo"), graph.find<FamilyQuestion>("FamilyQuestion"),
  ]);
  const visible = (s: Session) => role === "elder" || !s.private;
  const hers = sessions.filter((s) => s.speakerId === elder.id && s.mode === "story" && visible(s))
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  const family = sessions.filter((s) => s.mode === "family" && s.aboutSessionId && visible(s));
  const personName = (id: string) => people.find((p) => p.id === id);
  const entityById = new Map(entities.map((e) => [e.id, e]));

  // Photos that depict something a story names.
  const photoOf = new Map<string, string>();
  for (const p of photos) for (const d of await graph.out<Entity>(["Photo", p.id], "DEPICTS")) photoOf.set(d.node.id, p.url);

  const quotesOf = async (s: Session) =>
    (await graph.out<Quote>(["Session", s.id], "HAS_QUOTE")).map((n) => n.node)
      .filter((q) => role === "elder" || !q.private).sort((a, b) => a.seq - b.seq);

  const firstTelling = new Map<string, string>();
  const events: TimelineEvent[] = [];
  for (const s of hers) {
    const quotes = await quotesOf(s);
    if (!quotes.length) continue;
    const named = new Map<string, { id: string; name: string; kind: string }>();
    for (const q of quotes) {
      for (const m of await graph.out<Entity>(["Quote", q.id], "MENTIONS")) {
        const e = entityById.get(m.node.id) ?? m.node;
        named.set(e.id, { id: e.id, name: e.name, kind: e.kind });
      }
    }
    // The year: her own words first, then the family's confirmation; never a guess.
    const saidIn = quotes.find((q) => YEAR.test(q.text) && Number(YEAR.exec(q.text)![1]) <= ctx.clock.now().getUTCFullYear());
    const said = saidIn ? Number(YEAR.exec(saidIn.text)![1]) : null;
    const by = s.eraById ? personName(s.eraById)?.name : undefined;
    const key = s.storyKey;
    let retellOf: string | undefined;
    if (key) {
      if (firstTelling.has(key)) retellOf = firstTelling.get(key);
      else firstTelling.set(key, s.id);
    }
    if (!retellOf) {
      // A retelling recorded only by RETELLS edges (live stories have no story key).
      for (const q of quotes) {
        const target = (await graph.out<Quote>(["Quote", q.id], "RETELLS"))[0]?.node;
        if (target && target.sessionId !== s.id) { retellOf = target.sessionId; break; }
      }
    }
    const answered = questions.find((qq) => qq.answerSessionId === s.id);
    const photoUrl = [...named.keys()].map((id) => photoOf.get(id)).find(Boolean);
    const title = s.title || `${quotes[0]!.text.split(/\s+/).slice(0, 7).join(" ")}…`;
    events.push({
      id: s.id, ...(key ? { storyKey: key } : {}), title,
      year: said ?? (s.eraYear || null),
      yearSource: said ? "said" : s.eraYear ? "family" : null,
      ...(saidIn ? { yearQuote: saidIn.text } : {}), ...(!said && by ? { yearBy: by } : {}),
      toldAt: s.startedAt, toldOn: fmtDate(new Date(s.startedAt), household.tz),
      quotes: quotes.map((q) => q.text), entities: [...named.values()],
      ...(photoUrl ? { photoUrl } : {}), ...(retellOf ? { retellOf } : {}),
      ...(answered ? { answers: { question: answered.text, asker: personName(answered.askedById)?.name ?? "" } } : {}),
      voices: [],
    });
  }
  // A retelling happened when the first telling did.
  for (const e of events) {
    const first = e.retellOf && events.find((x) => x.id === e.retellOf);
    if (first && e.year === null) { e.year = first.year; e.yearSource = first.yearSource; if (first.yearBy) e.yearBy = first.yearBy; }
  }
  for (const f of family) {
    const target = events.find((e) => e.id === f.aboutSessionId);
    if (!target) continue;
    const p = personName(f.speakerId);
    target.voices.push({
      sessionId: f.id, name: p?.name ?? "Family", relation: p?.relationToElder ?? p?.relation ?? "",
      quotes: (await quotesOf(f)).map((q) => q.text), toldOn: fmtDate(new Date(f.startedAt), household.tz),
    });
  }

  const byEntity = new Map<string, string[]>();
  for (const e of events) for (const n of e.entities) byEntity.set(n.id, [...(byEntity.get(n.id) ?? []), e.id]);
  const threads = [...byEntity].filter(([, ev]) => new Set(ev).size > 1).map(([id, ev]) => {
    const e = entityById.get(id)!;
    return { entityId: id, name: e?.name ?? id, kind: e?.kind ?? "thing", events: [...new Set(ev)] };
  });
  const years = events.map((e) => e.year).filter((y): y is number => y !== null);
  return {
    elder: elder.name, from: years.length ? Math.min(...years) : null, to: ctx.clock.now().getUTCFullYear(),
    events, threads, updatedAt: ctx.clock.now().toISOString(),
  };
}

/** Family page: confirm roughly when a story happened (or clear it), and give it a title. */
export async function setStoryEra(
  ctx: Ctx, sessionId: string, input: { year?: number | null; title?: string; byId?: string },
): Promise<void> {
  const s = await ctx.graph.get<Session>("Session", sessionId);
  if (!s || s.speakerId !== ctx.elder.id) throw new FamilyError("That story no longer exists.");
  const props: Record<string, unknown> & { id: string } = { id: sessionId };
  if (input.year !== undefined) {
    const now = ctx.clock.now().getUTCFullYear();
    if (input.year !== null && (!Number.isInteger(input.year) || input.year < 1900 || input.year > now))
      throw new FamilyError(`Choose a year between 1900 and ${now}.`);
    props.eraYear = input.year ?? 0;
    props.eraById = input.year ? input.byId ?? ctx.admin.id : "";
  }
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (t.length > 80) throw new FamilyError("Keep the title under 80 characters.");
    props.title = t;
  }
  await ctx.graph.upsert("Session", props);
}
