import { useCallback, useEffect, useState } from 'react';
import type { Person } from './api.ts';

// Family page sections for: this week (digest + tablets not yet marked), "Ask Biji" questions,
// the carer's own check-in, and the link to the 3D life timeline. Everything shown comes from the
// family API; nothing here is ever said to her.

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method, headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : `Request failed (${res.status})`);
  return json as T;
}

interface Missed { medicine: string; time: string; say: string }
interface Digest {
  say: string; stories: number; familyMemories: number; questionsAnswered: number; dayChats: number;
  photoDescribed: boolean; taken: number; scheduled: number; topQuestions: { label: string; count: number }[]; note: string;
}
interface Question {
  id: string; text: string; status: 'open' | 'asked' | 'answered'; createdAt: string; askedAt?: string; answeredAt?: string;
  askerName: string; askerRelation: string; answer?: string[];
}
interface Carer { prompt: string; due: boolean; latest?: { mood: string; at: string }; reply?: string }
interface TimelineSummary { events: { year: number | null }[]; from: number | null }

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '');

/** Polls with the rest of the page (every 15 s) and after each change. */
function useFeatureData() {
  const [state, setState] = useState<{
    digest?: Digest; missed: Missed[]; questions: Question[]; carer?: Carer; timeline?: TimelineSummary; error?: string;
  }>({ missed: [], questions: [] });
  const load = useCallback(async () => {
    try {
      const [digest, missed, questions, carer, timeline] = await Promise.all([
        req<Digest>('GET', '/api/family/digest'), req<Missed[]>('GET', '/api/family/missed'),
        req<Question[]>('GET', '/api/family/questions'), req<Carer>('GET', '/api/family/carer'),
        req<TimelineSummary>('GET', '/api/family/timeline'),
      ]);
      setState({ digest, missed, questions, carer, timeline });
    } catch (e) {
      setState((s) => ({ ...s, error: (e as Error).message }));
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);
  return { ...state, reload: load };
}

export function FeatureSections({ people, name, admin }: { people: Person[]; name: string; admin: string }) {
  const d = useFeatureData();
  return (
    <>
      <TimelineCard name={name} timeline={d.timeline} />
      <WeekSection name={name} digest={d.digest} missed={d.missed} />
      <AskSection name={name} people={people} questions={d.questions} onSaved={d.reload} />
      <CarerSection admin={admin} carer={d.carer} onSaved={d.reload} />
      {d.error && <p className="err">{d.error}</p>}
    </>
  );
}

function TimelineCard({ name, timeline }: { name: string; timeline?: TimelineSummary }) {
  const total = timeline?.events.length ?? 0;
  const dated = timeline?.events.filter((e) => e.year !== null).length ?? 0;
  return (
    <section id="timeline" className="block timeline-card">
      <div>
        <h2>{name}’s life, in time</h2>
        <p className="muted">
          A living, 3D timeline of the stories she has told, each at the year she said or the year you confirmed, in her
          own words. It grows while she talks.
        </p>
        {timeline && (
          <p className="small">{total} {total === 1 ? 'story' : 'stories'} · {dated} placed in time{timeline.from ? ` · ${timeline.from} to now` : ''}{total > dated ? ` · ${total - dated} waiting for a year` : ''}</p>
        )}
      </div>
      <a className="button-link big" href="timeline.html" target="_blank" rel="noreferrer">Open her life timeline</a>
    </section>
  );
}

function WeekSection({ name, digest, missed }: { name: string; digest?: Digest; missed: Missed[] }) {
  return (
    <section id="week" className="block">
      <h2>This week</h2>
      {missed.length > 0 && (
        <div className="rows">
          {missed.map((m) => <div key={`${m.medicine}${m.time}`} className="row alert-row"><b>Tablet not marked</b><p>{m.say}</p></div>)}
        </div>
      )}
      {digest ? (
        <>
          <p className="trend-say">{digest.say}</p>
          <ul className="stat-tiles">
            <li><b>{digest.stories}</b><span>stories she told</span></li>
            <li><b>{digest.familyMemories}</b><span>family memories added</span></li>
            <li><b>{digest.questionsAnswered}</b><span>family questions answered</span></li>
            <li><b>{digest.taken}/{digest.scheduled}</b><span>tablets marked</span></li>
            <li><b>{digest.dayChats}</b><span>chats about her day</span></li>
            <li><b>{digest.photoDescribed ? 'Yes' : 'Not yet'}</b><span>weekly photo</span></li>
          </ul>
          <p className="small muted">{digest.note}</p>
        </>
      ) : <p className="muted">Loading {name}’s week…</p>}
    </section>
  );
}

function AskSection({ name, people, questions, onSaved }: {
  name: string; people: Person[]; questions: Question[]; onSaved: () => Promise<void>;
}) {
  const family = people.filter((p) => p.relation !== 'self');
  const [who, setWho] = useState(family[0]?.id ?? '');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!who && family[0]) setWho(family[0].id); }, [family, who]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await req<{ say: string }>('POST', '/api/family/questions', { from: who, text });
      setText(''); setMsg(r.say); await onSaved();
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    try { await req('POST', '/api/family/question-remove', { id }); await onSaved(); } catch (err) { setMsg((err as Error).message); }
  };
  return (
    <section id="ask" className="block">
      <h2>Ask {name}</h2>
      <p className="muted">
        Leave a question for her. Recollect asks one in the calm part of the afternoon, at most once a day, in your words and
        with your name, and keeps her answer in her own words. If she says “not now”, it waits for another day.
      </p>
      <form className="row ask-form" onSubmit={(e) => void submit(e)}>
        <label>Who is asking
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            {family.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="grow">Your question
          <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="What was your wedding day like?" />
        </label>
        <button disabled={busy || text.trim().length < 3 || !who}>Leave the question</button>
        {msg && <p className="small muted full">{msg}</p>}
      </form>
      <ul className="question-list">
        {questions.map((q) => (
          <li key={q.id} className={`row question ${q.status}`}>
            <div className="care-head">
              <b>“{q.text}”</b>
              <span className={`badge ${q.status}`}>
                {q.status === 'answered' ? `answered ${fmt(q.answeredAt)}` : q.status === 'asked' ? `asked ${fmt(q.askedAt)}, waiting` : 'waiting for a calm moment'}
              </span>
            </div>
            <p className="small muted">from {q.askerName}{q.askerRelation ? `, ${q.askerRelation}` : ''} · {fmt(q.createdAt)}</p>
            {q.status === 'answered' && (
              q.answer && q.answer.length
                ? <blockquote className="answer voice">“{q.answer.join(' ')}”<span className="meta"> {name}, in her own words</span></blockquote>
                : <p className="small muted">She asked to keep her answer private.</p>
            )}
            {q.status !== 'answered' && <button className="secondary small-btn" onClick={() => void remove(q.id)}>Withdraw</button>}
          </li>
        ))}
        {!questions.length && <li className="muted small">No questions yet.</li>}
      </ul>
    </section>
  );
}

function CarerSection({ admin, carer, onSaved }: { admin: string; carer?: Carer; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const answer = async (mood: string) => {
    setBusy(true);
    try { await req('POST', '/api/family/carer', { mood }); await onSaved(); } finally { setBusy(false); }
  };
  if (!carer) return null;
  return (
    <section id="you" className="block">
      <h2>And you, {admin}?</h2>
      <p className="trend-say">{carer.prompt}</p>
      <div className="actions">
        {([['ok', 'I’m okay'], ['tired', 'A bit tired'], ['struggling', 'Struggling']] as const).map(([mood, label]) => (
          <button key={mood} disabled={busy} className={carer.latest?.mood === mood && !carer.due ? '' : 'secondary'}
            aria-pressed={carer.latest?.mood === mood && !carer.due} onClick={() => void answer(mood)}>{label}</button>
        ))}
      </div>
      {carer.reply && !carer.due && <p className="carer-reply">{carer.reply}</p>}
      <p className="small muted">Only you see this. Recollect asks once a week.</p>
    </section>
  );
}
