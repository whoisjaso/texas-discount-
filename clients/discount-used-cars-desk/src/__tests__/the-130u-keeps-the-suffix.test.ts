import { describe, expect, it } from "vitest";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { FIELD_MAPPINGS } from "@/lib/fill-130u/field-mapping";
import { ROUTES } from "./fixtures/sales";

/** The suffix the licence recorded ("Jr") reaches box 16's own column. */
describe("the 130-U keeps the suffix", () => {
  it("maps applicantSuffix to the suffix column", () => {
    const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(ROUTES.cashPaid, "form130U", { salePrice: 9000 }, "https://x.test")!)!;
    const data = buildAgreementData(decoded, {}, null);
    expect(data.buyer_suffix).toBe("Jr");
    expect([data.buyer_first_name, data.buyer_middle_name, data.buyer_last_name]).toEqual(["Avery", "J", "Collins"]);
    // The applicant's printed name is the whole name, as box 16, the bill of
    // sale and the VTR-271 print it (the map's source is the buyer's name).
    expect(FIELD_MAPPINGS.find((mapping) => mapping.fieldId === "Applicant Owner")?.getValue(data)).toBe("Avery J Collins Jr");
  });

  it("keeps the printed name a copy filed before the stamp was signed with", () => {
    const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(ROUTES.cashPaid, "form130U", { salePrice: 9000 }, "https://x.test")!)!;
    const { pageLayout: _stamp, ...before } = decoded.dd as Record<string, unknown>;
    void _stamp;
    const data = buildAgreementData({ ...decoded, dd: before }, {}, null);
    expect(FIELD_MAPPINGS.find((mapping) => mapping.fieldId === "Applicant Owner")?.getValue(data)).toBe("Avery J Collins");
  });
});
