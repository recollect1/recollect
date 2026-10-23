import type { CardRef } from './api.ts';

// Plain rendering from structuredContent, for when the MCP Apps card cannot start.
// Only shows fields the tool returned; anything it cannot render falls back to the tool's `say`.
const isImage = (u: unknown): u is string => typeof u === 'string' && /^data:image\//.test(u);

export function FallbackCard({ card }: { card: CardRef }) {
  const sc = (card.result.structuredContent ?? {}) as Record<string, any>;
  const say = <p className="fallback-say">{String(sc.say ?? '')}</p>;
  switch (card.toolName) {
    case 'whats_today':
      if (!sc.weekday) return say;
      return (
        <div className="fallback">
          <div className="fb-day">{sc.weekday}</div>
          <div className="fb-date">{sc.date}</div>
          <ul>{(sc.doses ?? []).map((d: any, i: number) => <li key={d.name + d.time + i}>{d.name} — {d.taken ? `✓ taken ${d.takenAt ?? ''}` : `due ${d.time}`}</li>)}</ul>
          <ul>{(sc.visitors ?? []).map((v: any) => <li key={v.name + v.time}>{v.name} — {v.kind === 'call' ? 'calls today' : `comes ${v.time}`}</li>)}</ul>
        </div>
      );
    case 'recall_memory': {
      const quotes = (sc.quotes ?? []) as { text: string; date: string }[];
      if (!sc.found || !quotes.length) return say;
      return (
        <figure className="fallback">
          {quotes.map((q, i) => <blockquote key={i} className="quote">“{q.text}”</blockquote>)}
          <figcaption>told by {sc.speaker ?? ''} · {quotes[0]!.date}</figcaption>
        </figure>
      );
    }
    case 'who_is': {
      const c = sc.card as { name: string; relationToElder?: string; photoUrl?: string } | undefined;
      if (!c) return say;
      return (
        <div className="fallback">
          {isImage(c.photoUrl) && <img src={c.photoUrl} alt={c.name} />}
          <div className="fb-day">{c.name}</div>
          {say}
        </div>
      );
    }
    case 'photo_moment': {
      const p = sc.photo as { url: string; caption: string } | undefined;
      return <div className="fallback">{p && isImage(p.url) && <img src={p.url} alt={p.caption} />}{say}</div>;
    }
    default:
      return say;
  }
}
