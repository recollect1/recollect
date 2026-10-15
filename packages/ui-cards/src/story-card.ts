import { card, el } from "./shared.ts";

// recall_memory: her own words, verbatim, with the date she said them (§11).
void card("recollect-story-card", (sc) => {
  const quotes = (sc.quotes ?? []) as { text: string; date: string }[];
  if (!sc.found || quotes.length === 0) return [el("p", { class: "empty serif" }, String(sc.say ?? ""))];
  return [
    ...quotes.map((q) => el("blockquote", { class: "serif" }, `“${q.text}”`)),
    el("p", { class: "by muted" }, `told by ${sc.speaker ?? "her"} · ${quotes[0]!.date}`),
  ];
});
