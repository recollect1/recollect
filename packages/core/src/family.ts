// Family page operations (§13): setup, consent, stories, "This is me". Read and written through
// the Graph port, so they run on both adapters. Nothing here is spoken to the elder.
import type { Ctx } from "./ctx.ts";
import { newId } from "./text.ts";
import { isoWeek } from "./time.ts";
import type {
  Consent, Entity, Medicine, Person, Photo, Profile, Quote, Schedule, Session, StoryPrompt, Visit, WeeklyPhoto,
} from "./types.ts";

export interface FamilyOverview {
  elder: { id: string; name: string };
  admin: { id: string; name: string };
  people: Pick<Person, "id" | "name" | "relation" | "relationToElder" | "statusLine" | "photoUrl">[];
  medicines: (Medicine & { times: string[] })[];
  visits: Visit[];
  photos: Photo[];
  weeklyPhotoId: string | null;
  consent: Consent | null;
}

export async function familyOverview(ctx: Ctx): Promise<FamilyOverview> {
  const { graph, elder, admin } = ctx;
  const [people, medicines, schedules, visits, photos, weekly, consent] = await Promise.all([
    graph.find<Person>("Person"), graph.find<Medicine>("Medicine"), graph.find<Schedule>("Schedule"),
    graph.find<Visit>("Visit"), graph.find<Photo>("Photo"), graph.find<WeeklyPhoto>("WeeklyPhoto"),
    graph.find<Consent>("Consent", { personId: elder.id }),
  ]);
  const latestWeekly = weekly.sort((a, b) => (a.week < b.week ? 1 : -1))[0];
  return {
    elder: { id: elder.id, name: elder.name },
    admin: { id: admin.id, name: admin.name },
    people: people.filter((p) => p.id !== elder.id).map(({ id, name, relation, relationToElder, statusLine, photoUrl }) =>
      ({ id, name, relation, ...(relationToElder ? { relationToElder } : {}), ...(statusLine ? { statusLine } : {}), ...(photoUrl ? { photoUrl } : {}) })),
    medicines: medicines.map((m) => ({
      ...m, times: schedules.filter((s) => s.medicineId === m.id).map((s) => s.time).sort(),
    })),
    visits,
    photos,
    weeklyPhotoId: latestWeekly?.photoId ?? null,
    consent: consent[0] ?? null,
  };
}

// ---------- stories (private ones never shown, §1.6) ----------

export interface FamilyStory { sessionId: string; startedAt: string; quotes: string[]; retold: boolean }

export async function familyStories(ctx: Ctx): Promise<{ stories: FamilyStory[]; privateCount: number; prompts: StoryPrompt[] }> {
  const { graph, elder } = ctx;
  const sessions = (await graph.find<Session>("Session", { speakerId: elder.id }))
    .filter((s) => s.mode === "story")
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  const stories: FamilyStory[] = [];
  let privateCount = 0;
  for (const s of sessions) {
    if (s.private) { privateCount++; continue; }
    const quotes = (await graph.out<Quote>(["Session", s.id], "HAS_QUOTE")).map((n) => n.node).sort((a, b) => a.seq - b.seq);
    let retold = false;
    for (const q of quotes) if ((await graph.out(["Quote", q.id], "RETELLS")).length) { retold = true; break; }
    stories.push({ sessionId: s.id, startedAt: s.startedAt, quotes: quotes.map((q) => q.text), retold });
  }
  const prompts = (await graph.find<StoryPrompt>("StoryPrompt", { used: false }));
  return { stories, privateCount, prompts };
}

// ---------- setup ----------

export async function setStatusLine(ctx: Ctx, personId: string, statusLine: string): Promise<void> {
  const person = await ctx.graph.get<Person>("Person", personId);
  if (!person || person.id === ctx.elder.id) throw new FamilyError("no such family member");
  await ctx.graph.upsert("Person", { id: personId, statusLine: statusLine.trim().replace(/[.\s]+$/, "") });
}

export interface MedicineInput { id?: string; name: string; purpose: string; aliases: string[]; times: string[] }

export async function saveMedicine(ctx: Ctx, input: MedicineInput): Promise<string> {
  const { graph } = ctx;
  if (!input.name.trim()) throw new FamilyError("a medicine needs a name");
  const bad = input.times.find((t) => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(t));
  if (bad) throw new FamilyError(`"${bad}" is not a time like 08:00`);
  const id = input.id ?? newId("m");
  await graph.upsert("Medicine", {
    id, name: input.name.trim(), purpose: input.purpose.trim(),
    aliases: input.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean),
  });
  for (const s of await graph.find<Schedule>("Schedule", { medicineId: id })) await graph.remove("Schedule", s.id);
  for (const time of input.times) {
    const hhmm = time.padStart(5, "0");
    await graph.upsert("Schedule", { id: `${id}-${hhmm.replace(":", "")}`, medicineId: id, time: hhmm, qty: 1 });
  }
  return id;
}

export async function chooseWeeklyPhoto(ctx: Ctx, photoId: string): Promise<void> {
  if (!(await ctx.graph.get<Photo>("Photo", photoId))) throw new FamilyError("no such photo");
  const week = isoWeek(ctx.clock.now(), ctx.household.tz);
  // The same photo every week from now on; this week's entry is replaced if she has not described it yet.
  await ctx.graph.upsert("WeeklyPhoto", { id: `wp-${week}`, photoId, week });
}

// ---------- consent (§1.6): two steps to switch on, either side can switch off ----------

export interface ConsentChange {
  /** Step 1: the family confirms Gurdev herself said yes (ideally recorded with her present). */
  elderAgreed?: boolean;
  /** Step 2: the family admin's own agreement. */
  familyAgreed?: boolean;
  /** Full-voice mode (§2): only while change tracking is on. */
  fullVoice?: boolean;
  /** Switch tracking off now; both steps are needed to switch it on again. */
  off?: boolean;
}

export async function changeConsent(ctx: Ctx, change: ConsentChange): Promise<Consent> {
  const { graph, elder } = ctx;
  const now = ctx.clock.now().toISOString();
  const current = (await graph.find<Consent>("Consent", { personId: elder.id }))[0];
  let next: Consent = current ?? { id: newId("c"), personId: elder.id, trackingOn: false, fullVoiceOn: false };
  if (change.off) {
    next = { id: next.id, personId: elder.id, trackingOn: false, fullVoiceOn: false };
  } else {
    if (change.elderAgreed) next = { ...next, byElderAt: now };
    if (change.familyAgreed) next = { ...next, byFamilyAt: now };
    next.trackingOn = Boolean(next.byElderAt && next.byFamilyAt);
    if (change.fullVoice !== undefined) next.fullVoiceOn = change.fullVoice && next.trackingOn;
    if (!next.trackingOn) next.fullVoiceOn = false;
  }
  // Clearing a stamp needs an explicit null (the Falkor adapter skips undefined).
  await graph.upsert("Consent", {
    ...next, byElderAt: next.byElderAt ?? null, byFamilyAt: next.byFamilyAt ?? null,
  });
  return next;
}

/**
 * "Delete everything" (§1.6): her stories, everything learned from them, every marker, trend and
 * question log. Household setup (people, medicines, schedules, photos, profile) stays so Recollect
 * keeps working; tracking is switched off.
 */
export const PERSONAL_LABELS = [
  "Session", "Quote", "Entity", "StoryPrompt", "MarkerSet", "Baseline", "TrendFlag", "TrendCard",
  "AskEvent", "DoseEvent", "RoutineEvent", "WeeklyPhoto", "Job",
] as const;

export async function deleteEverything(ctx: Ctx): Promise<{ removed: number }> {
  const { graph } = ctx;
  let removed = 0;
  for (const label of PERSONAL_LABELS) {
    for (const n of await graph.find<{ id: string }>(label)) { await graph.remove(label, n.id); removed++; }
  }
  await changeConsent(ctx, { off: true });
  await graph.upsert("Profile", { id: ctx.elder.id, approvedFacts: [] });
  await ctx.index.load(graph);
  return { removed };
}

// ---------- "This is me" (§9.5): family-written fields + family-approved facts only ----------

const PROFILE_LISTS = ["likes", "calms", "upsets", "routines", "communicationTips"] as const;
export type ProfileEdit = Partial<Pick<Profile, "preferredName" | (typeof PROFILE_LISTS)[number]>>;

export async function saveProfile(ctx: Ctx, edit: ProfileEdit): Promise<void> {
  const clean: Record<string, unknown> = {};
  if (edit.preferredName !== undefined) clean.preferredName = edit.preferredName.trim();
  for (const k of PROFILE_LISTS) {
    const v = edit[k];
    if (v !== undefined) clean[k] = v.map((s) => s.trim()).filter(Boolean);
  }
  const existing = await ctx.graph.get<Profile>("Profile", ctx.elder.id);
  await ctx.graph.upsert("Profile", {
    ...(existing ?? { personId: ctx.elder.id, preferredName: ctx.elder.name, likes: [], calms: [], upsets: [],
      routines: [], communicationTips: [], approvedFacts: [] }),
    ...clean, id: ctx.elder.id,
  });
}

/**
 * Facts suggested from her stories: people and places she names in two or more stories.
 * They appear on "This is me" only after the family approves them.
 */
export async function factCandidates(ctx: Ctx): Promise<string[]> {
  const { graph } = ctx;
  const profile = await graph.get<Profile>("Profile", ctx.elder.id);
  const approved = new Set(profile?.approvedFacts ?? []);
  const out: string[] = [];
  for (const e of await graph.find<Entity>("Entity")) {
    if (e.kind !== "person" && e.kind !== "place") continue;
    const quotes = (await graph.into<Quote>(["Entity", e.id], "MENTIONS")).map((m) => m.node).filter((q) => !q.private);
    const stories = new Set(quotes.map((q) => q.sessionId)).size;
    if (stories < 2) continue;
    const fact = `Often talks about ${e.name}`;
    if (!approved.has(fact)) out.push(fact);
  }
  return out.sort();
}

export async function approveFact(ctx: Ctx, fact: string, approve = true): Promise<void> {
  const profile = await ctx.graph.get<Profile>("Profile", ctx.elder.id);
  if (!profile) throw new FamilyError("write the profile first");
  if (approve && !(await factCandidates(ctx)).includes(fact)) throw new FamilyError("not a suggested fact");
  const facts = new Set(profile.approvedFacts);
  if (approve) facts.add(fact); else facts.delete(fact);
  await ctx.graph.upsert("Profile", { id: profile.id, approvedFacts: [...facts] });
}

export class FamilyError extends Error {}
