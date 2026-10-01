/**
 * How this sale is being paid for, and what that changes.
 *
 * The packet used to be one list of six documents shown on every sale, two of
 * them marked "Optional". That is fine for the person who runs a deal a week
 * and knows that "Financing Contract" means our own payment plan and not the
 * lender's. It is not fine for someone covering the desk for an afternoon, who
 * sees an optional row and cannot tell whether optional means "not this time"
 * or "nobody has got to it yet".
 *
 * A sale is paid for in one of three ways and each one has a different packet:
 *
 *   cash     the buyer pays outright. No finance paper at all.
 *   inHouse  we carry the note. Our own financing contract is required.
 *   lender   an outside lender carries the note.
 *
 * The third is the one worth being careful about. When an outside lender funds
 * the deal, the retail instalment contract is *their* paper, produced in their
 * portal on their form, and our in-house financing contract must not be used:
 * signing both would be signing the same debt twice on two different sets of
 * terms. So `lender` does not simply add a document, it removes ours and sends
 * the operator to the lender instead.
 *
 * Nothing here is inferred from the money. A deal with no type recorded is
 * `null`, and the desk asks rather than guessing, because guessing "cash"
 * because no financing row exists yet would quietly hide the contract on every
 * finance deal that had not reached that step.
 */

import { planDocumentEffect, type SalePlan } from "@/lib/sales/sale-plan";
import { TOW_AWAY_DOCUMENTS, type SalvagePath } from "@/lib/sales/salvage-plan";

export type DealType = "cash" | "inHouse" | "lender";

export type DealFunding = {
  type: DealType | null;
  /** Which lender, when type is "lender". An id from the lender directory. */
  lenderId: string | null;
  /** Free text for a lender the directory does not carry yet. */
  lenderOther: string | null;
};

export const EMPTY_FUNDING: DealFunding = {
  type: null,
  lenderId: null,
  lenderOther: null,
};

/**
 * The three, in the words the lot uses out loud.
 *
 * The stored values stay `cash`, `inHouse` and `lender` because deals already
 * reference them and a label is not a reason to migrate data. What changed is
 * what a person reads: "We Finance" was our phrasing, "Buy Here Pay Here" is
 * the trade's, and someone covering the desk has heard the second one.
 */
export const DEAL_TYPES: {
  value: DealType;
  label: string;
  /**
   * Only where the label alone leaves two options confusable. "Cash" and
   * "Bank Financing" say what they are, so a line under them restated the
   * button and stole the eye on the way to the answer. "Buy Here Pay Here" is
   * the trade's phrase and not everyone covering the desk has heard it, so it
   * keeps the gloss the owner asked for.
   *
   * Capitalised word by word like the labels. It names a way of being paid
   * rather than describing one, so it belongs with the three answers rather
   * than with body copy, and the owner asked for every word on this screen to
   * be capitalised.
   */
  gloss?: string;
}[] = [
  { value: "cash", label: "Cash" },
  { value: "inHouse", label: "Buy Here Pay Here", gloss: "In-House Financing" },
  { value: "lender", label: "Bank Financing" },
];

export function dealTypeLabel(type: DealType | null): string {
  return DEAL_TYPES.find((entry) => entry.value === type)?.label ?? "Not set";
}

/**
 * Document types this funding path requires, by `document_agreements` name.
 *
 * `buyersGuide` is absent from every list on purpose: it is an FTC window form
 * that is printed and never stored, so it has no document type and cannot be
 * required by a check that reads stored records.
 *
 * `powerOfAttorney` is on NO list. It was on every one, on the theory that
 * since Texas HB 718 (July 2025) the dealer files through webDEALER and the
 * VTR-271 is what lets the dealer sign the filing for the buyer. But the
 * buyer at the desk signs the 130-U themselves, which is all webDEALER
 * needs, and the plain VTR-271 is not even lawful on a car under twenty
 * model years old. Requiring it made every ordinary sale end at a form that
 * could not be used. It is now added by the sale plan, only when the buyer
 * is not here to sign and we sign for them (see `planDocumentEffect`).
 *
 * `vehicleResponsibility` is likewise added by the plan: it records the
 * buyer registering the vehicle themselves, which under HB 718 is the
 * exception rather than the rule. It stays in `SALE_DOCUMENTS` as an
 * optional row for the deals where the exception genuinely applies.
 */
const REQUIRED_BY_TYPE: Record<DealType, string[]> = {
  cash: ["billOfSale", "form130U"],
  inHouse: ["billOfSale", "form130U", "financing"],
  lender: ["billOfSale", "form130U"],
};

/** Document types this funding path must NOT use. */
const EXCLUDED_BY_TYPE: Record<DealType, string[]> = {
  cash: ["financing"],
  inHouse: [],
  // Ours would be a second contract for the same debt. Theirs is the contract.
  lender: ["financing"],
};

/**
 * The documents a deal owes, on two axes.
 *
 * Funding decides whether our financing contract is in the packet. The sale
 * plan decides who registers the vehicle, and that swaps a whole branch:
 * when the BUYER files, we make no title application, so the 130-U comes
 * off and the Vehicle Responsibility acknowledgment goes on. When WE file
 * and the buyer is not here to sign the application, a power of attorney
 * goes on. Insurance not shown at the desk adds its own acknowledgment, and
 * a rebuilt title adds its written disclosure.
 *
 * The plan argument is optional so every existing caller keeps the funding
 * only behaviour, which is the HB 718 default: we file, and the buyer at the
 * desk signs the application.
 */
export function requiredDocumentTypes(
  type: DealType | null,
  plan?: SalePlan,
  titleStatus?: string | null,
  /**
   * The sale's salvage answer. On the tow-away path the packet is a
   * different packet altogether: nothing here is filed with the state, so
   * the base list and the plan's effects are both set aside and only the
   * tow-away sheets, plus our own financing contract when we carry the
   * note, are owed. Funding still decides that last one, because a buyer
   * can owe us money for a car they are towing home.
   */
  salvagePath?: SalvagePath | null,
): string[] {
  if (titleStatus === "salvage_unrebuilt" && salvagePath === "towAway") {
    const owed = [...TOW_AWAY_DOCUMENTS];
    if (type === "inHouse") owed.push("financing");
    return owed;
  }
  const base = !type
    ? REQUIRED_BY_TYPE.cash.filter((entry) => entry !== "financing")
    : REQUIRED_BY_TYPE[type];
  if (!plan) return base;

  const { add, remove } = planDocumentEffect(plan, titleStatus);
  const kept = base.filter((entry) => !remove.includes(entry));
  // Appended rather than merged into the table: order is the order the
  // corridor walks them, and the added ones come after the ones every sale
  // has. Deduplicated so a plan can never double a document.
  for (const entry of add) {
    if (!kept.includes(entry)) kept.push(entry);
  }
  return kept;
}

export function isDocumentExcluded(
  documentType: string | undefined,
  type: DealType | null,
): boolean {
  if (!documentType || !type) return false;
  return EXCLUDED_BY_TYPE[type].includes(documentType);
}

/**
 * Where funding lives on the deal.
 *
 * `step_data` is a JSONB blob whose existing keys are step numbers as strings,
 * left over from the retired paperwork pipeline. A named key cannot collide
 * with those, and using the blob rather than a new column means a second
 * dealership inherits this with no migration to run.
 */
export const FUNDING_KEY = "funding";

export function readFunding(stepData: unknown): DealFunding {
  if (!stepData || typeof stepData !== "object") return EMPTY_FUNDING;
  const raw = (stepData as Record<string, unknown>)[FUNDING_KEY];
  if (!raw || typeof raw !== "object") return EMPTY_FUNDING;

  const entry = raw as Record<string, unknown>;
  const type = entry.type;
  const validType =
    type === "cash" || type === "inHouse" || type === "lender" ? type : null;

  const text = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    type: validType,
    lenderId: validType === "lender" ? text(entry.lenderId) : null,
    lenderOther: validType === "lender" ? text(entry.lenderOther) : null,
  };
}

/** Merge funding into an existing step_data blob without disturbing the rest. */
export function writeFunding(
  stepData: unknown,
  funding: DealFunding,
): Record<string, unknown> {
  const base =
    stepData && typeof stepData === "object"
      ? { ...(stepData as Record<string, unknown>) }
      : {};
  base[FUNDING_KEY] = {
    type: funding.type,
    lenderId: funding.lenderId,
    lenderOther: funding.lenderOther,
  };
  return base;
}
