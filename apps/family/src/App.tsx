import { useCallback, useEffect, useState } from 'react';
import { api, type Alert, type CareStep, type CoachTip, type Fidelity, type Medicine, type Message, type Overview, type Person, type Profile, type Story, type ThisIsMe, type Today, type Trend } from './api.ts';
import { CareSection, CoachSection, FidelitySection, MessageField, StoryVoices } from './Ideas.tsx';

// The family page (§13): setup, consent, stories, today, trends, "This is me".
// Trends are family-only and never spoken to her. Simulated data is always labelled.

interface Data {
  alerts: Alert[];
  overview: Overview; today: Today; trend: Trend; me: ThisIsMe;
  fidelity: Fidelity; coach: CoachTip[]; care: CareStep[]; messages: Message[];
  stories: { stories: Story[]; privateCount: number; prompts: { id: string; text: string }[] };
}

export function App() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [overview, today, stories, trend, me, alerts, fidelity, coach, care, messages] = await Promise.all([
        api.overview(), api.today(), api.stories(), api.trend(), api.thisIsMe(), api.alerts(),
        api.fidelity(), api.coach(), api.care(), api.messages(),
      ]);
      setData({ overview, today, stories, trend, me, alerts, fidelity, coach, care, messages });
      setError(null);
    } catch (e) {
      setError(`Recollect is not reachable (${(e as Error).message}). Check that the server is running, then reload.`);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <main className="shell"><p className="banner">{error}</p></main>;
  if (!data) return <main className="shell"><p className="muted">Loading…</p></main>;
  const { overview, today, stories, trend, me, alerts, fidelity, coach, care, messages } = data;
  const goingOut = coach.find((t) => t.situation === 'going_out');
  const openAlerts = alerts.filter((a) => !a.acknowledged);
  const first = overview.elder.name;

  return (
    <div className="shell">
      <header className="masthead">
        <p className="eyebrow">Recollect · family page</p>
        <h1>{first}</h1>
        <nav aria-label="Sections">
          <a href="#today">Today</a><a href="#trends">Speech changes</a>{care.length > 0 && <a href="#care">Next steps</a>}
          <a href="#fidelity">Memory fidelity</a><a href="#coach">When things are hard</a><a href="#stories">Her stories</a>
          <a href="#people">People</a><a href="#medicines">Medicines</a><a href="#photo">Weekly photo</a>
          <a href="#me">This is me</a><a href="#consent">Consent</a>
        </nav>
      </header>

      {openAlerts.length > 0 && (
        <section className="alerts" aria-live="polite" aria-label="Alerts">
          {openAlerts.map((a) => (
            <div key={a.id} className="alert">
              <p>{a.say}</p>
              <p className="small muted">{new Date(a.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}{a.sms ? ' · text message sent' : ''}</p>
              {goingOut?.starter && (
                <p className="small"><b>What might help:</b> {goingOut.guidance} Ask her about {goingOut.starter.topic}: <span className="voice">“{goingOut.starter.quote}”</span></p>
              )}
              <button onClick={() => void api.ackAlert(a.id).then(load)}>I've seen this</button>
            </div>
          ))}
        </section>
      )}

      <section id="today" className="block">
        <h2>Today <span className="muted small">{today.date}</span></h2>
        <div className="today-grid">
          <div>
            <h3>Tablets</h3>
            <ul className="plain">
              {today.doses.map((d, i) => (
                <li key={d.name + d.time + i} className="dose">
                  <span>{d.name} <span className="muted">· {d.time}</span></span>
                  {d.taken ? <span className="taken">taken {d.takenAt}</span> : <span className="due">not marked yet</span>}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Stories told today</h3>
            <p className="big-number">{today.storiesToday}</p>
          </div>
          <div>
            <h3>Asked more than once</h3>
            {today.repeatedQuestions.length === 0 ? <p className="muted">Nothing repeated today.</p> : (
              <ul className="plain">{today.repeatedQuestions.map((q) => (
                <li key={q.label} className="repeat"><span>{q.label}</span><span className="count">asked {q.count} times today</span></li>
              ))}</ul>
            )}
            <p className="note">{today.note}</p>
          </div>
        </div>
      </section>

      <TrendSection trend={trend} name={first} />

      <CareSection steps={care} onSaved={load} name={first} />

      <FidelitySection fidelity={fidelity} name={first} />

      <CoachSection tips={coach} name={first} />

      <section id="stories" className="block">
        <h2>{first}’s stories</h2>
        {stories.prompts.length > 0 && (
          <div className="prompts">
            <h3>Questions for your next call</h3>
            <ul className="plain">{stories.prompts.map((p) => <li key={p.id}>{p.text}</li>)}</ul>
          </div>
        )}
        {stories.privateCount > 0 && (
          <p className="private-note">{stories.privateCount} {stories.privateCount === 1 ? 'story is' : 'stories are'} kept private by {first} and not shown here.</p>
        )}
        {stories.stories.length === 0 && <p className="muted">No stories yet. They appear here when {first} tells Recollect about her life.</p>}
        <ol className="stories">
          {stories.stories.map((s) => (
            <li key={s.sessionId} className="story">
              <div className="stitch">{s.quotes.map((q, i) => <p key={i} className="voice">{q}</p>)}</div>
              <p className="meta">
                told {new Date(s.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                {s.retold && <span className="muted"> · she has told this one before</span>}
              </p>
              <StoryVoices story={s} family={overview.people} onSaved={load} />
            </li>
          ))}
        </ol>
      </section>

      <section id="people" className="block">
        <h2>People</h2>
        <p className="muted">When {first} asks where someone is, Recollect reads exactly this line. The photo and relationship appear when she asks “who’s this?”.</p>
        <div className="rows">
          {overview.people.map((p) => (
            <div key={p.id} className="person-block">
              <PersonRow p={p} onSaved={load} />
              <MessageField person={p} current={messages.find((m) => m.personId === p.id)?.text} onSaved={load} />
            </div>
          ))}
        </div>
      </section>

      <section id="medicines" className="block">
        <h2>Medicines</h2>
        <p className="muted">Names and times only. Recollect tells {first} whether a dose is marked; it never gives medical advice.</p>
        <div className="rows">
          {overview.medicines.map((m) => <MedicineRow key={m.id} m={m} onSaved={load} />)}
          <MedicineRow onSaved={load} />
        </div>
      </section>

      <section id="photo" className="block">
        <h2>Weekly photo</h2>
        <p className="muted">Once a week Recollect shows {first} the same photo and asks her to tell you about it. It is never a test, and she is never corrected.</p>
        <ul className="photos">
          {overview.photos.map((ph) => (
            <li key={ph.id} className={ph.id === overview.weeklyPhotoId ? 'chosen' : ''}>
              <img src={ph.url} alt={ph.caption} />
              <p>{ph.caption}</p>
              {ph.id === overview.weeklyPhotoId
                ? <p className="taken">This week’s photo</p>
                : <button onClick={() => void api.weeklyPhoto(ph.id).then(load)}>Use this photo every week</button>}
            </li>
          ))}
        </ul>
      </section>

      <ThisIsMeSection me={me} onSaved={load} />

      <LanguageSection name={first} />

      <ConsentSection overview={overview} onSaved={load} />
    </div>
  );
}

function TrendSection({ trend, name }: { trend: Trend; name: string }) {
  return (
    <section id="trends" className="block">
      <h2>Speech changes</h2>
      <p className="muted">Recollect compares {name}’s everyday conversations only with her own usual pattern. It does not diagnose anything.</p>
      <div className="trend-card">
        {trend.card?.simulated && <span className="sim">Simulated data</span>}
        <p className="trend-say">{trend.say}</p>
        {trend.card && <p className="muted small">Based on the last {trend.card.weeks} weeks.</p>}
        {trend.card && <a className="button-link" href="/report/doctor" target="_blank" rel="noreferrer">Open doctor report</a>}
        <RefreshTrend />
      </div>
    </section>
  );
}

function RefreshTrend() {
  const [state, setState] = useState<'idle' | 'queued' | 'error'>('idle');
  return (
    <p className="small muted">
      Recollect recalculates this once a week.{' '}
      <button className="link" disabled={state === 'queued'} onClick={() => void api.refreshTrend().then(() => setState('queued'), () => setState('error'))}>
        {state === 'queued' ? 'Recalculating — this page updates in a minute' : state === 'error' ? 'Could not start; try again' : 'Recalculate now'}
      </button>
    </p>
  );
}

function useSaver() {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle');
  const run = async (fn: () => Promise<unknown>) => {
    setState('saving');
    try { await fn(); setState('saved'); setTimeout(() => setState('idle'), 2000); } catch (e) { setState((e as Error).message); }
  };
  const label = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : null;
  const err = !['idle', 'saving', 'saved'].includes(state) ? state : null;
  return { run, label, err, busy: state === 'saving' };
}

function PersonRow({ p, onSaved }: { p: Person; onSaved: () => void }) {
  const [v, setV] = useState(p.statusLine ?? '');
  const s = useSaver();
  return (
    <form className="row person" onSubmit={(e) => { e.preventDefault(); void s.run(async () => { await api.setStatus(p.id, v); onSaved(); }); }}>
      <div className="person-head">
        {p.photoUrl && <img className="avatar" src={p.photoUrl} alt="" />}
        <span><b>{p.name}</b> <span className="muted">· {p.relationToElder ?? p.relation}</span></span>
      </div>
      <label className="sr-only" htmlFor={`st-${p.id}`}>Where {p.name} is</label>
      <div className="inline">
        <span className="prefix">{p.name}</span>
        <input id={`st-${p.id}`} value={v} onChange={(e) => setV(e.target.value)} placeholder="is in London and calls you on Sundays" />
        <button disabled={s.busy || v === (p.statusLine ?? '')}>{s.label ?? 'Save'}</button>
      </div>
      {s.err && <p className="err">{s.err}</p>}
    </form>
  );
}

function MedicineRow({ m, onSaved }: { m?: Medicine; onSaved: () => void }) {
  const [name, setName] = useState(m?.name ?? '');
  const [purpose, setPurpose] = useState(m?.purpose ?? '');
  const [aliases, setAliases] = useState((m?.aliases ?? []).join(', '));
  const [times, setTimes] = useState((m?.times ?? []).join(', '));
  const s = useSaver();
  const split = (x: string) => x.split(',').map((t) => t.trim()).filter(Boolean);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void s.run(async () => {
      await api.saveMedicine({ ...(m ? { id: m.id } : {}), name: name.trim(), purpose: purpose.trim(), aliases: split(aliases), times: split(times) });
      if (!m) { setName(''); setPurpose(''); setAliases(''); setTimes(''); }
      onSaved();
    });
  };
  return (
    <form className={m ? 'row med' : 'row med new'} onSubmit={submit}>
      <b>{m ? m.name : 'Add a medicine'}</b>
      <div className="med-grid">
        <label>What she calls it<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="BP tablet" /></label>
        <label>Times (24h, comma separated)<input value={times} onChange={(e) => setTimes(e.target.value)} placeholder="08:00, 20:00" /></label>
        <label>Other names she uses<input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="pressure pill, bp" /></label>
        <label>Why she takes it (for the family)<input value={purpose} onChange={(e) => setPurpose(e.target.value)} /></label>
      </div>
      <button disabled={s.busy || !name.trim()}>{s.label ?? (m ? 'Save medicine' : 'Add medicine')}</button>
      {s.err && <p className="err">{s.err}</p>}
    </form>
  );
}

const PROFILE_FIELDS: { key: keyof Omit<Profile, 'preferredName' | 'approvedFacts'>; label: string }[] = [
  { key: 'likes', label: 'What she enjoys' },
  { key: 'calms', label: 'What calms her' },
  { key: 'upsets', label: 'What upsets her' },
  { key: 'routines', label: 'Her routines' },
  { key: 'communicationTips', label: 'How to talk with her' },
];

function ThisIsMeSection({ me, onSaved }: { me: ThisIsMe; onSaved: () => void }) {
  const profile = me.card?.profile;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const s = useSaver();
  const startEdit = () => {
    setDraft(Object.fromEntries([
      ['preferredName', profile?.preferredName ?? ''],
      ...PROFILE_FIELDS.map((f) => [f.key, (profile?.[f.key] ?? []).join('\n')]),
    ]));
    setEditing(true);
  };
  const save = () => void s.run(async () => {
    const lines = (k: string) => (draft[k] ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
    await api.saveProfile({
      preferredName: draft.preferredName ?? '',
      ...Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, lines(f.key)])),
    });
    setEditing(false);
    onSaved();
  });

  return (
    <section id="me" className="block">
      <h2>This is me</h2>
      <p className="muted">A one-page profile for carers and hospital staff. Only what the family writes, and facts the family has approved, appear on it.</p>
      {me.candidates.length > 0 && (
        <div className="prompts">
          <h3>Suggested from her stories: approve before it appears</h3>
          <ul className="plain">{me.candidates.map((f) => (
            <li key={f} className="fact"><span>{f}</span><button onClick={() => void api.fact(f, true).then(onSaved)}>Approve</button></li>
          ))}</ul>
        </div>
      )}
      {!editing ? (
        <div className="profile-sheet">
          {profile ? (
            <>
              <h3 className="sheet-name">{me.card!.name} <span className="muted">— likes to be called {profile.preferredName}</span></h3>
              <div className="sheet-grid">
                {PROFILE_FIELDS.map((f) => (
                  <div key={f.key}><h4>{f.label}</h4><ul>{profile[f.key].map((x) => <li key={x}>{x}</li>)}</ul></div>
                ))}
                <div><h4>Important people</h4><ul>{me.card!.people.map((p) => <li key={p.name}>{p.name} — {p.relation}</li>)}</ul></div>
                {profile.approvedFacts.length > 0 && (
                  <div><h4>From her stories (approved by family)</h4><ul>{profile.approvedFacts.map((x) => (
                    <li key={x}>{x} <button className="link" onClick={() => void api.fact(x, false).then(onSaved)}>remove</button></li>
                  ))}</ul></div>
                )}
              </div>
            </>
          ) : <p className="muted">{me.say}</p>}
          <div className="actions">
            <button onClick={startEdit}>{profile ? 'Edit profile' : 'Write the profile'}</button>
            {profile && <button className="secondary" onClick={() => window.print()}>Print</button>}
          </div>
        </div>
      ) : (
        <form className="row" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label>Likes to be called<input value={draft.preferredName ?? ''} onChange={(e) => setDraft({ ...draft, preferredName: e.target.value })} /></label>
          {PROFILE_FIELDS.map((f) => (
            <label key={f.key}>{f.label} <span className="muted small">(one per line)</span>
              <textarea rows={3} value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
            </label>
          ))}
          <div className="actions">
            <button disabled={s.busy}>{s.label ?? 'Save profile'}</button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
          {s.err && <p className="err">{s.err}</p>}
        </form>
      )}
    </section>
  );
}

/** The language she speaks and hears. Family pages and reports stay in English. */
function LanguageSection({ name }: { name: string }) {
  const [lang, setLang] = useState<'en' | 'hi' | null>(null);
  useEffect(() => { void api.language().then((r) => setLang(r.lang)).catch(() => setLang('en')); }, []);
  return (
    <section id="language" className="block">
      <h2>Her language</h2>
      <p className="muted">
        What {name} hears: dates, visitors, tablets, where people are, who is who, the evening and night routines. Her
        stories are always kept in the words she used, never translated. Hindi wording is fixed text reviewed by the family.
      </p>
      <div className="actions">
        {(['en', 'hi'] as const).map((l) => (
          <button key={l} className={lang === l ? '' : 'secondary'} aria-pressed={lang === l}
            onClick={() => void api.setLanguage(l).then((r) => setLang(r.lang))}>{l === 'en' ? 'English' : 'हिंदी (Hindi)'}</button>
        ))}
      </div>
    </section>
  );
}

function ConsentSection({ overview, onSaved }: { overview: Overview; onSaved: () => void }) {
  const c = overview.consent;
  const first = overview.elder.name;
  const [typed, setTyped] = useState('');
  const s = useSaver();
  const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null);
  return (
    <section id="consent" className="block">
      <h2>Consent</h2>
      <p className="muted">
        Change tracking is off until both {first} and you agree. Either of you can turn it off at any time; {first} can just say
        “stop tracking my speech”. Family sees trends and counts, never her private stories or recordings.
      </p>
      <div className="consent-steps">
        <div className={c?.byElderAt ? 'step done' : 'step'}>
          <h3>Step 1 · {first} agrees</h3>
          {c?.byElderAt ? <p>Agreed on {when(c.byElderAt)}</p> : (
            <><p className="small">Explain it to her in plain words, and record her answer only if she says yes.</p>
              <button onClick={() => void s.run(async () => { await api.consent({ elderAgreed: true }); onSaved(); })}>{first} said yes</button></>
          )}
        </div>
        <div className={c?.byFamilyAt ? 'step done' : 'step'}>
          <h3>Step 2 · {overview.admin.name} agrees</h3>
          {c?.byFamilyAt ? <p>Agreed on {when(c.byFamilyAt)}</p> : (
            <button onClick={() => void s.run(async () => { await api.consent({ familyAgreed: true }); onSaved(); })}>I agree</button>
          )}
        </div>
        <div className="step status">
          <h3>Change tracking</h3>
          <p className={c?.trackingOn ? 'taken' : 'due'}>{c?.trackingOn ? 'On' : 'Off'}</p>
          {c?.trackingOn && <button className="secondary" onClick={() => void s.run(async () => { await api.consent({ off: true }); onSaved(); })}>Turn off</button>}
        </div>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={Boolean(c?.fullVoiceOn)} disabled={!c?.trackingOn}
          onChange={(e) => void s.run(async () => { await api.consent({ fullVoice: e.target.checked }); onSaved(); })} />
        Full-voice mode (simulator only): record story-mode audio, measure pauses and speech rate, then delete the audio.
      </label>
      {s.err && <p className="err">{s.err}</p>}

      <div className="danger">
        <h3>Delete everything</h3>
        <p className="small">Deletes {first}’s stories, everything learned from them, all speech measurements, trends and question logs. People, medicines and photos stay so Recollect keeps working. This cannot be undone.</p>
        <label className="small"><span>Type <b>delete everything</b> to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
        <button className="danger-button" disabled={typed !== 'delete everything' || s.busy}
          onClick={() => void s.run(async () => { await api.deleteEverything(); setTyped(''); onSaved(); })}>Delete everything</button>
      </div>
    </section>
  );
}
