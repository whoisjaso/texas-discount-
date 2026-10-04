import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { DEALER_LICENSE } from "@/lib/documents/shared";
import { ROUTES, filedFormData } from "./fixtures/sales";

/** The dealer's GDN prints as the Texas Dealer License, never under a driver's "DL#". */
describe("the dealer line names the dealer licence", () => {
  for (const [route, type] of [["cashPaid", "billOfSale"], ["bhphTrade", "financing"]] as const) {
    it(type, () => {
      const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(ROUTES[route], type, filedFormData(type, ROUTES[route]), "https://x.test")!)!;
      const markup = renderToStaticMarkup(createElement(DocumentSheet, { decoded }));
      expect(markup).toContain(`Texas Dealer License ${DEALER_LICENSE}`);
      expect(markup).not.toContain(`DL# ${DEALER_LICENSE}`);
    });
  }

  it("prints the letterhead's licence label in the sheet's language", () => {
    const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(ROUTES.spanish, "insuranceAcknowledgment", { salePrice: 9000 }, "https://x.test")!)!;
    const markup = renderToStaticMarkup(createElement(DocumentSheet, { decoded }));
    expect(markup).toContain(`Licencia de concesionario ${DEALER_LICENSE}`);
    expect(markup).not.toContain(`Dealer licence ${DEALER_LICENSE}`);
  });
});
