// Memory Lane: a short guided reminiscence session built from her own graph (reminiscence and
// cognitive stimulation are widely used in dementia care). Each slide is one of her stories in her
// exact words, a photo of someone or somewhere in it if there is one, a family member's memory of
// it, and a gentle open question. Never a quiz: there is no right answer and nothing is checked.
import type { Ctx } from "./ctx.ts";
import { familyVoices } from "./network.ts";
import * as P from "./phrases.ts";
import { MAX_ANSWER_WORDS } from "./recall.ts";
import { wordCount } from "./text.ts";
import { fmtDate } from "./time.ts";
import type { Entity, Photo, Profile, Quote, Session } from "./types.ts";

export const LANE_SLIDES = 5;

export interface LaneSlide {
  sessionId: string; date: string; words: string; prompt: string; topic: string;
  photo?: { url: string; caption: string };
  voice?: { name: string; relation: string; words: string };
}
export interface MemoryLane { say: string; slides: LaneSlide[]; music?: string; elder: string }

export async function memoryLane(ctx: Ctx): Promise<MemoryLane> {
  const { graph, elder, household } = ctx;
  const sessions = (await graph.find<Session>("Session", { speakerId: elder.id }))
    .filter((s) => s.mode === "story" && !s.private);
  const voices = await familyVoices(ctx);
  const photos = await graph.find<Photo>("Photo");
  const depicts = new Map<string, Photo[]>();
  for (const ph of photos) for (const d of await graph.out<Entity>(["Photo", ph.id], "DEPICTS")) depicts.set(d.node.id, [...(depicts.get(d.node.id) ?? []), ph]);

  const candidates: (LaneSlide & { richness: number; key: string })[] = [];
  for (const s of sessions) {
    const quotes = (await graph.out<Quote>(["Session", s.id], "HAS_QUOTE")).map((n) => n.node).sort((a, b) => a.seq - b.seq);
    if (!quotes.length) continue;
    const entities = new Map<string, Entity>();
    for (const q of quotes) for (const m of await graph.out<Entity>(["Quote", q.id], "MENTIONS")) entities.set(m.node.id, m.node);
    // Her words, whole sentences, at most 45 words: the same rule as recall (§11).
    const picked: string[] = [];
    for (const q of quotes) {
      if (wordCount([...picked, q.text].join(" ")) > MAX_ANSWER_WORDS) break;
      picked.push(q.text);
    }
    if (!picked.length) picked.push(quotes[0]!.text);
    const focus = [...entities.values()].find((e) => e.kind === "person") ?? [...entities.values()].find((e) => e.kind === "place")
      ?? [...entities.values()][0];
    const topic = focus ? (focus.kind === "person" && /^[a-z]/.test(focus.name) ? `your ${focus.name}` : focus.name) : "that time";
    const photo = [...entities.keys()].map((id) => depicts.get(id)?.[0]).find(Boolean);
    const voice = voices.get(s.id)?.[0];
    candidates.push({
      sessionId: s.id, date: fmtDate(new Date(s.startedAt), household.tz), words: picked.join(" "),
      topic, prompt: P.memoryLanePrompt(topic),
      ...(photo ? { photo: { url: photo.url, caption: photo.caption } } : {}),
      ...(voice?.quotes[0] ? { voice: { name: voice.name, relation: voice.relation, words: voice.quotes[0] } } : {}),
      // Stories with a family member's memory or a photo make the warmest slides.
      richness: entities.size + (voice ? 3 : 0) + (photo ? 2 : 0), key: s.storyKey ?? s.id,
    });
  }
  // The richest telling of each story, richest stories first.
  const seen = new Set<string>();
  const slides = candidates.sort((a, b) => b.richness - a.richness)
    .filter((c) => !seen.has(c.key) && seen.add(c.key))
    .slice(0, LANE_SLIDES)
    .map(({ richness: _r, key: _k, ...slide }) => slide);
  const profile = await graph.get<Profile>("Profile", elder.id);
  const music = profile?.likes.find((l) => /song|music/i.test(l));
  return {
    say: slides.length ? P.memoryLaneIntro(elder.name) : P.memoryLaneEmpty(), slides, elder: elder.name,
    ...(music ? { music } : {}),
  };
}
