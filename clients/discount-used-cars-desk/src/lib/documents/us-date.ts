import { chicagoDateKey } from "@/lib/customers/recurring-dates";

/**
 * A date on a document, written the way a Texas form writes it.
 *
 * Two shapes reach the paper: a plain calendar date ("2026-09-02"), which
 * is already a business date and must not be shifted by any time zone, and
 * an instant ("2026-09-02T00:41:07.000Z"), which is a moment and has to be
 * turned into the business date at the desk. The second is where the
 * mistake lived: a signature at 7:41 pm in Houston is 00:41 the next day in
 * UTC, and a server that formats the instant in its own zone dates the
 * signature tomorrow. The dealership sells in one time zone, so that is
 * the zone the paper is dated in.
 */
export function usDate(value: string | null | undefined): string {
  if (!value) return "";
  const plain = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plain) return `${plain[2]}/${plain[3]}/${plain[1]}`;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value;
  const key = chicagoDateKey(instant);
  return `${key.slice(5, 7)}/${key.slice(8, 10)}/${key.slice(0, 4)}`;
}

/** Today, as the calendar date at the desk, in the shape the record stores. */
export function businessDateToday(): string {
  return chicagoDateKey();
}
