import { card, el } from "./shared.ts";

// speech_trend (family only): the stored card, never computed here; simulated data is labelled.
void card("recollect-trend-card", (sc) => {
  const c = sc.card as { say: string; simulated?: boolean; weeks?: number } | undefined;
  return [
    ...(c?.simulated ? [el("span", { class: "sim" }, "Simulated data")] : []),
    el("h1", {}, c?.weeks ? `Speech over the last ${c.weeks} weeks` : "Speech changes"),
    el("p", { class: "say" }, String(c?.say ?? sc.say ?? "")),
    el("p", { class: "note muted" }, "Compared only with her own usual pattern."),
  ];
});
