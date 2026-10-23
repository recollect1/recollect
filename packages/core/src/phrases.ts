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

// --- family memory network ---
/** A family member's own memory, quoted verbatim and always attributed. */
export const fromFamilyWords = (quote: string, speakerName: string, date: string) =>
  `${speakerName} told me on ${date}: "${quote}"`;
export const familyMemorySaved = (elderName: string) => `Thank you. I've kept your memory with ${elderName}'s stories.`;
/** Read after where_is; the same words every time until the family changes the message. */
export const messageFrom = (name: string, text: string) => `${name} left you a message: "${text}"`;
export const messageSaved = (elderName: string) => `Saved. ${elderName} will hear it when she asks where you are.`;

// --- memory fidelity: a chat about her day, never a quiz ---
export const todayChatPrompt = (name: string) => `${name}, tell me about your day. Did anyone come to see you?`;
/** Identical whatever she says: it never confirms, corrects or hints at the right answer (§1.4). */
export const todayChatThanks = () => "Thank you for telling me about your day.";

// --- Memory Lane ---
export const memoryLaneIntro = (name: string) =>
  `${name}, shall we look through some of your memories together? There's no right or wrong answer.`;
export const memoryLanePrompt = (topic: string) => `Would you tell me more about ${topic}?`;
export const memoryLaneEmpty = () => "There are no stories to look through yet. Would you like to tell me one?";

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

// --- family only: memory fidelity ---
export const RIBOT_NOTE =
  "In memory loss, recent memories often fade before old ones. Recollect compares her only with herself.";
export const recentVsOld = (name: string, named: number, chats: number, perStory: number) =>
  `In the last four weeks, ${name} named who had visited or called in ${named} of ${chats} chats about her day, ` +
  `while her stories from long ago name about ${perStory} people, places and things each. ${RIBOT_NOTE} ${NOT_MEDICAL}`;
export const recentNotReady = (name: string) =>
  `Recollect has not had enough chats with ${name} about her day to compare recent and long-ago memories yet.`;
export const retellSummary = (name: string, kept: number, total: number) =>
  `When ${name} told this story again, ${kept} of ${total} details from her earlier telling were the same.`;

// --- family only: carer coach (fixed, reviewed wording; the starter quotes her own stories) ---
export const coachStarter = (topic: string, quote: string, date: string) =>
  `Ask her about ${topic}. She told Recollect on ${date}: "${quote}"`;
export const COACH: Record<string, { title: string; guidance: string }> = {
  parent: {
    title: "When she asks for her mother or father",
    guidance: "Don't correct her or tell her they have died; that can feel like hearing it for the first time. " +
      "Ask about them instead, and stay with the feeling she is showing.",
  },
  going_out: {
    title: "When she wants to go out or go home",
    guidance: "Agree calmly, then offer something first: tea, a short walk in the courtyard, or a story. " +
      "Arguing about whether she can go usually makes it harder.",
  },
  repeats: {
    title: "When she asks the same thing again",
    guidance: "Answer as if it were the first time, in the same calm words. Recollect does the same.",
  },
  evening: {
    title: "In the late afternoon and evening",
    guidance: "Keep the room bright and quiet, slow down, and offer something familiar from her profile.",
  },
};

// --- family only: care follow-through (prepared for approval; Recollect never books or buys) ---
export const CARE_TITLES = {
  summary: "Pre-visit summary for her doctor",
  questions: "Questions to ask at the check-up",
  appointment: "Book a check-up in the next two weeks",
  memory_book: "A printed book of her stories",
  tablet_check: "Check her tablets will last until the visit",
} as const;
export const careSummary = (name: string, trendSay: string, sessions: number, weeks: number) =>
  `${trendSay} Based on ${sessions} everyday conversations over ${weeks} weeks. The doctor report has the charts.`;
export const careAppointment = (name: string) =>
  `Recollect has prepared a calendar invitation for a check-up for ${name}. Choose a time with her doctor's surgery, ` +
  `then add it to your calendar. Recollect does not book appointments itself.`;
export const careMemoryBook = (name: string, stories: number) =>
  `A printable book of ${stories} of ${name}'s stories, in her own words, for the family and her carers. ` +
  `Print it at home or send the file to a print shop; Recollect does not place orders.`;
export const coachReady = (name: string) =>
  `Here are some ideas for talking with ${name}, built from her own stories.`;
export const careReady = (name: string, steps: number) =>
  `Recollect has prepared ${steps} next steps for ${name}'s check-up, for you to approve on the family page.`;
export const careNone = (name: string) =>
  `Nothing to prepare for ${name} at the moment: her speech has not changed enough to mention.`;
export const familyMemoryNoStory = () =>
  "I couldn't find which of her stories that is about, so I've kept it on its own.";
export const careTabletCheck = (admin: string) =>
  `Before the visit, check with the pharmacy that her regular tablets will last until then. ` +
  `Recollect lists them below; ${admin} or the pharmacy decides everything about them.`;

// --- "Ask Biji": questions from the family, asked at a calm moment (her answer is kept verbatim) ---
export const familyQuestionPrompt = (asker: string, question: string) =>
  `${asker} would love to know: "${question}" Would you tell me about it? There's no right or wrong answer.`;
export const familyQuestionThanks = (asker: string) => `Thank you. I've kept that, and I'll keep it for ${asker} too.`;
export const questionLater = () => "Alright, we can talk about it another time.";
export const noFamilyQuestion = () => "There are no questions from the family just now.";
/** Family-facing. */
export const questionQueued = (elder: string) =>
  `Saved. Recollect will ask ${elder} at a calm time of day, once a day at most, and keep her answer in her own words.`;
export const questionAnswered = (elder: string, asker: string) => `${elder} answered ${asker}'s question.`;

// --- good morning (the same calm words every day) ---
export const goodMorning = (name: string, todayLine: string) => `Good morning, ${name}. ${todayLine}`;

// --- family: missed tablets, weekly digest, carer check-in ---
export const missedDoseNote = (name: string, medicine: string, time: string) =>
  `${name}'s ${time} ${medicine} isn't marked as taken yet. Recollect never suggests a late or extra tablet to her; ` +
  `please check with her, or with her doctor if you're unsure.`;
export const weeklyDigest = (name: string, stories: number, familyMemories: number, answered: number,
  taken: number, scheduled: number, repeats: string[]) =>
  `This week ${name} told ${stories} ${stories === 1 ? "story" : "stories"}` +
  `${familyMemories ? `, the family added ${familyMemories} ${familyMemories === 1 ? "memory" : "memories"}` : ""}` +
  `${answered ? `, and she answered ${answered} family ${answered === 1 ? "question" : "questions"}` : ""}. ` +
  `Tablets marked: ${taken} of ${scheduled}.` +
  `${repeats.length ? ` Questions she asked most: ${repeats.join("; ")}.` : ""}`;
export const CARER_PROMPT = (admin: string) => `How are you doing this week, ${admin}?`;
export const CARER_REPLIES: Record<"ok" | "tired" | "struggling", string> = {
  ok: "Glad to hear it. Thank you for everything you do for her.",
  tired: "Caring is tiring. If you can, ask another family member or her helper to cover an afternoon this week, " +
    "and take that time for yourself.",
  struggling: "Thank you for saying so. You don't have to manage this alone: please talk to someone you trust, " +
    "her doctor, or a local carers' support group about getting more help.",
};
export const timelineReady = (name: string, stories: number, dated: number) =>
  `${name}'s life timeline has ${stories} ${stories === 1 ? "story" : "stories"}, ${dated} of them placed in a year. ` +
  `Open it on the family page.`;
