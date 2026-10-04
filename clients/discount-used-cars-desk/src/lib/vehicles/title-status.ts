/**
 * Title status: an inventory fact, verified when the car is acquired.
 *
 * Texas puts the rebuilt-vehicle disclosure at the OFFER, not the closing
 * table (43 TAC §215.160; Transportation Code ch. 501 subch. E): the notice
 * goes on the car while it is displayed for sale, and the purchaser signs a
 * separate acknowledgment before any sale-consummating instrument. None of
 * that can happen if nobody knows what the title is — so the question is
 * asked once, at acquisition, and every later screen only reads the answer.
 *
 * `unknown` fails closed. A vehicle whose title status has not been verified
 * cannot start a sale; the fix is a five-second marking on the inventory
 * side, not a guess at the desk. The free-text `title_type` column is left
 * untouched as the raw record this canonical value was derived from.
 */

export const TITLE_STATUSES = [
  "clean",
  "rebuilt_salvage",
  "bonded",
  "salvage_unrebuilt",
  "nonrepairable",
  "export_only",
  "unknown",
] as const;

export type TitleStatus = (typeof TITLE_STATUSES)[number];

export function isTitleStatus(value: unknown): value is TitleStatus {
  return (
    typeof value === "string" &&
    (TITLE_STATUSES as readonly string[]).includes(value)
  );
}

/** What a person reads on a screen or a printed page. */
export const TITLE_STATUS_LABELS: Record<TitleStatus, string> = {
  clean: "Clean title",
  rebuilt_salvage: "Rebuilt salvage title",
  bonded: "Bonded title",
  salvage_unrebuilt: "Salvage title, not rebuilt",
  nonrepairable: "Nonrepairable",
  export_only: "Export only",
  unknown: "Not verified",
};

/**
 * Statuses a retail sale can proceed on. A salvage vehicle that has not been
 * rebuilt and inspected, a nonrepairable vehicle, and an export-only vehicle
 * cannot be sold for highway use, full stop — the block names the reason
 * rather than hiding it behind a generic error.
 */
const SELLABLE: ReadonlySet<TitleStatus> = new Set([
  "clean",
  "rebuilt_salvage",
  "bonded",
]);

export type TitleGate =
  | { ok: true; status: TitleStatus }
  | { ok: false; status: TitleStatus; reason: "unverified" | "unsellable" };

export function gateTitleStatus(raw: unknown): TitleGate {
  const status: TitleStatus = isTitleStatus(raw) ? raw : "unknown";
  if (status === "unknown") return { ok: false, status, reason: "unverified" };
  if (!SELLABLE.has(status)) return { ok: false, status, reason: "unsellable" };
  return { ok: true, status };
}

/**
 * A rebuilt-salvage vehicle carries disclosure duties: the exterior notice
 * while it is offered, and the separately signed purchaser acknowledgment
 * before any sale document.
 */
export function requiresRebuiltDisclosure(status: TitleStatus): boolean {
  return status === "rebuilt_salvage";
}

/**
 * Whether a sale may BEGIN on this title, which is a different question
 * from whether a document may be filed on it.
 *
 * The owner's rule: a salvage title is not a wall. The buyer is at the desk
 * and the car is the car; the sale starts, captures everything it can, and
 * holds its documents until the title is rebuilt in our name, with that
 * work inside the guide. Only a title no retail sale can ever take
 * (nonrepairable, export only) or one nobody has looked at is refused.
 */
export type SaleBeginning =
  | { ok: true; status: TitleStatus; path: "proceeds" | "rebuild-first" }
  | { ok: false; status: TitleStatus; reason: "unverified" | "unsellable" };

export function saleMayBegin(raw: unknown): SaleBeginning {
  const gate = gateTitleStatus(raw);
  if (gate.ok) return { ok: true, status: gate.status, path: "proceeds" };
  if (gate.status === "salvage_unrebuilt") return { ok: true, status: gate.status, path: "rebuild-first" };
  return gate;
}

/**
 * True while the title holds the documents: nothing files until it is
 * rebuilt, or until the sale has decided to sell the car as salvage to be
 * towed away, which has its own packet and files nothing with the state.
 *
 * `salvagePath` is the sale's answer (see `sales/salvage-plan.ts`). Absent
 * or undecided, a salvage title holds; "rebuild" holds until the county's
 * title flips the car; only "towAway" lets the documents through.
 */
export function titleHoldsDocuments(
  status: string | null | undefined,
  salvagePath?: "rebuild" | "towAway" | "undecided" | null,
): boolean {
  return status === "salvage_unrebuilt" && salvagePath !== "towAway";
}

/**
 * A title on which no document may ever be filed, and why.
 *
 * Distinct from a hold: a hold lifts. A nonrepairable or export-only title
 * cannot be sold for the road by anyone, and a title nobody has looked at
 * is a title nobody can write a document against. Read at the filing so a
 * caller that skipped the desk's question cannot file past it.
 */
export function titleRefusesDocuments(
  status: string | null | undefined,
): "unverified" | "unsellable" | null {
  const gate = gateTitleStatus(status);
  if (gate.ok) return null;
  if (gate.status === "salvage_unrebuilt") return null;
  return gate.reason;
}
