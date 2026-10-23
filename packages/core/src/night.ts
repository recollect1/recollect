// Night reassurance and family alert (§9.4, P1; scenario K). Templates only, no model.
// Between 00:00 and 05:00, wanting to go somewhere gets a calm reassurance and a dim light.
// Two such asks within 30 minutes, or "I'm going out", raises one family alert.
import type { Ctx } from "./ctx.ts";
import { logAsk } from "./daily.ts";
import { placeName, voice } from "./lang.ts";
import * as P from "./phrases.ts";
import { newId } from "./text.ts";
import { fmtTime, minutesOfDay, parseHHMM } from "./time.ts";
import type { AskEvent, Device, FamilyAlert, RoutineEvent } from "./types.ts";

const NIGHT_END = "05:00";
export const ESCALATE_WINDOW_MIN = 30;

/** Places she might want to go; matched as whole words after "go to (the)". */
const PLACE = /\b(?:go|going|went|take me)\s+(?:back\s+)?(?:to\s+)?(?:the\s+)?(market|bazaar|temple|gurdwara|shop|shops|station|school|office|bank|doctor|hospital|village|fields?|farm|well|park|house|home|mandi)\b/i;
/** Explicit intent to leave now: escalates on the first ask. */
const LEAVING = /\b(?:i'?m|i am)\s+(?:going|leaving)\s+(?:out|now|outside)\b|\bopen the (?:door|gate)\b|\bi'?m leaving\b|बाहर जा रही|मैं जा रही हूँ|मैं निकल रही|दरवाज़ा खोलो|दरवाजा खोलो/i;
/** The same places in Hindi (Devanagari) or Hinglish, mapped to the English key. */
const PLACE_HI: [RegExp, string][] = [
  [/बाज़ार|बाजार|\bbaz(?:a)?ar\b/i, "market"], [/मंडी|\bmandi\b/i, "mandi"], [/मंदिर|\bmandir\b/i, "temple"],
  [/गुरुद्वार|\bgurdwar/i, "gurdwara"], [/दुकान|\bdukaa?n\b/i, "shop"], [/स्टेशन/, "station"], [/स्कूल/, "school"],
  [/बैंक/, "bank"], [/अस्पताल|\baspatal\b/i, "hospital"], [/डॉक्टर|डाक्टर/, "doctor"], [/गाँव|गांव|\bpind\b|\bgaon\b/i, "village"],
  [/खेत|\bkhet\b/i, "fields"], [/दफ़्तर|दफ्तर|ऑफ़िस/, "office"],
];

export interface NightResult { say: string; night: boolean; alert?: FamilyAlert }

export function placeIn(text: string): string | undefined {
  return PLACE.exec(text)?.[1]?.toLowerCase() ?? PLACE_HI.find(([re]) => re.test(text))?.[1];
}

export async function nightReassure(ctx: Ctx, text: string): Promise<NightResult> {
  const { graph, household, elder, admin } = ctx;
  const now = ctx.clock.now();
  const night = minutesOfDay(now, household.tz) < parseHHMM(NIGHT_END);
  const V = voice(ctx);
  if (!night) return { say: V.goingOutDaytime(admin.name), night: false };

  const place = placeIn(text);
  const say = place
    ? `${V.nightReassure(elder.name)} ${V.nightPlaceReassure(placeName(ctx, place))}` : V.nightReassure(elder.name);

  // Dim night light on, whatever routine_state last did.
  for (const d of await graph.find<Device>("Device", { room: "bedroom", kind: "light" })) {
    if (d.state !== "dim") await graph.upsert("Device", { id: d.id, state: "dim" });
  }

  const since = new Date(now.getTime() - ESCALATE_WINDOW_MIN * 60_000).toISOString();
  // findRange is [from, to): end just after now so an ask at this same instant counts (a demo clock is frozen).
  const until = new Date(now.getTime() + 1).toISOString();
  const recent = (await graph.findRange<AskEvent>("AskEvent", "at", since, until))
    .filter((a) => a.intent === "night_out");
  await logAsk(ctx, "night_out", place ?? "out");

  let alert: FamilyAlert | undefined;
  if (recent.length >= 1 || LEAVING.test(text)) {
    // One alert per night episode: skip if one was raised inside the window already.
    const open = (await graph.findRange<FamilyAlert>("FamilyAlert", "at", since, until))[0];
    if (!open) {
      alert = {
        id: newId("alert"), at: now.toISOString(), kind: "night", acknowledged: false,
        say: P.nightAlert(elder.name, fmtTime(now, household.tz), place), ...(place ? { place } : {}),
      };
      await graph.upsert("FamilyAlert", { ...alert });
      const event: RoutineEvent = {
        id: newId("routine-night"), kind: "night", at: now.toISOString(),
        actions: ["night light dim", "reassured", "family alerted"], escalated: true,
      };
      await graph.upsert("RoutineEvent", { ...event });
    }
  }
  return { say, night: true, ...(alert ? { alert } : {}) };
}

export async function familyAlerts(ctx: Ctx): Promise<FamilyAlert[]> {
  return (await ctx.graph.find<FamilyAlert>("FamilyAlert")).sort((a, b) => (a.at < b.at ? 1 : -1));
}

export async function acknowledgeAlert(ctx: Ctx, id: string): Promise<void> {
  if (!(await ctx.graph.get<FamilyAlert>("FamilyAlert", id))) throw new Error("no such alert");
  await ctx.graph.upsert("FamilyAlert", { id, acknowledged: true });
}
