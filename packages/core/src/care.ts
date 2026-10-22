// Care follow-through (family only). When a change card appears, Recollect prepares the next steps:
// a pre-visit summary, questions for the doctor, a calendar invitation for a check-up, a printable
// book of her stories, and a reminder to check her tablets will last until the visit. Each step is
// only a proposal until the family approves it. Recollect never books, buys or orders anything, and
// never says anything about her tablets beyond their names and times (§1.5).
import type { Ctx } from "./ctx.ts";
import { FamilyError } from "./family.ts";
import { familyVoices } from "./network.ts";
import * as P from "./phrases.ts";
import trend from "./trend-phrases.json" with { type: "json" };
import { fmtDate, fmtHHMM, localAt, localParts, parseHHMM } from "./time.ts";
import type { CareAction, MarkerSet, Medicine, Quote, Schedule, Session, TrendCard } from "./types.ts";

const METRICS = trend.metrics as Record<string, { question: string }>;

export async function latestChangeCard(ctx: Ctx): Promise<TrendCard | undefined> {
  return (await ctx.graph.find<TrendCard>("TrendCard", { personId: ctx.elder.id }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .find((c) => c.kind === "change");
}

/** The care plan for the latest change card, created the first time it is needed. */
export async function ensureCarePlan(ctx: Ctx): Promise<CareAction[]> {
  const { graph, elder, admin } = ctx;
  const card = await latestChangeCard(ctx);
  if (!card) return [];
  const planId = `care-${card.id}`;
  const existing = await graph.find<CareAction>("CareAction", { planId });
  if (existing.length) return existing.sort((a, b) => a.order - b.order);

  const sessions = (await graph.find<MarkerSet>("MarkerSet")).length;
  const stories = (await graph.find<Session>("Session", { speakerId: elder.id })).filter((s) => s.mode === "story" && !s.private).length;
  const medicines = await graph.find<Medicine>("Medicine");
  const schedules = await graph.find<Schedule>("Schedule");
  const createdAt = ctx.clock.now().toISOString();
  const base = { planId, trendCardId: card.id, status: "proposed" as const, createdAt, simulated: card.simulated };
  const actions: CareAction[] = [
    { ...base, id: `${planId}-summary`, kind: "summary", order: 1, title: P.CARE_TITLES.summary,
      detail: P.careSummary(elder.name, card.say, sessions, card.weeks), items: [] },
    { ...base, id: `${planId}-questions`, kind: "questions", order: 2, title: P.CARE_TITLES.questions,
      detail: trend.doctorQuestionsIntro, items: card.changes.map((m) => METRICS[m]?.question).filter((q): q is string => Boolean(q)) },
    { ...base, id: `${planId}-appointment`, kind: "appointment", order: 3, title: P.CARE_TITLES.appointment,
      detail: P.careAppointment(elder.name), items: ["Bring the printed doctor report.", "Bring the list of her tablets."] },
    { ...base, id: `${planId}-memory_book`, kind: "memory_book", order: 4, title: P.CARE_TITLES.memory_book,
      detail: P.careMemoryBook(elder.name, stories), items: [] },
    { ...base, id: `${planId}-tablet_check`, kind: "tablet_check", order: 5, title: P.CARE_TITLES.tablet_check,
      detail: P.careTabletCheck(admin.name),
      items: medicines.map((m) => {
        const times = schedules.filter((s) => s.medicineId === m.id).map((s) => s.time)
          .sort((a, b) => parseHHMM(a) - parseHHMM(b)).map(fmtHHMM);
        return times.length ? `${m.name} · ${times.join(", ")}` : m.name;
      }) },
  ];
  for (const a of actions) await graph.upsert("CareAction", { ...a });
  return actions;
}

export async function decideCare(ctx: Ctx, id: string, approve: boolean): Promise<CareAction> {
  const action = await ctx.graph.get<CareAction>("CareAction", id);
  if (!action) throw new FamilyError("no such care step");
  const decided: CareAction = { ...action, status: approve ? "approved" : "dismissed", decidedAt: ctx.clock.now().toISOString() };
  await ctx.graph.upsert("CareAction", { id, status: decided.status, decidedAt: decided.decidedAt! });
  return decided;
}

const ics = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/**
 * A calendar invitation the family can import once they have approved the appointment step. The
 * time is only a placeholder (the next weekday, 10:30) to move to whatever the surgery offers.
 */
export async function careCalendar(ctx: Ctx, planId: string): Promise<string> {
  const actions = await ctx.graph.find<CareAction>("CareAction", { planId });
  const appointment = actions.find((a) => a.kind === "appointment");
  if (!appointment || appointment.status !== "approved") throw new FamilyError("approve the check-up step first");
  const questions = actions.find((a) => a.kind === "questions")?.items ?? [];
  const tz = ctx.household.tz;
  let day = new Date(ctx.clock.now().getTime() + 86400000);
  while ([0, 6].includes(localParts(day, tz).weekday)) day = new Date(day.getTime() + 86400000);
  const start = localAt(day, tz, "10:30");
  const end = new Date(start.getTime() + 30 * 60000);
  const description = [
    "Prepared by Recollect. Move this to the time the surgery gives you.",
    "Bring the printed doctor report and the list of her tablets.", "", "Questions you might ask:",
    ...questions.map((q) => `- ${q}`), "", P.NOT_MEDICAL,
  ].join("\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Recollect//Care follow-through//EN", "BEGIN:VEVENT",
    `UID:${planId}@recollect`, `DTSTAMP:${ics(ctx.clock.now())}`, `DTSTART:${ics(start)}`, `DTEND:${ics(end)}`,
    `SUMMARY:${icsText(`Check-up for ${ctx.elder.name} (bring the Recollect report)`)}`,
    `DESCRIPTION:${icsText(description)}`, "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A printable book of her stories (never the private ones), with family members' memories beside them. */
export async function memoryBookHtml(ctx: Ctx): Promise<string> {
  const { graph, elder, household } = ctx;
  const sessions = (await graph.find<Session>("Session", { speakerId: elder.id }))
    .filter((s) => s.mode === "story" && !s.private)
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  const voices = await familyVoices(ctx);
  const chapters: string[] = [];
  for (const s of sessions) {
    const quotes = (await graph.out<Quote>(["Session", s.id], "HAS_QUOTE")).map((n) => n.node).sort((a, b) => a.seq - b.seq);
    const family = (voices.get(s.id) ?? []).map((v) =>
      `<aside><p>${v.quotes.map(esc).join(" ")}</p><p class="by">${esc(v.name)}${v.relation ? `, ${esc(v.relation)}` : ""}</p></aside>`).join("");
    chapters.push(`<section><p class="date">Told on ${esc(fmtDate(new Date(s.startedAt), household.tz))}</p>` +
      `<p class="words">${quotes.map((q) => esc(q.text)).join(" ")}</p>${family}</section>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(elder.name)} — in her own words</title>
<style>body{font:19px/1.6 Georgia,"Times New Roman",serif;color:#1d1a16;background:#fffaf0;margin:0}
main{max-width:720px;margin:0 auto;padding:48px 24px}h1{font-size:40px;margin:0 0 4px}.sub{color:#5a5146;margin:0 0 40px}
section{break-inside:avoid;margin:0 0 36px;padding-bottom:28px;border-bottom:1px solid #e2d3b5}.date{color:#8a3b12;font:600 14px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em}
.words{font-size:22px}aside{margin:12px 0 0 24px;padding-left:16px;border-left:3px solid #e2d3b5;color:#4a4339}.by{font:14px system-ui,sans-serif;color:#7a6f60}
@media print{body{background:#fff}}</style></head><body><main>
<h1>${esc(elder.name)}</h1><p class="sub">Stories she told Recollect, in her own words, with memories from her family.</p>
${chapters.join("\n") || "<p>No stories yet.</p>"}
</main></body></html>`;
}
