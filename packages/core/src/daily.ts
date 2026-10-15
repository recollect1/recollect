// Daily-life tools: today, doses, where-is, who's-who, routines, family summary.
// Same calm answer every time (§1.4): repeats are logged as AskEvents, never mentioned.
import type { Ctx } from "./ctx.ts";
import * as P from "./phrases.ts";
import { newId, normalise } from "./text.ts";
import { fmtHHMM, fmtTime, isoWeek, localAt, localDayBounds, localParts, minutesOfDay, parseHHMM } from "./time.ts";
import type {
  AskEvent, AskIntent, Consent, Device, DoseEvent, Entity, Medicine, Person, Profile, RoutineEvent,
  Schedule, Session, TrendCard, Visit, WeeklyPhoto,
} from "./types.ts";

/** How long before a slot's time a dose still counts towards that slot. */
const SLOT_GRACE_MIN = 90;
/**
 * "Your next tablet" names only a dose that is coming up or at most this late. An older missed
 * dose is never offered as "next": that could prompt a late or double dose. Missed doses show on
 * the family page instead (§1.5).
 */
const NEXT_DOSE_LATE_MIN = 60;

export async function logAsk(ctx: Ctx, intent: AskIntent, detail = ""): Promise<void> {
  const ask: AskEvent = { id: newId("ask"), intent, detail, at: ctx.clock.now().toISOString() };
  await ctx.graph.upsert("AskEvent", { ...ask });
  await ctx.graph.link(["Person", ctx.elder.id], "ASKED", ["AskEvent", ask.id]);
}

// ---------- doses ----------

export interface DoseSlot { medicine: Medicine; time: string; taken: boolean; takenAt?: string }

/** Today's slots per medicine. The n-th dose logged today covers that medicine's n-th slot. */
async function todaysDoses(ctx: Ctx): Promise<{ slots: DoseSlot[]; events: DoseEvent[] }> {
  const { graph, household } = ctx;
  const now = ctx.clock.now();
  const { from, to } = localDayBounds(now, household.tz);
  const [medicines, schedules, events] = await Promise.all([
    graph.find<Medicine>("Medicine"), graph.find<Schedule>("Schedule"),
    graph.findRange<DoseEvent>("DoseEvent", "at", from, to),
  ]);
  const slots: DoseSlot[] = [];
  for (const medicine of medicines) {
    const times = schedules.filter((s) => s.medicineId === medicine.id).map((s) => s.time).sort();
    const logged = events.filter((e) => e.medicineId === medicine.id);
    times.forEach((time, i) => {
      const e = logged[i];
      slots.push({ medicine, time, taken: Boolean(e), ...(e ? { takenAt: fmtTime(new Date(e.at), household.tz) } : {}) });
    });
  }
  slots.sort((a, b) => parseHHMM(a.time) - parseHHMM(b.time));
  return { slots, events };
}

function findMedicine(slots: DoseSlot[], spoken: string | undefined, nowMin: number): Medicine | undefined {
  if (spoken?.trim()) {
    const want = normalise(spoken.replace(/\b(my|the|tablets?|pills?|medicines?)\b/gi, " ")).trim();
    return slots.map((s) => s.medicine).find((m) =>
      [m.name, ...m.aliases].some((a) => normalise(a.replace(/\b(tablet|medicine)\b/gi, " ")).trim() === want));
  }
  // No medicine named: the tablet whose slot is current.
  const due = slots.filter((s) => parseHHMM(s.time) <= nowMin + SLOT_GRACE_MIN);
  return (due[due.length - 1] ?? slots[0])?.medicine;
}

/** The slot of this medicine that "now" belongs to: the latest one already due, else the first. */
function currentSlot(slots: DoseSlot[], medicine: Medicine, nowMin: number): DoseSlot | undefined {
  const mine = slots.filter((s) => s.medicine.id === medicine.id);
  const due = mine.filter((s) => parseHHMM(s.time) <= nowMin + SLOT_GRACE_MIN);
  return due[due.length - 1] ?? mine[0];
}

export async function checkDose(ctx: Ctx, spoken?: string): Promise<{ say: string; medicine?: string; taken?: boolean }> {
  const nowMin = minutesOfDay(ctx.clock.now(), ctx.household.tz);
  const { slots } = await todaysDoses(ctx);
  const medicine = findMedicine(slots, spoken, nowMin);
  const slot = medicine && currentSlot(slots, medicine, nowMin);
  await logAsk(ctx, "check_dose", medicine?.name ?? spoken ?? "");
  if (!medicine || !slot) return { say: P.medicineUnknown(ctx.admin.name) };
  const say = slot.taken && slot.takenAt
    ? P.doseTaken(medicine.name, slot.takenAt) : P.doseNotYet(medicine.name, fmtHHMM(slot.time));
  return { say, medicine: medicine.name, taken: slot.taken };
}

export async function logDose(ctx: Ctx, spoken: string, at?: Date): Promise<{ say: string; logged: boolean }> {
  const { graph, household, elder, admin } = ctx;
  const when = at ?? ctx.clock.now();
  const nowMin = minutesOfDay(when, household.tz);
  const { slots } = await todaysDoses(ctx);
  const medicine = findMedicine(slots, spoken, nowMin);
  const slot = medicine && currentSlot(slots, medicine, nowMin);
  if (!medicine || !slot) return { say: P.medicineUnknown(admin.name), logged: false };
  if (slot.taken && slot.takenAt) return { say: P.doseAlreadyLogged(medicine.name, slot.takenAt, admin.name), logged: false };
  const dose: DoseEvent = { id: newId("dose"), medicineId: medicine.id, at: when.toISOString() };
  await graph.upsert("DoseEvent", { ...dose });
  await Promise.all([
    graph.link(["Person", elder.id], "LOGGED", ["DoseEvent", dose.id]),
    graph.link(["DoseEvent", dose.id], "OF", ["Medicine", medicine.id]),
  ]);
  return { say: P.doseLogged(medicine.name, fmtTime(when, household.tz)), logged: true };
}

// ---------- today ----------

export interface TodayCard {
  weekday: string; date: string; visitors: { name: string; time: string; kind: string }[];
  doses: { name: string; time: string; taken: boolean; takenAt?: string }[];
}

export async function whatsToday(ctx: Ctx): Promise<{ say: string; card: TodayCard }> {
  const { graph, household } = ctx;
  const p = localParts(ctx.clock.now(), household.tz);
  const [{ slots }, visits, people] = await Promise.all([
    todaysDoses(ctx), graph.find<Visit>("Visit"), graph.find<Person>("Person"),
  ]);
  const name = (id: string) => people.find((x) => x.id === id)?.name ?? "";
  const todays = visits.filter((v) => v.daysOfWeek.includes(p.weekday)).sort((a, b) => parseHHMM(a.time) - parseHHMM(b.time));
  const visitorLine = todays.length
    ? todays.map((v) => (v.kind === "call" ? P.visitorCalls(name(v.personId)) : P.visitorComes(name(v.personId), fmtHHMM(v.time)))).join(", and ")
    : P.noVisitors();
  const nowMin = minutesOfDay(ctx.clock.now(), household.tz);
  const next = slots.find((s) => !s.taken && parseHHMM(s.time) >= nowMin - NEXT_DOSE_LATE_MIN);
  const nextLine = next ? P.nextDose(next.medicine.name, fmtHHMM(next.time)) : P.noMoreDoses();
  await logAsk(ctx, "whats_today");
  return {
    say: P.today(p.weekdayName, p.day, p.monthName, visitorLine, nextLine),
    card: {
      weekday: p.weekdayName, date: `${p.day} ${p.monthName}`,
      visitors: todays.map((v) => ({ name: name(v.personId), time: fmtHHMM(v.time), kind: v.kind })),
      doses: slots.map((s) => ({
        name: s.medicine.name, time: fmtHHMM(s.time), taken: s.taken, ...(s.takenAt ? { takenAt: s.takenAt } : {}),
      })),
    },
  };
}

// ---------- people ----------

async function findPerson(ctx: Ctx, spoken: string): Promise<Person | undefined> {
  const want = normalise(spoken.replace(/\b(my|the|our)\b/gi, " ")).trim();
  if (!want) return undefined;
  const people = (await ctx.graph.find<Person>("Person")).filter((p) => p.id !== ctx.elder.id);
  return people.find((p) => [p.name, p.relation, ...p.aliases].some((a) => normalise(a).trim() === want));
}

export async function whereIs(ctx: Ctx, spoken: string): Promise<{ say: string; person?: string }> {
  const person = await findPerson(ctx, spoken);
  await logAsk(ctx, "where_is", person?.name ?? spoken);
  if (!person?.statusLine) return { say: P.whoIsUnknown(ctx.admin.name) };
  return { say: P.personStatus(person.name, person.statusLine), person: person.name };
}

export interface WhoCard { name: string; relationToElder: string; statusLine?: string; photoUrl?: string }

export async function whoIs(
  ctx: Ctx, input: { name?: string; photoId?: string }, role: "elder" | "family",
): Promise<{ say: string; card?: WhoCard }> {
  const { graph, admin } = ctx;
  let person: Person | undefined;
  if (input.name) person = await findPerson(ctx, input.name);
  else if (input.photoId) {
    // Photo -DEPICTS-> Entity -SAME_AS-> Person; a photo of one person identifies that person.
    const depicted = await graph.out<Entity>(["Photo", input.photoId], "DEPICTS");
    if (depicted.length === 1 && depicted[0])
      person = (await graph.out<Person>(["Entity", depicted[0].node.id], "SAME_AS"))[0]?.node;
  }
  if (role === "elder") await logAsk(ctx, "who_is", person?.name ?? input.name ?? "");
  if (!person?.relationToElder) return { say: P.whoIsUnknown(admin.name) };
  const extra = person.statusLine ? P.personStatus(person.name, person.statusLine) : undefined;
  return {
    say: P.whoIs(person.name, person.relationToElder, extra),
    card: {
      name: person.name, relationToElder: person.relationToElder,
      ...(person.statusLine ? { statusLine: person.statusLine } : {}),
      ...(person.photoUrl ? { photoUrl: person.photoUrl } : {}),
    },
  };
}

// ---------- consent ----------

export async function pauseTracking(ctx: Ctx): Promise<{ say: string }> {
  const consent = (await ctx.graph.find<Consent>("Consent", { personId: ctx.elder.id }))[0];
  await ctx.graph.upsert("Consent", {
    id: consent?.id ?? newId("c"), personId: ctx.elder.id, trackingOn: false, fullVoiceOn: false,
  });
  return { say: P.trackingPaused(ctx.admin.name) };
}

// ---------- routines (§9.4) ----------

export const EVENING_START = "17:00"; // dusk − 30 min when known; 17:00 otherwise
const EVENING_END = "22:00";
const NIGHT_END = "05:00";
/**
 * Weekly photo (§9.4): offered in a calm late-morning window, never in the evening or at night,
 * on any day of the week until that week's description has been saved. So it is offered at most
 * once a week, and a missed day simply moves it to the next.
 */
export const PHOTO_WINDOW = ["11:00", "12:00"] as const;

export interface RoutineState {
  routine: "evening" | "night" | "none"; shortReplies: boolean; greeting?: string;
  devices: Device[]; localTime: string;
  /** True when the simulator should offer this week's photo now (photo_moment). */
  photoDue: boolean;
  /** ISO week in household time, so a client offers the photo once per week. */
  week: string;
}

export async function routineState(ctx: Ctx): Promise<RoutineState> {
  const { graph, household, elder } = ctx;
  const now = ctx.clock.now();
  const min = minutesOfDay(now, household.tz);
  const routine = min >= parseHHMM(EVENING_START) && min < parseHHMM(EVENING_END) ? "evening"
    : min < parseHHMM(NIGHT_END) ? "night" : "none";
  const want: Record<string, string> = routine === "evening"
    ? { "living room/light": "on", "living room/speaker": "playing familiar music", "bedroom/light": "off" }
    : routine === "night"
      ? { "living room/light": "off", "living room/speaker": "idle", "bedroom/light": "dim" }
      : { "living room/light": "off", "living room/speaker": "idle", "bedroom/light": "off" };
  const devices = await graph.find<Device>("Device");
  await Promise.all(devices.map(async (d) => {
    const state = want[`${d.room}/${d.kind}`] ?? d.state;
    if (state !== d.state) { d.state = state; await graph.upsert("Device", { id: d.id, state }); }
  }));

  let greeting: string | undefined;
  if (routine === "evening") {
    const dayStart = localDayBounds(now, household.tz).from;
    const id = `routine-evening-${dayStart.slice(0, 10)}`;
    if (!(await graph.get<RoutineEvent>("RoutineEvent", id))) {
      const event: RoutineEvent = {
        id, kind: "evening", at: localAt(now, household.tz, EVENING_START).toISOString(),
        actions: ["living room light on", "familiar music", "short replies"], escalated: false,
      };
      await graph.upsert("RoutineEvent", { ...event });
    }
    const profile = await graph.get<Profile>("Profile", elder.id);
    greeting = P.eveningHello(elder.name, profile?.calms[0] ?? "Shall we put on your music?");
  }
  const week = isoWeek(now, household.tz);
  let photoDue = false;
  if (routine === "none" && min >= parseHHMM(PHOTO_WINDOW[0]) && min < parseHHMM(PHOTO_WINDOW[1])) {
    // A photo has been chosen (any WeeklyPhoto entry), and this week's has no saved description.
    // Choosing a photo on the family page also writes this week's entry, without a session.
    const entries = await graph.find<WeeklyPhoto>("WeeklyPhoto");
    photoDue = entries.length > 0 && !entries.some((e) => e.week === week && e.sessionId);
  }
  return {
    routine, shortReplies: routine === "evening", ...(greeting ? { greeting } : {}),
    devices: devices.sort((a, b) => a.id.localeCompare(b.id)), localTime: fmtTime(now, household.tz),
    photoDue, week,
  };
}

// ---------- family ----------

const ASK_LABEL: Record<AskIntent, (detail: string) => string> = {
  where_is: (d) => `where ${d} is`,
  who_is: (d) => `who ${d} is`,
  check_dose: (d) => `about the ${d}`,
  whats_today: () => "what day it is",
  recall: () => "a question about the past",
  night_out: () => "about going out at night",
};

export interface FamilySummary {
  say: string; date: string; doses: TodayCard["doses"]; storiesToday: number;
  repeatedQuestions: { label: string; count: number }[]; note: string;
}

/** Trends and counts only — never private stories, never raw audio (§1.6). */
export async function familySummary(ctx: Ctx, date?: string): Promise<FamilySummary> {
  const { graph, household, elder } = ctx;
  const day = date ? new Date(`${date}T12:00:00Z`) : ctx.clock.now();
  const { from, to } = localDayBounds(day, household.tz);
  const [medicines, schedules, events, asks, sessions] = await Promise.all([
    graph.find<Medicine>("Medicine"), graph.find<Schedule>("Schedule"),
    graph.findRange<DoseEvent>("DoseEvent", "at", from, to),
    graph.findRange<AskEvent>("AskEvent", "at", from, to),
    graph.findRange<Session>("Session", "startedAt", from, to),
  ]);
  const doses: TodayCard["doses"] = [];
  for (const m of medicines) {
    const logged = events.filter((e) => e.medicineId === m.id);
    schedules.filter((s) => s.medicineId === m.id).map((s) => s.time).sort().forEach((time, i) => {
      const e = logged[i];
      doses.push({ name: m.name, time: fmtHHMM(time), taken: Boolean(e), ...(e ? { takenAt: fmtTime(new Date(e.at), household.tz) } : {}) });
    });
  }
  const counts = new Map<string, number>();
  for (const a of asks) {
    const label = ASK_LABEL[a.intent](a.detail);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const repeatedQuestions = [...counts].filter(([, n]) => n >= 2).map(([label, count]) => ({ label, count }));
  const storiesToday = sessions.filter((s) => s.mode === "story" && s.speakerId === elder.id).length;
  const p = localParts(day, household.tz);
  return {
    say: P.familySummary(elder.name, doses.filter((d) => d.taken).length, doses.length, storiesToday,
      repeatedQuestions.map((r) => P.repeatLine(r.label, r.count))),
    date: `${p.day} ${p.monthName}`, doses, storiesToday, repeatedQuestions, note: P.REPEATS_NORMAL,
  };
}

/** The latest stored trend card. Never computed in the call (§10): the trends agent writes it. */
export async function speechTrend(ctx: Ctx): Promise<{ say: string; card?: TrendCard }> {
  const { graph, elder } = ctx;
  const consent = (await graph.find<Consent>("Consent", { personId: elder.id }))[0];
  if (!consent?.trackingOn) return { say: P.trackingOff(elder.name) };
  const card = (await graph.find<TrendCard>("TrendCard", { personId: elder.id }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  return card ? { say: card.say, card } : { say: P.trendNotReady(elder.name) };
}

export interface ThisIsMe { name: string; profile: Profile; people: { name: string; relation: string }[] }

/** Only family-written fields and family-approved facts (§9.5). */
export async function thisIsMe(ctx: Ctx): Promise<{ say: string; card?: ThisIsMe }> {
  const { graph, elder } = ctx;
  const profile = await graph.get<Profile>("Profile", elder.id);
  if (!profile) return { say: P.thisIsMeMissing(elder.name) };
  const people = (await graph.find<Person>("Person"))
    .filter((p) => p.id !== elder.id && p.relationToElder)
    .map((p) => ({ name: p.name, relation: p.relationToElder ?? p.relation }));
  return { say: P.thisIsMeReady(elder.name), card: { name: elder.name, profile, people } };
}
