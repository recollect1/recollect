// Thin wrappers over the Web Speech API (Chrome: webkitSpeechRecognition).

type Rec = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null;
};

export function recognitionSupported(): boolean {
  return typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/** The language she speaks and hears: follows the household setting (English or Hindi). */
let speechLang: 'en-IN' | 'hi-IN' = 'en-IN';
export function setSpeechLang(lang: 'en' | 'hi'): void { speechLang = lang === 'hi' ? 'hi-IN' : 'en-IN'; }

function makeRec(continuous: boolean): Rec {
  const C = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const r: Rec = new C();
  r.lang = speechLang;
  r.continuous = continuous;
  r.interimResults = true;
  return r;
}

/** One utterance: resolves with the final transcript when the user stops talking (or stop() is called). */
export function listenOnce(onInterim: (t: string) => void): { done: Promise<string>; stop: () => void } {
  const rec = makeRec(false);
  let final = '';
  const done = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      onInterim((final + ' ' + interim).trim());
    };
    rec.onerror = (e) => (e.error === 'no-speech' || e.error === 'aborted' ? resolve('') : reject(new Error(e.error)));
    rec.onend = () => resolve(final.trim());
  });
  rec.start();
  return { done, stop: () => rec.stop() };
}

const END_PHRASE = /[\s,.।]*(that's all|that is all|thats all|बस इतना ही|बस इतनी सी|bas itna hi)[\s.!।]*$/i;

/**
 * Story mode: keep listening until a 4 s pause or "that's all". Returns the verbatim transcript
 * (with the closing phrase removed). Chrome ends continuous sessions on its own sometimes, so we restart.
 */
export function listenForStory(onInterim: (t: string) => void, pauseMs = 4000): { done: Promise<string>; stop: () => void } {
  let finals: string[] = [];
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rec: Rec | null = null;
  let resolveFn: (s: string) => void = () => {};
  const finish = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    rec?.stop();
    resolveFn(finals.join(' ').replace(END_PHRASE, '').replace(/\s+/g, ' ').trim());
  };
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(finish, pauseMs);
  };
  const start = () => {
    rec = makeRec(true);
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t: string = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) finals.push(t);
        else interim += t;
      }
      const all = (finals.join(' ') + ' ' + interim).trim();
      onInterim(all);
      if (END_PHRASE.test(finals.join(' '))) finish();
      else arm();
    };
    rec.onerror = () => {};
    rec.onend = () => { if (!stopped) start(); };
    rec.start();
  };
  const done = new Promise<string>((r) => (resolveFn = r));
  start();
  arm();
  return { done, stop: finish };
}

export function speak(text: string, onEnd?: () => void): void {
  if (!('speechSynthesis' in window)) return onEnd?.();
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const want = speechLang;
  u.lang = want;
  u.voice = voices.find((v) => v.lang.replace('_', '-') === want) ?? voices.find((v) => v.lang.startsWith(want.slice(0, 2))) ?? null;
  u.rate = 0.92;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export const STORY_TRIGGER = /\b(tell you a story|want to tell (you )?(a|about)|let me tell you|i have a story|kahani suna)|कहानी सुना|कहानी बता|एक कहानी है/i;
