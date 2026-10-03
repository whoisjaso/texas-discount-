import type { SaleDetail } from "@/lib/admin/sale-desk";
import { fieldMapFor } from "@/lib/documents/field-maps";
import { probe, type ProbeOptions } from "@/lib/documents/field-maps/probes";
import type { Blank, MapField, Source } from "@/lib/documents/field-maps/types";
import { factById } from "@/lib/sales/deal-facts";
import { usDate } from "@/lib/documents/us-date";
import { printedPhone } from "@/lib/forms/phone";
import { idDocumentType, readIdKind } from "@/lib/forms/id-document";

/**
 * The page read back, and the boxes it would print blank.
 *
 * The review screen used to list the answers and the money, whatever the
 * document printed: the rebuilt disclosure's review showed a car price the
 * state page never prints and none of the four values it does. Now the
 * review is the page: each printed box, in page order, with what it will
 * say and where that came from. A box the sale should have filled and did
 * not is marked missing, with the place it is fixed, and the filing refuses
 * it (`missingPrintedFields`).
 */

export type ReadBackStatus =
  | "filled"
  | "asked"
  | "blankAllowed"
  | "ink"
  | "office"
  | "marker"
  | "missing";

export type ReadBackRow = {
  id: string;
  label: string;
  value: string;
  status: ReadBackStatus;
  /** The source chip: dealer, fees, vehicle, buyer, coBuyer, answer, computed, date, signature, static, none. */
  source: Source["from"];
  /** Where the box is fixed: the question, the licence step or the car. */
  changeHref?: string;
};

export type ReadBackPage = { page: number; title: string; rows: ReadBackRow[] };

const MONEY_IDS = new Set([
  "salePrice", "cashPrice", "tax", "titleFee", "docFee", "registrationFee", "inspectionFee", "plateFee",
  "tradeInAllowance", "tradeInPayoff", "amountPaidToday", "sellerLienAmount", "downPayment", "dueAtSigning",
  "paymentAmount", "lastPaymentAmount", "quotedRegistrationAmount", "lateHandlingFee", "lateHandlingTotal",
  "total", "balanceOwed", "otherFees", "sale_price", "trade_in_amount", "trade_in_amount_38b",
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
      return [
        plan.registrationByDealer ? "We file the registration" : "The buyer files the registration",
        plan.insuranceShown === undefined ? "" : plan.insuranceShown ? "Insurance on file" : "Insurance owed",
        plan.inspectionDone ? "Inspection passed" : plan.inspectionByDealer === undefined ? "" : plan.inspectionByDealer ? "We inspect" : "The buyer inspects",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    return "";
  }
  return String(raw);
}

const PHONE_IDS = new Set(["buyerPhone", "coBuyerPhone", "dealerPhone"]);
const MILEAGE_IDS = new Set(["vehicleMileage", "odometerReading", "odometer"]);

/**
 * A stored code as the paper words it: the tap's own label for an answer
 * ("actual" reads "Yes, That Is The Real Mileage"), the ID's kind by name,
 * a phone the way people write one, a reading with its separators. The
 * review reads the page, so it says what the page says.
 */
function printedWording(field: MapField, value: string): string {
  if (!value) return value;
  if (PHONE_IDS.has(field.id)) return printedPhone(value);
  if (MILEAGE_IDS.has(field.id) && /^\d+$/.test(value)) return Number(value).toLocaleString("en-US");
  if (field.source.from === "buyer" && field.source.fact === "idKind") return idDocumentType(readIdKind(value)).label;
  if (field.id === "docFeeNotice") return "Printed beside the fee";
  if (field.source.from === "answer") {
    const fact = factById(field.source.fact);
    const option = fact?.options?.find((entry) => entry.value === value);
    if (option) return option.label;
  }
  return value;
}

function isBlank(value: string): boolean {
  return value.trim() === "" || /^\[Not set:/.test(value.trim());
}

function statusFor(field: MapField, value: string): ReadBackStatus {
  const blank: Blank = field.blank;
  const empty = isBlank(value);
  if (typeof blank === "object" && "ink" in blank) return empty ? "ink" : "filled";
  if (typeof blank === "object" && "office" in blank) return "office";
  if (typeof blank === "object" && "marker" in blank) return empty ? "marker" : "filled";
  if (empty) return blank === "never" ? "missing" : "blankAllowed";
  return field.source.from === "answer" ? "asked" : "filled";
}

/** Where a box is fixed on this sale, when there is a screen for it. */
export function factHref(field: MapField, sale: SaleDetail, documentType: string): string | undefined {
  const deal = encodeURIComponent(sale.id);
  const source = field.source;
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

/** The document's pages, each printed box with its value, source and status. */
export function readBack(
  documentType: string,
  sale: SaleDetail,
  formData: Record<string, unknown>,
  options: ProbeOptions = {},
): ReadBackPage[] {
  const map = fieldMapFor(documentType);
  const printed = map ? probe(documentType, sale, formData, options) : null;
  if (!map || !printed) return [];
  return map.pages
    .map((page) => ({
      page: page.page,
      title: page.title,
      rows: page.fields
        .filter((field) => field.printed !== false)
        .map((field) => {
          const value = printedWording(field, displayValue(field.id, printed[field.id]));
          const status = statusFor(field, value);
          const href = factHref(field, sale, documentType);
          return {
            id: field.id,
            label: field.label,
            value,
            status,
            source: field.source.from,
            ...(href ? { changeHref: href } : {}),
          };
        }),
    }))
    .filter((page) => page.rows.length > 0);
}

/**
 * The printed boxes a sale should have filled and would leave blank: a
 * `blank: "never"` box whose probe is empty. The labels, for the refusal.
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
  const missing: string[] = [];
  for (const page of map.pages) {
    for (const field of page.fields) {
      if (field.printed === false || field.blank !== "never") continue;
      if (isBlank(displayValue(field.id, printed[field.id]))) missing.push(field.label);
    }
  }
  return missing;
}
