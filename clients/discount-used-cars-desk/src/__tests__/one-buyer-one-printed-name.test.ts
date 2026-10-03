import { describe, expect, it } from "vitest";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { FIELD_MAPPINGS } from "@/lib/fill-130u/field-mapping";
import { poaFieldsFromSale } from "@/lib/documents/poa-fields";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * The same buyer's printed name is the same on every document. The 130-U's
 * Applicant/Owner line dropped the suffix ("Avery J Collins") while box 16,
 * the bill of sale and the VTR-271 printed "Avery J Collins Jr", and its map
 * said the source was the buyer's whole name.
 */
describe("one buyer, one printed name", () => {
  it("is identical on the bill of sale, the 130-U and the power of attorney", () => {
    const sale = ROUTES.cashPaid;
    const bill = decodeCompletedLinkFromUrl(corridorCompletedLink(sale, "billOfSale", filedFormData("billOfSale", sale), "https://x.test")!)!;
    const form = buildAgreementData(
      decodeCompletedLinkFromUrl(corridorCompletedLink(sale, "form130U", filedFormData("form130U", sale), "https://x.test")!)!,
      {},
      null,
    );
    const applicant = FIELD_MAPPINGS.find((mapping) => mapping.fieldId === "Applicant Owner")?.getValue(form);
    expect(bill.dd.buyerName).toBe("Avery J Collins Jr");
    expect(applicant).toBe(bill.dd.buyerName);
    expect(poaFieldsFromSale(sale).printedName).toBe(bill.dd.buyerName);
  });
});
