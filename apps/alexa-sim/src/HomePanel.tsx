import { useState } from 'react';
import type { RoutineState } from './api.ts';

// Simulated home (§13): the lights and speaker the routine agent controls, plus a demo clock
// that can jump to 11:15 (weekly photo, scenario J), 17:00 (evening calm, scenario I) or
// 03:00 (night, scenario K).
const JUMPS: { at?: string; label: string }[] = [
  { at: '09:00', label: 'Morning 09:00' },
  { at: '11:15', label: 'Photo time 11:15' },
  { at: '17:00', label: 'Evening 17:00' },
  { at: '03:00', label: 'Night 03:00' },
  { label: 'Real time' },
];

const LABEL: Record<string, string> = { light: 'Light', speaker: 'Speaker' };

export function HomePanel({ routine, onJump }: { routine: RoutineState | null; onJump: (at?: string) => Promise<void> | void }) {
  // The last demo-clock button pressed in this page (the server's clock keeps running from there).
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function jump(j: (typeof JUMPS)[number]) {
    setBusy(true);
    try { await onJump(j.at); setPicked(j.label); } finally { setBusy(false); }
  }
  return (
    <section className="home" aria-label="Simulated home">
      <div className="home-head">
        <h2>Simulated home</h2>
        <span className="mono muted">
          {routine ? `${routine.localTime} · ${routine.routine === 'none' ? 'no routine' : `${routine.routine} routine`}${routine.shortReplies ? ' · short replies' : ''}` : '…'}
        </span>
      </div>
      <ul className="devices">
        {(routine?.devices ?? []).map((d) => (
          <li key={d.id} className={`device-tile ${d.state === 'off' || d.state === 'idle' ? 'off' : 'on'}`}>
            <span className="device-dot" aria-hidden="true" />
            <span>{LABEL[d.kind] ?? d.kind} · {d.room}</span>
            <b>{d.state}</b>
          </li>
        ))}
      </ul>
      <div className="jumps" role="group" aria-label="Demo clock">
        <span className="mono muted">demo clock</span>
        {JUMPS.map((j) => (
          <button key={j.label} disabled={busy} aria-pressed={picked === j.label} onClick={() => void jump(j)}>{j.label}</button>
        ))}
      </div>
    </section>
  );
}
