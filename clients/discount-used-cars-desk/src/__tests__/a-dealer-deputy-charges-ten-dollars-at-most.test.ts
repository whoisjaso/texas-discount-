import { describe, expect, it } from "vitest";
import { feeFields } from "./helpers/fees";
import { DEALER_DEPUTY_TITLE_FEE } from "@/lib/legal/texas-dealer-fees";
import { dealFeesFromSchedule, configFeeSchedule, dealerChargesOnTop, validateFeeSchedule } from "@/lib/sales/fee-schedule";

/**
 * The dealer-deputy title fee (rulebook texas-dealer-fees.md 1.4; 43 TAC
 * §217.168(b)(2), eff. 2025-07-01): only a dealer its county deputized, at
 * most $10.00 a title, on top of the doc fee. Recorded at onboarding and $0
 * on every sale until it gets its own document line.
 */

const codes = (fields: unknown) => validateFeeSchedule(fields).map((problem) => problem.code);

describe("the deputy fee", () => {
  it("is refused without deputy status", () => {
    expect(codes(feeFields({ deputy: { isDeputy: false, feeCents: 500 } }))).toEqual(["deputyFeeWithoutDeputy"]);
  });

  it("is refused above $10.00, with the citation", () => {
    expect(validateFeeSchedule(feeFields({ deputy: { isDeputy: true, feeCents: 1001 } }))).toEqual([
      { code: "deputyFeeOverLimit", field: "deputy.fee", params: { limit: "$10.00", citation: "43 TAC §217.168(b)(2)" } },
    ]);
  });

  it("is accepted at $10.00, and is $0 for a dealer that is not a deputy", () => {
    expect(codes(feeFields({ deputy: { isDeputy: true, feeCents: 1000 } }))).toEqual([]);
    expect(codes(feeFields({ deputy: { isDeputy: false, feeCents: 0 } }))).toEqual([]);
    expect(DEALER_DEPUTY_TITLE_FEE.maxCents).toBe(1000);
    expect(DEALER_DEPUTY_TITLE_FEE.defaultCents).toBe(0);
  });

  it("is recorded but not charged on a sale yet", () => {
    const schedule = { ...configFeeSchedule(), ...feeFields({ deputy: { isDeputy: true, feeCents: 1000 } }) };
    const copy = dealFeesFromSchedule(schedule);
    expect(Object.keys(copy)).not.toContain("deputy");
    expect(dealerChargesOnTop(schedule)).toBe(15000);
  });
});
