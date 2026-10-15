import { card, el, safeImage } from "./shared.ts";

// photo_moment: the same family photo each week; never a test, no right answers (§7.1b).
void card("recollect-photo-card", (sc) => {
  const p = sc.photo as { url: string; caption: string } | undefined;
  return [
    ...(p && safeImage(p.url) ? [el("img", { class: "photo", src: p.url, alt: p.caption }), el("p", { class: "caption" }, p.caption)] : []),
    el("p", { class: "prompt serif" }, String(sc.say ?? "")),
  ];
});
