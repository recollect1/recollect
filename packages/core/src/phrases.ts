// Every sentence Recollect speaks or shows comes from here (CLAUDE.md §8).
// No model writes memory, medicine or trend wording. Wording never varies with repeat counts.

// Trend wording is shared with the Python trends agent, so both read the same file.
import trend from "./trend-phrases.json" with { type: "json" };

/** §1.2 — banned in every family card, report and spoken line (case-insensitive). */
export const BANNED_CLAIMS: string[] = trend.bannedClaims;
/** §1.5 — banned in any medicine response (case-insensitive). */
export const BANNED_MEDICINE = [
  "safe to", "you can take", "it's fine", "no problem", "stop taking", "increase", "decrease",
  "double", "skip",
];
export const NOT_MEDICAL: string = trend.notMedical;

export function findBanned(text: string, list: string[]): string[] {
  const t = text.toLowerCase();
  return list.filter((w) => t.includes(w));
}

export type Audience = "elder" | "family";

// --- memory ---
export const fromTheirWords = (quote: string, speakerName: string, date: string, to: Audience = "elder") =>
  to === "elder" ? `You told me on ${date}: "${quote}"` : `${speakerName} said on ${date}: "${quote}"`;
export const nothingRecorded = (topic: string) =>
  `I don't have anything saved about ${topic} yet. Would you like to tell me about it?`;
export const storySaved = () => "Thank you, I've kept that.";
export const privateKept = () => "Alright, I'll keep that just for you.";
// Shared with the Python extract worker, which writes story prompts (§9.1 step 4).
export const storyPromptFor = (entityName: string) =>
  trend.templates.storyPromptFor.replace("{entity}", entityName);
export const storyPromptOpen = () => "Would you like to tell me a story from when you were young?";
// Simulator story mode (§13): spoken before listening, and if nothing was heard.
export const listeningForStory = () => `I'm listening. Take your time, and say "that's all" when you're done.`;
export const didNotCatchStory = () => "I didn't catch the story. Would you like to try again?";

// --- medicine ---
export const doseTaken = (name: string, time: string) => `Yes, you took your ${name} at ${time} today.`;
export const doseNotYet = (name: string, due: string) =>
  `Your ${name} is due at ${due}. It isn't marked as taken yet.`;
export const doseLogged = (name: string, time: string) => `Noted, ${name} at ${time}.`;
export const doseAlreadyLogged = (name: string, time: string, admin: string) =>
  `Your ${name} was already marked at ${time} today. If you're unsure, please ask ${admin}.`;
export const medicineUnknown = (admin: string) =>
  `I'm not sure which tablet you mean. Please ask ${admin}.`;

// --- today ---
export const visitorComes = (name: string, time: string) => `${name} comes at ${time}`;
export const visitorCalls = (name: string) => `${name} calls today`;
export const noVisitors = () => "Nobody is expected today";
export const nextDose = (name: string, time: string) => `Your next tablet is your ${name}, at ${time}.`;
export const noMoreDoses = () => "There are no more tablets on today's list.";
export const today = (weekday: string, d: number, month: string, visitorLine: string, nextDoseLine: string) =>
  `It's ${weekday}, ${d} ${month}. ${visitorLine}. ${nextDoseLine}`;

// --- people ---
export const personStatus = (name: string, statusLine: string) => `${name} ${statusLine}.`;
export const whoIs = (name: string, relationToElder: string, extra?: string) =>
  `That's ${name}, your ${relationToElder}.${extra ? ` ${extra}` : ""}`;
export const whoIsUnknown = (admin: string) => `I'm not sure who that is. ${admin} can add them for me.`;

// --- tracking and consent ---
export const trackingPaused = (admin: string) =>
  `Okay, I've stopped tracking your speech. You can turn it back on with ${admin} any time.`;

// --- routines ---
export const eveningHello = (name: string, offer: string) => `It's evening, ${name}. ${offer}`;
export const nightReassure = (name: string) =>
  `It's night time, ${name}, and everyone is asleep. You're safe at home. Let's rest until morning.`;
/** Daytime answer when she wants to go out: never a refusal, never a test. */
export const goingOutDaytime = (admin: string) =>
  `Of course. Let's ask ${admin} to come with you.`;
export const nightPlaceReassure = (place: string) =>
  `The ${place} opens in the morning. We can go after breakfast.`;

// --- weekly photo ---
export const weeklyPhotoPrompt = (name: string) =>
  `${name}, would you tell me about this photo? There's no right or wrong answer.`;
export const photoThanks = () => "Thank you, I loved hearing that.";
export const photoLater = () => "Alright, we can look at it another time.";
export const noPhotoYet = (admin: string) => `There's no photo chosen yet. ${admin} can pick one for us.`;

// --- family only: never spoken to the elder ---
export const CHANGE_PHRASES: Record<string, string> = Object.fromEntries(
  Object.entries(trend.metrics).map(([metric, m]) => [metric, m.phrase]));
export const TREND_TEMPLATES: Record<string, string> = trend.templates;
const listOf = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
export const trendStable = (name: string, weeks: number) =>
  `${name}'s speech has stayed close to their usual pattern over the last ${weeks} weeks. ${NOT_MEDICAL}`;
export const trendChange = (name: string, metrics: string[], since: string) =>
  `Since ${since}, ${name} ${listOf(metrics.map((m) => CHANGE_PHRASES[m] ?? m))}. ` +
  `Worth mentioning at the next check-up. ${NOT_MEDICAL}`;
export const trendNotReady = (name: string) =>
  `There isn't a trend for ${name} yet. Recollect needs a few weeks of conversations first. ${NOT_MEDICAL}`;
// Night-time family alert (§9.4, P1). Family page only; never spoken to her.
export const NOT_EMERGENCY = "Recollect is not an emergency service. If she may be in danger, call local emergency services.";
export const nightAlert = (name: string, time: string, place?: string) =>
  `${name} was awake at ${time} and wanted to go ${place ? `to the ${place}` : "out"}. ` +
  `Recollect reassured her and turned on the night light. ${NOT_EMERGENCY}`;
export const trackingOff = (name: string) =>
  `Change tracking is turned off for ${name}, so there is no trend to show.`;
export const REPEATS_NORMAL = "Repeats are normal; Recollect answers the same way every time.";
export const familySummary = (name: string, taken: number, due: number, stories: number, repeats: string[]) =>
  `Today ${name} has ${taken} of ${due} tablets marked as taken and told ${stories} ` +
  `${stories === 1 ? "story" : "stories"}.` +
  (repeats.length ? ` Asked more than once: ${listOf(repeats)}. ${REPEATS_NORMAL}` : "");
export const repeatLine = (label: string, count: number) => `${label} (asked ${count} times today)`;
export const thisIsMeReady = (name: string) => `Here is ${name}'s "This is me" page, ready to print.`;
export const thisIsMeMissing = (name: string) => `${name}'s "This is me" page hasn't been written yet.`;
