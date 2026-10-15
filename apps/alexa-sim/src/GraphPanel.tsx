import { useEffect, useRef, useState } from 'react';
import type { GraphData } from './api.ts';

// Force-directed view of the memory graph (§13, P1). Her stories and the people, places, events
// and things they name are nodes; edges are mentions, RELATED links and RETELLS (a story told
// again). Nodes that appear while the panel is open pulse once.

interface Node { id: string; name: string; kind: string; x: number; y: number; vx: number; vy: number; fresh: number }
interface Edge { a: string; b: string; kind: 'mention' | 'related' | 'retell' }

const KIND_COLOR: Record<string, string> = { story: '#eef2f7', person: 'var(--marigold)', place: 'var(--ring)', event: 'var(--rose)', thing: 'var(--sage)' };
const W = 720;
const H = 420;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function GraphPanel({ data, stats }: { data: GraphData | null; stats: string }) {
  const nodes = useRef(new Map<string, Node>());
  const [, force] = useState(0);
  const edges = useRef<Edge[]>([]);

  useEffect(() => {
    if (!data) return;
    const known = nodes.current;
    const first = known.size === 0;
    const all = [
      ...data.stories.map((s) => ({ id: s.id, name: s.label, kind: 'story' })),
      ...data.entities,
    ];
    for (const e of all) {
      if (!known.has(e.id)) {
        known.set(e.id, { id: e.id, name: e.name, kind: e.kind, x: W / 2 + (Math.random() - 0.5) * 200, y: H / 2 + (Math.random() - 0.5) * 140, vx: 0, vy: 0, fresh: first ? 0 : 90 });
      }
    }
    for (const id of [...known.keys()]) if (!all.some((e) => e.id === id)) known.delete(id);
    const es: Edge[] = [
      ...data.mentions.map((m) => ({ a: m.story, b: m.entity, kind: 'mention' as const })),
      ...data.related.map((r) => ({ a: r.from, b: r.to, kind: 'related' as const })),
      ...data.retells.map((r) => ({ a: r.from, b: r.to, kind: 'retell' as const })),
    ];
    edges.current = es.filter((e) => known.has(e.a) && known.has(e.b));
    if (reduced()) { for (let i = 0; i < 300; i++) step(); force((n) => n + 1); }
  }, [data]);

  function step() {
    const ns = [...nodes.current.values()];
    for (const a of ns) {
      for (const b of ns) {
        if (a === b) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 100);
        const f = 9000 / (d2 * Math.sqrt(d2)); // inverse-square repulsion along the unit vector
        a.vx += dx * f; a.vy += dy * f;
      }
      a.vx += (W / 2 - a.x) * 0.005; a.vy += (H / 2 - a.y) * 0.009;
    }
    for (const e of edges.current) {
      const a = nodes.current.get(e.a)!, b = nodes.current.get(e.b)!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = ((d - (e.kind === 'mention' ? 85 : 60)) / d) * 0.03;
      a.vx += dx * k; a.vy += dy * k; b.vx -= dx * k; b.vy -= dy * k;
    }
    for (const n of ns) {
      n.vx *= 0.82; n.vy *= 0.82;
      n.x = Math.min(W - 30, Math.max(30, n.x + n.vx));
      n.y = Math.min(H - 20, Math.max(20, n.y + n.vy));
      if (n.fresh > 0) n.fresh--;
    }
  }

  useEffect(() => {
    if (reduced()) return;
    let raf = 0;
    const loop = () => { step(); force((n) => n + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const ns = [...nodes.current.values()];
  return (
    <section className="graph" aria-label="Memory graph">
      <header className="graph-head">
        <h2>Memory graph</h2>
        <span className="mono muted">{stats}</span>
        <ul className="legend">{Object.entries(KIND_COLOR).map(([k, c]) => <li key={k}><i style={{ background: c }} />{k}</li>)}</ul>
      </header>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ns.length} remembered people, places, events and things`}>
        {edges.current.map((e) => {
          const a = nodes.current.get(e.a), b = nodes.current.get(e.b);
          if (!a || !b) return null;
          return <line key={e.kind + e.a + e.b} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge ${e.kind}`} />;
        })}
        {ns.map((n) => (
          <g key={n.id} transform={`translate(${n.x},${n.y})`} className={n.fresh > 0 ? 'node fresh' : 'node'}>
            {n.fresh > 0 && <circle r={8 + (90 - n.fresh) / 4} className="pulse" style={{ stroke: KIND_COLOR[n.kind] }} opacity={n.fresh / 90} />}
            {n.kind === 'story'
              ? <rect x={-6} y={-6} width={12} height={12} rx={2} style={{ fill: KIND_COLOR.story }} />
              : <circle r={7} style={{ fill: KIND_COLOR[n.kind] ?? 'var(--muted)' }} />}
            <text x={11} y={4}>{n.name}</text>
          </g>
        ))}
      </svg>
    </section>
  );
}
