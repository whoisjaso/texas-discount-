import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import {
  financingTerms,
  hasFinancingDownPayment,
  paperworkAnswers,
  paperworkMoney,
  readPaperwork,
  withDownPayment,
} from "@/lib/sales/paperwork";
import { readMoney } from "@/lib/sales/money";
import { isProblem } from "@/lib/documents/terms";
import { contractFigures, type ContractData } from "@/lib/documents/finance";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import ContractPreview from "@/components/documents/ContractPreview";
import type { SaleDetail } from "@/lib/admin/sale-desk";

/**
 * One sale, one set of figures (SOP "Money": tax after trade-in, balance =
 * total - paid; "every figure is read off the sale once").
 *
 * A buy here pay here sale with a trade-in printed three different totals:
 * the bill of sale taxed the price less the trade, while the contract and the
 * 130-U read the trade-in from their OWN answers (where it is never asked),
 * taxed the full price, and financed a note $2,125 too large. The down
 * payment typed on the contract never reached the bill of sale's balance.
 *
 * Figures use the vitest fee fixture ($292 doc fee, $400 fees).
 */

const sale = {
  id: "d1", status: "active", language: "en", plate: null, plateAsked: false,
  buyer: { id: "c1", name: "Marcus Reed", phone: "7135550142", email: "m@example.com",
           idNumber: "12345678", idState: "TX", address: "4802 Telephone Rd, Houston, TX 77087" },
  vehicle: { id: "v1", year: 2016, make: "Nissan", model: "Altima", vin: "1N4AL3AP0GC123456",
             salePrice: 9000, bodyStyle: "sedan", titleStatus: "clean", mileage: 98000 },
  documents: {}, registration: null,
  createdAt: "2026-10-01T15:00:00.000Z",
  startedAt: "2026-10-01T15:00:00.000Z",
  funding: { type: "inHouse", lenderId: null, lenderOther: null },
  stepData: {
    money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "1500" },
    paperwork: {
      billOfSale: { tradeIn: "yes", tradeInAllowance: "2000", tradeInDescription: "2012 Honda Civic LX" },
      financing: { downPayment: "1500", paymentFrequency: "Monthly", termsBy: "count", numberOfPayments: "36" },
    },
    buyerId: {
      mailing: { street: "4802 Telephone Rd", city: "Houston", state: "TX", postal: "77087", county: "Harris" },
      name: { read: null, confirmed: "Marcus Reed" },
      licenseNumber: { read: null, confirmed: "12345678" },
    },
  },
} as unknown as SaleDetail;

/** Exactly what the preview action builds for one document. */
function filed(documentType: string) {
  const answers = readPaperwork(sale.stepData, documentType);
  const money = paperworkMoney(sale.vehicle?.salePrice, readPaperwork(sale.stepData, "billOfSale"), readMoney(sale.stepData), sale.funding.type);
  const context = {
    funding: sale.funding.type,
    bodyStyle: "sedan",
    licenceState: "TX",
    paidToday: money.paidToday > 0 ? money.paidToday : null,
    buyerCity: "Houston",
    buyerCounty: "Harris",
    vehicleWeight: null,
    dealTotal: money.total,
    vehicleYear: 2016,
    saleYear: 2026,
    answers,
  };
  const formData: Record<string, unknown> = { ...paperworkAnswers(documentType, context), ...money };
  const decoded = decodeCompletedLinkFromUrl(corridorCompletedLink(sale, documentType, formData, "https://x.test")!)!;
  return { money, context, decoded, dd: decoded.dd as Record<string, unknown> };
}

describe("a buy here pay here sale with a trade-in", () => {
  const bill = filed("billOfSale");
  const contract = filed("financing");
  const title = filed("form130U");

  it("taxes the price less the trade on every document", () => {
    expect(bill.dd.tax).toBe(437.5);
    expect(contract.dd.tax).toBe(437.5);
    expect(title.dd.tax).toBe(437.5);
  });

  it("carries the same trade-in on all three", () => {
    expect(bill.dd.tradeInAllowance).toBe(2000);
    expect(contract.dd.tradeInAllowance).toBe(2000);
    expect(title.dd.tradeInAllowance).toBe(2000);
  });

  it("finances exactly the bill of sale's balance", () => {
    expect(bill.dd.sellerLienAmount).toBe(6337.5);
    expect(contractFigures(contract.dd as unknown as ContractData).amountFinanced).toBe(6337.5);
    const terms = financingTerms(readPaperwork(sale.stepData, "financing"), contract.context);
    expect(terms && !isProblem(terms) ? terms.principal : null).toBe(6337.5);
  });

  it("names the trade-in in box 36 of the 130-U", () => {
    const data = buildAgreementData(title.decoded, {}, null);
    expect(data.trade_in_amount).toBe(2000);
    expect(data.trade_in_description).toBe("2012 Honda Civic LX");
  });

  it("leaves box 36 empty when the bill of sale says there is no trade-in", () => {
    const noTrade = {
      ...sale,
      stepData: {
        ...(sale.stepData as Record<string, unknown>),
        paperwork: { billOfSale: { tradeIn: "no", tradeInDescription: "left over" } },
      },
    } as unknown as SaleDetail;
    const link = corridorCompletedLink(noTrade, "form130U", {}, "https://x.test")!;
    expect(decodeCompletedLinkFromUrl(link)!.dd.tradeInDescription).toBe("");
  });
});

describe("the callers read the bill of sale's answers for the money", () => {
  it.each([
    "src/app/admin/sales/[dealId]/paperwork/[doc]/[q]/page.tsx",
    "src/lib/actions/paperwork-preview.ts",
  ])("%s", (file) => {
    const source = readFileSync(file, "utf8");
    const call = source.slice(source.indexOf("paperworkMoney("), source.indexOf("sale.funding.type,", source.indexOf("paperworkMoney(")));
    expect(call).toContain('readPaperwork(sale.stepData, "billOfSale")');
    expect(call).not.toMatch(/^\s*answers,\s*$/m);
  });
});

describe("the down payment is one fact", () => {
  it("is written to the money step and the contract together, and nothing else moves", () => {
    const before = {
      money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
      paperwork: { financing: { paymentFrequency: "Monthly" }, billOfSale: { tradeIn: "no" } },
      plate: "ABC1234",
    };
    const after = withDownPayment(before, "1500");
    expect(readMoney(after)).toEqual({ amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "1500" });
    expect(readPaperwork(after, "financing")).toEqual({ paymentFrequency: "Monthly", downPayment: "1500" });
    expect(readPaperwork(after, "billOfSale")).toEqual({ tradeIn: "no" });
    expect(after.plate).toBe("ABC1234");
    // The input is not mutated.
    expect(before.money.paidTodayAmount).toBe("");
  });

  it("knows when the contract already holds one", () => {
    expect(hasFinancingDownPayment({ paperwork: { financing: { downPayment: "" } } })).toBe(true);
    expect(hasFinancingDownPayment({ paperwork: { financing: {} } })).toBe(false);
    expect(hasFinancingDownPayment({})).toBe(false);
  });

  it("is written through the helper by both screens, inside their step-data transform", () => {
    const paperwork = readFileSync("src/lib/actions/paperwork.ts", "utf8");
    const money = readFileSync("src/lib/actions/sale-money.ts", "utf8");
    expect(paperwork).toMatch(/casMergeStepData\(supabase, dealId, \(current\) => \{[\s\S]*?withDownPayment\(current, value\)[\s\S]*?\}\);/);
    expect(money).toMatch(/casMergeStepData\(supabase, dealId, \(current\) => \{[\s\S]*?withDownPayment\(written, next\.paidTodayAmount\)[\s\S]*?\}\);/);
  });
});

describe("the contract's itemisation", () => {
  const base = {
    contractDate: "2026-10-01", stockNumber: "", buyerName: "Marcus Reed", buyerAddress: "4802 Telephone Rd",
    buyerPhone: "", buyerEmail: "", coBuyerName: "", coBuyerAddress: "", coBuyerPhone: "", coBuyerEmail: "",
    vehicleYear: "2016", vehicleMake: "Nissan", vehicleModel: "Altima", vehicleVin: "1N4AL3AP0GC123456",
    vehiclePlate: "", vehicleMileage: "98000", cashPrice: 9000, downPayment: 1500, tax: 437.5, titleFee: 33,
    registrationFee: 75, docFee: 292, apr: 18, numberOfPayments: 36, paymentFrequency: "Monthly",
    firstPaymentDate: "2026-11-01", dueAtSigning: 1500,
  } as ContractData;

  it("counts the trade-in toward the down payment and shows the split", () => {
    const html = renderToStaticMarkup(createElement(ContractPreview, { data: { ...base, tradeInAllowance: 2000 }, signatures: {} as never }));
    expect(html).toContain("a. Trade-In Allowance");
    expect(html).toContain("b. Cash Down Payment");
    expect(html).toContain("$3,500.00");
    expect(html).toContain("$6,337.50");
  });

  it("prints exactly as before when the payload carries no trade-in", () => {
    const html = renderToStaticMarkup(createElement(ContractPreview, { data: base, signatures: {} as never }));
    expect(html).not.toContain("Trade-In Allowance");
    expect(html).not.toContain("Cash Down Payment");
    expect(contractFigures(base).amountFinanced).toBe(9837.5 - 1500);
    expect(html).toContain("$8,337.50");
  });
});
