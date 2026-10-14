import type { CardRef } from './api.ts';

// Plain rendering from structuredContent, for when the MCP Apps card cannot start.
export function FallbackCard({ card }: { card: CardRef }) {
  const sc = card.result.structuredContent ?? {};
  const c = sc.card as any;
  if (!c) return <p className="fallback-say">{String(sc.say ?? '')}</p>;
  if (card.toolName === 'whats_today') {
    return (
      <div className="fallback">
        <div className="fb-day">{c.weekday}</div>
        <div className="fb-date">{c.day} {c.month} {c.year}</div>
        <ul>{c.doses.map((d: any) => <li key={d.medicine + d.time}>{d.medicine} — {d.taken ? `✓ taken ${d.takenAt}` : `due ${d.time}`}</li>)}</ul>
      </div>
    );
  }
  return (
    <figure className="fallback">
      <blockquote className="quote">“{c.quote}”</blockquote>
      <figcaption>told by {c.speakerName} · {c.toldOn}</figcaption>
    </figure>
  );
}
