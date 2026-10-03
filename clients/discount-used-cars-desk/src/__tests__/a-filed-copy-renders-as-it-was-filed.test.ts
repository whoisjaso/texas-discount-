import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl, type CompletedLinkData } from "@/lib/documents/customerPortal";
import { ROUTES, filedFormData, owedDocuments } from "./fixtures/sales";

/**
 * A copy filed before the page-by-page change carries none of the values
 * the change stamps (who files the registration, the late fee, the ID's
 * kind and issuer, the warranty's kind and shares, the renewal answer, the
 * balance beside Paid Today). Each renderer falls back to what it printed
 * then, so an old copy renders whole: no "undefined", no NaN, no box
 * reading a value the copy never carried.
 */

const STAMPS = [
  "registrationBy",
  "lateHandlingFee",
  "lateHandlingTotal",
  "buyerIdIssuer",
  "warrantyKind",
  "warrantyLaborPercent",
  "warrantyPartsPercent",
  "warrantySystems",
  "renewalReminders",
  "balanceOwed",
  "amountPaidToday",
  "stockNumber",
  "tradeInVin",
];

const DESIGNED = new Set([
  "billOfSale",
  "financing",
  "vehicleResponsibility",
  "insuranceAcknowledgment",
  "rebuiltDisclosure",
  "salvageBillOfSale",
  "towAwayAcknowledgment",
  "buyerResponsibilityStatement",
]);

function filedBefore(decoded: CompletedLinkData): CompletedLinkData {
  const dd = { ...decoded.dd };
  for (const key of STAMPS) delete dd[key];
  return { ...decoded, dd };
}

describe("a filed copy renders as it was filed", () => {
  for (const [route, sale] of Object.entries(ROUTES)) {
    for (const type of owedDocuments(sale).filter((t) => DESIGNED.has(t))) {
      it(`${route}: ${type} without the new stamps`, () => {
        const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(sale, type, filedFormData(type, sale), "https://x.test")!)!;
        const now = renderToStaticMarkup(createElement(DocumentSheet, { decoded }));
        const old = renderToStaticMarkup(createElement(DocumentSheet, { decoded: filedBefore(decoded) }));
        for (const markup of [now, old]) {
          expect(markup).not.toMatch(/>undefined<|>NaN<|\$NaN|\[object Object\]/);
          // The rebuilt disclosure is the state's own page, drawn from the PDF route.
          if (type !== "rebuiltDisclosure") expect(markup).toContain("1G1ZD5ST8MF345678");
        }
      });
    }
  }

  it("prints the ID number alone, and no issuer, on a copy filed before the ID's kind was stamped", () => {
    const decoded = decodeCompletedLinkFromUrl(
      corridorCompletedLink(ROUTES.cashPaid, "vehicleResponsibility", filedFormData("vehicleResponsibility", ROUTES.cashPaid), "https://x.test")!,
    )!;
    const { buyerIdKind: _kind, ...rest } = filedBefore(decoded).dd;
    void _kind;
    const markup = renderToStaticMarkup(createElement(DocumentSheet, { decoded: { ...decoded, dd: rest } }));
    expect(markup).toContain("12345678");
    expect(markup).not.toContain("(Driver Licence");
  });

  it("prints the old Total Paid, the total due, on a bill of sale filed before Paid Today was stamped", () => {
    const decoded = decodeCompletedLinkFromUrl(
      corridorCompletedLink(ROUTES.cashBalance, "billOfSale", filedFormData("billOfSale", ROUTES.cashBalance), "https://x.test")!,
    )!;
    const now = renderToStaticMarkup(createElement(DocumentSheet, { decoded }));
    const old = renderToStaticMarkup(createElement(DocumentSheet, { decoded: filedBefore(decoded) }));
    const paid = (markup: string) => /data-total-paid="">([^<]+)</.exec(markup)?.[1];
    expect(paid(now)).toBe("$3,500.00");
    expect(paid(old)).not.toBe("$3,500.00");
    expect(old).not.toContain('data-paid-today=""');
  });
});
