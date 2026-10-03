import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { feeFields, occcFiling } from "./helpers/fees";
import {
  docFeeCapCents,
  docFeeLimitProblem,
  docFeeWithinLimit,
  occcFilingInForce,
  overLimitKind,
  postedDealerChargesProblem,
  validateFeeSchedule,
  type OcccDocFeeFiling,
} from "@/lib/sales/fee-schedule";

/**
 * Law and code review, 2026-10-03 (major): the desk never compared an OCCC
 * filing's dates with today. An owner could record a filing "filed"
 * 2027-06-01 and "effective" 2027-07-01, save a $399 documentary fee, and file
 * it the same day: validateFeeSchedule returned [], docFeeWithinLimit(399)
 * returned true and postedDealerChargesProblem returned null. That is the
 * violation 7 TAC §84.205(c)(5)(A) describes: charging more than $225
 * "without first providing a complete notification", which "is not effective
 * until the OCCC receives a complete form" (§84.205(c)(3)).
 *
 * Now a filing dated after today, or one that takes effect before it was
 * filed, is refused when saved (in the desk and in the database function),
 * a fee above $225 waits for the filing's effective date, and at filing a
 * filing counts only from the business day it is both filed and in effect.
 */

const TODAY = "2026-10-03";
const future: OcccDocFeeFiling = occcFiling(39900, { filedOn: "2027-06-01", effectiveOn: "2027-07-01" });

describe("when the owner saves", () => {
  it("refuses a filing dated after today (the review's probe: $399 filed 2027-06-01)", () => {
    const problems = validateFeeSchedule(feeFields({ docFeeCents: 39900, occcFiling: future }), { today: TODAY });
    expect(problems.map((problem) => problem.code)).toContain("occcFilingInFuture");
  });

  it("refuses a filing that takes effect before it was filed", () => {
    const backwards = occcFiling(30000, { filedOn: "2026-09-01", effectiveOn: "2020-01-01" });
    const problems = validateFeeSchedule(feeFields({ docFeeCents: 30000, occcFiling: backwards }), { today: TODAY });
    expect(problems.map((problem) => problem.code)).toEqual(["occcFilingDatesOutOfOrder"]);
  });

  it("lets a filing be recorded ahead of its effective date, but not a fee above $225.00 until then", () => {
    const ahead = occcFiling(30000, { filedOn: "2026-10-01", effectiveOn: "2026-11-01" });
    expect(validateFeeSchedule(feeFields({ docFeeCents: 22500, occcFiling: ahead }), { today: TODAY })).toEqual([]);
    const early = validateFeeSchedule(feeFields({ docFeeCents: 30000, occcFiling: ahead }), { today: TODAY });
    expect(early).toEqual([
      { code: "occcFilingNotYetEffective", field: "docFee", params: { limit: "$225.00", effectiveOn: "2026-11-01" } },
    ]);
    // On the effective date the higher fee saves.
    expect(validateFeeSchedule(feeFields({ docFeeCents: 30000, occcFiling: ahead }), { today: "2026-11-01" })).toEqual([]);
  });

  it("accepts a filing filed and in effect on or before today", () => {
    const inForce = occcFiling(30000, { filedOn: "2026-10-03", effectiveOn: "2026-10-03" });
    expect(validateFeeSchedule(feeFields({ docFeeCents: 30000, occcFiling: inForce }), { today: TODAY })).toEqual([]);
  });
});

describe("at filing", () => {
  it("does not count a filing that is not in force on the business date", () => {
    expect(occcFilingInForce(future, TODAY)).toBe(false);
    expect(docFeeWithinLimit(399, { occcFiling: future }, TODAY)).toBe(false);
    expect(postedDealerChargesProblem({ docFee: "399.00" }, { docFee: 399 }, { occcFiling: future }, TODAY)).toBe("feeOverLimit");
    // And the limit it shows is $225.00 until the filing takes effect.
    expect(docFeeCapCents({ occcFiling: future }, TODAY)).toBe(22500);
    expect(docFeeCapCents({ occcFiling: future }, "2027-07-01")).toBe(39900);
    expect(docFeeWithinLimit(399, { occcFiling: future }, "2027-07-01")).toBe(true);
  });

  it("never counts a filing whose dates are out of order", () => {
    const backwards = occcFiling(30000, { filedOn: "2026-09-01", effectiveOn: "2020-01-01" });
    expect(occcFilingInForce(backwards, TODAY)).toBe(false);
    expect(docFeeWithinLimit(300, { occcFiling: backwards }, TODAY)).toBe(false);
  });

  it("names the limit it is over: $225.00 with no filing in force, or the filed maximum", () => {
    const inForce = occcFiling(30000, { filedOn: "2026-09-01", effectiveOn: "2026-09-02" });
    expect(docFeeLimitProblem(300.01, { occcFiling: inForce }, TODAY)).toBe("feeOverFiledMax");
    expect(docFeeLimitProblem(300, { occcFiling: future }, TODAY)).toBe("feeOverLimit");
    expect(overLimitKind({ docFee: 300.01 }, { docFee: 300.01 }, { occcFiling: inForce }, TODAY)).toBe("filedMax");
    expect(overLimitKind({ docFee: 230 }, { docFee: 230 }, { occcFiling: null }, TODAY)).toBe("noFiling");
  });
});

describe("the database function and the screens agree", () => {
  const sql = readFileSync("supabase/migrations/20261003000000_dealer_fee_schedule.sql", "utf8");

  it("refuses the same three cases by the same codes, against the business date", () => {
    expect(sql).toContain("v_today date := (now() at time zone 'America/Chicago')::date;");
    expect(sql).toMatch(/if v_filed_on > v_today then\s+raise exception 'occcFilingInFuture';/);
    expect(sql).toMatch(/if v_effective_on < v_filed_on then\s+raise exception 'occcFilingDatesOutOfOrder';/);
    expect(sql).toMatch(/if v_effective_on > v_today and v_doc > 22500 then\s+raise exception 'occcFilingNotYetEffective';/);
    expect(sql).toContain("constraint dealer_fee_schedule_occc_dates check (occc_filed_on is null or occc_effective_on >= occc_filed_on)");
  });

  it("caps the date boxes on the screen: filed on or before today, in effect no earlier than filed", () => {
    const wizard = readFileSync("src/components/admin/fees/DealerFeesWizard.tsx", "utf8");
    expect(wizard).toMatch(/name="occcFiledOn"\s+max=\{today\}/);
    expect(wizard).toMatch(/name="occcEffectiveOn"\s+min=\{filing\.filedOn \|\| undefined\}/);
  });
});

describe("the environment cannot raise the cap in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("ignores the OCCC seed variables when NODE_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const config = await import("@/lib/dealership-config");
    expect(config.occcDocFeeFilingSeed).toBeNull();
    const schedule = await import("@/lib/sales/fee-schedule");
    expect(schedule.configFeeSchedule(TODAY).occcFiling).toBeNull();
  });

  it("still carries the test fixture's seed outside production", async () => {
    vi.resetModules();
    const config = await import("@/lib/dealership-config");
    expect(config.occcDocFeeFilingSeed).toMatchObject({ max: "292", licenseOrNmls: "TEST FIXTURE" });
  });
});
