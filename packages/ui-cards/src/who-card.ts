import { card, el, safeImage } from "./shared.ts";

// who_is: photo, name, how they are related to her (§5 scenario H).
void card("recollect-who-card", (sc) => {
  const c = sc.card as { name: string; relationToElder?: string; statusLine?: string; photoUrl?: string } | undefined;
  if (!c) return [el("p", { class: "empty" }, String(sc.say ?? ""))];
  const photo = safeImage(c.photoUrl) ? el("img", { src: c.photoUrl!, alt: c.name }) : el("span");
  return [
    el("div", { class: "who" }, photo, el("div", {},
      el("div", { class: "name" }, c.name),
      c.relationToElder ? el("div", { class: "rel" }, `your ${c.relationToElder}`) : el("span"))),
    c.statusLine ? el("p", { class: "status muted" }, `${c.name} ${c.statusLine}.`) : el("span"),
  ];
});
