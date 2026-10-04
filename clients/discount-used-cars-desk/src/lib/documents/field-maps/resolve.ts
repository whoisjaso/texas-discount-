import type { SaleDetail } from "@/lib/admin/sale-desk";
import { fieldMapFor } from "@/lib/documents/field-maps";
import { probe, type ProbeOptions } from "@/lib/documents/field-maps/probes";
import {
  conditionOf,
  fieldIsOn,
  type Blank,
  type ConditionInput,
  type MapField,
  type Source,
} from "@/lib/documents/field-maps/types";
import { factById, type DealFact } from "@/lib/sales/deal-facts";
import { factAppliesOnSale, type PaperworkContext } from "@/lib/sales/paperwork";
import { usDate } from "@/lib/documents/us-date";
import { printedPhone } from "@/lib/forms/phone";
import { idDocumentType, readIdKind } from "@/lib/forms/id-document";

/**
 * The page read back, and the boxes it would print blank.
 *
 * The review screen used to list the answers and the money, whatever the
 * document printed: the rebuilt disclosure's review showed a car price the
 * state page never prints and none of the four values it does. Now the
 * review is the page: each printed box on this sale, in page order, with
 * what it will say and where that came from. A box the sale should have
 * filled and did not is marked missing, with the place it is fixed, and the
 * filing refuses it (`missingPrintedFields`).
 *
 * "On this sale" is the map's own condition (`on`, or a tested `when`): no
 * co-buyer, no co-buyer rows; no lien, no lien rows. A box whose condition
 * holds is as required as a "never" box.
 */

export type ReadBackStatus =
  | "filled"
  | "asked"
  | "blankAllowed"
  | "ink"
  | "office"
  | "marker"
  | "missing";

/**
 * The chip beside a value: where it came from. The source kinds, plus
 * "intake" for what Start A Sale took down (the phone, the email, the
 * mailing address): those were typed at the desk, not read off the licence.
 */
export type ReadBackChip = Source["from"] | "intake";

export type ReadBackRow = {
  id: string;
  label: string;
  value: string;
  status: ReadBackStatus;
  /** The source chip: dealer, fees, vehicle, buyer, intake, coBuyer, answer, computed, date, signature, static, none. */
  source: ReadBackChip;
  /**
   * Words the desk itself wrote for the value (Still To Do, an ID's kind,
   * "Yes"), as keys the screen words in its own language. The value above
   * is the English the paper prints.
   */
  valueKeys?: string[];
  /** Where the box is fixed: the question, the licence step or the car. */
  changeHref?: string;
};

export type ReadBackPage = {
  page: number;
  title: string;
  rows: ReadBackRow[];
  /**
   * The answers this document asks for another document's paper (the
   * warranty's kind and shares, printed on the Buyers Guide), read back
   * under that document's name after the pages.
   */
  carriedFor?: string;
};

export type ReadBackOptions = ProbeOptions & {
  /**
   * What the question screens know about the sale (`paperworkFilingContext`):
   * with it, a box whose answer is not a question on this sale reads back
   * from its fallback source, with no Change link to a question that would
   * only redirect away.
   */
  context?: PaperworkContext;
};

const MONEY_IDS = new Set([
  "salePrice", "cashPrice", "tax", "titleFee", "docFee", "registrationFee", "inspectionFee", "plateFee",
  "tradeInAllowance", "tradeInPayoff", "amountPaidToday", "sellerLienAmount", "downPayment", "dueAtSigning",
  "paymentAmount", "lastPaymentAmount", "quotedRegistrationAmount", "lateHandlingFee", "lateHandlingTotal",
  "total", "balanceOwed", "otherFees", "sale_price", "trade_in_amount", "trade_in_amount_38b",
  "netTradeIn", "feesAndTax", "totalAmountDue", "totalPaid", "financedByLender",
  "cashPriceSubtotal", "amountFinanced", "totalOfPayments", "financeCharge", "balanceAfterTrade",
]);

const dollars = (value: number) =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One printed value as a person reads it. Empty when the box would be blank. */
export function displayValue(id: string, raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "boolean") return raw ? "Yes" : "";
  if (typeof raw === "number") {
    if (MONEY_IDS.has(id)) return raw === 0 && (id === "otherFees" || id === "tradeInPayoff") ? "" : dollars(raw);
    return String(raw);
  }
  if (typeof raw === "string") {
    if (raw.startsWith("data:image")) return "Signed";
    // A date reads the way the paper prints it.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return usDate(raw.trim());
    return raw.trim();
  }
  if (typeof raw === "object") {
    const plan = raw as Record<string, unknown>;
    if ("registrationByDealer" in plan) {
      return stillToDoKeys(plan)
        .map((key) => STILL_TO_DO_WORDS[key])
        .join(" · ");
    }
    return "";
  }
  return String(raw);
}

/** Still To Do's lines, as keys the screen words in its own language. */
const STILL_TO_DO_WORDS: Record<string, string> = {
  registrationByDealer: "We file the registration",
  registrationByBuyer: "The buyer files the registration",
  insuranceOnFile: "Insurance on file",
  insuranceOwed: "Insurance owed",
  inspectionPassed: "Inspection passed",
  weInspect: "We inspect",
  buyerInspects: "The buyer inspects",
};

function stillToDoKeys(plan: Record<string, unknown>): string[] {
  return [
    plan.registrationByDealer ? "registrationByDealer" : "registrationByBuyer",
    plan.insuranceShown === undefined ? "" : plan.insuranceShown ? "insuranceOnFile" : "insuranceOwed",
    plan.inspectionDone ? "inspectionPassed" : plan.inspectionByDealer === undefined ? "" : plan.inspectionByDealer ? "weInspect" : "buyerInspects",
  ].filter(Boolean);
}

const PHONE_IDS = new Set(["buyerPhone", "coBuyerPhone", "dealerPhone", "buyer_phone"]);
const MILEAGE_IDS = new Set(["vehicleMileage", "odometerReading", "odometer"]);
const PERCENT_IDS = new Set(["apr"]);

/**
 * The 130-U's own codes as the state form words its boxes. The probe reads
 * `buildAgreementData`, which stores "title_and_registration", "individual"
 * and "A"; the review says what the paper says.
 */
const FORM_130U_WORDS: Record<string, Record<string, string>> = {
  applying_for: {
    title_and_registration: "Title & Registration",
    title_only: "Title Only",
    registration_only: "Registration Purposes Only",
    nontitle: "Nontitle Registration",
  },
  applicant_type: {
    individual: "Individual",
    business: "Business",
    government: "Government",
    trust: "Trust",
    non_profit: "Non-Profit",
  },
  odometer_brand: { A: "Actual Mileage", N: "Not Actual", X: "Exceeds Mechanical Limits" },
  e_reminder: { yes: "Yes" },
};

/**
 * A stored code as the paper words it: the tap's own label for an answer
 * ("actual" reads "Yes, That Is The Real Mileage"), the ID's kind by name,
 * a phone the way people write one, a reading with its separators, a rate
 * with its percent sign. The review reads the page, so it says what the
 * page says.
 */
function printedWording(field: MapField, value: string): string {
  if (!value) return value;
  if (PHONE_IDS.has(field.id)) return printedPhone(value);
  if (MILEAGE_IDS.has(field.id) && /^\d+$/.test(value)) return Number(value).toLocaleString("en-US");
  if (PERCENT_IDS.has(field.id) && /^\d+(\.\d+)?$/.test(value)) return `${value}%`;
  const coded = FORM_130U_WORDS[field.id];
  if (coded && coded[value]) return coded[value];
  if (field.source.from === "buyer" && field.source.fact === "idKind") return idDocumentType(readIdKind(value)).label;
  if (field.id === "docFeeNotice") return "Printed beside the fee";
  if (field.source.from === "answer") {
    const fact = factById(field.source.fact);
    const option = fact?.options?.find((entry) => entry.value === value);
    if (option) return option.label;
  }
  return value;
}

/** Desk-written words a Spanish screen says in Spanish (the paper stays English). */
function valueKeysFor(field: MapField, raw: unknown, value: string): string[] | undefined {
  if (raw && typeof raw === "object" && "registrationByDealer" in (raw as Record<string, unknown>)) {
    return stillToDoKeys(raw as Record<string, unknown>);
  }
  if (field.source.from === "buyer" && field.source.fact === "idKind" && value) return [`idKind.${readIdKind(String(raw))}`];
  if (raw === true) return ["yes"];
  return undefined;
}

/** Blank on paper: nothing, or the visible "Not set" marker anywhere in it. */
function isBlank(value: string): boolean {
  return value.trim() === "" || value.includes("[Not set:");
}

/** Whether a box's condition holds on this sale, making a blank a defect. */
function requiredHere(field: MapField, input: ConditionInput | null): boolean {
  if (field.blank === "never") return true;
  const blank = field.blank;
  if (typeof blank === "object" && "when" in blank && blank.test) return input ? safe(blank.test, input) : false;
  return false;
}

function safe(test: (input: ConditionInput) => boolean, input: ConditionInput): boolean {
  try {
    return test(input);
  } catch {
    return false;
  }
}

function statusFor(field: MapField, value: string, required: boolean, asked: boolean): ReadBackStatus {
  const blank: Blank = field.blank;
  const empty = isBlank(value);
  if (typeof blank === "object" && "ink" in blank) return empty ? "ink" : "filled";
  if (typeof blank === "object" && "office" in blank) return "office";
  if (typeof blank === "object" && "marker" in blank) return empty ? "marker" : "filled";
  if (empty) return required ? "missing" : "blankAllowed";
  return asked ? "asked" : "filled";
}

/** Buyer facts typed at Start A Sale rather than read off the licence. */
const INTAKE_FACTS = new Set(["phone", "email", "street", "city", "state", "zip", "county", "address"]);

function chipFor(source: Source): ReadBackChip {
  if (source.from === "buyer" && INTAKE_FACTS.has(source.fact)) return "intake";
  return source.from;
}

/** Where a box is fixed on this sale, when there is a screen for it. */
export function factHref(field: MapField, sale: SaleDetail, documentType: string): string | undefined {
  return hrefFor(field.source, sale, documentType);
}

function hrefFor(source: Source, sale: SaleDetail, documentType: string): string | undefined {
  const deal = encodeURIComponent(sale.id);
  if (source.from === "answer") {
    const fact = factById(source.fact);
    if (!fact) return undefined;
    if (fact.owner.startsWith("guide:")) return `/admin/sales/${deal}/guide`;
    const owner = fact.owner === documentType ? documentType : fact.owner;
    return `/admin/sales/${deal}/paperwork/${encodeURIComponent(owner)}/${encodeURIComponent(fact.key)}?change=${encodeURIComponent(fact.key)}`;
  }
  if (source.from === "buyer") return `/admin/sales/${deal}/guide/buyerId`;
  if (source.from === "vehicle" && sale.vehicle?.id) return `/admin/inventory/${encodeURIComponent(sale.vehicle.id)}`;
  if (source.from === "fees" && (source.line === "titleFee" || source.line === "registrationFee")) {
    return `/admin/sales/${deal}/government-fees`;
  }
  return undefined;
}

/**
 * The source a box really reads on this sale: its answer when that answer
 * is a question here, else its fallback (the intake's licence state, the
 * solver's rate, the funding's "Financing").
 */
function effectiveSource(field: MapField, documentType: string, context: PaperworkContext | undefined): {
  source: Source;
  fact: DealFact | undefined;
  fellBack: boolean;
} {
  const source = field.source;
  if (source.from !== "answer") return { source, fact: undefined, fellBack: false };
  const fact = factById(source.fact);
  if (!fact || !context || fact.owner.startsWith("guide:")) return { source, fact, fellBack: false };
  if (factAppliesOnSale(fact, documentType, context)) return { source, fact, fellBack: false };
  return { source: field.fallback ?? { from: "computed", by: "not a question on this sale" }, fact, fellBack: true };
}

function conditionInput(
  sale: SaleDetail,
  formData: Record<string, unknown>,
  printed: Record<string, unknown>,
): ConditionInput {
  return { printed, formData, sale };
}

/** The value a row shows: the printed box, or for a carried answer the answer itself. */
function rawValue(field: MapField, printed: Record<string, unknown>, formData: Record<string, unknown>): unknown {
  if (printed[field.id] !== undefined) return printed[field.id];
  if (field.carriedFor && field.source.from === "answer") {
    const fact = factById(field.source.fact);
    return fact ? formData[fact.key] : undefined;
  }
  return undefined;
}

function rowFor(
  field: MapField,
  documentType: string,
  sale: SaleDetail,
  formData: Record<string, unknown>,
  printed: Record<string, unknown>,
  input: ConditionInput,
  context: PaperworkContext | undefined,
): ReadBackRow {
  const raw = rawValue(field, printed, formData);
  const value = printedWording(field, displayValue(field.id, raw));
  const { source, fellBack } = effectiveSource(field, documentType, context);
  const asked = source.from === "answer";
  const status = statusFor(field, value, requiredHere(field, input), asked);
  const href = fellBack && source.from !== "buyer" ? undefined : hrefFor(source, sale, documentType);
  const valueKeys = valueKeysFor(field, raw, value);
  return {
    id: field.id,
    label: field.label,
    value,
    status,
    source: chipFor(source),
    ...(valueKeys ? { valueKeys } : {}),
    ...(href ? { changeHref: href } : {}),
  };
}

/** The document's pages, each printed box on this sale with its value, source and status. */
export function readBack(
  documentType: string,
  sale: SaleDetail,
  formData: Record<string, unknown>,
  options: ReadBackOptions = {},
): ReadBackPage[] {
  const map = fieldMapFor(documentType);
  const printed = map ? probe(documentType, sale, formData, options) : null;
  if (!map || !printed) return [];
  const input = conditionInput(sale, formData, printed);
  const pages: ReadBackPage[] = map.pages
    .map((page) => ({
      page: page.page,
      title: page.title,
      rows: page.fields
        .filter((field) => field.printed !== false && fieldIsOn(field, input))
        .map((field) => rowFor(field, documentType, sale, formData, printed, input, options.context)),
    }))
    .filter((page) => page.rows.length > 0);
  // Asked here, printed on another document's paper.
  const carried = new Map<string, ReadBackRow[]>();
  for (const page of map.pages) {
    for (const field of page.fields) {
      if (!field.carriedFor || !fieldIsOn(field, input)) continue;
      if (conditionOf(field) === undefined && !requiredHere(field, input)) continue;
      const rows = carried.get(field.carriedFor) ?? [];
      rows.push(rowFor(field, documentType, sale, formData, printed, input, options.context));
      carried.set(field.carriedFor, rows);
    }
  }
  for (const [target, rows] of carried) {
    pages.push({ page: 0, title: fieldMapFor(target)?.pages[0]?.title ?? target, rows, carriedFor: target });
  }
  return pages;
}

/**
 * The boxes a sale should have filled and would leave blank: a "never" box,
 * or a box whose tested condition holds on this sale (a business applicant's
 * name and FEIN, a warranty's kind, period and systems, a trade-in's
 * description and allowance), whose probe is empty. Asked-here answers
 * another document prints (`carriedFor`) count too: the bill of sale holds
 * the warranty the Buyers Guide states. The labels, for the refusal.
 */
export function missingPrintedFields(
  documentType: string,
  sale: SaleDetail,
  formData: Record<string, unknown>,
  options: ProbeOptions = {},
): string[] {
  const map = fieldMapFor(documentType);
  if (!map || map.legacy) return [];
  const printed = probe(documentType, sale, formData, options);
  if (!printed) return [];
  const input = conditionInput(sale, formData, printed);
  const missing: string[] = [];
  for (const page of map.pages) {
    for (const field of page.fields) {
      if (field.printed === false && !field.carriedFor) continue;
      if (!fieldIsOn(field, input) || !requiredHere(field, input)) continue;
      if (typeof field.blank === "object" && "marker" in field.blank) continue;
      const value = displayValue(field.id, rawValue(field, printed, formData));
      if (isBlank(value)) missing.push(field.label);
    }
  }
  return missing;
}
