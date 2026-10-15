import type { ToolCallRecord } from './api.ts';

export const latencyClass = (ms: number) => (ms < 250 ? 'ok' : ms < 500 ? 'warn' : 'bad');

export function p95(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]!;
}

export function LatencyStrip({ calls }: { calls: ToolCallRecord[] }) {
  const p = p95(calls.map((c) => c.ms));
  return (
    <section className="latency" aria-label="Tool latency">
      <div className="latency-sum mono">
        <span className="muted">tool calls</span> <b>{calls.length}</b>
        <span className="muted"> · p95 </span>
        <b className={p === null ? '' : latencyClass(p)}>{p === null ? '—' : `${p.toFixed(1)} ms`}</b>
        <span className="muted"> · budget 250 / 500 ms</span>
      </div>
      <ol className="latency-list">
        {calls.slice(-14).map((c, i) => (
          <li key={i} className={`lat-chip ${latencyClass(c.ms)}`} title={`server ${c.serverMs ?? '—'} ms\n${JSON.stringify(c.args)}`}>
            <span>{c.name}</span> <span className="mono">{c.ms.toFixed(1)} ms</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
