import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl, type CompletedLinkData } from "@/lib/documents/customerPortal";
import { calculateBillOfSale, formatCurrency, type BillOfSaleData } from "@/lib/documents/billOfSale";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * A bill of sale filed before the page-by-page change reprints exactly what
 * it printed when it was signed.
 *
 * Every corridor bill of sale has carried `amountPaidToday` since the first
 * corridor commit, so that key cannot tell an old copy from a new one: a
 * renderer reading it flipped every old copy's "Total Paid" from the total
 * due to the paid-today figure. Filing now stamps `pageLayout`, and only a
 * stamped copy takes the new readings (Total Paid, the Paid Today line, the
 * sale date beside an unsigned line). An old copy is today's payload minus
 * that stamp: the shape every real old copy has.
 */
afterEach(() => vi.useRealTimers());

const render = (decoded: CompletedLinkData) => renderToStaticMarkup(createElement(DocumentSheet, { decoded }));
const totalPaid = (markup: string) => /data-total-paid="">([^<]+)</.exec(markup)?.[1];
const signatureDates = (markup: string) => [...markup.matchAll(/signature-date[^>]*>([^<]+)</g)].map((match) => match[1]);

function filed(saleDate?: string) {
  const sale = ROUTES.cashBalance;
  return decodeCompletedLinkFromUrl(
    corridorCompletedLink(sale, "billOfSale", filedFormData("billOfSale", sale), "https://x.test", {}, { saleDate: saleDate ?? null })!,
  )!;
}

function signedBefore(decoded: CompletedLinkData): CompletedLinkData {
  const { pageLayout: _stamp, ...dd } = decoded.dd as Record<string, unknown>;
  void _stamp;
  return { ...decoded, dd };
}

describe("an old bill of sale reprints as it was signed", () => {
  it("carries the paid-today figure in both shapes, so only the stamp tells them apart", () => {
    const decoded = filed();
    expect(typeof (decoded.dd as Record<string, unknown>).amountPaidToday).toBe("number");
    expect((decoded.dd as Record<string, unknown>).pageLayout).toBe(1);
    expect((signedBefore(decoded).dd as Record<string, unknown>).amountPaidToday).toBe(3500);
  });

  it("prints Total Paid as the total due, with no Paid Today line, on a copy filed before the stamp", () => {
    const old = signedBefore(filed());
    const due = calculateBillOfSale(old.dd as unknown as BillOfSaleData).totalDue;
    const markup = render(old);
    expect(totalPaid(markup)).toBe(formatCurrency(due));
    expect(totalPaid(markup)).not.toBe("$3,500.00");
    expect(markup).not.toContain('data-paid-today=""');
  });

  it("prints what was paid today, and its line, on a copy filed since", () => {
    const markup = render(filed());
    expect(totalPaid(markup)).toBe("$3,500.00");
    expect(markup).toContain('data-paid-today=""');
  });

  it("dates an unsigned line with the sale date on a stamped copy, and the print date on an old one", () => {
    const decoded = filed("2026-10-03");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T18:00:00Z"));
    expect(signatureDates(render(decoded))).toContain("10/03/2026");
    expect(signatureDates(render(decoded))).not.toContain("10/10/2026");
    expect(signatureDates(render(signedBefore(decoded)))).toContain("10/10/2026");
    expect(signatureDates(render(signedBefore(decoded)))).not.toContain("10/03/2026");
  });
});
