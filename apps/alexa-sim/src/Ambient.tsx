import { useEffect, useState } from 'react';
import type { RoutineState, ToolCallRecord } from './api.ts';

// The device's home screen when nothing else is showing: a big clock and a slow rotation of tiles.
// Every tile is built from data the simulator already has: routine_state (polled for the home
// panel) and the latest results of tool calls made in this conversation. The home screen itself
// never calls a tool (a whats_today call would be logged as one of her orientation questions).

interface TodaySC { weekday?: string; date?: string; visitors?: { name: string; time: string; kind: string }[]; doses?: { name: string; time: string; taken: boolean; takenAt?: string }[] }
interface Tile { key: string; label: string; node: React.ReactNode }

const latest = (calls: ToolCallRecord[], name: string, ok: (sc: Record<string, any>) => boolean) =>
  [...calls].reverse().find((c) => c.name === name && c.structuredContent && ok(c.structuredContent))?.structuredContent as Record<string, any> | undefined;

export function Ambient({ routine, calls, lang, suggestions }: {
  routine: RoutineState | null; calls: ToolCallRecord[]; lang: 'en' | 'hi'; suggestions: string[];
}) {
  const today = latest(calls, 'whats_today', (sc) => Boolean(sc.weekday)) as TodaySC | undefined;
  const photo = latest(calls, 'photo_moment', (sc) => Boolean(sc.photo))?.photo as { url: string; caption: string } | undefined;

  const tiles: Tile[] = [];
  if (routine && routine.routine !== 'none' && routine.greeting) {
    tiles.push({ key: 'routine', label: routine.routine === 'evening' ? 'Evening' : 'Night', node: <p className="amb-greeting">{routine.greeting}</p> });
  }
  if (today && ((today.visitors?.length ?? 0) > 0 || (today.doses?.length ?? 0) > 0)) {
    tiles.push({
      key: 'today', label: 'Today',
      node: (
        <div className="amb-today">
          {(today.visitors ?? []).map((v) => (
            <p key={v.name + v.time}><span className="amb-ico" aria-hidden="true">●</span>{v.name} <span className="amb-dim">{v.kind === 'call' ? 'calls today' : `comes at ${v.time}`}</span></p>
          ))}
          <ul className="amb-doses">
            {(today.doses ?? []).map((d, i) => (
              <li key={d.name + d.time + i} className={d.taken ? 'taken' : ''}>{d.taken ? '✓ ' : ''}{d.name} <span className="amb-dim">{d.taken ? d.takenAt : d.time}</span></li>
            ))}
          </ul>
        </div>
      ),
    });
  }
  if (photo && /^data:image\//.test(photo.url)) {
    tiles.push({ key: 'photo', label: 'This week’s photo', node: <figure className="amb-photo"><img src={photo.url} alt={photo.caption} /><figcaption>{photo.caption}</figcaption></figure> });
  }
  if (suggestions.length) {
    tiles.push({ key: 'try', label: lang === 'hi' ? 'बोलकर देखिए' : 'Try saying', node: <ul className="amb-try">{suggestions.slice(0, 3).map((s) => <li key={s}>“{s}”</li>)}</ul> });
  }

  const [i, setI] = useState(0);
  useEffect(() => {
    if (tiles.length < 2) return;
    const t = setInterval(() => setI((x) => x + 1), 9000);
    return () => clearInterval(t);
  }, [tiles.length]);
  const at = tiles.length ? i % tiles.length : 0;
  const tile = tiles[at];

  const date = today?.weekday
    ? `${today.weekday}, ${today.date ?? ''}`
    : new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const on = (routine?.devices ?? []).filter((d) => d.state !== 'off' && d.state !== 'idle');

  return (
    <div className="ambient">
      <div className="amb-head">
        <time className="amb-clock">{routine?.localTime ?? '—'}</time>
        <div className="amb-date">{date}</div>
      </div>
      {tile && (
        <div className="amb-tile" key={tile.key + at}>
          <p className="amb-label">{tile.label}</p>
          {tile.node}
        </div>
      )}
      <div className="amb-foot">
        {on.length > 0 && (
          <ul className="amb-devices" aria-label="Home devices that are on">
            {on.map((d) => <li key={d.id}>{d.kind === 'speaker' ? '♪' : '☀'} {d.room}: {d.state}</li>)}
          </ul>
        )}
        {tiles.length > 1 && (
          <div className="amb-dots">
            {tiles.map((t, j) => (
              <button key={t.key} type="button" className={j === at ? 'on' : ''} aria-label={`Show ${t.label}`} aria-pressed={j === at} onClick={() => setI(j)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
