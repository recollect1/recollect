// The memory graph as the simulator's live panel draws it (§13, P1): her stories, the people,
// places, events and things they name, how those relate, and which stories are retellings.
// Private stories are left out for the family role (§1.6).
import type { Ctx } from "./ctx.ts";
import type { Entity, Quote, Session } from "./types.ts";

export interface GraphView {
  stories: { id: string; label: string; startedAt: string }[];
  entities: { id: string; name: string; kind: string }[];
  mentions: { story: string; entity: string }[];
  related: { from: string; to: string; label: string }[];
  retells: { from: string; to: string }[];
}

export async function graphView(ctx: Ctx, role: "elder" | "family"): Promise<GraphView> {
  const { graph, elder } = ctx;
  const sessions = (await graph.find<Session>("Session", { speakerId: elder.id }))
    .filter((s) => s.mode === "story" && (role === "elder" || !s.private));
  const visible = new Set(sessions.map((s) => s.id));
  const sessionOfQuote = new Map<string, string>();
  const stories: GraphView["stories"] = [];
  for (const s of sessions) {
    const quotes = (await graph.out<Quote>(["Session", s.id], "HAS_QUOTE")).map((n) => n.node).sort((a, b) => a.seq - b.seq);
    for (const q of quotes) sessionOfQuote.set(q.id, s.id);
    const first = quotes[0]?.text ?? "";
    stories.push({ id: s.id, startedAt: s.startedAt, label: first.split(/\s+/).slice(0, 5).join(" ") + (first ? "…" : "") });
  }

  const entities: GraphView["entities"] = [];
  const mentions = new Set<string>();
  const related: GraphView["related"] = [];
  for (const e of await graph.find<Entity>("Entity")) {
    const storiesOfE = new Set(
      (await graph.into<Quote>(["Entity", e.id], "MENTIONS")).map((m) => sessionOfQuote.get(m.node.id)).filter((s): s is string => Boolean(s)),
    );
    if (storiesOfE.size === 0) continue; // only what her visible stories name
    entities.push({ id: e.id, name: e.name, kind: e.kind });
    for (const s of storiesOfE) mentions.add(`${s}|${e.id}`);
    for (const r of await graph.out<Entity>(["Entity", e.id], "RELATED")) {
      related.push({ from: e.id, to: r.node.id, label: String(r.edge.label ?? "") });
    }
  }
  const ids = new Set(entities.map((e) => e.id));

  const retells = new Set<string>();
  for (const [quoteId, sessionId] of sessionOfQuote) {
    for (const r of await graph.out<Quote>(["Quote", quoteId], "RETELLS")) {
      const other = sessionOfQuote.get(r.node.id);
      if (other && other !== sessionId && visible.has(other)) retells.add(`${sessionId}|${other}`);
    }
  }

  return {
    stories,
    entities,
    mentions: [...mentions].map((m) => { const [story, entity] = m.split("|") as [string, string]; return { story, entity }; }),
    related: related.filter((r) => ids.has(r.to)),
    retells: [...retells].map((r) => { const [from, to] = r.split("|") as [string, string]; return { from, to }; }),
  };
}
