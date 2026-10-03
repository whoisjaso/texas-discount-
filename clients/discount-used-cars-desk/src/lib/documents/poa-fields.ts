import type { SaleDetail } from "@/lib/admin/sale-desk";
import { nameForForms, readBuyerId, settled } from "@/lib/sales/buyer-id";
import { readPaperwork } from "@/lib/sales/paperwork";
import { dealership, factOr } from "@/lib/dealership-config";
import type { PowerOfAttorneyFormFields } from "@/lib/documents/powerOfAttorneyForm";
import { splitPersonName, type NameParts } from "@/lib/forms/person-name";

/**
 * Every box of the VTR-271, read off the sale (field-maps/power-of-attorney).
 *
 * The route used to read the vehicle row's plate, put the whole mailing
 * line (city, state and ZIP twice, "Tx" lower-cased) into the street box,
 * name the grantee by the public trade name and print a Printed Name from a
 * different string than the name boxes. One builder, one source per box:
 *
 *   plate          the sale's plate answer, the one the bill of sale and the
 *                  130-U print, as "TX <plate>" (webDEALER issues Texas plates)
 *   street         the mailing street alone; city, county, state and ZIP
 *                  have their own boxes
 *   county         the 130-U's county answer, else the intake's: one county
 *   grantee        the licensed entity (dealership.legalName), the name on
 *                  the GDN record and on every other document
 *   printed name   built from the same parts the name boxes print
 */
export type PoaFields = PowerOfAttorneyFormFields & {
  grantorNameParts: NameParts;
  granteeName: string;
  granteeAddress: string;
  granteeCity: string;
  granteeCounty: string;
  granteeState: string;
  granteeZip: string;
  printedName: string;
};

/** The grantee: the dealership's legal name, falling back to its public name. */
export function poaGranteeName(): string {
  return factOr(dealership.legalName ?? dealership.name, "dealer legal name");
}

export function poaFieldsFromSale(sale: SaleDetail): PoaFields {
  const held = readBuyerId(sale.stepData);
  const name = settled(held.name) ?? sale.buyer?.name ?? "";
  const forForms = nameForForms(held);
  // The licence's parts; a deal with no licence name splits the one it has.
  const parts: NameParts = forForms.source !== "none" ? forForms.parts : splitPersonName(name);
  const mailing = held.mailing;
  const county =
    (readPaperwork(sale.stepData, "form130U").countyOfResidence ?? "").trim() || (mailing.county ?? "").trim();
  const printedName = [parts.first, parts.middle, parts.last, parts.suffix].filter(Boolean).join(" ") || name;
  const plate = (sale.plate ?? "").trim();
  return {
    vin: sale.vehicle?.vin ?? "",
    year: sale.vehicle?.year ? String(sale.vehicle.year) : "",
    make: sale.vehicle?.make ?? "",
    model: sale.vehicle?.model ?? "",
    bodyStyle: sale.vehicle?.bodyStyle ?? "",
    licensePlate: plate ? `TX ${plate.toUpperCase()}` : "",
    titleDocumentNumber: "",
    grantorName: printedName,
    grantorNameParts: parts,
    grantorAddress: mailing.street ?? sale.buyer?.address ?? "",
    grantorCity: mailing.city ?? "",
    grantorCounty: county,
    grantorState: (mailing.state ?? "").toUpperCase(),
    grantorZip: mailing.postal ?? "",
    granteeName: poaGranteeName(),
    granteeAddress: dealership.address.street,
    granteeCity: dealership.address.locality,
    granteeCounty: dealership.county ?? "",
    granteeState: dealership.address.region,
    granteeZip: dealership.address.postalCode,
    printedName,
    // Dated by the grantor in ink.
    executedDate: "",
  };
}

/** The same fields keyed by the map's ids, for the read-back and the tests. */
export function poaProbe(fields: PoaFields): Record<string, unknown> {
  return {
    vin: fields.vin,
    year: fields.year,
    make: fields.make,
    bodyStyle: fields.bodyStyle,
    model: fields.model,
    licensePlate: fields.licensePlate,
    titleDocumentNumber: fields.titleDocumentNumber,
    grantorFirst: fields.grantorNameParts.first ?? "",
    grantorMiddle: fields.grantorNameParts.middle ?? "",
    grantorLast: fields.grantorNameParts.last ?? "",
    grantorSuffix: fields.grantorNameParts.suffix ?? "",
    grantorAddress: fields.grantorAddress,
    grantorCity: fields.grantorCity,
    grantorCounty: fields.grantorCounty,
    grantorState: fields.grantorState,
    grantorZip: fields.grantorZip,
    granteeName: fields.granteeName,
    granteeAddress: fields.granteeAddress,
    granteeCity: fields.granteeCity,
    granteeCounty: fields.granteeCounty,
    granteeState: fields.granteeState,
    granteeZip: fields.granteeZip,
    printedName: fields.printedName,
    executedDate: fields.executedDate,
    grantorSignature: "",
  };
}

/**
 * The form's fields back from a filed copy's `form_data.printed` (the probe
 * stamped at filing), or null for a copy filed before the stamp. A filed
 * power of attorney reprints what was signed: rebuilding it from the sale
 * now would follow any answer changed since (the county, the plate).
 */
export function poaFormFieldsFromPrinted(printed: unknown): PowerOfAttorneyFormFields | null {
  if (!printed || typeof printed !== "object") return null;
  const p = printed as Record<string, unknown>;
  const text = (key: string) => (typeof p[key] === "string" ? (p[key] as string) : "");
  if (!text("vin")) return null;
  const parts: NameParts = {
    first: text("grantorFirst"),
    middle: text("grantorMiddle"),
    last: text("grantorLast"),
    suffix: text("grantorSuffix"),
  };
  return {
    vin: text("vin"),
    year: text("year") || undefined,
    make: text("make") || undefined,
    model: text("model") || undefined,
    bodyStyle: text("bodyStyle") || undefined,
    licensePlate: text("licensePlate") || undefined,
    titleDocumentNumber: text("titleDocumentNumber") || undefined,
    grantorName: text("printedName"),
    grantorNameParts: parts,
    grantorAddress: text("grantorAddress") || undefined,
    grantorCity: text("grantorCity") || undefined,
    grantorCounty: text("grantorCounty") || undefined,
    grantorState: text("grantorState") || undefined,
    grantorZip: text("grantorZip") || undefined,
    executedDate: text("executedDate") || undefined,
  };
}
