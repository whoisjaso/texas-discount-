import { readMoney, type MoneyAnswers } from "@/lib/sales/money";
import { paperworkMoney, readPaperwork } from "@/lib/sales/paperwork";
import { readFunding } from "@/lib/sales/deal-type";

/**
 * The down payment is frozen once the bill of sale is filed (owner's decision
 * 10/01/2026; SOP "The sale plan", Freeze).
 *
 * The bill of sale states what crossed the desk today and the balance left
 * after it, and on a buy here pay here deal that balance is the note the
 * financing contract finances. The down payment is one fact with two homes
 * (the money step's "Down today", `money.paidTodayAmount`, and the financing
 * contract's "How Much Are They Putting Down?", which writes back to it). A
 * change to it after the bill of sale is filed would leave a signed bill of
 * sale disagreeing with the contract and the 130-U lien that follow it: a
 * signed document silently reattached to changed terms. So the change is
 * refused, with the way out: void the bill of sale and file it again.
 *
 * Only a CHANGE is refused. The same figure typed again, or a box answered
 * with the figure the bill of sale already states (a buy here pay here deal
 * with nothing down reads $0.00 either way), cannot invalidate anything.
 *
 * Pure (no server imports), so both actions and their tests share one rule.
 */

/**
 * The sheets that state the down payment as a bill of sale: the ordinary one
 * and, on a tow-away sale, the salvage bill of sale, which prints the same
 * paid-today figure.
 */
export const BILL_OF_SALE_TYPES = ["billOfSale", "salvageBillOfSale"] as const;

/** The filed bill of sale holding the down payment, or null when none is filed. */
export function filedBillOfSale(finalizedTypes: readonly string[]): string | null {
  return BILL_OF_SALE_TYPES.find((type) => finalizedTypes.includes(type)) ?? null;
}

export type FiledAgreementRow = {
  document_type: string | null;
  status?: string | null;
  completed_at?: string | null;
  finalized_at?: string | null;
  /** Set when the document was voided (owner's decision 10/02/2026). */
  voided_at?: string | null;
};

/**
 * Whether a document row counts as filed: the same rule the packet is drawn
 * with (`getSaleDetail`, sale-desk.ts), so a bill of sale the desk shows as
 * filed or signed always freezes the down payment. The desk's own filing sets
 * `finalized_at`; the older e-sign path completes a deal-linked row with
 * `completed_at` and status "completed" and no `finalized_at`.
 *
 * A voided row is never filed any more (owner's decision 10/02/2026): it is a
 * record of what was filed, kept and readable, and it holds nothing frozen,
 * counts toward no packet and can be signed by no one.
 */
export function isFiledAgreement(row: FiledAgreementRow): boolean {
  if (row.voided_at) return false;
  return (
    Boolean(row.finalized_at) ||
    Boolean(row.completed_at) ||
    row.status === "completed" ||
    row.status === "finalized"
  );
}

export const DOWN_PAYMENT_FROZEN_CODE = "downPaymentFrozen" as const;

export const DOWN_PAYMENT_FROZEN_MESSAGE =
  "The bill of sale is already filed with the down payment it states. Void the bill of sale and file it again before changing the down payment.";

export const PAID_TODAY_INVALID_CODE = "paidTodayInvalid" as const;

export const PAID_TODAY_INVALID_MESSAGE = "Type a dollar amount, like 1500. It cannot be less than zero.";

/**
 * The paid-today figure as the deal stores it: digits and cents only, or ""
 * for an empty box (which means "nothing typed", not $0.00), or null when
 * what was typed is not a dollar amount of zero or more.
 *
 * Every reader of the down payment must read the same text. The money step
 * strips "$", "," and spaces and clamps; the contract's printed itemisation
 * strips but never clamps; the note's payment solver did neither, so "1,500"
 * financed the whole total there while the contract printed it as $1,500 down,
 * and "-500" left the bill of sale's balance alone while the contract
 * financed $500 more. Stored as one plain figure, all three agree, and the
 * freeze's "same figure" is the same stored value. The arithmetic is
 * untouched: this only decides what text the arithmetic is handed.
 */
export function canonicalPaidToday(typed: string): string | null {
  const digits = typed.replace(/[$,\s]/g, "");
  if (digits === "") return "";
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(digits)) return null;
  return String(Math.round(Number(digits) * 100) / 100);
}

/**
 * The down payment a paid-today answer stands for, as a figure: the typed
 * amount itself, never clamped to the total (the contract prints what was
 * typed, so a figure above the total is still a different down payment), or,
 * for an empty box, what the deal implies crossed the desk.
 */
function downPaymentFigure(
  advertised: number | null | undefined,
  bill: Record<string, string>,
  money: MoneyAnswers,
  funding: ReturnType<typeof readFunding>["type"],
  typed: string,
): number {
  const digits = typed.replace(/[$,\s]/g, "");
  const parsed = digits === "" ? Number.NaN : Number(digits);
  if (Number.isFinite(parsed)) return Math.round(parsed * 100) / 100;
  return paperworkMoney(advertised, bill, { ...money, paidTodayAmount: typed }, funding).paidToday;
}

/**
 * Whether writing `to` as the paid-today answer changes the down payment the
 * deal's figures carry, everything else held as the deal will stand.
 *
 * Measured as the figure, not the typing: "1,500", "$1500.00" and "1500" are
 * one down payment, and on a financed deal an empty box and a typed 0 are the
 * same $0.00 (nothing is implied to cross the desk). The trade-in is the bill
 * of sale's, as on every document (`paperworkMoney`). Not clamped to the
 * total: the contract prints the typed figure, so any other figure is a
 * change.
 */
export function downPaymentChanges(input: {
  /** The vehicle row's price, read only when the deal has no typed amount. */
  advertised: number | null | undefined;
  stepData: unknown;
  /** The money answers as they will stand, apart from the down payment. */
  money?: MoneyAnswers;
  /** The paid-today answer being written. */
  to: string;
}): boolean {
  const money = input.money ?? readMoney(input.stepData);
  const bill = readPaperwork(input.stepData, "billOfSale");
  const funding = readFunding(input.stepData).type;
  const from = readMoney(input.stepData).paidTodayAmount;
  const before = downPaymentFigure(input.advertised, bill, { ...money, paidTodayAmount: from }, funding, from);
  const after = downPaymentFigure(input.advertised, bill, { ...money, paidTodayAmount: input.to }, funding, input.to);
  return before !== after;
}
