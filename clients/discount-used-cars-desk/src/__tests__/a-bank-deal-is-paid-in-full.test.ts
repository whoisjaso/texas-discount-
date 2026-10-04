import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { billOfSaleTotalPaid, calculateBillOfSale, formatCurrency, type BillOfSaleData } from "@/lib/documents/billOfSale";
import { readBack } from "@/lib/documents/field-maps/resolve";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * On a bank deal the lot is paid in full: the buyer's part today and the
 * lender's at funding. The acknowledgment's "Total Paid" printed only the
 * down payment beside the full total due, with no balance and no lender
 * line, so the signed record read as if most of the price was neither paid
 * nor owed. It prints the total due, with the lender's part on its own line.
 * Display only: the figures are the sale's own.
 */
const sale = ROUTES.bankTypedLender;
const formData = filedFormData("billOfSale", sale);
const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(sale, "billOfSale", formData, "https://x.test")!)!;
const data = decoded.dd as unknown as BillOfSaleData;
const markup = renderToStaticMarkup(createElement(DocumentSheet, { decoded }));

describe("a bank deal is paid in full", () => {
  it("prints Total Paid as the total due", () => {
    const due = calculateBillOfSale(data).totalDue;
    expect(due).toBeGreaterThan(2000);
    expect(/data-total-paid="">([^<]+)</.exec(markup)?.[1]).toBe(formatCurrency(due));
  });

  it("names the lender's part, the total less what was paid today", () => {
    const paid = billOfSaleTotalPaid(data);
    expect(paid.paidToday).toBe(2000);
    expect(paid.lenderName).toBe("First Community Bank");
    expect(paid.financedByLender).toBe(Math.round((calculateBillOfSale(data).totalDue - 2000) * 100) / 100);
    expect(markup).toContain(`Financed by First Community Bank`);
    expect(markup).toContain(formatCurrency(paid.financedByLender));
    expect(markup).toMatch(/data-paid-today=""[^>]*><span>Paid Today<\/span><span>\$2,000\.00/);
  });

  it("reads the same lines back on the review", () => {
    const rows = readBack("billOfSale", sale, formData).flatMap((page) => page.rows);
    const value = (id: string) => rows.find((row) => row.id === id)?.value;
    expect(value("totalPaid")).toBe(formatCurrency(calculateBillOfSale(data).totalDue));
    expect(value("financedByLender")).toBe(formatCurrency(billOfSaleTotalPaid(data).financedByLender));
  });

  it("keeps a cash sale's Total Paid as what was paid", () => {
    const cash = decodeCompletedLinkFromUrl(
      corridorCompletedLink(ROUTES.cashBalance, "billOfSale", filedFormData("billOfSale", ROUTES.cashBalance), "https://x.test")!,
    )!;
    const paid = billOfSaleTotalPaid(cash.dd as unknown as BillOfSaleData);
    expect(paid.totalPaid).toBe(3500);
    expect(paid.financedByLender).toBe(0);
  });
});
