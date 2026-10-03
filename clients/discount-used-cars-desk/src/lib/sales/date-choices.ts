import type { PaperworkOption } from "@/lib/sales/paperwork";
import { businessDateToday } from "@/lib/documents/us-date";

/**
 * The first payment date, as two taps worked out from the contract date.
 *
 * A desk agrees "first payment in two weeks" or "first of next month", not a
 * calendar square. So the screen offers the two dates a note on this
 * frequency usually starts on, each labelled with the date it means, and a
 * third choice opens a date box for anything else.
 *
 *   Weekly          in one week, in two weeks
 *   Every two weeks in two weeks, in four weeks
 *   Monthly         in one month, in two months (held to the month's end:
 *                   a contract on the 31st pays on the 30th of a 30-day month)
 *
 * Pure, and in the dealership's own calendar (the contract's date is the
 * business date it is signed on), so the labels and the stored value agree.
 */

function parse(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

const pad = (value: number) => String(value).padStart(2, "0");

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** The date `days` after `start`, both YYYY-MM-DD. */
export function addDays(start: string, days: number): string {
  const at = parse(start);
  if (!at) return "";
  const moved = new Date(Date.UTC(at.y, at.m - 1, at.d + days));
  return iso(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

/** The same day `months` later, held to the last day of a shorter month. */
export function addMonths(start: string, months: number): string {
  const at = parse(start);
  if (!at) return "";
  const index = at.m - 1 + months;
  const y = at.y + Math.floor(index / 12);
  const m = (((index % 12) + 12) % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return iso(y, m, Math.min(at.d, last));
}

/** MM/DD/YYYY, as the contract prints it. */
export function usLabel(value: string): string {
  const at = parse(value);
  return at ? `${pad(at.m)}/${pad(at.d)}/${at.y}` : value;
}

export function firstPaymentChoices(
  contractDate: string | undefined,
  frequency: string | undefined,
): PaperworkOption[] {
  const from = contractDate && parse(contractDate) ? contractDate : businessDateToday();
  const pairs: Array<[string, string, string]> =
    frequency === "Weekly"
      ? [
          [addDays(from, 7), "In One Week", "inOneWeek"],
          [addDays(from, 14), "In Two Weeks", "inTwoWeeks"],
        ]
      : frequency === "Bi-weekly"
        ? [
            [addDays(from, 14), "In Two Weeks", "inTwoWeeks"],
            [addDays(from, 28), "In Four Weeks", "inFourWeeks"],
          ]
        : [
            [addMonths(from, 1), "In One Month", "inOneMonth"],
            [addMonths(from, 2), "In Two Months", "inTwoMonths"],
          ];
  return pairs.map(([value, label, template]) => ({
    value,
    label,
    gloss: usLabel(value),
    template,
  }));
}
