/**
 * The webDEALER handoff.
 *
 * Since 1 July 2025 every licensed Texas dealer has to file title and
 * registration electronically through TxDMV webDEALER, so this step is not
 * optional paperwork, it is how the car gets its plates.
 *
 * What this is not: an integration. TxDMV does support getting data in without
 * keyboard entry, by a transfer from a dealer management system that lands the
 * transaction in webDEALER as "Imported", but that path runs through a vendor
 * holding the Web Service Access permission, which is an approved-vendor
 * arrangement with TxDMV rather than something a site can call. Writing
 * straight into webDEALER from here would mean becoming that vendor. That is a
 * decision about the business, not a line of code, so it is written down in
 * docs/NEW_DEALERSHIP.md and left to the owner.
 *
 * What this is: everything webDEALER asks for, gathered off the deal that
 * already holds it, on one screen, one tap from the clipboard. The typing does
 * not disappear, but the looking-up does, and the looking-up is the part that
 * gets a VIN wrong. Nothing is invented: a field the deal does not hold shows
 * as missing and says which screen fills it, rather than being left blank for
 * someone to fill in from memory.
 */

import type { SaleDetail } from "@/lib/admin/sale-desk";
import { readBuyerId } from "@/lib/sales/buyer-id";
import { readMoney, saleMoney } from "@/lib/sales/money";
import { lenderNameFor } from "@/lib/sales/corridor-link";
import { dealership, factOr } from "@/lib/dealership-config";
import { readTitleOrigin } from "@/lib/vehicles/title-kinds";
import { readPaperwork } from "@/lib/sales/paperwork";

export type HandoffFieldKey =
  | "vin"
  | "yearMakeModel"
  | "emptyWeight"
  | "buyerName"
  | "buyerStreet"
  | "buyerCity"
  | "buyerState"
  | "buyerZip"
  | "buyerZipPlus4"
  | "buyerCounty"
  | "vinInspection"
  | "buyerIdNumber"
  | "salesPrice"
  | "lienholder"
  | "dealerGdn";

export type HandoffField = {
  /**
   * Stable identity for the row, so the screen can name it in the reader's
   * language while the clipboard text below keeps the English label —
   * webDEALER is an English form and the paste target does not change with
   * the operator's screen.
   */
  key: HandoffFieldKey;
  label: string;
  value: string | null;
  /** An absent optional value is not a missing filing requirement. */
  optional?: boolean;
  /** Where to go when it is missing. Only set for fields we can point at. */
  fixHref?: string;
  fixLabel?: string;
};

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatPrice(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

/** The two ZIP boxes in webDEALER. Never invent the four-digit extension. */
export function splitHandoffZip(value: string | null | undefined): {
  zip: string | null;
  plus4: string | null;
} {
  const match = cleanText(value)?.match(/^(\d{5})(?:[-\s]?(\d{4}))?$/);
  return { zip: match?.[1] ?? null, plus4: match?.[2] ?? null };
}

function emptyWeightFor(sale: SaleDetail): string | null {
  const answer = cleanText(readPaperwork(sale.stepData, "form130U").emptyWeight);
  const raw = answer ?? sale.vehicle?.weightLbs;
  if (raw == null) return null;
  const text = String(raw).replace(/,/g, "").trim();
  if (!/^\d+$/.test(text)) return null;
  const weight = Number(text);
  return Number.isSafeInteger(weight) && weight > 0 ? String(weight) : null;
}

/**
 * The fields, in the order webDEALER asks for them.
 *
 * Vehicle first, then buyer, then the sale, because that is the order of the
 * screens on their side. Reordering this to group "things we have" against
 * "things we do not" would read better and scan worse: the operator is copying
 * down a form, and the form has an order.
 */
export function buildHandoffFields(
  sale: SaleDetail,
  dealerLicense: string | null,
): HandoffField[] {
  const vehicle = sale.vehicle;
  const buyer = sale.buyer;
  const buyerHref = `/admin/sales/${encodeURIComponent(sale.id)}`;
  // The confirmed mailing record, which holds the address in the four parts
  // webDEALER wants rather than the one line the customer row keeps.
  const mailing = readBuyerId(sale.stepData).mailing;
  const zip = splitHandoffZip(mailing.postal);

  const yearMakeModel = [vehicle?.year, vehicle?.make, vehicle?.model]
    .filter((part) => part !== null && part !== undefined && `${part}`.length > 0)
    .join(" ")
    .trim();

  return [
    {
      key: "vin",
      label: "VIN",
      value: cleanText(vehicle?.vin)?.toUpperCase() ?? null,
    },
    {
      key: "yearMakeModel",
      label: "Year, make and model",
      value: yearMakeModel.length > 0 ? yearMakeModel : null,
    },
    {
      key: "emptyWeight",
      label: "Empty weight (lbs.)",
      value: emptyWeightFor(sale),
      fixHref: `/admin/sales/${encodeURIComponent(sale.id)}/guide/document:form130U`,
      fixLabel: "Add on the 130-U",
    },
    {
      key: "buyerName",
      label: "Name 1",
      value: cleanText(buyer?.name),
      fixHref: buyerHref,
      fixLabel: "Add on the sale",
    },
    /*
      The address in pieces, because webDEALER asks for it in pieces.

      Their form has separate inputs for street, city, state and ZIP, so a
      single "Buyer address" row meant copying one string and then splitting
      it by hand in their window, every single filing. The deal has held the
      parts all along, in the buyer's confirmed mailing record; this screen
      was reading the customer row's flattened copy instead.
    */
    {
      key: "buyerStreet",
      label: "Street address",
      value: cleanText(mailing.street) ?? cleanText(buyer?.address),
      fixHref: buyerHref,
      fixLabel: "Add on the sale",
    },
    {
      key: "buyerCity",
      label: "City",
      value: cleanText(mailing.city),
      fixHref: buyerHref,
      fixLabel: "Add on the sale",
    },
    {
      key: "buyerState",
      label: "State",
      value: cleanText(mailing.state)?.toUpperCase() ?? null,
      fixHref: buyerHref,
      fixLabel: "Add on the sale",
    },
    {
      key: "buyerZip",
      label: "ZIP",
      value: zip.zip,
      fixHref: buyerHref,
      fixLabel: "Add on the sale",
    },
    {
      key: "buyerZipPlus4",
      label: "ZIP +4",
      value: zip.plus4,
      optional: true,
    },
    {
      // On the 130-U as box 19 and on webDEALER as its own input, so it is
      // its own row rather than something to remember from the city.
      key: "buyerCounty",
      label: "County",
      value: cleanText(mailing.county),
      fixHref: buyerHref,
      fixLabel: "Add on the sale",
    },
    {
      key: "buyerIdNumber",
      label: "Buyer ID number",
      value: cleanText(buyer?.idNumber),
      fixHref: buyerHref,
      fixLabel: "Add on the sale",
    },
    {
      key: "salesPrice",
      label: "Sales price",
      /*
        The deal's own figure, not the vehicle row's. The row is where the
        box started; the typed amount is what two people agreed to, and the
        walkthrough caught this screen handing a $28,500 sticker price to
        webDEALER on a deal the operator had just closed at $6,000.
      */
      value: formatPrice(
        saleMoney(vehicle?.salePrice, readMoney(sale.stepData), 0, sale.funding.type)
          .salePrice,
      ),
    },
    {
      key: "lienholder",
      label: "Lienholder",
      /*
        Who holds the lien at title, which webDEALER asks and this list did
        not carry. The lender by name on a bank deal; the dealership itself
        when it carries the note; and on a paid cash deal the honest answer
        is none.
      */
      value:
        sale.funding.type === "lender"
          ? lenderNameFor(sale)
          : sale.funding.type === "inHouse"
            ? factOr(dealership.legalName, "dealer legal name")
            : "None",
      ...(sale.funding.type === "lender" && !lenderNameFor(sale)
        ? {
            fixHref: `/admin/sales/${encodeURIComponent(sale.id)}/guide/lender`,
            fixLabel: "Name the lender",
          }
        : {}),
    },
    {
      key: "dealerGdn",
      label: "Dealer GDN",
      value: cleanText(dealerLicense),
    },
    /*
      An out-of-state title, said where the filing happens.

      The July 2026 webDEALER guide (section 6.6.3) permits VIN self-
      certification where an out-of-state vehicle is not subject to a
      commercial or emissions inspection. Do not send every title to an
      auto theft investigator by claiming VTR-68-A is universally required.
    */
    ...(readTitleOrigin(sale.stepData).state
      ? [
          {
            key: "vinInspection" as const,
            label: "Out-of-state title",
            value: `Title from ${readTitleOrigin(sale.stepData).state}. Verify the applicable inspection or VIN self-certification before filing.`,
          },
        ]
      : []),
  ];
}

/**
 * The same fields as one block of text.
 *
 * Copying seven fields one at a time is seven round trips between two windows.
 * Copying the block once and reading down it is one. Both are offered because
 * the block is faster and the single field is what you want when webDEALER
 * rejects one entry and you are fixing just that.
 *
 * Missing fields are named rather than skipped, so a blank in the paste is
 * visible as a blank instead of silently shortening the list.
 */
export function handoffClipboardText(fields: HandoffField[]): string {
  return fields
    .map((field) => `${field.label}: ${field.value ?? (field.optional ? "(not supplied)" : "(missing)")}`)
    .join("\n");
}

export function missingHandoffFields(fields: HandoffField[]): HandoffField[] {
  return fields.filter((field) => field.value === null && !field.optional);
}

/**
 * Where the plate lands once webDEALER has issued it.
 *
 * Stored beside funding in step_data. The retired paperwork pipeline recorded
 * a plate at its step 7 and `readSaleRegistration` still reads that, so this
 * writes to its own key and the sale prefers whichever it finds.
 */
export const PLATE_KEY = "plate";

export function readPlate(stepData: unknown): string | null {
  if (!stepData || typeof stepData !== "object") return null;
  const raw = (stepData as Record<string, unknown>)[PLATE_KEY];
  return cleanText(typeof raw === "string" ? raw : null);
}

export function writePlate(
  stepData: unknown,
  plate: string,
): Record<string, unknown> {
  const base =
    stepData && typeof stepData === "object"
      ? { ...(stepData as Record<string, unknown>) }
      : {};
  base[PLATE_KEY] = plate.trim().toUpperCase();
  // A plate typed is a plate asked for; the corridor's step is answered.
  base[PLATE_ASKED_KEY] = true;
  return base;
}

/**
 * Whether the plate question has been put to the desk, whatever the answer.
 *
 * The plate is asked right after the registration answer, so it prints on
 * the bill of sale and the 130-U and sits ready on the webDEALER screen. Not
 * every sale has a plate at that moment: a dealer can have one on the shelf
 * or be waiting on webDEALER to issue it. "Not yet" is an answer, and the
 * step must move on from it without inventing a plate, so the fact that the
 * question was answered is stored apart from the plate itself.
 */
export const PLATE_ASKED_KEY = "plateAsked";

export function readPlateAsked(stepData: unknown): boolean {
  if (!stepData || typeof stepData !== "object") return false;
  return (stepData as Record<string, unknown>)[PLATE_ASKED_KEY] === true;
}

export function writePlateLater(stepData: unknown): Record<string, unknown> {
  const base =
    stepData && typeof stepData === "object"
      ? { ...(stepData as Record<string, unknown>) }
      : {};
  base[PLATE_ASKED_KEY] = true;
  return base;
}
