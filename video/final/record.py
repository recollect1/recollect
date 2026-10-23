"""Records the final film (video/FILM_PLAN.md v2) from the real running app (`pnpm dev`: simulator
:5173, family :5174, MCP :8787 with DEMO_CLOCK=1, FalkorDB + worker for the memory graph).

Every reply on screen is a real MCP tool call; Bedrock (Nova Pro) picks the tools. Her lines are
"heard" by a stand-in for the browser's speech recognition (word by word, paced to her voiced clip),
so the app's real listening flow runs. Each scene logs when every voiced clip starts and which
stretches are only waiting on Bedrock (cut in assembly). Real reply texts are checked against
lines.py; any difference is written to clips/overrides.json for tts.py to re-voice.

    .venv/bin/python record.py [scene ...]
"""
import json
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

from lines import LINES, STORY_REST, STORY_SPOKEN

HERE = Path(__file__).parent
TAKES, CLIPS = HERE / "takes", HERE / "clips"
SIM, FAM = "http://127.0.0.1:5173/", "http://127.0.0.1:5174/"
W, H = 1280, 720
DUR: dict[str, float] = json.loads((CLIPS / "durations.json").read_text())
GAP = 0.35  # silence between turns

INIT = r"""
window.__say = []; window.__heardAt = 0;
class FakeRec {
  constructor() { this.lang = 'en-IN'; this.continuous = false; this.interimResults = true;
    this.onresult = null; this.onend = null; this.onerror = null; this._stopped = false; }
  start() {
    const item = window.__say.shift();
    if (!item) return;
    window.__heardAt = Date.now();
    const words = item.text.split(' '); let i = 0, acc = '';
    const emit = (t, fin) => this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: fin })] });
    const next = () => {
      if (this._stopped) return;
      if (i < words.length) { acc = words.slice(0, ++i).join(' '); emit(acc, false); setTimeout(next, item.delays[i - 1] || 120); }
      else { emit(item.text, true); setTimeout(() => { if (!this._stopped && !this.continuous) { this._stopped = true; this.onend && this.onend(); } }, 300); }
    };
    setTimeout(next, 120);
  }
  stop() { if (this._stopped) return; this._stopped = true; this.onend && this.onend(); }
  abort() { this.stop(); }
}
window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
// No audio is recorded here; replies "speak" for about as long as their voiced clip will.
Object.defineProperty(window, 'speechSynthesis', { value: {
  speak(u) { setTimeout(() => u.onend && u.onend(new Event('end')), 300 + u.text.length * 60); },
  cancel() {}, pause() {}, resume() {}, getVoices() { return []; },
  speaking: false, pending: false, paused: false, addEventListener() {}, removeEventListener() {},
}});
"""

NOTE_JS = """t => { let d = document.getElementById('film-note'); if (!d) { d = document.createElement('div'); d.id = 'film-note';
  Object.assign(d.style, { position: 'fixed', right: '12px', bottom: '8px', zIndex: 99999, background: '#0b1226d9', color: '#cfd8e6',
    font: '500 13px system-ui', padding: '5px 10px', borderRadius: '8px', pointerEvents: 'none' }); document.body.appendChild(d); }
  d.textContent = t; }"""
SUB_JS = """t => { let d = document.getElementById('film-sub'); if (!d) { d = document.createElement('div'); d.id = 'film-sub';
  Object.assign(d.style, { position: 'fixed', left: '28%', top: '120px', transform: 'translateX(-50%)', zIndex: 99999,
    background: '#000000d0', color: '#fff', font: '600 22px system-ui', padding: '8px 18px', borderRadius: '10px',
    maxWidth: '1000px', textAlign: 'center', pointerEvents: 'none' }); document.body.appendChild(d); }
  d.style.display = t ? 'block' : 'none'; d.textContent = t; }"""
REENACT = "Re-enactment: voices are synthetic, every reply is the real app. People are fictional."


class Scene:
    def __init__(self, browser, name):
        self.browser, self.name = browser, name
        self.folder = TAKES / name
        self.folder.mkdir(parents=True, exist_ok=True)
        for old in self.folder.rglob("*.webm"):
            old.unlink()
        self.pages, self.created = {}, {}
        self.t0 = 0.0
        self.events: list[tuple[float, str]] = []   # (scene time, clip key)
        self.cuts: list[tuple[float, float]] = []   # waiting-only stretches to drop
        self.switches: list[tuple[float, str]] = []  # (scene time, page key shown from then on)
        self.replies: dict[str, str] = {}

    def page(self, key: str) -> Page:
        if key not in self.pages:
            ctx = self.browser.new_context(viewport={"width": W, "height": H}, record_video_dir=str(self.folder / key),
                                           record_video_size={"width": W, "height": H})
            ctx.add_init_script(INIT)
            self.pages[key] = ctx.new_page()
            self.created[key] = time.time()
        return self.pages[key]

    def now(self) -> float:
        return time.time() - self.t0

    def show(self, key: str) -> None:
        self.switches.append((self.now(), key))

    def clip(self, key: str, wait: bool = True, at: float | None = None) -> None:
        self.events.append((self.now() if at is None else at, key))
        if wait:
            time.sleep(DUR[key])

    def hold(self, seconds: float) -> None:
        time.sleep(seconds)


# ---------------- app helpers ----------------

def replies(p: Page) -> int:
    return p.locator("li.line.recollect").count()


def last_reply(p: Page) -> str:
    return p.locator("li.line.recollect p").last.inner_text().strip()


def wait_reply(p: Page, before: int, timeout: float = 60) -> float:
    end = time.time() + timeout
    while replies(p) <= before:
        if time.time() > end:
            raise TimeoutError("no reply")
        p.wait_for_timeout(100)
    return time.time()


def api(p: Page, method: str, path: str, body=None):
    return p.evaluate("""async ([m, u, b]) => { const r = await fetch(u, { method: m, headers: b ? {'content-type': 'application/json'} : {},
        body: b ? JSON.stringify(b) : undefined }); return r.status; }""", [method, path, body])


def note(p: Page, text: str = REENACT) -> None:
    p.evaluate(NOTE_JS, text)


def sub(p: Page, text: str) -> None:
    p.evaluate(SUB_JS, text)


def sim_ready(p: Page, lang: str = "en") -> None:
    p.goto(SIM)
    p.wait_for_selector("text=MCP 2025-11-25", timeout=90000)
    api(p, "POST", "/api/family/language", {"lang": lang})
    p.reload()
    p.wait_for_selector("text=MCP 2025-11-25", timeout=90000)
    p.get_by_role("radio", name=re.compile("elder")).click()
    p.get_by_role("button", name="Clear").click()
    p.wait_for_timeout(700)
    note(p)


def delays_for(text: str, seconds: float) -> list[int]:
    words = text.split(" ")
    return [int(seconds * 1000 / len(words))] * len(words)


def say(S: Scene, p: Page, key: str, expect: str | None) -> None:
    """She (or Aman) speaks `key`; the app listens, waits on Bedrock, and replies; we voice the reply."""
    text = LINES[key][1]
    before = replies(p)
    p.evaluate("([t, d]) => window.__say.push({ text: t, delays: d })", [text, delays_for(text, DUR[key])])
    p.locator("button:has(.talk-label)").click()
    S.clip(key, wait=False)
    spoke_end = S.now() + DUR[key] + 0.5
    t_reply = wait_reply(p, before) - S.t0
    if t_reply - spoke_end > 0.6:
        S.cuts.append((spoke_end, t_reply - 0.2))
    if expect:
        actual = last_reply(p)
        S.replies[expect] = actual
        S.clip(expect, wait=False, at=t_reply)
        time.sleep(max(DUR[expect], 0.3 + len(actual) * 0.06) + GAP)


def jump(S: Scene, p: Page, label: str, voice: str | None = None) -> None:
    before = replies(p)
    p.get_by_role("button", name=label, exact=True).click()
    t_click = S.now()
    t_reply = wait_reply(p, before) - S.t0
    if t_reply - t_click > 1.2:
        S.cuts.append((t_click + 0.6, t_reply - 0.2))
    if voice:
        S.replies[voice] = last_reply(p)
        S.clip(voice, wait=False, at=t_reply)
        time.sleep(DUR[voice] + GAP)


def glide(p: Page, sel: str, offset: int = -20) -> None:
    p.locator(sel).first.evaluate(
        f"e => window.scrollTo({{top: e.getBoundingClientRect().top + scrollY + {offset}, behavior: 'smooth'}})")


# ---------------- scenes ----------------

def slide(file: str, key: str):
    def run(S: Scene, pre: bool):
        p = S.page("slide")
        if pre:
            p.goto((HERE / file).as_uri())
            return
        p.reload()
        S.show("slide")
        S.hold(0.4)
        S.clip(key)
        S.hold(0.7)
    return run


def s3_morning(S: Scene, pre: bool):
    p = S.page("sim")
    if pre:
        sim_ready(p)
        api(p, "POST", "/api/clock", {"at": "08:10"})
        api(p, "POST", "/api/direct", {"role": "elder", "name": "log_dose", "args": {"medicine": "BP tablet"}})
        p.get_by_role("button", name="Clear").click()
        p.wait_for_timeout(600)
        return
    S.show("sim")
    jump(S, p, "Morning 09:00")
    S.clip("n3a")
    say(S, p, "g3a", "r3a")
    say(S, p, "g3c", "r3c")
    say(S, p, "g3c", "r3c")
    S.clip("n3b")
    S.hold(0.3)


def s4_hindi(S: Scene, pre: bool):
    p = S.page("sim")
    if pre:
        sim_ready(p)
        p.get_by_role("radio", name="हिंदी").click()
        p.wait_for_timeout(1200)
        note(p)
        return
    S.show("sim")
    S.clip("n4")
    sub(p, "She asks: “Where is Aman?”")
    say(S, p, "g4", "r4")
    sub(p, "")


def s5_story(S: Scene, pre: bool):
    p = S.page("sim")
    if pre:
        sim_ready(p)
        api(p, "POST", "/api/clock", {"at": "10:30"})
        return
    S.show("sim")
    before = replies(p)
    story = f"{STORY_SPOKEN} {STORY_REST}"
    spoken_words = len(STORY_SPOKEN.split(" "))
    delays = delays_for(STORY_SPOKEN, DUR["g5b"]) + [75] * (len(story.split(" ")) - spoken_words)
    # Queue the story for when story mode starts listening, then say the trigger.
    p.evaluate("([t, d]) => window.__say.push({ text: t, delays: d })", ["I want to tell you a story.", delays_for("I want to tell you a story.", DUR["g5a"])])
    p.evaluate("([t, d]) => window.__say.push({ text: t, delays: d })", [story, delays])
    p.locator("button:has(.talk-label)").click()
    S.clip("g5a", wait=False)
    t_prompt = wait_reply(p, before) - S.t0
    S.replies["r5a"] = last_reply(p)
    S.clip("r5a", wait=False, at=t_prompt)
    # Story mode starts listening after the prompt is "spoken"; her clip starts when the mic hears her.
    p.wait_for_function("() => window.__heardAt > 0 && window.__say.length === 0", timeout=30000)
    heard = p.evaluate("() => window.__heardAt") / 1000 - S.t0
    S.clip("g5b", wait=False, at=heard)
    t_saved = wait_reply(p, before + 1, timeout=90) - S.t0
    S.replies["r5b"] = last_reply(p)
    S.clip("r5b", wait=False, at=t_saved)
    time.sleep(DUR["r5b"] + 0.3)
    # The live memory graph: the worker (Strands on Bedrock) adds what she just named.
    p.get_by_role("button", name=re.compile("memory graph")).click()
    p.wait_for_timeout(500)
    p.locator("[aria-label='Memory graph'], .graph").first.scroll_into_view_if_needed()
    S.clip("n5")
    S.hold(1.0)


def s6_recall(S: Scene, pre: bool):
    p = S.page("sim")
    if pre:
        sim_ready(p)
        return
    S.show("sim")
    S.clip("n6a", wait=False)
    p.get_by_role("radio", name=re.compile("family")).click()
    time.sleep(DUR["n6a"] + 0.2)
    say(S, p, "a6", "r6a")
    S.hold(0.4)
    p.get_by_role("radio", name=re.compile("elder")).click()
    p.wait_for_timeout(400)
    say(S, p, "g6", "r6b")
    S.clip("n6b")
    S.hold(0.3)


def s7_ask(S: Scene, pre: bool):
    fam, p = S.page("family"), S.page("sim")
    if pre:
        fam.goto(FAM)
        fam.wait_for_selector("#ask", timeout=90000)
        glide(fam, "#ask", -10)
        fam.wait_for_timeout(800)
        note(fam)
        sim_ready(p)
        return
    S.show("family")
    S.clip("n7a", wait=False)
    fam.locator("#ask select").select_option(label="Aman")
    fam.locator("#ask input").click()
    fam.locator("#ask input").type("What was your wedding day like?", delay=40)
    fam.get_by_role("button", name="Leave the question").click()
    left = DUR["n7a"] - S.now() + 0.4
    if left > 0:
        time.sleep(left)
    S.show("sim")
    jump(S, p, "Family question 15:20", voice="r7a")
    say(S, p, "g7", "r7b")
    S.hold(0.2)


def s8_timeline(S: Scene, pre: bool):
    tl = S.page("timeline")
    if pre:
        tl.goto(FAM + "timeline.html")
        tl.wait_for_timeout(5000)
        tl.get_by_role("button", name="Reset view").click()
        tl.wait_for_timeout(1500)
        note(tl, "Her life timeline, live from the memory graph. People are fictional.")
        return
    S.show("timeline")
    S.clip("n8", wait=False)
    tl.wait_for_timeout(2000)
    tl.locator(".tl-tag", has_text="Arriving in Patiala").first.dispatch_event("click")
    tl.wait_for_timeout(int(max(DUR["n8"] - 2.0, 2.5) * 1000))
    tl.locator(".tl-tag", has_text="1968").first.dispatch_event("click")
    tl.wait_for_timeout(2600)


def s9_family(S: Scene, pre: bool):
    fam = S.page("family")
    if pre:
        fam.goto(FAM)
        fam.wait_for_selector("#today", timeout=90000)
        fam.wait_for_timeout(1500)
        note(fam, "Simulated speech history, labelled on screen. People are fictional.")
        return
    S.show("family")
    glide(fam, "#today", -10)
    S.clip("n9a")
    S.hold(0.5)
    glide(fam, "#trends", -10)
    S.hold(0.5)
    S.clip("n9b")
    S.hold(0.6)
    fam.goto(FAM + "report/doctor")
    fam.wait_for_timeout(600)
    S.clip("n9c", wait=False)
    for _ in range(4):
        fam.mouse.wheel(0, 300)
        fam.wait_for_timeout(int(DUR["n9c"] * 1000 / 4))
    S.hold(0.4)
    fam.goto(FAM)
    fam.wait_for_selector("#care", timeout=60000)
    glide(fam, "#care", -10)
    fam.wait_for_timeout(500)
    S.clip("n9d", wait=False)
    step = fam.locator("li.row.care", has_text="Book a check-up")
    if step.count():
        step.first.get_by_role("button", name="Approve").click()
    fam.wait_for_timeout(int(DUR["n9d"] * 1000 * 0.55))
    glide(fam, "#you", -10)
    fam.wait_for_timeout(int(DUR["n9d"] * 1000 * 0.45) + 600)


SCENES = {
    "s1_problem": slide("s1_problem.html", "n1"),
    "s2_who": slide("s2_who.html", "n2"),
    "s3_morning": s3_morning,
    "s4_hindi": s4_hindi,
    "s5_story": s5_story,
    "s6_recall": s6_recall,
    "s7_ask": s7_ask,
    "s8_timeline": s8_timeline,
    "s9_family": s9_family,
    "s10_built": slide("s10_built.html", "n10"),
    "s11_close": slide("s11_close.html", "n11"),
}


def main() -> None:
    wanted = sys.argv[1:] or list(SCENES)
    TAKES.mkdir(exist_ok=True)
    meta_file = TAKES / "meta.json"
    meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}
    overrides_file = CLIPS / "overrides.json"
    overrides = json.loads(overrides_file.read_text()) if overrides_file.exists() else {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--enable-gpu", "--ignore-gpu-blocklist"])
        for name in wanted:
            S = Scene(browser, name)
            SCENES[name](S, True)
            S.t0 = time.time()
            SCENES[name](S, False)
            end = S.now()
            offsets = {k: S.t0 - c for k, c in S.created.items()}
            for pg in S.pages.values():
                pg.context.close()
            files = {k: str(next((S.folder / k).glob("*.webm"))) for k in S.pages}
            meta[name] = {"end": round(end, 2), "events": S.events, "cuts": S.cuts, "switches": S.switches,
                          "files": files, "offsets": offsets}
            for key, actual in S.replies.items():
                if actual and actual != LINES[key][1]:
                    overrides[key] = actual
                    print(f"  reply {key} differs → re-voice: {actual!r}")
            print(f"{name:12s} {end:5.1f} s recorded, {sum(b - a for a, b in S.cuts):4.1f} s of waiting to cut")
            meta_file.write_text(json.dumps(meta, indent=1))
            overrides_file.write_text(json.dumps(overrides, indent=1, ensure_ascii=False))
        browser.close()


if __name__ == "__main__":
    main()
