import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { missingPrintedFields, readBack } from "@/lib/documents/field-maps/resolve";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * With the owner's fees not set (a demo, DESK_ALLOW_UNSET_FACTS), the bill
 * of sale and the contract printed "Documentary Fee $0.00" and the review
 * read "$0.00 · From your fees", beside a money summary saying the fee was
 * not set: a figure the owner never gave. The fee is 0 in the arithmetic,
 * unchanged; the paper and the review print the "Not set" marker.
 */
const sheet = (type: string, sale: typeof ROUTES.cashPaid, docFeeSet: boolean) => {
  const formData = { ...filedFormData(type, sale), docFee: 0 };
  const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(sale, type, formData, "https://x.test", {}, { docFeeSet })!)!;
  return { decoded, markup: renderToStaticMarkup(createElement(DocumentSheet, { decoded })), formData };
};

describe("an unset doc fee prints its marker", () => {
  it("bill of sale: the line reads the marker, and the money is unchanged", () => {
    const { decoded, markup } = sheet("billOfSale", ROUTES.cashPaid, false);
    expect(decoded.dd.docFeeUnset).toBe(true);
    expect(decoded.dd.docFee).toBe(0);
    expect(markup).toMatch(/data-doc-fee="">\[Not set: doc fee\]</);
  });

  it("contract: the itemization reads the marker", () => {
    const { markup } = sheet("financing", ROUTES.bhphTrade, false);
    expect(markup).toContain("[Not set: doc fee]");
  });

  it("a set fee prints its figure and carries no marker", () => {
    const { decoded, markup } = sheet("billOfSale", ROUTES.cashPaid, true);
    expect(decoded.dd).not.toHaveProperty("docFeeUnset");
    expect(markup).not.toContain("[Not set: doc fee]");
  });

  it("reads back as not set by the owner, and is not a box the filing refuses", () => {
    const formData = { ...filedFormData("billOfSale", ROUTES.cashPaid), docFee: 0 };
    const row = readBack("billOfSale", ROUTES.cashPaid, formData, { docFeeSet: false })
      .flatMap((page) => page.rows)
      .find((entry) => entry.id === "docFee");
    expect(row?.status).toBe("marker");
    expect(missingPrintedFields("billOfSale", ROUTES.cashPaid, formData, { docFeeSet: false })).not.toContain("Documentary Fee");
  });
});
