/**
 * Shared date logic for annual relationship touches (birthdays,
 * purchase anniversaries): "today" in dealership-local time and
 * month/day matching with the Feb-29 rule.
 */

export interface ChicagoDate {
  year: number;
  month: number;
  day: number;
}

/** Calendar date in America/Chicago for a given instant. */
export function getChicagoDate(now: Date = new Date()): ChicagoDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function chicagoDateKey(now: Date = new Date()): string {
  const { year, month, day } = getChicagoDate(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Whether the annual recurrence of an ISO date ("yyyy-MM-dd") lands on
 * `today`. Feb 29 recurrences fall on Feb 28 in non-leap years.
 */
export function isAnnualMatch(isoDate: string, today: ChicagoDate): boolean {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return false;
  const month = Number(match[1]);
  const day = Number(match[2]);

  if (month === 2 && day === 29 && !isLeapYear(today.year)) {
    return today.month === 2 && today.day === 28;
  }
  return today.month === month && today.day === day;
}
