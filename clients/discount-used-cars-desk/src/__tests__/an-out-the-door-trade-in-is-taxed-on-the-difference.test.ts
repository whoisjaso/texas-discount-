import { describe, expect, it } from "vitest";
import { calcTexasTax } from "@/lib/documents/billOfSale";
import { calculateTax } from "@/lib/documents/form130U";
import { saleMoney, splitOutTheDoor } from "@/lib/sales/money";
import { paperworkMoney } from "@/lib/sales/paperwork";
import { buildHandoffFields } from "@/lib/sales/webdealer";
import type { SaleDetail } from "@/lib/admin/sale-desk";

/**
 * Law review, 2026-10-03 (major): a deal quoted out-the-door with a trade-in
 * taxed the full vehicle price, trade-in included. Texas taxes the price
 * less the trade-in (Tax Code §152.002(b)(5): total consideration "does not
 * include ... the value of a motor vehicle taken by a seller as all or a
 * part of the consideration for sale of another motor vehicle"), and the
 * 130-U computes and remits that. The review's own probe: $10,000 out the
 * door, $33 + $150 + $75 in fees, a $2,000 trade-in, printed tax $573.06
 * where $448.06-on-that-price was due: $125.00 (6.25% of the trade-in) the
 * buyer paid as "tax" that never reached the state.
 *
 * Now the car is backed out of the quoted figure with the trade-in outside
 * the tax base; the lines still sum to the quoted figure to the cent and the
 * tax is 6.25% of (car - trade-in) to within a cent.
 */

const FEES = { titleFee: 33, docFee: 150, registrationFee: 75 };

describe("an out-the-door quote with a trade-in", () => {
  it("charges the tax on the price less the trade-in (the review's probe)", () => {
    const money = saleMoney(10000, { priceBasis: "outTheDoor" }, 2000, null, FEES);
    expect(money.tax).not.toBe(573.06);
    expect(Math.abs(money.tax - calcTexasTax(money.salePrice - 2000))).toBeLessThanOrEqual(0.01);
    expect(money.salePrice).toBe(9286.59);
    expect(money.tax).toBe(455.41);
    // The quoted figure still holds to the cent, and the buyer pays it less the trade-in.
    expect(Math.round((money.salePrice + money.tax + money.feeTotal) * 100)).toBe(1000000);
    expect(money.total).toBe(8000);
  });

  it("agrees with the 130-U's own tax", () => {
    for (const [quote, trade] of [[10000, 2000], [15689.25, 4000], [7720.5, 2500], [4000, 500]] as const) {
      const money = saleMoney(quote, { priceBasis: "outTheDoor" }, trade, null, FEES);
      const form = calculateTax({ salesPrice: money.salePrice, tradeInAllowance: trade, rebateOrIncentive: 0, taxRate: 6.25 } as never);
      expect(Math.abs(money.tax - form.taxDue), `${quote} with ${trade}`).toBeLessThanOrEqual(0.01);
      expect(Math.round((money.salePrice + money.tax + money.feeTotal) * 100), `${quote}`).toBe(Math.round(quote * 100));
    }
  });

  it("taxes nothing when the trade-in is worth the whole car", () => {
    expect(splitOutTheDoor(5000, 258, 6000)).toEqual({ salePrice: 4742, tax: 0 });
  });

  it("splits exactly as before when there is no trade-in", () => {
    expect(splitOutTheDoor(4000, 400)).toEqual(splitOutTheDoor(4000, 400, 0));
    // The old split: the car is (quote - fees) / 1.0625, the tax the remainder.
    const car = Math.round(((4000 - 400) / 1.0625) * 100) / 100;
    expect(splitOutTheDoor(4000, 400)).toEqual({ salePrice: car, tax: Math.round((3600 - car) * 100) / 100 });
  });

  it("is the bill of sale's figure on every paper, webDEALER's sales price included", () => {
    const answers = { tradeIn: "yes", tradeInAllowance: "2000" };
    const money = paperworkMoney(10000, answers, { priceBasis: "outTheDoor", amount: "10000" }, "cash", FEES);
    const sale = {
      id: "d1",
      status: "in_progress",
      language: "en",
      plate: null,
      plateAsked: false,
      buyer: null,
      vehicle: { id: "v1", year: 2017, make: "Ford", model: "Explorer", vin: "1FM5K8D80HGA00001", salePrice: 10000, titleStatus: "clean" },
      documents: {},
      registration: null,
      funding: { type: "cash", lenderId: null, lenderOther: null },
      stepData: { money: { priceBasis: "outTheDoor", amount: "10000" }, paperwork: { billOfSale: answers } },
    } as unknown as SaleDetail;
    const salesPrice = buildHandoffFields(sale, null, FEES).find((field) => field.key === "salesPrice")?.value;
    expect(salesPrice).toContain("9,286.59");
    expect(money.salePrice).toBe(9286.59);
  });
});
