import { useState } from 'react';
import { api, type CareStep, type CoachTip, type Fidelity, type Person, type Story } from './api.ts';

// Family page sections for the memory fidelity engine, family memories, carer coach and care
// follow-through. Family only: nothing here is ever said to her.

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function RecentChart({ weekly }: { weekly: Fidelity['recentVsOld']['weekly'] }) {
  const W = 560, H = 140, pad = 26, bw = Math.min(28, (W - pad * 2) / weekly.length - 8);
  const x = (i: number) => pad + i * ((W - pad * 2) / weekly.length) + 4;
  const y = (share: number) => H - pad - share * (H - pad * 2);
  return (
    <svg className="mini-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label="Share of day chats each week in which she named who had visited or called">
      <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} className="axis" />
      {weekly.map((w, i) => {
        const share = w.chats ? w.named / w.chats : 0;
        return (
          <g key={w.week}>
            <rect x={x(i)} y={y(share)} width={bw} height={Math.max(2, H - pad - y(share))} rx={4} className="bar">
              <title>Week of {w.week}: named the visitor in {w.named} of {w.chats} chats</title>
            </rect>
            {(i === 0 || i === weekly.length - 1) && (
              <text x={x(i) + bw / 2} y={H - 8} textAnchor="middle" className="tick">{w.week.slice(5)}</text>
            )}
          </g>
        );
      })}
      <text x={pad} y={14} className="tick">100%</text>
    </svg>
  );
}

export function FidelitySection({ fidelity, name }: { fidelity: Fidelity; name: string }) {
  const r = fidelity.recentVsOld;
  return (
    <section id="fidelity" className="block">
      <h2>Memory fidelity</h2>
      <p className="muted">
        How {name}’s retellings compare with her first tellings, and her recent memory beside her long-ago memory. Compared only
        with herself. Nothing here is ever said to her, and she is never quizzed or corrected.
      </p>
      <div className="trend-card">
        {r.simulated && <span className="sim">Simulated data</span>}
        <h3>Recent and long ago</h3>
        <p className="trend-say">{r.say}</p>
        {r.ready && (
          <div className="fidelity-figures">
            <p><b>{pct(r.recent.named, r.recent.chats)}%</b><span className="muted small"> of recent chats about her day named who had visited</span></p>
            <p><b>{r.perStory}</b><span className="muted small"> people, places and things in each of her stories from long ago</span></p>
          </div>
        )}
        {r.weekly.length > 1 && <RecentChart weekly={r.weekly} />}
        <p className="small muted">The chat is just “tell me about your day”. She always hears the same thanks, whatever she says.</p>
      </div>
      {fidelity.retells.length > 0 && <h3>Stories she has told again</h3>}
      {fidelity.retells.map((t) => (
        <div key={t.retold.sessionId} className="retell">
          <p className="voice">“{t.retold.opening}”</p>
          <p className="meta">first told {t.first.date} · told again {t.retold.date}</p>
          <p>{t.say}</p>
          <ul className="chips">
            {t.kept.map((k) => <li key={`k${k}`} className="chip kept">{k}</li>)}
            {t.dropped.map((k) => <li key={`d${k}`} className="chip dropped">{k} <span className="sr-only">(not in the retelling)</span></li>)}
            {t.added.map((k) => <li key={`a${k}`} className="chip added">{k} <span className="sr-only">(new in the retelling)</span></li>)}
          </ul>
          <p className="small muted">Same in both · <span className="legend dropped">only in her first telling</span> · <span className="legend added">new in the retelling</span></p>
          {t.possibleSwaps.map(([a, b]) => <p key={a + b} className="small">Possibly a swapped name: <b>{a}</b> in her first telling, <b>{b}</b> now.</p>)}
          {t.years && <p className="small">The year changed: {t.years.first.join(', ')} then, {t.years.retold.join(', ')} now.</p>}
          {t.confirmedByFamily.length > 0 && <p className="small muted">Also in a family member’s memory of this story: {t.confirmedByFamily.join(', ')}.</p>}
        </div>
      ))}
    </section>
  );
}

export function CoachSection({ tips, name }: { tips: CoachTip[]; name: string }) {
  return (
    <section id="coach" className="block">
      <h2>When things are hard</h2>
      <p className="muted">Suggestions for difficult moments, with ways in from {name}’s own stories.</p>
      <div className="rows">
        {tips.map((t) => (
          <div key={t.situation} className="row coach">
            <b>{t.title}</b>
            <p>{t.guidance}</p>
            {t.starter && (
              <div className="starter">
                <p><b>Try:</b> ask her about {t.starter.topic}.</p>
                <p className="voice">“{t.starter.quote}”</p>
                <p className="meta">she told Recollect on {t.starter.date}</p>
              </div>
            )}
            {t.calm && <p className="small"><b>From her profile:</b> {t.calm}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function CareSection({ steps, onSaved, name }: { steps: CareStep[]; onSaved: () => void; name: string }) {
  if (!steps.length) return null;
  const plan = steps[0]!.planId;
  return (
    <section id="care" className="block">
      <h2>Next steps for the check-up</h2>
      <p className="muted">
        Recollect noticed a change in {name}’s speech and prepared these for you. Nothing happens until you approve it, and
        Recollect never books, buys or orders anything itself.
      </p>
      {steps[0]!.simulated && <span className="sim">Simulated data</span>}
      <ol className="care-steps">
        {steps.map((s) => (
          <li key={s.id} className={`row care ${s.status}`}>
            <div className="care-head"><b>{s.title}</b><span className="small muted">{s.status === 'proposed' ? 'waiting for you' : s.status}</span></div>
            <p>{s.detail}</p>
            {s.items.length > 0 && <ul>{s.items.map((i) => <li key={i}>{i}</li>)}</ul>}
            <div className="actions">
              {s.status === 'proposed' && (
                <>
                  <button onClick={() => void api.careDecision(s.id, true).then(onSaved)}>Approve</button>
                  <button className="secondary" onClick={() => void api.careDecision(s.id, false).then(onSaved)}>Not now</button>
                </>
              )}
              {s.status === 'approved' && s.kind === 'appointment' && (
                <a className="button-link" href={`/report/care-calendar.ics?plan=${encodeURIComponent(plan)}`}>Add to calendar</a>
              )}
              {s.kind === 'memory_book' && (
                <a className="button-link" href="/report/memory-book" target="_blank" rel="noreferrer">Open the book</a>
              )}
              {s.kind === 'summary' && (
                <a className="button-link" href="/report/doctor" target="_blank" rel="noreferrer">Open doctor report</a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Family members' memories under one of her stories, and a form to add one. */
export function StoryVoices({ story, family, onSaved }: { story: Story; family: Person[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState(family[0]?.id ?? '');
  const [text, setText] = useState('');
  const [state, setState] = useState<string | null>(null);
  return (
    <div className="voices">
      {(story.voices ?? []).map((v) => (
        <blockquote key={v.sessionId} className="family-voice">
          <p className="voice">“{v.quotes.join(' ')}”</p>
          <p className="meta">{v.name}{v.relation ? `, ${v.relation}` : ''}</p>
        </blockquote>
      ))}
      {!open ? (
        <button className="link" onClick={() => setOpen(true)}>Add your memory of this story</button>
      ) : (
        <form className="row" onSubmit={(e) => {
          e.preventDefault();
          void api.shareMemory(who, text.trim(), story.sessionId).then(() => { setText(''); setOpen(false); setState(null); onSaved(); }, (err) => setState((err as Error).message));
        }}>
          <label>Who is sharing it
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              {family.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Your memory, in your own words
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} required />
          </label>
          <p className="small muted">It is kept with her story and always shown as yours, never as hers.</p>
          <div className="actions">
            <button disabled={!text.trim() || !who}>Keep this memory</button>
            <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {state && <p className="err">{state}</p>}
        </form>
      )}
    </div>
  );
}

/** The short message read to her after "where is …". */
export function MessageField({ person, current, onSaved }: { person: Person; current?: string; onSaved: () => void }) {
  const [v, setV] = useState(current ?? '');
  const [saved, setSaved] = useState(false);
  return (
    <form className="inline message" onSubmit={(e) => {
      e.preventDefault();
      void api.setMessage(person.id, v).then(() => { setSaved(true); setTimeout(() => setSaved(false), 2000); onSaved(); });
    }}>
      <label className="small muted" htmlFor={`msg-${person.id}`}>A message for her</label>
      <input id={`msg-${person.id}`} value={v} maxLength={200} onChange={(e) => setV(e.target.value)}
        placeholder={`Read to her when she asks where ${person.name} is`} />
      <button disabled={v === (current ?? '')}>{saved ? 'Saved' : !v && current ? 'Clear' : 'Save message'}</button>
    </form>
  );
}
