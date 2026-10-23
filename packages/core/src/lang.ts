// The language she hears: English (default) or Hindi. A household setting the family chooses; in a
// real Alexa+ add-on it would follow the device locale. Only what she hears changes: family views,
// cards, reports and stored quotes stay as they are (quotes are never translated).
import type { Ctx } from "./ctx.ts";
import * as EN from "./phrases.ts";
import { HI } from "./phrases-hi.ts";
import { localParts } from "./time.ts";
import type { Medicine, Person } from "./types.ts";

export type Lang = "en" | "hi";
export const LANGS: Lang[] = ["en", "hi"];

export const langOf = (ctx: Ctx): Lang => (ctx.household.lang === "hi" ? "hi" : "en");
export const isHi = (ctx: Ctx) => langOf(ctx) === "hi";

/** Phrase set for what she hears. */
export const voice = (ctx: Ctx): typeof HI => (isHi(ctx) ? HI : EN);

export async function setLanguage(ctx: Ctx, lang: Lang): Promise<{ lang: Lang }> {
  await ctx.graph.upsert("Household", { id: ctx.household.id, lang });
  ctx.household.lang = lang;
  return { lang };
}

// Family-written Hindi versions of names and lines, when present; English otherwise.
export const medName = (ctx: Ctx, m: Medicine) => (isHi(ctx) && m.nameHi ? m.nameHi : m.name);
export const statusOf = (ctx: Ctx, p: Person) => (isHi(ctx) && p.statusLineHi ? p.statusLineHi : p.statusLine ?? "");
export const relationOf = (ctx: Ctx, p: Person) =>
  (isHi(ctx) && p.relationToElderHi ? p.relationToElderHi : p.relationToElder ?? "");

/** Weekday and month names for what she hears. */
export function dayNames(ctx: Ctx, d: Date): { weekdayName: string; monthName: string; day: number; year: number } {
  const p = localParts(d, ctx.household.tz);
  if (!isHi(ctx)) return p;
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("hi-IN", { timeZone: ctx.household.tz, ...o }).format(d);
  return { ...p, weekdayName: f({ weekday: "long" }), monthName: f({ month: "long" }) };
}

/** "3 August 2026" or "3 अगस्त 2026". */
export function spokenDate(ctx: Ctx, d: Date): string {
  const p = dayNames(ctx, d);
  return `${p.day} ${p.monthName} ${p.year}`;
}

const PLACE_HI: Record<string, string> = {
  market: "बाज़ार", bazaar: "बाज़ार", mandi: "मंडी", temple: "मंदिर", gurdwara: "गुरुद्वारा", shop: "दुकान",
  shops: "दुकानें", station: "स्टेशन", school: "स्कूल", bank: "बैंक", doctor: "डॉक्टर", hospital: "अस्पताल",
  village: "गाँव", field: "खेत", fields: "खेत", farm: "खेत", park: "पार्क", office: "दफ़्तर",
};
export const placeName = (ctx: Ctx, place: string) => (isHi(ctx) ? PLACE_HI[place] ?? place : place);
