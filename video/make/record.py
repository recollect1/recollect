"""Records the Recollect demo, scene by scene, from real interactions.

The simulator (localhost:5173) and family page (localhost:5174) talk to the live AWS deployment;
every reply on screen is a real MCP tool call. Speech is typed (no microphone in a headless browser),
and the browser's text-to-speech is replaced by a timer, since no audio is recorded here: the
narration track is added afterwards.

    python record.py [scene ...]       # default: all scenes
"""
import json
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

HERE = Path(__file__).parent
OUT = HERE / "takes"
SIM, FAMILY = "http://localhost:5173/", "http://localhost:5174/"
W, H = 1280, 720
RADIO = ("My father came to visit us in Patiala in 1968 and he brought a radio. It was the first radio "
         "in our house. It was a big brown Murphy radio and it sat on a shelf in the front room. The whole "
         "street came to listen to the cricket. Balwant would not let anyone touch the dial. In the evening "
         "we listened to old songs on Radio Ceylon.")

# Speech synthesis stand-in: "speaks" for a time proportional to the text, then fires onend.
SPEECH_STUB = """
// No microphone here: report speech recognition as unavailable, so story mode takes typed text.
window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;
Object.defineProperty(window, 'speechSynthesis', { value: {
  speak(u) { setTimeout(() => u.onend && u.onend(new Event('end')), Math.min(5000, 600 + u.text.length * 40)); },
  cancel() {}, pause() {}, resume() {}, getVoices() { return []; },
  speaking: false, pending: false, paused: false, addEventListener() {}, removeEventListener() {},
}});
"""


def duration(mp3: Path) -> float:
    import subprocess, imageio_ffmpeg
    err = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-i", str(mp3)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def replies(page: Page) -> int:
    return page.locator("li.line.recollect").count()


def wait_reply(page: Page, before: int, timeout: float = 40) -> None:
    end = time.time() + timeout
    while replies(page) <= before:
        if time.time() > end:
            raise TimeoutError("no reply")
        page.wait_for_timeout(200)
    page.wait_for_timeout(900)  # let the card render and the "voice" finish


def say(page: Page, text: str, delay: int = 16) -> None:
    before = replies(page)
    box = page.locator("#utterance")
    box.click()
    if len(text) > 120:
        box.fill(text)  # a long story is pasted, not typed key by key
        page.wait_for_timeout(1500)
    else:
        box.type(text, delay=delay)
    page.keyboard.press("Enter")
    wait_reply(page, before)


def button(page: Page, name: str) -> None:
    page.get_by_role("button", name=name, exact=True).click()


def role(page: Page, name: str) -> None:
    page.get_by_role("radio", name=name).click()
    page.wait_for_timeout(700)


def sim_ready(page: Page) -> None:
    page.goto(SIM)
    page.wait_for_selector("text=MCP 2025-11-25", timeout=30000)
    page.get_by_role("button", name="Clear").click()
    page.wait_for_timeout(1500)


def sleep_until(t0: float, seconds: float) -> None:
    left = seconds - (time.time() - t0)
    if left > 0:
        time.sleep(left)


# --- scenes: (pre-roll, body). Pre-roll frames are trimmed off. ---

def s1_daily(page, phase):
    if phase == "pre":
        sim_ready(page)
        button(page, "Morning 09:00")
        page.wait_for_timeout(2500)
        page.get_by_role("button", name="Clear").click()
        page.wait_for_timeout(800)
        return
    say(page, "I took my BP tablet at 8:10 this morning.")
    say(page, "Did I take my BP tablet?")
    say(page, "Who is Aman?")
    for _ in range(3):
        say(page, "Where is Aman?", delay=20)


def s2_memory(page, phase):
    if phase == "pre":
        sim_ready(page)
        page.get_by_role("button", name=re.compile("memory graph", re.I)).click()
        page.wait_for_timeout(2500)
        return
    say(page, "I want to tell you a story.")
    say(page, RADIO, delay=6)
    # The worker (AgentCore + Nova Pro) adds people, places and things; the panel polls every 3 s.
    page.locator("section.graph").scroll_into_view_if_needed()
    page.wait_for_timeout(11000)
    page.mouse.wheel(0, -3000)
    page.wait_for_timeout(600)
    role(page, "Aman (family)")
    say(page, "How did Grandma come to Patiala?")
    role(page, "Gurdev (elder)")
    say(page, "What was my school like?")


def s3_evening(page, phase):
    if phase == "pre":
        sim_ready(page)
        return
    before = replies(page)
    button(page, "Evening 17:00")
    wait_reply(page, before)
    page.locator("section.home").scroll_into_view_if_needed()
    page.wait_for_timeout(2500)
    page.mouse.wheel(0, -3000)
    say(page, "I feel a bit restless.")


def s4_photo(page, phase):
    if phase == "pre":
        sim_ready(page)
        return
    before = replies(page)
    button(page, "Photo time 11:15")
    wait_reply(page, before)
    page.wait_for_timeout(1500)
    say(page, "That is our courtyard at Diwali. Aman is holding the sparklers and Simran is lighting the lamps.")


def s5_family(page, phase):
    if phase == "pre":
        page.goto(FAMILY)
        page.wait_for_selector("#trends", timeout=30000)
        page.wait_for_timeout(1500)
        return
    page.locator("#today").scroll_into_view_if_needed()
    page.wait_for_timeout(3500)
    page.locator("#trends").scroll_into_view_if_needed()
    page.wait_for_timeout(5500)
    page.goto(FAMILY + "report/doctor")
    page.wait_for_timeout(2500)
    for _ in range(6):
        page.mouse.wheel(0, 420)
        page.wait_for_timeout(900)
    page.goto(FAMILY)
    page.wait_for_selector("#me", timeout=30000)
    page.locator("#me").scroll_into_view_if_needed()
    page.wait_for_timeout(4000)


def card(name):
    def run(page, phase):
        if phase == "pre":
            page.goto((HERE / f"{name}.html").as_uri())
            page.wait_for_timeout(800)
    return run


SCENES = {
    "s0_problem": card("s0_problem"), "s1_daily": s1_daily, "s2_memory": s2_memory,
    "s3_evening": s3_evening, "s4_photo": s4_photo, "s5_family": s5_family,
    "s6_engineering": card("s6_engineering"), "s7_close": card("s7_close"),
}


def main() -> None:
    wanted = sys.argv[1:] or list(SCENES)
    OUT.mkdir(exist_ok=True)
    offsets = json.loads((OUT / "offsets.json").read_text()) if (OUT / "offsets.json").exists() else {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for name in wanted:
            audio = duration(HERE / f"{name}.mp3")
            folder = OUT / name
            for old in folder.glob("*.webm"):
                old.unlink()
            ctx = browser.new_context(viewport={"width": W, "height": H}, record_video_dir=str(folder),
                                      record_video_size={"width": W, "height": H}, device_scale_factor=1)
            ctx.add_init_script(SPEECH_STUB)
            page = ctx.new_page()
            started = time.time()
            SCENES[name](page, "pre")
            t0 = time.time()
            SCENES[name](page, "body")
            sleep_until(t0, audio + 1.2)
            length = time.time() - t0
            ctx.close()
            offsets[name] = {"start": round(t0 - started, 2), "length": round(length, 2), "audio": round(audio, 2)}
            print(f"{name:16s} body {length:5.1f} s · narration {audio:5.1f} s")
            (OUT / "offsets.json").write_text(json.dumps(offsets, indent=1))
        browser.close()


if __name__ == "__main__":
    main()
