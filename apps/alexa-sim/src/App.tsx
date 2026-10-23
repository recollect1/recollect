import * as EN from '@recollect/core/phrases';
import { HI } from '@recollect/core/phrases-hi';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type CardRef, type GraphData, type Household, type Role, type RoutineState, type ToolCallRecord, type TurnResult } from './api.ts';
import { Ambient } from './Ambient.tsx';
import { CardFrame } from './CardFrame.tsx';
import { GraphPanel } from './GraphPanel.tsx';
import { HomePanel } from './HomePanel.tsx';
import { LatencyStrip, latencyClass, timing, toolMs } from './LatencyStrip.tsx';
import { Icon } from './Icon.tsx';
import { startRecording, type Recording } from './audio.ts';
import { listenForStory, listenOnce, recognitionSupported, setSpeechLang, speak, stopSpeaking, STORY_TRIGGER } from './speech.ts';

type Phase = 'idle' | 'listening' | 'story' | 'thinking' | 'speaking';

/** "Not now" to the weekly photo: back off gently, offer again next week. */
const NOT_NOW = /^\s*(?:(no|nah|not now|not today|later|maybe later|another time)\b|अभी नहीं|बाद में|नहीं|abhi nahi|baad mein)/i;

interface Line {
  who: 'user' | 'recollect' | 'system';
  text: string;
  source?: 'say' | 'model';
  /** Who said a user line; the role can be switched later, so it is kept per line. */
  as?: Role;
  calls?: ToolCallRecord[];
}

const DEBUG = new URLSearchParams(location.search).has('debug');

/** Names used by the simulator, all from the household overview (never literals in the UI). */
interface Names { elder: string; family: string; familyHi?: string; medicine?: string; medicineHi?: string }

/**
 * The family member the simulator speaks as: the first family member who is not the admin or a
 * helper (Aman in the seed), else the admin.
 */
function namesFrom(h: Household): Names {
  const fam = h.people.find((p) => p.id !== h.admin.id && !/helper/i.test(p.relation)) ?? h.people.find((p) => p.id === h.admin.id);
  return { elder: h.elder.name, family: fam?.name ?? h.admin.name, familyHi: fam?.nameHi, medicine: h.medicines[0]?.name, medicineHi: h.medicines[0]?.nameHi };
}

/** Debug buttons: real direct MCP calls, with arguments taken from the household. */
function debugCalls(n: Names): { role: Role; name: string; args: Record<string, unknown>; label: string }[] {
  return [
    { role: 'elder', name: 'whats_today', args: {}, label: 'whats_today' },
    ...(n.medicine ? [{ role: 'elder' as Role, name: 'check_dose', args: { medicine: n.medicine }, label: `check_dose ${n.medicine}` }] : []),
    { role: 'elder', name: 'where_is', args: { person: n.family }, label: `where_is ${n.family}` },
    { role: 'elder', name: 'who_is', args: { name: n.family }, label: `who_is ${n.family}` },
    { role: 'family', name: 'recall_memory', args: { question: 'How did Grandma come to Patiala?' }, label: 'recall (family): Patiala' },
    { role: 'elder', name: 'recall_memory', args: { question: 'What was my school like?' }, label: 'recall: school (nothing saved)' },
    { role: 'elder', name: 'photo_moment', args: {}, label: 'photo_moment' },
    { role: 'elder', name: 'night_reassure', args: { text: 'I need to go to the market' }, label: 'night: go to the market' },
    { role: 'elder', name: 'story_prompt', args: {}, label: 'story_prompt' },
    { role: 'elder', name: 'memory_lane', args: {}, label: 'memory_lane' },
    { role: 'elder', name: 'talk_about_today', args: {}, label: 'talk_about_today' },
    { role: 'family', name: 'speech_trend', args: {}, label: 'speech_trend (family)' },
  ];
}

/** Example things to say, per role and language; names come from the household. */
function suggestionsFor(role: Role, lang: 'en' | 'hi', n: Names | null): string[] {
  if (!n) return [];
  if (role === 'family') return ['How did Grandma come to Patiala?', 'How is her speech?', `What did ${n.elder} do today?`];
  if (lang === 'hi') {
    return ['आज कौन सा दिन है?', ...(n.medicineHi ? [`क्या मैंने ${n.medicineHi} ली?`] : []), `${n.familyHi ?? n.family} कहाँ है?`, 'मैं आपको एक कहानी सुनाना चाहती हूँ।'];
  }
  return ['What day is it?', ...(n.medicine ? [`Did I take my ${n.medicine}?`] : []), `Where is ${n.family}?`, `Who is ${n.family}?`, 'I want to tell you a story.'];
}

const PHASE_LABEL: Record<Phase, string> = { idle: '', listening: 'Listening…', story: 'Listening to your story', thinking: 'Thinking…', speaking: 'Speaking' };

export function App() {
  const [role, setRole] = useState<Role>('elder');
  const [phase, setPhase] = useState<Phase>('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState('');
  const [text, setText] = useState('');
  const [card, setCard] = useState<CardRef | null>(null);
  const [calls, setCalls] = useState<ToolCallRecord[]>([]);
  const [routine, setRoutine] = useState<RoutineState | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const [graph, setGraph] = useState<GraphData | null>(null);
  // Poll while the panel is open, so entities appear as the worker writes them.
  useEffect(() => {
    if (!showGraph) return;
    const load = () => void api.graph().then(setGraph).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [showGraph]);
  const [status, setStatus] = useState<Record<string, any> | null>(null);
  const [storyNext, setStoryNext] = useState(false); // typed story mode
  // Weekly photo (§9.4): after the photo is offered, her next words are its description.
  const [photoNext, setPhotoNext] = useState(false);
  // Day chat: after "tell me about your day", her next words are the answer (never a story to save).
  const [dayNext, setDayNext] = useState(false);
  // The language she speaks and hears (household setting, also on the family page).
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const P = lang === 'hi' ? HI : EN;
  const offeredWeek = useRef<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const logRef = useRef<HTMLOListElement>(null);

  // Names for the role switch, transcript and suggestions come from the household, not the UI.
  const [names, setNames] = useState<Names | null>(null);
  // After a reply without a card, the screen shows the exchange (as a smart display does) for a while.
  const [showReply, setShowReply] = useState(false);
  const elderName = names?.elder ?? 'Elder';
  const familyName = names?.family ?? 'Family';
  const roles: { role: Role; label: string }[] = [
    { role: 'elder', label: `${elderName} (elder)` },
    { role: 'family', label: `${familyName} (family)` },
  ];
  const speakerName = (r: Role) => (r === 'elder' ? elderName : familyName);

  useEffect(() => { api.status().then(setStatus).catch(() => setStatus({ error: true })); }, []);
  useEffect(() => { api.household().then((h) => setNames(namesFrom(h))).catch(() => {}); }, []);
  useEffect(() => { api.language().then((l) => { setLang(l); setSpeechLang(l); }).catch(() => {}); }, []);
  async function chooseLang(l: 'en' | 'hi') {
    if (l === lang) return;
    try {
      const saved = await api.setLanguage(l);
      setLang(saved); setSpeechLang(saved);
      setLines((x) => [...x, { who: 'system', text: saved === 'hi' ? `${elderName} now speaks and hears Hindi (हिंदी).` : `${elderName} now speaks and hears English.` }]);
    } catch (e) { fail(e); }
  }

  useEffect(() => { logRef.current?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [lines, interim]);

  // Simulated home (§13): lights, speaker and short-reply mode follow routine_state, a real tool call.
  const refreshRoutine = useCallback(async () => {
    const r = await api.direct('elder', 'routine_state', {});
    const sc = r.calls[0]?.structuredContent as RoutineState | undefined;
    if (sc) setRoutine(sc);
    return { r, sc };
  }, []);
  useEffect(() => {
    void refreshRoutine().catch(() => {});
    const t = setInterval(() => void refreshRoutine().catch(() => {}), 30_000);
    return () => clearInterval(t);
  }, [refreshRoutine]);

  const say = useCallback((reply: string) => {
    setPhase('speaking');
    speak(reply, () => setPhase('idle'));
  }, []);

  const handleResult = useCallback((r: TurnResult) => {
    setLines((l) => [...l, { who: 'recollect', text: r.reply, source: r.source, calls: r.calls }]);
    setCalls((c) => [...c, ...r.calls]);
    // A new answer replaces the old card: an earlier card must not sit beside an unrelated reply.
    if (r.card) { setCard(r.card); setShowReply(false); } else { setCard(null); setShowReply(Boolean(r.reply)); }
    const last = r.calls[r.calls.length - 1];
    if (last?.name === 'talk_about_today' && !last.args.answer) setDayNext(true);
    // The reply is either a tool's `say` (verbatim) or short model small talk.
    say(r.reply);
  }, [say]);

  const fail = useCallback((e: unknown) => {
    const msg = e instanceof ApiError && e.code === 'bedrock_not_configured'
      ? 'Bedrock is not configured. Set BEDROCK_CHAT_MODEL_ID and AWS credentials in .env, then restart the simulator.'
      : `Something went wrong: ${(e as Error).message}`;
    setLines((l) => [...l, { who: 'system', text: msg }]);
    setPhase('idle');
  }, []);

  const tellStory = useCallback(async (story: string, audio?: string) => {
    setPhase('thinking');
    try { handleResult(await api.story(story, audio)); } catch (e) { fail(e); }
  }, [handleResult, fail]);

  const send = useCallback(async (utterance: string) => {
    const t = utterance.trim();
    if (!t) return;
    setLines((l) => [...l, { who: 'user', text: t, as: role }]);
    setShowReply(false);
    if (photoNext && role === 'elder') {
      setPhotoNext(false);
      if (NOT_NOW.test(t)) {
        const reply = P.photoLater();
        setLines((l) => [...l, { who: 'recollect', text: reply, source: 'say' }]);
        setCard(null); setShowReply(true);
        return say(reply);
      }
      setPhase('thinking');
      try { handleResult(await api.direct('elder', 'photo_moment', { text: t })); } catch (e) { fail(e); }
      return;
    }
    if (dayNext && role === 'elder') {
      setDayNext(false);
      setPhase('thinking');
      try { handleResult(await api.direct('elder', 'talk_about_today', { answer: t })); } catch (e) { fail(e); }
      return;
    }
    if (role === 'elder' && STORY_TRIGGER.test(t)) return startStory();
    setPhase('thinking');
    try {
      const r = await api.turn(role, t, routine?.shortReplies ?? false, lang);
      if (r.understood) setLines((l) => [...l, { who: 'system', text: `Understood as: “${r.understood}”` }]);
      handleResult(r);
    } catch (e) { fail(e); }
  }, [role, routine, photoNext, dayNext, lang, handleResult, fail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offer this week's photo once, when routine_state says it is a calm moment for it. The offer is
  // a real photo_moment tool call; it is never made in the evening, at night or mid-conversation.
  useEffect(() => {
    if (!routine?.photoDue || role !== 'elder' || phase !== 'idle' || offeredWeek.current === routine.week) return;
    offeredWeek.current = routine.week;
    setLines((l) => [...l, { who: 'system', text: 'A calm part of the day: offering this week’s photo.' }]);
    setPhase('thinking');
    api.direct('elder', 'photo_moment', {}).then((r) => {
      handleResult(r);
      if (r.calls[0]?.structuredContent?.photo) setPhotoNext(true);
    }).catch(fail);
  }, [routine, role, phase, handleResult, fail]);

  function startStory() {
    const prompt = P.listeningForStory();
    setLines((l) => [...l, { who: 'recollect', text: prompt, source: 'say' }]);
    setCard(null); setShowReply(true);
    if (!recognitionSupported()) {
      setStoryNext(true);
      say(prompt);
      return;
    }
    setPhase('speaking');
    speak(prompt, async () => {
      setPhase('story');
      // Full-voice mode (§2): record alongside recognition, only with the family's consent switch on.
      let recording: Recording | null = null;
      if (await api.fullVoice()) {
        recording = await startRecording().catch(() => null);
        if (recording) setLines((l) => [...l, { who: 'system', text: 'Full-voice mode is on: recording this story to measure pauses. The audio is deleted after measuring.' }]);
      }
      const s = listenForStory(setInterim);
      stopRef.current = s.stop;
      s.done.then(async (story) => {
        stopRef.current = null;
        setInterim('');
        if (story) setLines((l) => [...l, { who: 'user', text: story, as: role }]);
        const audio = recording ? await recording.stop().catch(() => undefined) : undefined;
        void tellStory(story, audio);
      });
    });
  }

  function talk() {
    if (phase === 'listening' || phase === 'story') {
      stopRef.current?.();
      return;
    }
    stopSpeaking();
    setPhase('listening');
    const s = listenOnce(setInterim);
    stopRef.current = s.stop;
    s.done.then((t) => {
      stopRef.current = null;
      setInterim('');
      if (t) void send(t);
      else setPhase('idle');
    }).catch(fail);
  }

  function submitText(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    if (storyNext) {
      setStoryNext(false);
      setLines((l) => [...l, { who: 'user', text: t, as: role }]);
      void tellStory(t.replace(/[\s,.।]*(that's all|that is all|बस इतना ही|बस इतनी सी|bas itna hi)[\s.!।]*$/i, ''));
    } else void send(t);
  }

  function switchRole(r: Role) {
    if (r === role) return;
    stopRef.current?.();
    stopSpeaking();
    setRole(r);
    setCard(null);
    setStoryNext(false);
    setPhotoNext(false);
    setDayNext(false);
    setPhase('idle');
    setShowReply(false);
    setLines((l) => [...l, { who: 'system', text: `Now speaking as ${roles.find((x) => x.role === r)!.label}.` }]);
  }

  // The reply stays on screen for a while after she stops hearing it, then the home screen returns.
  useEffect(() => {
    if (!showReply || phase !== 'idle') return;
    const t = setTimeout(() => setShowReply(false), 30_000);
    return () => clearTimeout(t);
  }, [showReply, phase]);

  function goHome() {
    setCard(null);
    setShowReply(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        talk();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onCardMessage = useCallback((t: string) => {
    setLines((l) => [...l, { who: 'system', text: `The card asked: “${t}” (the simulator does not place calls).` }]);
  }, []);

  const elderStatus = status?.[role];
  const suggestions = suggestionsFor(role, lang, names);
  const live = phase === 'listening' || phase === 'story';
  // The last exchange, shown on the screen after a reply without a card.
  const lastReplyAt = lines.map((l) => l.who).lastIndexOf('recollect');
  const lastReply = lastReplyAt >= 0 ? lines[lastReplyAt] : undefined;
  const lastUser = lines.slice(0, lastReplyAt).reverse().find((l) => l.who === 'user');
  const lastUserNow = [...lines].reverse().find((l) => l.who === 'user');
  const caption = live ? (interim || (phase === 'story' ? 'Listening to your story…' : 'Listening…'))
    : phase === 'thinking' ? (lastUserNow?.text ?? '') : '';
  const ambience = routine?.routine === 'evening' ? 'evening' : routine?.routine === 'night' ? 'night' : 'day';
  // Demo clock (scenarios I, K): jump the MCP server's clock, then let routine_state speak if it greets.
  async function jumpClock(at?: string) {
    try {
      await api.clock(at);
      const { r, sc } = await refreshRoutine();
      setLines((l) => [...l, { who: 'system', text: `Demo clock set to ${sc?.localTime ?? at ?? 'real time'}.` }]);
      if (sc?.greeting && role === 'elder') handleResult(r);
    } catch (e) { fail(e); }
  }

  async function direct(d: ReturnType<typeof debugCalls>[number]) {
    setLines((l) => [...l, { who: 'system', text: `Direct tool call as ${d.role}: ${d.name}(${JSON.stringify(d.args)}) — no voice model.` }]);
    setPhase('thinking');
    try { handleResult(await api.direct(d.role, d.name, d.args)); } catch (e) { fail(e); }
  }

  const statusOk = Boolean(elderStatus?.ok);
  return (
    <div className={`page ambience-${ambience}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Recollect</span>
          <span className="brand-sub">Alexa+ simulator</span>
        </div>
        <div className="switches">
          <div className="seg" role="radiogroup" aria-label="Who is speaking">
            <span className="seg-label" aria-hidden="true">Speaking as</span>
            {roles.map((r) => (
              <button key={r.role} role="radio" aria-checked={role === r.role} className={role === r.role ? 'role on' : 'role'} onClick={() => switchRole(r.role)}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="seg" role="radiogroup" aria-label="Her language">
            <span className="seg-label" aria-hidden="true">Language</span>
            {(['en', 'hi'] as const).map((l) => (
              <button key={l} role="radio" aria-checked={lang === l} lang={l} className={lang === l ? 'role on' : 'role'} onClick={() => void chooseLang(l)}>
                {l === 'en' ? 'English' : 'हिंदी'}
              </button>
            ))}
          </div>
        </div>
        <div className="conn">
          <span className={`pill ${statusOk ? 'good' : status ? 'down' : ''}`}>
            <i aria-hidden="true" />
            {statusOk ? <>MCP {elderStatus.protocol} · {elderStatus.tools.length} tools</> : status ? 'MCP server unreachable' : 'Connecting…'}
          </span>
          <span className={`pill ${status?.chatModel ? 'good' : 'warnp'}`}>
            <i aria-hidden="true" />
            {status?.chatModel ? <>Bedrock {String(status.chatModel).replace(/^(us|global)\.(anthropic|amazon)\./, '')}</> : 'Bedrock not set'}
          </span>
        </div>
      </header>

      <main className="stage">
        <section className="device-col" aria-label="Device">
          <div className={`device phase-${phase} routine-${ambience}`}>
            <span className="camera" aria-hidden="true" />
            <div className={card ? 'screen has-card' : 'screen'}>
              {card ? (
                <div className="screen-card" key={card.resourceUri + card.toolName + JSON.stringify(card.args)}>
                  <CardFrame card={card} role={role} onCardMessage={onCardMessage} />
                </div>
              ) : showReply && lastReply ? (
                <div className="reply-view" key={lastReplyAt}>
                  {lastUser && <p className="reply-user">“{lastUser.text}”</p>}
                  <p className="reply-say">{lastReply.text}</p>
                </div>
              ) : (
                <Ambient routine={routine} calls={calls} lang={lang} suggestions={suggestions} />
              )}
              {(card || showReply) && (
                <button type="button" className="home-btn" onClick={goHome} aria-label="Back to the home screen"><Icon name="home" size={20} /></button>
              )}
              {caption && <div className={`caption ${phase}`} aria-hidden="true"><span>{caption}</span></div>}
              <div className="lightbar" aria-hidden="true"><span /></div>
            </div>
          </div>
          <div className="device-base" aria-hidden="true" />
          <p className="phase-line" aria-live="polite">
            {phase === 'story' ? 'Listening to your story — pause for 4 seconds or say “that’s all”.' : PHASE_LABEL[phase] || ' '}
          </p>

          <div className="controls">
            <button className={`talk ${live ? 'live' : ''}`} onClick={talk} disabled={!recognitionSupported() || phase === 'thinking'}
              title={recognitionSupported() ? 'Push to talk (space)' : 'Speech recognition is not available in this browser: type instead'}>
              <span className="talk-ico"><Icon name={live ? 'stop' : 'mic'} /></span>
              <span className="talk-label">{phase === 'story' ? 'Finish story' : phase === 'listening' ? 'Stop listening' : 'Talk'}</span>
              <kbd>space</kbd>
            </button>
            <form className="typebox" onSubmit={submitText}>
              <label className="sr-only" htmlFor="utterance">Type instead of speaking</label>
              <input id="utterance" value={text} onChange={(e) => setText(e.target.value)} placeholder={storyNext ? 'Type the story, then press Enter' : 'Or type what you would say'} autoComplete="off" />
              <button type="submit" disabled={phase === 'thinking' || !text.trim()} aria-label="Send"><Icon name="send" size={20} /></button>
            </form>
          </div>
          {suggestions.length > 0 && (
            <div className="suggest" aria-label="Things to try saying">
              <span className="suggest-label">Try saying</span>
              {suggestions.map((s) => (
                <button key={s} type="button" lang={/[ऀ-ॿ]/.test(s) ? 'hi' : 'en'} disabled={phase === 'thinking' || live} onClick={() => void send(s)}>{s}</button>
              ))}
            </div>
          )}
          {DEBUG && names && (
            <div className="debug" aria-label="Direct tool calls">
              <span className="mono muted">debug · direct MCP calls:</span>
              {debugCalls(names).map((d) => <button key={d.label} onClick={() => direct(d)}>{d.label}</button>)}
            </div>
          )}
        </section>

        <aside className="panel-col" aria-label="Control panel">
          <section className="transcript" aria-label="Conversation">
            <div className="panel-head">
              <h2>Conversation</h2>
              <button className="chip-btn" onClick={() => { void api.reset(role); setLines([]); goHome(); }}>Clear</button>
            </div>
            <ol ref={logRef}>
              {lines.map((l, i) => (
                <li key={i} className={`line ${l.who}`}>
                  {l.who !== 'system' && <span className="who">{l.who === 'user' ? speakerName(l.as ?? role) : 'Recollect'}</span>}
                  <p className={l.source === 'say' ? 'said' : undefined}>{l.text}</p>
                  {l.who === 'recollect' && l.source && (
                    <span className="provenance mono">{l.source === 'say' ? 'spoken verbatim from tool `say`' : 'model small talk'}</span>
                  )}
                  {l.calls?.map((c, j) => (
                    <span key={j} className={`call mono ${latencyClass(toolMs(c))}`}>{c.name}({Object.values(c.args).map((v) => JSON.stringify(v)).join(', ')}) · {timing(c)}</span>
                  ))}
                </li>
              ))}
              {interim && <li className="line user interim"><span className="who">…</span><p>{interim}</p></li>}
            </ol>
            {lines.length === 0 && !interim && <p className="empty">Press Talk (or space) and speak, type below, or tap a suggestion. Replies are read aloud.</p>}
          </section>
          <HomePanel routine={routine} onJump={jumpClock} />
          <LatencyStrip calls={calls} />
        </aside>
      </main>

      <div className="graph-toggle">
        <button className="chip-btn" aria-expanded={showGraph} onClick={() => setShowGraph((s) => !s)}>
          <Icon name="graph" size={18} /> {showGraph ? 'Hide memory graph' : 'Show memory graph'}
        </button>
      </div>
      {showGraph && (
        <GraphPanel
          data={graph}
          stats={graph ? `${graph.stories.length} stories · ${graph.entities.length} people, places and things · ${graph.retells.length} retold` : ''}
        />
      )}
    </div>
  );
}
