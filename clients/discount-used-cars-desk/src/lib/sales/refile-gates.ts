import type { PaperworkMoney } from "@/lib/sales/paperwork";
import { DEALER_CHARGES_MESSAGES, type DealerChargesProblem } from "@/lib/sales/fee-schedule";
import { GOVERNMENT_FEES_FILING_MESSAGES, type GovernmentFeesFilingProblem } from "@/lib/sales/government-fees";
import { CHAPTER_345_MESSAGE } from "@/lib/legal/chapter-345";
import {
  PRINTS_BILL_OF_SALE_FIGURES,
  currentCopy,
  filedAtOf,
  isVoided,
  type AgreementRecord,
} from "@/lib/sales/filed-documents";

/**
 * Filing again goes through the same gates, and three more (owner's decision
 * 10/02/2026; SOP "The documents", Voiding and filing again). Pure, so the
 * filing action and its tests read one rule; every one of them only ever
 * refuses, none loosens a filing refusal that already existed.
 *
 *   billOfSaleAlreadyFiled  one current bill of sale per sale: a second one is
 *                           filed only after the first is voided.
 *   billOfSaleFirst         a document printing the bill of sale's figures or
 *                           answers waits for a current bill of sale.
 *   figuresChanged          the figures the review screen posted are the
 *                           server's own, recomputed now; a screen opened
 *                           before a change files nothing.
 */

export type FilingGateCode =
  | "billOfSaleAlreadyFiled"
  | "billOfSaleFirst"
  | "figuresChanged"
  /*
    The dealer charges (rulebook, texas-dealer-fees.md section 5.4;
    fee-schedule.ts and dealership-fees.ts decide them). Each only refuses.
  */
  | DealerChargesProblem
  | "feeSettingsUnreadable"
  /* The sale's government fees, recorded from webDEALER (government-fees.ts). */
  | GovernmentFeesFilingProblem
  /* A ch. 345 vehicle (chapter-345.ts): not this desk's paperwork. */
  | "chapter345Vehicle";

export const FILING_GATE_MESSAGES: Record<FilingGateCode, string> = {
  billOfSaleAlreadyFiled: "This sale already has a filed bill of sale. Void it from the paperwork before filing it again.",
  billOfSaleFirst: "File the bill of sale first. This document prints its figures.",
  figuresChanged: "The figures changed since this screen opened. Look at the document again before filing.",
  ...DEALER_CHARGES_MESSAGES,
  ...GOVERNMENT_FEES_FILING_MESSAGES,
  chapter345Vehicle: CHAPTER_345_MESSAGE,
};

const ROOTS = ["billOfSale", "salvageBillOfSale"] as const;

/** The money keys a filing carries, compared in cents with the server's own figures. */
export const FILED_MONEY_KEYS = [
  "salePrice",
  "tax",
  "titleFee",
  "docFee",
  "registrationFee",
  "tradeInAllowance",
  "total",
  "paidToday",
  "sellerLienAmount",
] as const;

/** The government lines on lines of their own, carried only when a sale charges them. */
export const OWN_LINE_MONEY_KEYS = ["inspectionFee", "plateFee"] as const;

/** The documents that must carry every money key: the ones that print the figures. */
export const MONEY_REQUIRED_FOR = ["billOfSale", "salvageBillOfSale", "financing", "form130U"] as const;

function cents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function same(posted: unknown, expected: number): boolean {
  const a = cents(posted);
  return a !== null && a === Math.round(expected * 100);
}

/**
 * Whether the posted figures are the server's own. `downPayment` is the
 * financing contract's down payment as the deal stores it (or the money
 * step's paid-today figure it defaults to), when the document is the contract.
 */
export function figuresDiffer(
  documentType: string,
  formData: Record<string, unknown>,
  expected: { money: PaperworkMoney; downPayment?: number | null },
): boolean {
  const required = (MONEY_REQUIRED_FOR as readonly string[]).includes(documentType);
  const money = expected.money as unknown as Record<string, unknown>;
  for (const key of FILED_MONEY_KEYS) {
    const has = Object.prototype.hasOwnProperty.call(formData, key);
    if (!has) {
      if (required) return true;
      continue;
    }
    if (!same(formData[key], Number(money[key]) || 0)) return true;
  }
  /*
    The government lines of their own (government-fees.ts) are carried only
    when the sale charges them, so they are compared both ways: one the
    server charges must be posted at its figure, and one posted must be the
    server's.
  */
  for (const key of OWN_LINE_MONEY_KEYS) {
    const wanted = Number(money[key]) || 0;
    const has = Object.prototype.hasOwnProperty.call(formData, key);
    if (wanted > 0 && !has && required) return true;
    if (has && !same(formData[key], wanted)) return true;
  }
  if (Object.prototype.hasOwnProperty.call(formData, "sellerLienEnabled")) {
    if (Boolean(formData.sellerLienEnabled) !== Boolean(expected.money.sellerLienEnabled)) return true;
  } else if (required) {
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(formData, "quotedRegistrationAmount")) {
    if (!same(formData.quotedRegistrationAmount, expected.money.registrationCost)) return true;
  }
  if (documentType === "financing") {
    const posted = cents(formData.downPayment) ?? 0;
    const wanted = Math.round((expected.downPayment ?? 0) * 100);
    if (posted !== wanted) return true;
  }
  return false;
}

/**
 * Whether the answers a filing posted are the sale's own, as the server
 * resolves them now (`paperworkAnswers`, the same call the review screen
 * shows). The bill of sale prints its mileage statement, trade-in, payment
 * method, warranty and how a salvage car leaves from these, and the contract
 * its rate, count and payments; a review tab opened before an answer changed,
 * or a hand-made request, would otherwise file words the sale no longer
 * holds. A posted answer that differs, or an answer key the sale does not
 * have, is refused; a key left out is filled with the sale's own answer
 * (`withServerAnswers`). Money keys are compared by `figuresDiffer`.
 */
export function answersDiffer(
  formData: Record<string, unknown>,
  serverAnswers: Record<string, string>,
  moneyKeys: readonly string[],
): boolean {
  const skip = new Set<string>([...moneyKeys, "quotedRegistrationAmount"]);
  for (const [key, value] of Object.entries(serverAnswers)) {
    if (skip.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(formData, key)) continue;
    const posted = formData[key];
    if (String(posted ?? "") !== value) return true;
  }
  for (const key of Object.keys(formData)) {
    if (skip.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(serverAnswers, key)) return true;
  }
  return false;
}

/** The posted form data with every answer it left out filled from the sale's own. */
export function withServerAnswers(
  formData: Record<string, unknown>,
  serverAnswers: Record<string, string>,
  moneyKeys: readonly string[],
): Record<string, unknown> {
  const skip = new Set<string>([...moneyKeys, "quotedRegistrationAmount"]);
  const out: Record<string, unknown> = { ...formData };
  for (const [key, value] of Object.entries(serverAnswers)) {
    if (skip.has(key) || Object.prototype.hasOwnProperty.call(out, key)) continue;
    out[key] = value;
  }
  return out;
}

/** The documents whose figures must agree with the current bill of sale's printed ones. */
export const AGREES_WITH_BILL_OF_SALE = ["financing", "form130U", "vehicleResponsibility", "towAwayAcknowledgment"] as const;

/**
 * Whether a document from the bill of sale's figure list would print figures
 * other than the ones the current bill of sale printed. The posted figures are
 * already the server's own (`figuresDiffer`); this catches the sale's figures
 * having moved away from the paper (a save that slipped past the freeze in the
 * moment a bill of sale was filed), so a contract never states a price, tax,
 * trade-in, down payment or balance its bill of sale does not. Only keys both
 * carry are compared.
 */
export function figuresDisagreeWithBillOfSale(
  documentType: string,
  formData: Record<string, unknown>,
  printed: Record<string, unknown> | null,
): boolean {
  if (!printed || !(AGREES_WITH_BILL_OF_SALE as readonly string[]).includes(documentType)) return false;
  const pairs: Array<[string, string]> = [
    ["salePrice", "salePrice"],
    ["tradeInAllowance", "tradeInAllowance"],
    ["tax", "tax"],
    ["titleFee", "titleFee"],
    ["docFee", "docFee"],
    ["registrationFee", "registrationFee"],
    ["inspectionFee", "inspectionFee"],
    ["plateFee", "plateFee"],
    ["paidToday", "amountPaidToday"],
  ];
  if (printed.sellerLienEnabled === true) pairs.push(["sellerLienAmount", "sellerLienAmount"]);
  for (const [postedKey, printedKey] of pairs) {
    if (!Object.prototype.hasOwnProperty.call(formData, postedKey)) continue;
    if (!Object.prototype.hasOwnProperty.call(printed, printedKey)) continue;
    const a = cents(formData[postedKey]);
    const b = cents(printed[printedKey]);
    if (a === null || b === null || a !== b) return true;
  }
  return false;
}

/** The bill of sale this sale's packet is drawn from: the salvage one on a tow-away sale. */
export function rootFor(owed: readonly string[]): (typeof ROOTS)[number] {
  return owed.includes("salvageBillOfSale") ? "salvageBillOfSale" : "billOfSale";
}

/**
 * The new refusals, in order, or null. `rows` are the deal's documents
 * (voided ones included); `owed` is the packet the sale owes now.
 */
export function filingGate(input: {
  documentType: string;
  rows: readonly AgreementRecord[];
  owed: readonly string[];
  formData: Record<string, unknown>;
  expected: { money: PaperworkMoney; downPayment?: number | null };
}): FilingGateCode | null {
  const { documentType, rows, owed } = input;
  if ((ROOTS as readonly string[]).includes(documentType)) {
    if (ROOTS.some((root) => currentCopy(rows, root))) return "billOfSaleAlreadyFiled";
  } else {
    const root = rootFor(owed);
    if (PRINTS_BILL_OF_SALE_FIGURES[root].includes(documentType) && !currentCopy(rows, root)) {
      return "billOfSaleFirst";
    }
  }
  if (figuresDiffer(documentType, input.formData, input.expected)) return "figuresChanged";
  return null;
}

/** The voided copy a new filing of this type replaces: the newest voided one, or null. */
export function replacedCopyId(rows: readonly AgreementRecord[], documentType: string): string | null {
  let newest: AgreementRecord | null = null;
  for (const row of rows) {
    if (row.document_type !== documentType || !isVoided(row) || !row.id) continue;
    const at = Date.parse(row.voided_at ?? "") || Date.parse(filedAtOf(row) ?? "") || 0;
    const best = newest ? Date.parse(newest.voided_at ?? "") || Date.parse(filedAtOf(newest) ?? "") || 0 : -1;
    if (!newest || at > best) newest = row;
  }
  return newest?.id ?? null;
}
