import { card, el, safeImage } from "./shared.ts";

// memory_lane: a gentle reminiscence session from her own stories. One slide at a time, large and
// slow; she (or whoever sits with her) moves on when ready. Never a quiz: nothing is checked.
interface Slide {
  date: string; words: string; prompt: string;
  photo?: { url: string; caption: string };
  voice?: { name: string; relation: string; words: string };
}

void card("recollect-lane-card", (sc) => {
  const slides = (sc.slides ?? []) as Slide[];
  if (!slides.length) return [el("p", { class: "empty serif" }, String(sc.say ?? ""))];
  const stage = el("div", { class: "stage" });
  const counter = el("p", { class: "counter muted" });
  const prev = el("button", { class: "secondary", type: "button" }, "Back");
  const next = el("button", { type: "button" }, "Next memory");
  let i = 0;
  const show = () => {
    const s = slides[i]!;
    stage.replaceChildren(
      ...(s.photo && safeImage(s.photo.url)
        ? [el("img", { class: "photo", src: s.photo.url, alt: s.photo.caption }), el("p", { class: "caption" }, s.photo.caption)]
        : []),
      el("blockquote", { class: "serif" }, `“${s.words}”`),
      el("p", { class: "by muted" }, `you told me on ${s.date}`),
      ...(s.voice
        ? [el("div", { class: "voice" }, el("p", { class: "serif" }, `“${s.voice.words}”`),
            el("p", { class: "by muted" }, `${s.voice.name}${s.voice.relation ? `, your ${s.voice.relation}` : ""}`))]
        : []),
      el("p", { class: "prompt serif" }, s.prompt),
    );
    counter.textContent = `${i + 1} of ${slides.length}`;
    (prev as HTMLButtonElement).disabled = i === 0;
    next.textContent = i === slides.length - 1 ? "Start again" : "Next memory";
  };
  prev.addEventListener("click", () => { i = Math.max(0, i - 1); show(); });
  next.addEventListener("click", () => { i = (i + 1) % slides.length; show(); });
  show();
  return [
    el("p", { class: "intro serif" }, String(sc.say ?? "")),
    stage,
    el("div", { class: "nav" }, prev, counter, next),
    ...(sc.music ? [el("p", { class: "music muted" }, `Music to go with it: ${sc.music}`)] : []),
  ];
});
