import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Law review, 2026-10-03 (blocker): on the buy here pay here contract the
 * documentary fee was in the itemization on one page and its notice was
 * clause 16, two pages later. Tex. Fin. Code §348.006(c)(3)(B) puts the
 * notice "in reasonable proximity to the place in each where the amount of
 * the documentary fee is disclosed", on the buyer's order AND the retail
 * installment contract, and the onboarding screen told the owner it "Prints
 * beside this fee on every bill of sale and finance contract".
 *
 * Now, on every copy filed with the notice's stamp:
 *   - the notice is the very next thing after the documentary fee's line in
 *     the itemization, word for word, with the approved Spanish one on a
 *     Spanish sale;
 *   - the documentary fee is its own item after the cash price, not inside
 *     it (§348.004(c), §348.006(a)(1)(C)), and the amounts are unchanged;
 *   - clause 16 stays as well.
 * A copy filed before the stamp prints exactly as it was filed.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => "/" }));

import ContractPreview from "@/components/documents/ContractPreview";
import { contractFigures, type ContractData } from "@/lib/documents/finance";
import { DOC_FEE_NOTICE_EN, DOC_FEE_NOTICE_ES } from "@/lib/legal/doc-fee-notice";

const contract = {
  contractDate: "2026-10-03", stockNumber: "", buyerName: "Andrea Salinas", buyerAddress: "7400 Metz St", buyerPhone: "", buyerEmail: "",
  coBuyerName: "", coBuyerAddress: "", coBuyerPhone: "", coBuyerEmail: "", vehicleYear: "2017", vehicleMake: "Ford",
  vehicleModel: "Explorer", vehicleVin: "1FM5K8D80HGA00001", vehiclePlate: "", vehicleMileage: "88000", cashPrice: 9000,
  tradeInAllowance: 0, downPayment: 2000, tax: 562.5, titleFee: 33, registrationFee: 75, docFee: 150, apr: 18,
  numberOfPayments: 24, paymentFrequency: "Monthly", firstPaymentDate: "2026-11-03", dueAtSigning: 2000,
} as unknown as ContractData;

const html = (data: ContractData) => renderToStaticMarkup(createElement(ContractPreview, { data, signatures: {} as never }));

/** The markup of the itemization block alone (up to the as-is notice beside it). */
function itemization(page: string): string {
  const start = page.indexOf('data-contract-itemization="stamped"');
  expect(start).toBeGreaterThan(-1);
  return page.slice(start, page.indexOf('class="doc-notice"', start));
}

describe("the notice sits beside the documentary fee on the contract", () => {
  it("prints the exact notice immediately after the fee's line, before anything else", () => {
    const page = html({ ...contract, docFeeNotice: 1 } as ContractData);
    const feeLine = page.indexOf('data-item="docFee"');
    expect(feeLine).toBeGreaterThan(-1);
    // The fee's own row closes, and the very next element is the notice.
    const rowEnd = page.indexOf("</span></div>", feeLine) + "</span></div>".length;
    const nextElement = page.slice(rowEnd);
    expect(nextElement.startsWith('<div class="bos-doc-fee-notice" data-doc-fee-notice="">')).toBe(true);
    expect(nextElement.startsWith(`<div class="bos-doc-fee-notice" data-doc-fee-notice=""><p lang="en">${DOC_FEE_NOTICE_EN}</p>`)).toBe(true);
    // In the itemization, ahead of the terms and their clause 16.
    const notice = page.indexOf(DOC_FEE_NOTICE_EN);
    expect(notice).toBeGreaterThan(feeLine);
    expect(notice).toBeLessThan(page.indexOf("1. PROMISE TO PAY"));
    expect(notice).toBeLessThan(page.indexOf("16. DOCUMENTARY FEE:"));
    // Clause 16 still prints it too.
    expect(page.split(DOC_FEE_NOTICE_EN).length - 1).toBe(2);
  });

  it("adds the approved Spanish notice beside it on a Spanish sale", () => {
    const page = html({ ...contract, docFeeNotice: 1, docFeeNoticeSpanish: true } as ContractData);
    const feeLine = page.indexOf('data-item="docFee"');
    const block = page.slice(feeLine, page.indexOf("4. Down Payment", feeLine));
    expect(block).toContain(DOC_FEE_NOTICE_EN);
    expect(block).toContain(DOC_FEE_NOTICE_ES);
  });

  it("itemizes the documentary fee on its own, after the cash price, with the same amounts", () => {
    const data = { ...contract, docFeeNotice: 1 } as ContractData;
    const page = html(data);
    const block = itemization(page);
    const { totalCashPrice, amountFinanced } = contractFigures(data);
    const cashPrice = totalCashPrice - data.docFee;
    // The cash price subtotal carries the tax and the government fees, not the doc fee.
    expect(block).toContain("2. Cash Price (Including Tax And Government Fees)");
    expect(block).toContain(`$${cashPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    expect(cashPrice).toBe(9000 + 562.5 + 33 + 75);
    expect(block.indexOf("2. Cash Price")).toBeLessThan(block.indexOf('data-item="docFee"'));
    expect(block).toContain("3. Documentary Fee");
    // The amount financed is what it always was: the whole, less the down payment.
    expect(block).toContain("5. Amount Financed (2 plus 3, minus 4)");
    expect(block).toContain(`$${amountFinanced.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    expect(amountFinanced).toBe(9000 + 562.5 + 33 + 75 + 150 - 2000);
    // No doc fee line inside the cash price's lettered items.
    expect(block).not.toContain("c. Documentary Fee");
  });

  it("puts the government lines of their own inside the cash price, never inside registration", () => {
    const data = { ...contract, docFeeNotice: 1, inspectionFee: 7.5, plateFee: 10, registrationFee: 68.25 } as ContractData;
    const page = html(data);
    const block = itemization(page);
    expect(block).toContain("d. Government Vehicle Inspection Program Replacement Fee");
    expect(block).toContain("e. License Plate Fee");
    expect(contractFigures(data).totalCashPrice).toBe(9000 + 562.5 + 33 + 68.25 + 7.5 + 10 + 150);
    expect(block.indexOf("e. License Plate Fee")).toBeLessThan(block.indexOf("2. Cash Price"));
  });

  it("prints a copy filed before the notice exactly as it was filed", () => {
    const page = html(contract);
    expect(page).not.toContain('data-contract-itemization="stamped"');
    expect(page).toContain("c. Documentary Fee");
    expect(page).toContain("2. Total Cash Price");
    expect(page).not.toContain(DOC_FEE_NOTICE_EN);
  });
});
