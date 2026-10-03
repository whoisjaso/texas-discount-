import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl, encodeCompletedLink } from "@/lib/documents/customerPortal";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * "Total Paid" is what was paid today, and a Paid Today line sits between
 * the total and the balance it leaves. It printed the total due: $4,001.75
 * paid beside a $501.75 balance still owed. Display only; the money is the
 * sale's own figures, unchanged.
 */
const render = (link: string) => renderToStaticMarkup(createElement(DocumentSheet, { decoded: decodeCompletedLinkFromUrl(link)! }));

describe("total paid is what was paid", () => {
  it("prints the paid-today figure, and the line above the balance", () => {
    const sale = ROUTES.bhphTrade;
    const formData = filedFormData("billOfSale", sale);
    const markup = render(corridorCompletedLink(sale, "billOfSale", formData, "https://x.test")!);
    expect(markup).toMatch(/data-total-paid="">\$1,500\.00</);
    expect(markup).toMatch(/data-paid-today=""[^>]*><span>Paid Today<\/span><span>\$1,500\.00/);
  });

  it("keeps the old reading on a copy filed before the paid-today figure was carried", () => {
    const legacy = encodeCompletedLink("billOfSale", { salePrice: 3500, tax: 218.75, titleFee: 33, docFee: 175, registrationFee: 75, otherFees: 0, tradeInAllowance: 0, tradeInPayoff: 0, saleDate: "2026-10-01" }, {}, "https://x.test");
    const markup = render(legacy);
    expect(markup).toMatch(/data-total-paid="">\$4,001\.75</);
    expect(markup).not.toContain("data-paid-today");
  });
});
