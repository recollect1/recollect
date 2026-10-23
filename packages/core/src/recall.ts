// Grounded recall, CLAUDE.md §11. The spoken answer is assembled only from stored Quote text;
// no model writes it. Nothing relevant stored -> nothingRecorded.
import type { Ctx } from "./ctx.ts";
import { cosine } from "./embed.ts";
import type { Graph } from "./graph.ts";
import { spokenDate, voice } from "./lang.ts";
import * as EN from "./phrases.ts";
import { normalise, wordCount } from "./text.ts";
import { fmtDate } from "./time.ts";
import type { Entity, EntityKind, Person, Quote, Session } from "./types.ts";

/** Sessions recall answers from: her life stories, and family members' memories of them. */
const RECALLED_MODES = new Set(["story", "family"]);

export const MAX_ANSWER_WORDS = 45;
const TOP_K = 8;
/** Candidates passed to the relevance check. Each costs two cross-encoder pairs. */
const RERANK_K = 4;
const env = (name: string, fallback: number) => Number(process.env[name] ?? fallback);
/** §11 step 4: 0.6·cosine + 0.4·entity overlap must reach this before anything else is tried. */
const minScore = () => env("RECALL_MIN_SCORE", 0.45);
/** Relevance logit at which a quote answers the question as asked. */
const directMin = () => env("RECALL_DIRECT_MIN", 0.5);
/**
 * Relevance logit at which a quote answers the question with its names blanked out. Sharing a
 * name is not an answer: "Where did Aman go to university?" must not return the story of his
 * birth. The rest of the question has to match something she said as well.
 */
const maskedMin = () => env("RECALL_MASKED_MIN", -8.5);

interface IndexedQuote extends Quote { entityIds: Set<string>; storyEntityIds: Set<string>; storyKey?: string }
const PRONOUN: Record<EntityKind, string> = { person: "they", place: "there", event: "it", thing: "it" };

/** In-process view of quotes, embeddings and entity aliases, so recall needs no graph round trip. */
export class RecallIndex {
  private quotes = new Map<string, IndexedQuote>();
  private aliases: { alias: string; entityId: string; mask: RegExp; pronoun: string }[] = [];
  private names = new Map<string, string>();

  async load(graph: Graph): Promise<void> {
    const sessions = new Map((await graph.find<Session>("Session")).map((s) => [s.id, s]));
    const quotes = new Map<string, IndexedQuote>();
    const bySession = new Map<string, Set<string>>();
    for (const q of await graph.find<Quote>("Quote")) {
      const s = sessions.get(q.sessionId);
      // Weekly photo descriptions and chats about her day are marker series, not life stories.
      if (!s || !RECALLED_MODES.has(s.mode) || !q.embedding) continue;
      let storyEntityIds = bySession.get(q.sessionId);
      if (!storyEntityIds) bySession.set(q.sessionId, (storyEntityIds = new Set()));
      quotes.set(q.id, { ...q, entityIds: new Set(), storyEntityIds, storyKey: s.storyKey });
    }
    this.names = new Map((await graph.find<Person>("Person")).map((p) => [p.id, p.name]));
    const aliases: RecallIndex["aliases"] = [];
    for (const e of await graph.find<Entity>("Entity")) {
      for (const a of [e.name, ...e.aliases]) {
        const words = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]+/g, "[-\\s]+");
        aliases.push({
          alias: normalise(a), entityId: e.id, pronoun: PRONOUN[e.kind],
          mask: new RegExp(`\\b(?:(?:my|the|our)\\s+)?${words}(?:['’]s)?(?![\\w-])`, "gi"),
        });
      }
      for (const m of await graph.into<Quote>(["Entity", e.id], "MENTIONS")) {
        const q = quotes.get(m.node.id);
        // A sentence like "She cooked it slowly" is still about the mother named one sentence earlier.
        if (q) { q.entityIds.add(e.id); q.storyEntityIds.add(e.id); }
      }
    }
    // Longest alias first, so "mother-in-law" is matched before "mother".
    this.aliases = aliases.sort((a, b) => b.alias.length - a.alias.length);
    this.quotes = quotes;
  }

  /** Entities named in the text, matched on whole words through the alias map. */
  entitiesIn(text: string): Set<string> {
    let t = normalise(text);
    const hits = new Set<string>();
    for (const { alias, entityId } of this.aliases) {
      if (!t.includes(alias)) continue;
      hits.add(entityId);
      t = t.split(alias).join("  ");
    }
    return hits;
  }

  /** The question with every known name replaced by a pronoun. */
  maskEntities(text: string): string {
    let t = text;
    for (const { mask, pronoun } of this.aliases) t = t.replace(mask, pronoun);
    return t;
  }

  all(): IndexedQuote[] { return [...this.quotes.values()]; }
  get(id: string): IndexedQuote | undefined { return this.quotes.get(id); }
  speakerName(id: string): string { return this.names.get(id) ?? ""; }
  get size(): number { return this.quotes.size; }
}

export interface RecalledQuote { id: string; text: string; saidAt: string; date: string; sessionId: string; storyKey?: string }
export interface RecallResult {
  say: string; found: boolean; quotes: RecalledQuote[];
  /** Who said the quoted words: her, or a family member (family memory network). */
  speaker?: string;
  /** Best §11 score, and the relevance logits behind the decision (for the eval table). */
  score: number; direct?: number; masked?: number;
}

export async function recall(ctx: Ctx, question: string, role: "elder" | "family"): Promise<RecallResult> {
  const { index, household, elder } = ctx;
  // She hears her own language; the family reads English. Quotes are never translated.
  const V = role === "elder" ? voice(ctx) : EN;
  const nothing = (score: number, direct?: number, masked?: number): RecallResult => ({
    say: V.nothingRecorded("that"), found: false, quotes: [], score,
    ...(direct === undefined ? {} : { direct }), ...(masked === undefined ? {} : { masked }),
  });
  const qVec = await ctx.embedder.embed(question);
  const hits = index.entitiesIn(question);

  // Steps 3–4: candidates = quotes from stories that mention a hit entity ∪ top-8 by vector.
  const visible = index.all().filter((q) => role === "elder" || !q.private);
  const scored = visible.map((q) => {
    const cos = cosine(qVec, q.embedding ?? []);
    let shared = 0;
    for (const id of hits) if (q.storyEntityIds.has(id)) shared++;
    return { q, cos, shared, score: 0.6 * cos + 0.4 * (hits.size ? shared / hits.size : 0) };
  });
  const topByVector = new Set([...scored].sort((a, b) => b.cos - a.cos).slice(0, TOP_K).map((s) => s.q.id));
  const candidates = scored
    .filter((s) => (s.shared > 0 || topByVector.has(s.q.id)) && s.score >= minScore())
    .sort((a, b) => b.score - a.score)
    .slice(0, RERANK_K);
  const top = candidates[0];
  if (!top) return nothing(Math.max(0, ...scored.map((s) => s.score)));

  // Relevance check: does a candidate answer the question — as asked, or with its names blanked?
  const passages = candidates.map((c) => c.q.text);
  // The names-blanked pass only runs when the question as asked did not already find its answer.
  const fill = (text: string) => new Array<string>(passages.length).fill(text);
  const direct = await ctx.reranker.score(fill(question), passages);
  const bestDirect = Math.max(...direct);
  const masked = bestDirect < directMin() && hits.size
    ? await ctx.reranker.score(fill(index.maskEntities(question)), passages) : [];
  const bestMasked = masked.length ? Math.max(...masked) : undefined;
  if (bestDirect < directMin() && (bestMasked === undefined || bestMasked < maskedMin()))
    return nothing(top.score, bestDirect, bestMasked);
  const rel = (i: number) => Math.max(direct[i] ?? -Infinity, masked[i] ?? -Infinity);
  const answers = (i: number) => (direct[i] ?? -Infinity) >= directMin() || (masked[i] ?? -Infinity) >= maskedMin();
  // Her own words first: a family member's memory is quoted only when none of hers answers.
  const order = candidates.map((_, i) => i).sort((a, b) => rel(b) - rel(a));
  const pick = order.find((i) => answers(i) && candidates[i]!.q.speakerId === elder.id) ?? order[0]!;
  const best = (candidates[pick] ?? top).q;

  // Step 6: 1–2 quotes, at most 45 words, whole sentences only, copied verbatim. The second quote
  // is the sentence she said next, so the two read as one unbroken passage of her own words.
  const picked = [best];
  const next = visible.find((q) => q.sessionId === best.sessionId && q.seq === best.seq + 1);
  if (next && wordCount(best.text) + wordCount(next.text) <= MAX_ANSWER_WORDS) picked.push(next);

  const date = fmtDate(new Date(best.saidAt), household.tz);
  const text = picked.map((q) => q.text).join(" ");
  const speaker = best.speakerId === elder.id ? elder.name : index.speakerName(best.speakerId) || "Someone";
  const spoken = role === "elder" ? spokenDate(ctx, new Date(best.saidAt)) : date;
  const say = best.speakerId === elder.id || role === "family"
    ? V.fromTheirWords(text, speaker, spoken, role)
    : V.fromFamilyWords(text, speaker, spoken);
  return {
    say, found: true, speaker, score: top.score, direct: bestDirect, ...(bestMasked === undefined ? {} : { masked: bestMasked }),
    quotes: picked.map((q) => ({
      id: q.id, text: q.text, saidAt: q.saidAt, date, sessionId: q.sessionId, storyKey: q.storyKey,
    })),
  };
}
