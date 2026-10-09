/**
 * Indian calendar days (UTC+5:30, no daylight saving). All reporting, month boundaries and
 * daily counters use these (doc 02 §2.6, 03).
 */
const IST_OFFSET_MS = 330 * 60 * 1000;

/** "YYYY-MM-DD" of the Indian calendar day containing the instant. */
export function indianDate(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM" of the Indian calendar month containing the instant. */
export function indianMonth(at: Date): string {
  return indianDate(at).slice(0, 7);
}

/** The instant an Indian calendar day starts (00:00 IST). */
export function startOfIndianDay(day: string): Date {
  assertDay(day);
  return new Date(Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS);
}

/** First and last day ("YYYY-MM-DD") of a month given as "YYYY-MM". */
export function monthBounds(month: string): { first: string; last: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Invalid month: ${month}`);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, "0")}` };
}

/** Adds whole calendar days to a "YYYY-MM-DD" date. */
export function addDays(day: string, days: number): string {
  assertDay(day);
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Adds whole months to a "YYYY-MM" month. */
export function addMonths(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}

/** Parses "YYYY-MM", falling back to the current Indian month when invalid (report month picker). */
export function parseMonthOr(value: string | null | undefined, now: Date): string {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : indianMonth(now);
}

function assertDay(day: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    throw new Error(`Invalid date: ${day}`);
  }
}

/** The last `count` months ending with the current Indian month, newest first. */
export function recentMonths(count: number, now: Date): string[] {
  const current = indianMonth(now);
  return Array.from({ length: count }, (_, i) => addMonths(current, -i));
}

/**
 * Whole contract years elapsed from `startDay` to `onDay` (both "YYYY-MM-DD"). Used for the
 * tenure step, measured at the start of the month (04.9).
 */
export function wholeYearsBetween(startDay: string, onDay: string): number {
  assertDay(startDay);
  assertDay(onDay);
  if (onDay < startDay) return 0;
  const [sy, sm, sd] = startDay.split("-").map(Number) as [number, number, number];
  const [oy, om, od] = onDay.split("-").map(Number) as [number, number, number];
  let years = oy - sy;
  if (om < sm || (om === sm && od < sd)) years--;
  return Math.max(0, years);
}
