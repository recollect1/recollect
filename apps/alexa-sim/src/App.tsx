import * as P from '@recollect/core/phrases';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type CardRef, type GraphData, type Role, type RoutineState, type ToolCallRecord, type TurnResult } from './api.ts';
import { CardFrame } from './CardFrame.tsx';
import { GraphPanel } from './GraphPanel.tsx';
import { HomePanel } from './HomePanel.tsx';
import { LatencyStrip, latencyClass } from './LatencyStrip.tsx';
import { startRecording, type Recording } from './audio.ts';
import { listenForStory, listenOnce, recognitionSupported, speak, stopSpeaking, STORY_TRIGGER } from './speech.ts';

type Phase = 'idle' | 'listening' | 'story' | 'thinking' | 'speaking';

interface Line {
  who: 'user' | 'recollect' | 'system';
  text: string;
  source?: 'say' | 'model';
  calls?: ToolCallRecord[];
}

const DEBUG = new URLSearchParams(location.search).has('debug');
const DEBUG_CALLS: { role: Role; name: string; args: Record<string, unknown>; label: string }[] = [
  { role: 'elder', name: 'whats_today', args: {}, label: 'whats_today' },
  { role: 'elder', name: 'check_dose', args: { medicine: 'BP tablet' }, label: 'check_dose BP' },
  { role: 'elder', name: 'where_is', args: { person: 'Aman' }, label: 'where_is Aman' },
  { role: 'elder', name: 'who_is', args: { name: 'Aman' }, label: 'who_is Aman' },
  { role: 'family', name: 'recall_memory', args: { question: 'How did Grandma come to Patiala?' }, label: 'recall (family): Patiala' },
  { role: 'elder', name: 'recall_memory', args: { question: 'What was my school like?' }, label: 'recall: school (nothing saved)' },
  { role: 'elder', name: 'photo_moment', args: {}, label: 'photo_moment' },
  { role: 'elder', name: 'night_reassure', args: { text: 'I need to go to the market' }, label: 'night: go to the market' },
  { role: 'elder', name: 'story_prompt', args: {}, label: 'story_prompt' },
  { role: 'family', name: 'speech_trend', args: {}, label: 'speech_trend (family)' },
];

const ROLES: { role: Role; label: string; hint: string }[] = [
  { role: 'elder', label: 'Gurdev (elder)', hint: 'Try “Did I take my BP tablet?” or “I want to tell you a story.”' },
  { role: 'family', label: 'Aman (family)', hint: 'Try “How did Grandma come to Patiala?” or “How is her speech?”' },
];

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
  const stopRef = useRef<(() => void) | null>(null);
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => { api.status().then(setStatus).catch(() => setStatus({ error: true })); }, []);
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
    if (r.card) setCard(r.card);
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
    setLines((l) => [...l, { who: 'user', text: t }]);
    if (role === 'elder' && STORY_TRIGGER.test(t)) return startStory();
    setPhase('thinking');
    try { handleResult(await api.turn(role, t, routine?.shortReplies ?? false)); } catch (e) { fail(e); }
  }, [role, routine, handleResult, fail]); // eslint-disable-line react-hooks/exhaustive-deps

  function startStory() {
    const prompt = P.listeningForStory();
    setLines((l) => [...l, { who: 'recollect', text: prompt, source: 'say' }]);
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
        if (story) setLines((l) => [...l, { who: 'user', text: story }]);
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
      setLines((l) => [...l, { who: 'user', text: t }]);
      void tellStory(t.replace(/[\s,.]*(that's all)[\s.!]*$/i, ''));
    } else void send(t);
  }

  function switchRole(r: Role) {
    if (r === role) return;
    stopRef.current?.();
    stopSpeaking();
    setRole(r);
    setCard(null);
    setStoryNext(false);
    setPhase('idle');
    setLines((l) => [...l, { who: 'system', text: `Now speaking as ${ROLES.find((x) => x.role === r)!.label}.` }]);
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
  const ticks = calls.slice(-24);
  // Demo clock (scenarios I, K): jump the MCP server's clock, then let routine_state speak if it greets.
  async function jumpClock(at?: string) {
    try {
      await api.clock(at);
      const { r, sc } = await refreshRoutine();
      setLines((l) => [...l, { who: 'system', text: `Demo clock set to ${sc?.localTime ?? at ?? 'real time'}.` }]);
      if (sc?.greeting && role === 'elder') handleResult(r);
    } catch (e) { fail(e); }
  }

  async function direct(d: (typeof DEBUG_CALLS)[number]) {
    setLines((l) => [...l, { who: 'system', text: `Direct tool call as ${d.role}: ${d.name}(${JSON.stringify(d.args)}) — no voice model.` }]);
    setPhase('thinking');
    try { handleResult(await api.direct(d.role, d.name, d.args)); } catch (e) { fail(e); }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">Recollect</span>
          <span className="brand-sub">Alexa+ simulator</span>
        </div>
        <div className="roles" role="radiogroup" aria-label="Who is speaking">
          {ROLES.map((r) => (
            <button key={r.role} role="radio" aria-checked={role === r.role} className={role === r.role ? 'role on' : 'role'} onClick={() => switchRole(r.role)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="conn mono">
          {elderStatus?.ok ? <>MCP {elderStatus.protocol} · {elderStatus.tools.length} tools</> : status ? <span className="bad">MCP server unreachable</span> : '…'}
          {' · '}
          {status?.chatModel ? <>Bedrock {String(status.chatModel).replace(/^(us|global)\.anthropic\./, '')}</> : <span className="warn">Bedrock not set</span>}
        </div>
      </header>

      <main className="stage">
        <section className="device-col">
          <div className={`device phase-${phase}`}>
            <div className={card ? "screen has-card" : "screen"}>
              {card ? (
                <CardFrame card={card} role={role} onCardMessage={onCardMessage} />
              ) : (
                <div className="idle">
                  <div className="idle-time">{routine?.localTime ?? '—'}</div>
                  <div className="idle-date">{routine?.routine === 'evening' ? 'Evening' : routine?.routine === 'night' ? 'Night' : ''}</div>
                  <div className="idle-hint">{ROLES.find((r) => r.role === role)!.hint}</div>
                </div>
              )}
            </div>
            <div className="ring-wrap" aria-hidden="true">
              <div className="ring">
                {ticks.map((c, i) => (
                  <span key={i} className={`tick ${latencyClass(c.ms)}`} style={{ transform: `rotate(${(i / 24) * 360}deg) translateY(-50px)` }} />
                ))}
              </div>
            </div>
          </div>

          <div className="controls">
            <button className={`talk ${phase === 'listening' || phase === 'story' ? 'live' : ''}`} onClick={talk} disabled={!recognitionSupported() || phase === 'thinking'}>
              {phase === 'story' ? 'Finish story' : phase === 'listening' ? 'Stop listening' : 'Talk'}
              <kbd>space</kbd>
            </button>
            <form className="typebox" onSubmit={submitText}>
              <label className="sr-only" htmlFor="utterance">Type instead of speaking</label>
              <input id="utterance" value={text} onChange={(e) => setText(e.target.value)} placeholder={storyNext ? 'Type the story, then press Enter' : 'Or type what you would say'} autoComplete="off" />
              <button type="submit" disabled={phase === 'thinking'}>Send</button>
            </form>
          </div>
          {DEBUG && (
            <div className="debug" aria-label="Direct tool calls">
              <span className="mono muted">debug · direct MCP calls:</span>
              {DEBUG_CALLS.map((d) => <button key={d.label} onClick={() => direct(d)}>{d.label}</button>)}
            </div>
          )}
          <HomePanel routine={routine} onJump={jumpClock} />
          <p className="phase-line" aria-live="polite">
            {phase === 'listening' ? 'Listening…' : phase === 'story' ? 'Listening to your story — pause for 4 seconds or say “that’s all”.' : phase === 'thinking' ? 'Thinking…' : phase === 'speaking' ? 'Speaking' : ' '}
          </p>
        </section>

        <section className="transcript" aria-label="Conversation">
          <div className="transcript-head">
            <h2>Conversation</h2>
            <button className="link" onClick={() => { void api.reset(role); setLines([]); setCard(null); }}>Clear</button>
          </div>
          <ol ref={logRef}>
            {lines.map((l, i) => (
              <li key={i} className={`line ${l.who}`}>
                {l.who !== 'system' && <span className="who">{l.who === 'user' ? (role === 'elder' ? 'Gurdev' : 'Aman') : 'Recollect'}</span>}
                <p className={l.source === 'say' ? 'said' : undefined}>{l.text}</p>
                {l.who === 'recollect' && l.source && (
                  <span className="provenance mono">{l.source === 'say' ? 'spoken verbatim from tool `say`' : 'model small talk'}</span>
                )}
                {l.calls?.map((c, j) => (
                  <span key={j} className={`call mono ${latencyClass(c.ms)}`}>{c.name}({Object.values(c.args).map((v) => JSON.stringify(v)).join(', ')}) · {c.ms.toFixed(1)} ms</span>
                ))}
              </li>
            ))}
            {interim && <li className="line user interim"><span className="who">…</span><p>{interim}</p></li>}
          </ol>
          {lines.length === 0 && <p className="empty">Press Talk (or space) and speak, or type below. Replies are read aloud.</p>}
        </section>
      </main>

      <LatencyStrip calls={calls} />

      <div className="graph-toggle">
        <button className="link" aria-expanded={showGraph} onClick={() => setShowGraph((s) => !s)}>
          {showGraph ? 'Hide memory graph' : 'Show memory graph'}
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
