import type { ToolCallRecord } from './api.ts';

export const latencyClass = (ms: number) => (ms < 250 ? 'ok' : ms < 500 ? 'warn' : 'bad');

/**
 * Time the server spent on the call when it reported one (`_meta["recollect/latencyMs"]`), else the
 * round trip. When the simulator is far from the server (a laptop in India, the server in
 * us-east-1), the round trip is mostly network; Alexa+ calls from inside AWS.
 */
export const toolMs = (c: ToolCallRecord) => c.serverMs ?? c.ms;

/** "server 6 ms · round trip 290 ms", or just the round trip when the server reported nothing. */
export const timing = (c: ToolCallRecord) =>
  c.serverMs === null ? `${c.ms.toFixed(0)} ms` : `server ${c.serverMs.toFixed(0)} ms · round trip ${c.ms.toFixed(0)} ms`;

export function p95(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]!;
}

export function LatencyStrip({ calls }: { calls: ToolCallRecord[] }) {
  const p = p95(calls.map(toolMs));
  const trip = p95(calls.map((c) => c.ms));
  return (
    <section className="latency" aria-label="Tool latency">
      <div className="panel-head"><h2>Tool latency</h2></div>
      <div className="latency-sum mono">
        <span className="muted">tool calls</span> <b>{calls.length}</b>
        <span className="muted"> · p95 on the server </span>
        <b className={p === null ? '' : latencyClass(p)}>{p === null ? '—' : `${p.toFixed(1)} ms`}</b>
        <span className="muted"> · budget 250 / 500 ms · round trip p95 {trip === null ? '—' : `${trip.toFixed(0)} ms`}</span>
      </div>
      <ol className="latency-list">
        {calls.slice(-14).map((c, i) => (
          <li key={i} className={`lat-chip ${latencyClass(toolMs(c))}`} title={JSON.stringify(c.args)}>
            <span>{c.name}</span> <span className="mono">{timing(c)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
