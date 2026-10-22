// MCP Apps card resources (§10). Built by `pnpm --filter @recollect/ui-cards build`.
import { readFileSync } from "node:fs";

export const CARDS = {
  story: "ui://recollect/story-card",
  today: "ui://recollect/today-card",
  trend: "ui://recollect/trend-card",
  who: "ui://recollect/who-card",
  photo: "ui://recollect/photo-card",
  lane: "ui://recollect/lane-card",
} as const;
export type CardName = keyof typeof CARDS;

const cache = new Map<CardName, string>();
export function cardHtml(name: CardName): string {
  let html = cache.get(name);
  if (!html) cache.set(name, (html = readFileSync(new URL(`./dist/${name}-card.html`, import.meta.url), "utf8")));
  return html;
}
