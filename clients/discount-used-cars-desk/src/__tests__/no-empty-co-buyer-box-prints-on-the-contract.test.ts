import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * Every buy-here-pay-here contract printed an empty "CO-BUYER INFORMATION"
 * box and a "Co-Buyer Signature" line. The rule that hid them sat inside a
 * phone-width media query, so it never applied to the printed page. With no
 * co-buyer there is no box and no line, on paper as on screen.
 */
describe("no empty co-buyer box prints on the contract", () => {
  it("has no co-buyer block and no co-buyer signature line without a co-buyer", () => {
    const sale = ROUTES.bhphTrade;
    const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(sale, "financing", filedFormData("financing", sale), "https://x.test")!)!;
    const markup = renderToStaticMarkup(createElement(DocumentSheet, { decoded }));
    expect(markup).not.toMatch(/Co-Buyer Information/i);
    expect(markup).not.toMatch(/Co-Buyer Signature/i);
    expect(markup).not.toContain('data-mobile-empty="true"');
    expect(markup).toContain("Avery J Collins Jr");
  });
});
