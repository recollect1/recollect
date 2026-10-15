import { card, el } from "./shared.ts";

// whats_today: the date huge, tablets ✓ taken / due, visitors, one "call" button (§10).
void card("recollect-today-card", (sc, app) => {
  const doses = (sc.doses ?? []) as { name: string; time: string; taken: boolean; takenAt?: string }[];
  const visitors = (sc.visitors ?? []) as { name: string; time: string; kind: string }[];
  const admin = String(sc.admin ?? "family");
  const call = el("button", { type: "button" }, `Call ${admin}`);
  call.addEventListener("click", async () => {
    call.setAttribute("disabled", "");
    // Messages the host; the card never dials.
    await app.sendMessage({ role: "user", content: [{ type: "text", text: `Please call ${admin}.` }] }).catch(() => {});
    call.textContent = `Asked to call ${admin}`;
  });
  return [
    el("div", { class: "day" }, String(sc.weekday ?? "")),
    el("div", { class: "date" }, String(sc.date ?? "")),
    el("h2", {}, "Tablets"),
    el("ul", {}, ...doses.map((d) => el("li", {}, el("span", {}, d.name),
      d.taken ? el("span", { class: "ok" }, `✓ taken${d.takenAt ? ` ${d.takenAt}` : ""}`) : el("span", { class: "due" }, `due ${d.time}`)))),
    el("h2", {}, "People today"),
    visitors.length
      ? el("ul", {}, ...visitors.map((v) => el("li", {}, el("span", {}, v.name), el("span", {}, v.kind === "call" ? "calls today" : `comes ${v.time}`))))
      : el("p", { class: "muted" }, "Nobody is expected today"),
    el("div", { class: "actions" }, call),
  ];
});
