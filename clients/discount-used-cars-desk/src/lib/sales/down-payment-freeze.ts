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

export const DOWN_PAYMENT_FROZEN_CODE = "downPaymentFrozen" as const;

export const DOWN_PAYMENT_FROZEN_MESSAGE =
  "The bill of sale is already filed with the down payment it states. Void the bill of sale and file it again before changing the down payment.";

/**
 * Whether writing `to` as the paid-today answer changes the down payment the
 * deal's figures carry, everything else held as the deal will stand.
 *
 * Measured as the figure, not the typing: "1,500", "$1500.00" and "1500" are
 * one down payment, and on a financed deal an empty box and a typed 0 are the
 * same $0.00 (nothing is implied to cross the desk). The trade-in is the bill
 * of sale's, as on every document (`paperworkMoney`).
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
  const before = paperworkMoney(input.advertised, bill, { ...money, paidTodayAmount: from }, funding).paidToday;
  const after = paperworkMoney(input.advertised, bill, { ...money, paidTodayAmount: input.to }, funding).paidToday;
  return before !== after;
}
