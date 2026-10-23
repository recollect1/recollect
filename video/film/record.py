"""Records the Recollect film, scene by scene, from the real running app (features branch stack:
MCP 8797, simulator 5183, family 5184). Every reply is a real MCP tool call; Bedrock Nova Pro picks
the tools. Her voice is played by a stand-in for the browser's speech recognition that "hears" a
scripted line word by word, so the real listening flow runs (light bar, live caption). The browser's
text-to-speech is replaced by a timer; the narration is added afterwards.

    python record.py [scene ...]
"""
import json, re, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import Page, sync_playwright

HERE = Path(__file__).parent
TAKES = HERE / "takes"
SIM, FAM = "http://127.0.0.1:5183/", "http://127.0.0.1:5184/"
W, H = 1280, 720
GPU = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"]
RADIO = ("My father came to visit us in Patiala in 1968 and he brought a radio. It was the first radio in our house. "
         "It was a big brown Murphy radio and it sat on a shelf in the front room. The whole street came to listen to the "
         "cricket. In the evening we listened to old songs on Radio Ceylon. That's all.")

INIT = r"""
// Stand-in microphone: speech recognition that "hears" the next scripted line, word by word.
window.__say = []; window.__rate = 140;
class FakeRec {
  constructor() { this.lang = 'en-IN'; this.continuous = false; this.interimResults = true;
    this.onresult = null; this.onend = null; this.onerror = null; this._stopped = false; }
  start() {
    const text = window.__say.shift();
    if (!text) return; // silence: wait until stopped
    const words = text.split(' '); let i = 0;
    const emit = (t, fin) => this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: fin })] });
    this._timer = setInterval(() => {
      if (this._stopped) return clearInterval(this._timer);
      i++;
      if (i <= words.length) emit(words.slice(0, i).join(' '), false);
      else { clearInterval(this._timer); emit(text, true);
        setTimeout(() => { if (!this._stopped && !this.continuous) { this._stopped = true; this.onend && this.onend(); } }, 350); }
    }, window.__rate);
  }
  stop() { if (this._stopped) return; this._stopped = true; clearInterval(this._timer); this.onend && this.onend(); }
  abort() { this.stop(); }
}
window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
Object.defineProperty(window, 'speechSynthesis', { value: {
  speak(u) { setTimeout(() => u.onend && u.onend(new Event('end')), Math.min(3200, 500 + u.text.length * 22)); },
  cancel() {}, pause() {}, resume() {}, getVoices() { return []; },
  speaking: false, pending: false, paused: false, addEventListener() {}, removeEventListener() {},
}});
"""


def duration(mp3: Path) -> float:
    import imageio_ffmpeg
    err = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-i", str(mp3)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def replies(p: Page) -> int:
    return p.locator("li.line.recollect").count()


def wait_reply(p: Page, before: int, timeout: float = 45, settle: int = 700) -> None:
    end = time.time() + timeout
    while replies(p) <= before:
        if time.time() > end:
            raise TimeoutError("no reply")
        p.wait_for_timeout(150)
    p.wait_for_timeout(settle)


def talk(p: Page, text: str, rate: int = 140, settle: int = 700) -> None:
    """She speaks: the stand-in microphone hears `text`, the app runs its real voice flow."""
    before = replies(p)
    p.evaluate("([t, r]) => { window.__say.push(t); window.__rate = r; }", [text, rate])
    p.locator("button:has(.talk-label)").click()
    wait_reply(p, before, settle=settle)


def button(p: Page, name: str) -> None:
    p.get_by_role("button", name=name, exact=True).click()


def api(p: Page, method: str, path: str, body=None):
    return p.evaluate("""async ([m, u, b]) => { const r = await fetch(u, { method: m, headers: b ? {'content-type': 'application/json'} : {},
        body: b ? JSON.stringify(b) : undefined }); return r.status; }""", [method, path, body])


def sim_ready(p: Page, lang: str = "en") -> None:
    p.goto(SIM)
    p.wait_for_selector("text=MCP 2025-11-25", timeout=60000)
    api(p, "POST", "/api/family/language", {"lang": lang})
    p.reload(); p.wait_for_selector("text=MCP 2025-11-25", timeout=60000)
    p.get_by_role("radio", name=re.compile("elder")).click()
    p.get_by_role("button", name="Clear").click()
    p.wait_for_timeout(800)


def jump(p: Page, label: str, expect_reply: bool = True) -> None:
    before = replies(p)
    button(p, label)
    if expect_reply:
        wait_reply(p, before)
    else:
        p.wait_for_timeout(1500)


def glide(p: Page, sel: str, wait: int = 1500, offset: int = -30) -> None:
    p.locator(sel).first.evaluate(
        f"e => window.scrollTo({{top: e.getBoundingClientRect().top + scrollY + {offset}, behavior: 'smooth'}})")
    p.wait_for_timeout(wait)


def subtitle(p: Page, text: str) -> None:
    p.evaluate("""t => { let d = document.getElementById('film-sub'); if (!d) { d = document.createElement('div'); d.id = 'film-sub';
      Object.assign(d.style, { position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)', zIndex: 99999,
        background: '#000c', color: '#fff', font: '600 20px Atkinson Hyperlegible, system-ui', padding: '8px 16px', borderRadius: '10px',
        maxWidth: '1100px', textAlign: 'center' }); document.body.appendChild(d); } d.textContent = t; }""", text)


# ---------------- scenes ----------------
# Each scene gets pages from `open_page(key, url_or_none)`; returns segments [(key, t_from, t_to)] in
# seconds since the scene's t0, or None for "the whole body of the single page".

def m04_daily(S):
    p = S.page("sim")
    if S.pre:
        sim_ready(p)
        api(p, "POST", "/api/clock", {"at": "08:10"})
        api(p, "POST", "/api/direct", {"role": "elder", "name": "log_dose", "args": {"medicine": "BP tablet"}})
        p.get_by_role("button", name="Clear").click(); p.wait_for_timeout(600)
        return
    jump(p, "Morning 09:00")
    p.wait_for_timeout(1800)
    talk(p, "Did I take my BP tablet?")
    p.wait_for_timeout(600)
    talk(p, "Who is Aman?", settle=1800)
    talk(p, "Where is Aman?")
    talk(p, "Where is Aman?", settle=1200)


def m05_hindi(S):
    p = S.page("sim")
    if S.pre:
        sim_ready(p)
        return
    p.get_by_role("radio", name="हिंदी").click()
    p.wait_for_timeout(900)
    subtitle(p, "She asks: “Where is Aman?”")
    talk(p, "अमन कहाँ है?", settle=400)
    subtitle(p, "Recollect: “Aman is in London and calls you on Sundays.”")
    p.wait_for_timeout(2800)


def m06_story(S):
    tl, p = S.page("timeline"), S.page("sim")
    if S.pre:
        tl.goto(FAM + "timeline.html"); tl.wait_for_timeout(1500)
        sim_ready(p)
        api(p, "POST", "/api/clock", {"at": "10:30"})
        tl.get_by_role("button", name="Reset view").click()
        return
    S.mark("a")
    before = replies(p)
    talk(p, "I want to tell you a story.", settle=300)
    p.evaluate("() => { window.__say.push(%s); window.__rate = 75; }" % json.dumps(RADIO))
    # Story mode starts listening by itself after the prompt is spoken.
    end = time.time() + 40
    while replies(p) < before + 2 and time.time() < end:
        p.wait_for_timeout(150)
    S.mark("saved")
    tl.wait_for_timeout(6500)
    S.mark("end")
    return [("sim", "a", "saved", 0.6), ("timeline", "saved", "end", 0)]


def m08_recall(S):
    p = S.page("sim")
    if S.pre:
        sim_ready(p)
        return
    p.get_by_role("radio", name=re.compile("family")).click(); p.wait_for_timeout(600)
    talk(p, "How did Grandma come to Patiala?", settle=2600)
    p.get_by_role("radio", name=re.compile("elder")).click(); p.wait_for_timeout(500)
    talk(p, "What was my school like?", settle=1600)


def m09_ask(S):
    fam, p = S.page("family"), S.page("sim")
    if S.pre:
        fam.goto(FAM); fam.wait_for_selector("#ask", timeout=60000)
        glide(fam, "#ask", 400, -10)
        sim_ready(p)
        return
    S.mark("a")
    fam.locator("#ask select").select_option(label="Aman")
    fam.locator("#ask input").click()
    fam.locator("#ask input").type("What was your wedding day like?", delay=45)
    fam.get_by_role("button", name="Leave the question").click()
    fam.wait_for_timeout(1200)
    S.mark("b")
    jump(p, "Family question 15:20")
    p.wait_for_timeout(2200)
    talk(p, "It rained all morning. My mother tied my dupatta twice because her hands were shaking.", rate=90, settle=1400)
    S.mark("c")
    fam.reload(); fam.wait_for_selector("#ask", timeout=60000)
    glide(fam, "#ask", 300, -10)
    S.mark("c2")
    fam.wait_for_timeout(2600)
    S.mark("end")
    return [("family", "a", "b", 0), ("sim", "b", "c", 0), ("family", "c2", "end", 0)]


def m10_evening(S):
    p = S.page("sim")
    if S.pre:
        sim_ready(p)
        return
    jump(p, "Evening 17:00")
    p.wait_for_timeout(3500)


def m11_timeline(S):
    tl = S.page("timeline")
    if S.pre:
        tl.goto(FAM + "timeline.html"); tl.wait_for_timeout(4500)
        tl.get_by_role("button", name="Reset view").click(); tl.wait_for_timeout(1600)
        return
    tl.wait_for_timeout(3600)
    tl.locator(".tl-tag", has_text="Arriving in Patiala").first.dispatch_event("click")
    tl.wait_for_timeout(4200)
    tl.locator(".tl-tag", has_text="1968").first.dispatch_event("click")
    tl.wait_for_timeout(3600)


def m12_family(S):
    fam = S.page("family")
    if S.pre:
        fam.goto(FAM); fam.wait_for_selector("#trends", timeout=60000); fam.wait_for_timeout(1200)
        return
    fam.wait_for_timeout(1800)
    glide(fam, "#trends", 3200)
    S.mark("report")
    fam.goto(FAM + "report/doctor"); fam.wait_for_timeout(1400)
    for _ in range(3):
        fam.mouse.wheel(0, 380); fam.wait_for_timeout(650)
    fam.goto(FAM); fam.wait_for_selector("#fidelity", timeout=60000)
    glide(fam, "#fidelity", 2400, -20)
    glide(fam, "#care", 1500, -20)
    step = fam.locator("li.row.care", has_text="Book a check-up")
    glide(fam, "li.row.care:has-text('Book a check-up')", 700, -140)
    step.get_by_role("button", name="Approve").click()
    fam.wait_for_timeout(1500)
    glide(fam, "#coach", 2200, -20)


def card(name):
    def run(S):
        p = S.page("card")
        if S.pre:
            p.goto((HERE / f"{name}.html").as_uri()); p.wait_for_timeout(300)
    return run


SCENES = {
    "m01_open": card("m01_open"), "m02_problem": card("m02_problem"), "m03_intro": card("m03_intro"),
    "m04_daily": m04_daily, "m05_hindi": m05_hindi, "m06_story": m06_story, "m08_recall": m08_recall,
    "m09_ask": m09_ask, "m10_evening": m10_evening, "m11_timeline": m11_timeline, "m12_family": m12_family,
    "m13_arch": card("m13_arch"), "m14_close": card("m14_close"),
}
MIN_BODY = {"m05_hindi": 7.0}


class Scene:
    def __init__(self, browser, name):
        self.browser, self.name, self.pages, self.created, self.marks, self.pre = browser, name, {}, {}, {}, True
        self.folder = TAKES / name
        self.folder.mkdir(parents=True, exist_ok=True)
        for old in self.folder.rglob("*.webm"):
            old.unlink()
        self.t0 = 0.0

    def page(self, key):
        if key not in self.pages:
            ctx = self.browser.new_context(viewport={"width": W, "height": H}, record_video_dir=str(self.folder / key),
                                           record_video_size={"width": W, "height": H})
            ctx.add_init_script(INIT)
            pg = ctx.new_page()
            self.created[key] = time.time()
            self.pages[key] = pg
        return self.pages[key]

    def mark(self, k):
        self.marks[k] = time.time() - self.t0


def main():
    wanted = sys.argv[1:] or list(SCENES)
    TAKES.mkdir(exist_ok=True)
    meta_file = TAKES / "meta.json"
    meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=GPU)
        for name in wanted:
            audio = max(duration(HERE / f"{name}.mp3") + 1.0, MIN_BODY.get(name, 0))
            S = Scene(browser, name)
            SCENES[name](S)
            S.pre = False
            S.t0 = time.time()
            segs = SCENES[name](S)
            if segs is None:
                left = audio - (time.time() - S.t0)
                if left > 0:
                    time.sleep(left)
                key = next(iter(S.pages))
                segs = [(key, 0.0, time.time() - S.t0, 0)]
            else:
                segs = [(k, S.marks[a] if isinstance(a, str) else a, S.marks[b] if isinstance(b, str) else b, pad)
                        for k, a, b, pad in segs]
            offsets = {k: S.t0 - S.created[k] for k in S.pages}
            for pg in S.pages.values():
                pg.context.close()
            files = {k: str(next((S.folder / k).glob("*.webm"))) for k in S.pages}
            meta[name] = {"segments": [{"file": files[k], "from": round(offsets[k] + a, 2), "to": round(offsets[k] + b + pad, 2)}
                                       for k, a, b, pad in segs], "audio": round(duration(HERE / f"{name}.mp3"), 2)}
            total = sum(s["to"] - s["from"] for s in meta[name]["segments"])
            print(f"{name:14s} picture {total:5.1f} s · narration {meta[name]['audio']:5.1f} s")
            meta_file.write_text(json.dumps(meta, indent=1))
        browser.close()


if __name__ == "__main__":
    main()
