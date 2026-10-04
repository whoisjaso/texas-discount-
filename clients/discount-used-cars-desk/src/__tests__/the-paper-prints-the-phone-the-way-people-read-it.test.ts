import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { printedPhone } from "@/lib/forms/phone";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { FIELD_MAPPINGS } from "@/lib/fill-130u/field-mapping";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { ROUTES, filedFormData } from "./fixtures/sales";

/** (713) 555-0188, not +17135550188, on the bill of sale, the contract and 130-U box 25. */
describe("the paper prints the phone the way people read it", () => {
  it("formats a US number and leaves anything else as stored", () => {
    expect(printedPhone("+17135550188")).toBe("(713) 555-0188");
    expect(printedPhone("7135550188")).toBe("(713) 555-0188");
    expect(printedPhone("+52 55 1234 5678")).toBe("+52 55 1234 5678");
    expect(printedPhone(null)).toBe("");
  });

  for (const [route, type] of [["cashPaid", "billOfSale"], ["bhphTrade", "financing"]] as const) {
    it(`${type}`, () => {
      const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(ROUTES[route], type, filedFormData(type, ROUTES[route]), "https://x.test")!)!;
      const markup = renderToStaticMarkup(createElement(DocumentSheet, { decoded }));
      expect(markup).toContain("(713) 555-0188");
      expect(markup).not.toContain("+17135550188");
    });
  }

  it("130-U box 25", () => {
    const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(ROUTES.cashPaid, "form130U", { salePrice: 9000 }, "https://x.test")!)!;
    const data = buildAgreementData(decoded, {}, null);
    expect(FIELD_MAPPINGS.find((mapping) => mapping.fieldId === "25 Applicant Phone Number optional")?.getValue(data)).toBe("(713) 555-0188");
  });
});
