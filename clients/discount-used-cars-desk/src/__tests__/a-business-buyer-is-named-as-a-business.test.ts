import { describe, expect, it } from "vitest";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { FIELD_MAPPINGS } from "@/lib/fill-130u/field-mapping";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * A business applicant is the business: box 16 prints its legal name and
 * box 14 its FEIN, both asked on the 130-U. It used to print the person's
 * name parts and licence number under a ticked Business box.
 */
describe("a business buyer is named as a business", () => {
  const decoded = decodeCompletedLinkFromUrl(
    corridorCompletedLink(ROUTES.business, "form130U", filedFormData("form130U", ROUTES.business), "https://x.test")!,
  )!;
  const data = buildAgreementData(decoded, {}, null);

  it("names the entity and its FEIN", () => {
    expect(data.applicant_type).toBe("business");
    expect(data.buyer_entity_name).toBe("Gulf Coast Hauling, LLC");
    expect(data.buyer_dl_number).toBe("741234567");
    expect(FIELD_MAPPINGS.find((mapping) => mapping.fieldId === "Applicant Owner")?.getValue(data)).toBe("Gulf Coast Hauling, LLC");
  });

  it("ticks no photo ID box for a business", () => {
    for (const box of ["U.S. Driver License/ID Card", "Passport", "US Military ID"]) {
      expect(FIELD_MAPPINGS.find((mapping) => mapping.fieldId === box)?.getValue(data)).toBe(false);
    }
  });
});
