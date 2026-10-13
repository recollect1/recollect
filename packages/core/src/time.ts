// Household-local time helpers. All stored timestamps are UTC ISO strings.
export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };

/** A clock the demo can jump (scenarios I and K). Never used unless DEMO_CLOCK=1. */
export class DemoClock implements Clock {
  private offsetMs = 0;
  now(): Date { return new Date(Date.now() + this.offsetMs); }
  set(at: Date): void { this.offsetMs = at.getTime() - Date.now(); }
  reset(): void { this.offsetMs = 0; }
}

export interface LocalParts {
  year: number; month: number; day: number; hour: number; minute: number;
  weekday: number; weekdayName: string; monthName: string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function localParts(d: Date, tz: string): LocalParts {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hourCycle: "h23", weekday: "long",
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  const monthName = new Intl.DateTimeFormat("en-GB", { timeZone: tz, month: "long" }).format(d);
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday ?? ""), weekdayName: p.weekday ?? "", monthName,
  };
}

/** "8:10", "20:00" — 24-hour, no leading zero, as in the §5 scenarios. */
export function fmtTime(d: Date, tz: string): string {
  const p = localParts(d, tz);
  return `${p.hour}:${String(p.minute).padStart(2, "0")}`;
}

/** "3 August 2026" */
export function fmtDate(d: Date, tz: string): string {
  const p = localParts(d, tz);
  return `${p.day} ${p.monthName} ${p.year}`;
}

export function minutesOfDay(d: Date, tz: string): number {
  const p = localParts(d, tz);
  return p.hour * 60 + p.minute;
}

export function parseHHMM(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

/** "08:00" -> "8:00" */
export function fmtHHMM(t: string): string {
  const mins = parseHHMM(t);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

/** UTC instants bounding the household-local day that contains `d`. */
export function localDayBounds(d: Date, tz: string): { from: string; to: string } {
  const p = localParts(d, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const offsetMs = asUtc - Math.floor(d.getTime() / 60000) * 60000;
  const start = Date.UTC(p.year, p.month - 1, p.day) - offsetMs;
  return { from: new Date(start).toISOString(), to: new Date(start + 86400000).toISOString() };
}

/** The UTC instant of a household-local wall-clock time on the local day containing `d`. */
export function localAt(d: Date, tz: string, hhmm: string): Date {
  return new Date(new Date(localDayBounds(d, tz).from).getTime() + parseHHMM(hhmm) * 60000);
}

/** ISO week label, e.g. "2026-W42", in household-local time. */
export function isoWeek(d: Date, tz: string): string {
  const p = localParts(d, tz);
  const t = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
