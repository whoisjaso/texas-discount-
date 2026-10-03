import type { Condition, ConditionInput } from "@/lib/documents/field-maps/types";
import { readCoBuyer } from "@/lib/sales/co-buyer";

/**
 * The conditions a box can be on a sale under, as predicates.
 *
 * A map used to say "when there is a co-buyer" in words only, so nothing
 * acted on it: a business applicant with no business name filed a 130-U
 * with the person's licence in the FEIN box, and a warranty sale with no
 * warranty kind filed a bill of sale with a blank warranty line. Each
 * condition here reads what the review posts first (the answers over the
 * money), then the sale's stored answers, so the review, the filing and
 * the tests decide it the same way.
 */

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/*
  The stored answers, read here rather than through paperwork.ts: the maps
  import these conditions, and paperwork.ts imports the maps, so an import
  back would be a cycle that leaves a map reading an undefined condition.
*/
function readPaperwork(stepData: unknown, documentType: string): Record<string, string> {
  const bag = stepData && typeof stepData === "object" ? (stepData as Record<string, unknown>).paperwork : null;
  const held = bag && typeof bag === "object" ? (bag as Record<string, unknown>)[documentType] : null;
  const out: Record<string, string> = {};
  if (!held || typeof held !== "object") return out;
  for (const [key, value] of Object.entries(held as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** A bill of sale answer: the posted one on the bill itself, else the stored one. */
function billAnswer(input: ConditionInput, key: string): string {
  const posted = text(input.formData[key]);
  if (posted) return posted;
  const stored =
    readPaperwork(input.sale.stepData, "billOfSale")[key] ??
    readPaperwork(input.sale.stepData, "salvageBillOfSale")[key];
  return stored ?? "";
}

/** A co-buyer named on this sale (Start A Sale's "Add a co-buyer"). */
export const hasCoBuyer: Condition = (input) => Boolean(readCoBuyer(input.sale.stepData).name);

/** The bill of sale took a trade-in. */
export const tradeIn: Condition = (input) => billAnswer(input, "tradeIn") === "yes";

/** Sold with a dealer warranty. */
export const warranty: Condition = (input) => billAnswer(input, "conditionType") === "warranty";

/** A limited dealer warranty (the shares of labor and parts are its terms). */
export const limitedWarranty: Condition = (input) =>
  warranty(input) && billAnswer(input, "warrantyKind") === "limited";

/** The seller keeps a lien: money is still owed to the dealership. */
export const sellerLien: Condition = (input) =>
  input.printed.sellerLienEnabled === true && Number(input.printed.sellerLienAmount ?? 0) > 0;

/** A bank deal: the lender takes the lien and is named on the title. */
export const bankDeal: Condition = (input) => input.sale.funding.type === "lender";

/** Any lien on the title, on the 130-U (boxes 33 and 34). */
export const titleCarriesLien: Condition = (input) => input.printed.has_lien === true;

/** The 130-U applicant is an entity, not a person (box 13). */
export const entityApplicant: Condition = (input) => {
  const posted = text(input.formData.applicantType);
  const answer = posted || readPaperwork(input.sale.stepData, "form130U").applicantType || "Individual";
  return answer !== "Individual";
};

/** The 130-U applicant is a person. */
export const personApplicant: Condition = (input) => !entityApplicant(input);

/** A trade-in that came with its VIN. */
export const tradeInWithVin: Condition = (input) => tradeIn(input) && billAnswer(input, "tradeInVin").trim() !== "";
