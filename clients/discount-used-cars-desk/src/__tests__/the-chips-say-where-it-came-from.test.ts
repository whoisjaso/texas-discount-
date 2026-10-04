import { describe, expect, it } from "vitest";
import { readBack } from "@/lib/documents/field-maps/resolve";
import { paperworkFilingContext } from "@/lib/sales/paperwork-filing-context";
import { ROUTES, filedFormData, routeSale } from "./fixtures/sales";

/**
 * A chip says where a value came from. The phone, email and address are
 * typed at Start Sale, not read off the licence. A rate the payment and the
 * count imply, the "Financing" a bank deal prints, and the licence state
 * the intake recorded are not answers on this sale: no "You answered", and
 * no Change link to a question that only redirects away.
 */
function read(type: string, sale: typeof ROUTES.cashPaid) {
  const { context } = paperworkFilingContext(sale, type, "Harris");
  return readBack(type, sale, filedFormData(type, sale), { context }).flatMap((page) => page.rows);
}

describe("the chips say where it came from", () => {
  it("credits the phone, email and address to Start Sale, and the name and ID to the licence", () => {
    const rows = read("billOfSale", ROUTES.cashPaid);
    const chip = (id: string) => rows.find((row) => row.id === id)?.source;
    for (const id of ["buyerPhone", "buyerEmail", "buyerAddress", "buyerCity", "buyerZip"]) expect(chip(id), id).toBe("intake");
    for (const id of ["buyerName", "buyerLicense", "buyerIdKind"]) expect(chip(id), id).toBe("buyer");
  });

  it("reads a solved rate as worked out, with its percent sign and no Change", () => {
    const both = routeSale("both-agreed", {
      funding: { type: "inHouse", lenderId: null, lenderOther: null },
      stepData: {
        funding: { type: "inHouse", lenderId: null, lenderOther: null },
        money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "1500" },
        paperwork: {
          billOfSale: { odometerStatus: "actual", tradeIn: "no", conditionType: "as_is" },
          financing: { downPayment: "1500", paymentFrequency: "Monthly", termsBy: "both", paymentAmount: "250", numberOfPayments: "36", firstPaymentDate: "2026-11-03" },
        },
      },
    });
    const apr = read("financing", both).find((row) => row.id === "apr");
    expect(apr?.source).toBe("computed");
    expect(apr?.status).toBe("filled");
    expect(apr?.changeHref).toBeUndefined();
    expect(apr?.value).toMatch(/^\d+(\.\d+)?%$/);
  });

  it("reads a bank deal's payment method as the funding's, with no Change to a cash-only question", () => {
    const method = read("billOfSale", ROUTES.bankTypedLender).find((row) => row.id === "paymentMethod");
    expect(method?.value).toBe("Financing");
    expect(method?.source).toBe("computed");
    expect(method?.changeHref).toBeUndefined();
  });

  it("reads the intake's licence state as the licence's, with its fix on the licence step", () => {
    const state = read("billOfSale", ROUTES.cashPaid).find((row) => row.id === "buyerLicenseState");
    expect(state?.value).toBe("TX");
    expect(state?.source).toBe("buyer");
    expect(state?.changeHref).toMatch(/\/guide\/buyerId$/);
  });

  it("keeps an answer given here as asked, with its Change", () => {
    const odometer = read("billOfSale", ROUTES.cashPaid).find((row) => row.id === "odometerStatus");
    expect(odometer?.source).toBe("answer");
    expect(odometer?.changeHref).toMatch(/\?change=odometerStatus$/);
  });
});
