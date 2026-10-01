import { describe, expect, it } from "vitest";
import { saleMoney, typedDollars } from "@/lib/sales/money";

/**
 * The Handle A Sale SOP's money vectors, verbatim. The fee stack they assume
 * ($33 title + $75 registration + $292 doc fee = $400) is supplied as a test
 * fixture in vitest.config.ts; Vega's real doc fee comes from the owner.
 * The SOP's "balance" is `lien` here: an unpaid cash balance is the lien.
 */
const cash = (amount: string, priceBasis: "outTheDoor" | "vehicleOnly", extra: Record<string, string> = {}) =>
  saleMoney(0, { amount, priceBasis, paidTodayAmount: "", ...extra }, 0, "cash");

describe("the SOP's money test vectors", () => {
  it("$4,000 out the door, cash", () => {
    const m = cash("4000", "outTheDoor");
    expect(m.salePrice).toBe(3388.24);
    expect(m.tax).toBe(211.76);
    expect(m.feeTotal).toBe(400);
    expect(m.total).toBe(4000);
    expect(m.lien).toBe(0);
  });

  it("$3,500 vehicle only, cash, nothing else typed", () => {
    const m = cash("3500", "vehicleOnly");
    expect(m.tax).toBe(218.75);
    expect(m.total).toBe(4118.75);
    expect(m.paidToday).toBe(3500);
    expect(m.lien).toBe(618.75);
  });

  it("$4,000 vehicle only, cash", () => {
    const m = cash("4000", "vehicleOnly");
    expect(m.tax).toBe(250);
    expect(m.total).toBe(4650);
  });

  it("$10,000 vehicle only, $3,000 trade", () => {
    const m = saleMoney(0, { amount: "10000", priceBasis: "vehicleOnly", paidTodayAmount: "" }, 3000, "cash");
    expect(m.tax).toBe(437.5);
    expect(m.total).toBe(7837.5);
  });

  it("any lender deal carries no balance", () => {
    for (const amount of ["4000", "12000", "999"]) {
      const m = saleMoney(0, { amount, priceBasis: "vehicleOnly", paidTodayAmount: "0" }, 0, "lender");
      expect(m.lien).toBe(0);
    }
  });

  it("buy here pay here with no down payment yet: paid 0, the note is the total", () => {
    const m = saleMoney(0, { amount: "5000", priceBasis: "vehicleOnly", paidTodayAmount: "" }, 0, "inHouse");
    expect(m.paidToday).toBe(0);
    expect(m.lien).toBe(m.total);
  });

  it("parses money boxes before testing for empty", () => {
    expect(typedDollars("$")).toBeNull();
    expect(typedDollars("")).toBeNull();
    expect(typedDollars("$3,000.00")).toBe(3000);
    expect(typedDollars("0")).toBe(0);
  });

  it("clamps what was paid to the deal", () => {
    const m = cash("4000", "outTheDoor", { paidTodayAmount: "9000" });
    expect(m.paidToday).toBe(4000);
    expect(m.lien).toBe(0);
  });
});
