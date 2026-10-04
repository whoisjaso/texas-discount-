/**
 * One ordering rule for vehicles, everywhere they are listed.
 *
 * Alphabetical by make, then model, then year, then trim. A shopper scanning
 * the lot and an operator picking a car off a list are doing the same thing —
 * looking for a name — so both get the same order, and it does not shuffle
 * when a record is edited.
 *
 * Year ascends within a model so the same car across years reads oldest to
 * newest rather than in whatever order the database returns.
 */

/** Columns, in precedence order, that define alphabetical vehicle order. */
export const ALPHABETICAL_VEHICLE_COLUMNS = [
  { column: "make", ascending: true },
  { column: "model", ascending: true },
  { column: "year", ascending: true },
  { column: "trim", ascending: true },
] as const;

type Orderable<Q> = { order: (column: string, options: { ascending: boolean }) => Q };

/**
 * Apply alphabetical order to a Supabase query.
 *
 * Pass `after: true` when another sort already ran and this should only break
 * ties — Supabase applies `.order()` calls in the sequence they are chained.
 */
export function applyAlphabeticalOrder<Q extends Orderable<Q>>(query: Q): Q {
  let next = query;
  for (const { column, ascending } of ALPHABETICAL_VEHICLE_COLUMNS) {
    next = next.order(column, { ascending });
  }
  return next;
}

export type ComparableVehicle = {
  make?: string | null;
  model?: string | null;
  year?: number | string | null;
  trim?: string | null;
};

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * Compare two vehicles for an in-memory list.
 *
 * Uses locale-aware comparison so accented makes sort where a reader expects,
 * and sorts blanks last — an unnamed car belongs at the bottom of a list, not
 * at the top of it.
 */
export function compareVehiclesAlphabetically(
  a: ComparableVehicle,
  b: ComparableVehicle,
): number {
  const byText = (left: string, right: string) => {
    if (left === right) return 0;
    if (left === "") return 1;
    if (right === "") return -1;
    return left.localeCompare(right, undefined, { sensitivity: "base" });
  };

  const make = byText(text(a.make), text(b.make));
  if (make !== 0) return make;

  const model = byText(text(a.model), text(b.model));
  if (model !== 0) return model;

  const yearA = Number(a.year);
  const yearB = Number(b.year);
  const hasA = Number.isFinite(yearA);
  const hasB = Number.isFinite(yearB);
  if (hasA && hasB && yearA !== yearB) return yearA - yearB;
  if (hasA !== hasB) return hasA ? -1 : 1;

  return byText(text(a.trim), text(b.trim));
}

/** Sort a copy; never mutate the caller's array. */
export function sortVehiclesAlphabetically<T extends ComparableVehicle>(
  vehicles: readonly T[],
): T[] {
  return [...vehicles].sort(compareVehiclesAlphabetically);
}
