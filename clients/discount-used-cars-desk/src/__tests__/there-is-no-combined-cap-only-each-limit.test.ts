import { describe, expect, it } from "vitest";
import { feeFields, occcFiling } from "./helpers/fees";
import { COMBINED } from "@/lib/legal/texas-dealer-fees";
import {
  NO_COMBINED_CAP,
  configFeeSchedule,
  dealFeeLines,
  dealFeesFromSchedule,
  dealerChargesAllowance,
  dealerChargesLine,
  dealerChargesOnTop,
} from "@/lib/sales/fee-schedule";
import { saleMoney } from "@/lib/sales/money";

/**
 * Texas has no combined cap on dealer fees (rulebook texas-dealer-fees.md
 * section 4): a finding from the absence of any such provision, not a quoted
 * rule. Each limit is enforced on its own, and the screens say "Dealer
 * charges on top of the price: $X of $Y allowed". The deputy fee and the
 * inventory tax are recorded and $0 on sales until they get their own lines.
 */

describe("the combined cap", () => {
  it("does not exist, and says why", () => {
    expect(COMBINED.statutoryAggregateCap).toBeNull();
    expect(NO_COMBINED_CAP.statutoryAggregateCap).toBeNull();
    expect(COMBINED.citation).toMatch(/absence finding, 2026-10-03/);
    expect(COMBINED.citation).toMatch(/§348\.005/);
    expect(COMBINED.withNothingElseRecordedCents).toBe(22500);
  });
});

describe("the dealer charges on top of the price", () => {
  it("reads $150.00 of $225.00 with nothing else recorded", () => {
    expect(dealerChargesLine(feeFields())).toEqual({ charged: "$150.00", allowed: "$225.00" });
  });

  it("allows the filed maximum once a filing is recorded", () => {
    expect(dealerChargesLine(feeFields({ docFeeCents: 25000, occcFiling: occcFiling(30000) }))).toEqual({
      charged: "$250.00",
      allowed: "$300.00",
    });
  });

  it("charges the deputy fee and the inventory tax as $0 until they have their own lines", () => {
    const fields = feeFields({
      deputy: { isDeputy: true, feeCents: 1000 },
      vit: { year: 2026, inBusinessJan1: true, passesThrough: true, unitFactor: 0.0019 },
    });
    expect(dealerChargesOnTop(fields)).toBe(15000);
    expect(dealerChargesAllowance(fields)).toBe(22500);
    const copy = dealFeesFromSchedule({ ...configFeeSchedule(), ...fields });
    const money = saleMoney(10000, { amount: "10000", priceBasis: "vehicleOnly", paidTodayAmount: "" }, 0, "cash", dealFeeLines(copy));
    // Price, tax, title, the doc fee and registration: no deputy line, no inventory tax line.
    expect(money.feeTotal).toBe(copy.titleFee + 150 + copy.registrationFee);
    expect(money.total).toBe(10000 + 625 + copy.titleFee + 150 + copy.registrationFee);
  });
});
