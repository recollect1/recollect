// Family-only views: tablets not yet marked, the weekly digest, and the family admin's own weekly
// check-in. Fixed wording; nothing here is ever said to her, and nothing advises on medicines.
import type { Ctx } from "./ctx.ts";
import { todaysDoses } from "./daily.ts";
import { FamilyError } from "./family.ts";
import * as P from "./phrases.ts";
import { newId } from "./text.ts";
import { fmtHHMM, isoWeek, minutesOfDay, parseHHMM } from "./time.ts";
import type { AskEvent, CarerCheckin, DoseEvent, FamilyQuestion, Schedule, Session } from "./types.ts";

/** A tablet counts as "not marked" for the family this long after its time. */
export const MISSED_AFTER_MIN = 60;

export interface MissedDose { medicine: string; time: string; say: string }

/** Today's tablets that are well past their time and not marked. Family view only. */
export async function missedDoses(ctx: Ctx): Promise<MissedDose[]> {
  const nowMin = minutesOfDay(ctx.clock.now(), ctx.household.tz);
  const { slots } = await todaysDoses(ctx);
  return slots
    .filter((s) => !s.taken && nowMin >= parseHHMM(s.time) + MISSED_AFTER_MIN)
    .map((s) => ({
      medicine: s.medicine.name, time: fmtHHMM(s.time),
      say: P.missedDoseNote(ctx.elder.name, s.medicine.name, fmtHHMM(s.time)),
    }));
}

const LABEL: Record<string, (d: string) => string> = {
  where_is: (d) => `where ${d} is`, who_is: (d) => `who ${d} is`, check_dose: (d) => `about the ${d}`,
  whats_today: () => "what day it is", recall: () => "about the past", night_out: () => "about going out at night",
};

export interface WeeklyDigest {
  say: string; from: string; to: string; stories: number; familyMemories: number; questionsAnswered: number;
  dayChats: number; photoDescribed: boolean; taken: number; scheduled: number;
  topQuestions: { label: string; count: number }[]; note: string;
}

/** The last seven days, ending now. Counts only: never private stories (§1.6). */
export async function weeklyDigest(ctx: Ctx): Promise<WeeklyDigest> {
  const { graph, elder } = ctx;
  // Up to and including this moment (findRange's upper bound is exclusive).
  const to = new Date(ctx.clock.now().getTime() + 1);
  const from = new Date(to.getTime() - 7 * 24 * 3600_000);
  const [sessions, asks, doses, schedules, questions] = await Promise.all([
    graph.findRange<Session>("Session", "startedAt", from.toISOString(), to.toISOString()),
    graph.findRange<AskEvent>("AskEvent", "at", from.toISOString(), to.toISOString()),
    graph.findRange<DoseEvent>("DoseEvent", "at", from.toISOString(), to.toISOString()),
    graph.find<Schedule>("Schedule"), graph.find<FamilyQuestion>("FamilyQuestion"),
  ]);
  const hers = sessions.filter((s) => s.speakerId === elder.id);
  const stories = hers.filter((s) => s.mode === "story").length;
  const familyMemories = sessions.filter((s) => s.mode === "family").length;
  const dayChats = hers.filter((s) => s.mode === "daily").length;
  const photoDescribed = hers.some((s) => s.mode === "photo_desc");
  const questionsAnswered = questions.filter((q) => q.answeredAt && q.answeredAt >= from.toISOString()).length;
  const counts = new Map<string, number>();
  for (const a of asks) {
    const label = (LABEL[a.intent] ?? (() => a.intent))(a.detail);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const topQuestions = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([label, count]) => ({ label, count }));
  // Seven days of the schedule; today's doses that are not due yet are not counted as scheduled.
  const nowMin = minutesOfDay(to, ctx.household.tz);
  const notYetDue = schedules.filter((s) => parseHHMM(s.time) > nowMin).length;
  const scheduled = schedules.length * 7 - notYetDue;
  const taken = Math.min(doses.length, scheduled);
  return {
    say: P.weeklyDigest(elder.name, stories, familyMemories, questionsAnswered, taken, scheduled,
      topQuestions.map((t) => P.repeatLine(t.label, t.count).replace(" today", " this week"))),
    from: from.toISOString(), to: to.toISOString(), stories, familyMemories, questionsAnswered, dayChats,
    photoDescribed, taken, scheduled, topQuestions, note: P.REPEATS_NORMAL,
  };
}

// ---------- the carer's own check-in ----------

export interface CarerView { prompt: string; due: boolean; latest?: CarerCheckin; reply?: string }

export async function carerView(ctx: Ctx): Promise<CarerView> {
  const week = isoWeek(ctx.clock.now(), ctx.household.tz);
  const mine = (await ctx.graph.find<CarerCheckin>("CarerCheckin", { personId: ctx.admin.id }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const latest = mine[0];
  return {
    prompt: P.CARER_PROMPT(ctx.admin.name), due: !mine.some((c) => c.week === week),
    ...(latest ? { latest, reply: P.CARER_REPLIES[latest.mood] } : {}),
  };
}

export async function carerCheckin(ctx: Ctx, mood: string): Promise<CarerView> {
  if (mood !== "ok" && mood !== "tired" && mood !== "struggling") throw new FamilyError("Choose how you are doing.");
  const week = isoWeek(ctx.clock.now(), ctx.household.tz);
  const c: CarerCheckin = { id: `cc-${ctx.admin.id}-${week}`, personId: ctx.admin.id, week, mood, at: ctx.clock.now().toISOString() };
  await ctx.graph.upsert("CarerCheckin", { ...c });
  return carerView(ctx);
}
