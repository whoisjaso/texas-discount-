import { describe, expect, it } from "vitest";
import { feeFields, occcFiling } from "./helpers/fees";
import {
  docFeeCapCents,
  docFeeWithinLimit,
  parseFeeScheduleInput,
  typedCents,
  validateFeeSchedule,
  type FeeScheduleInput,
} from "@/lib/sales/fee-schedule";

/**
 * The documentary fee stops at $225.00 without an OCCC filing (rulebook
 * texas-dealer-fees.md 1.1; 7 TAC §84.205(b)(1), eff. 2024-07-11). Above it
 * only up to a maximum the dealer filed with the OCCC, whole, never above
 * the filed amount. Refused, never trimmed, and the refusal carries the
 * citation.
 */

const codes = (fields: unknown) => validateFeeSchedule(fields).map((problem) => problem.code);

const typed = (over: Partial<FeeScheduleInput> = {}): FeeScheduleInput => ({
  docFee: "150",
  occcFiling: null,
  writesFinanceContracts: true,
  nmlsId: "",
  legacyLicense: "",
  deputy: { isDeputy: false, fee: "" },
  vit: { inBusinessJan1: false, passesThrough: null, unitFactor: "" },
  financesCh345: false,
  ...over,
});

describe("without a filing", () => {
  it("accepts $225.00 and refuses $225.01, with the limit and the citation", () => {
    expect(codes(feeFields({ docFeeCents: 22500 }))).toEqual([]);
    const [problem, ...rest] = validateFeeSchedule(feeFields({ docFeeCents: 22501 }));
    expect(rest).toEqual([]);
    expect(problem).toEqual({
      code: "docFeeOverPresumed",
      field: "docFee",
      params: { limit: "$225.00", citation: "7 TAC §84.205(b)(1)" },
    });
  });

  it("takes $0 as an answer", () => {
    expect(codes(feeFields({ docFeeCents: 0 }))).toEqual([]);
  });

  it("refuses a negative figure, part of a cent, and nothing at all", () => {
    expect(codes(feeFields({ docFeeCents: -1 }))).toEqual(["feeNotDollars"]);
    expect(codes(feeFields({ docFeeCents: 150.5 }))).toEqual(["feeNotDollars"]);
    expect(codes(feeFields({ docFeeCents: Number.NaN }))).toEqual(["feeNotDollars"]);
    expect(codes(feeFields({ docFeeCents: null }))).toEqual(["docFeeRequired"]);
  });

  it("reads what was typed the desk's way, and refuses what is not a dollar amount", () => {
    expect(typedCents("$150")).toBe(15000);
    expect(typedCents(" 1,150.5 ")).toBe(115050);
    expect(typedCents("0")).toBe(0);
    expect(typedCents("")).toBeNull();
    expect(typedCents("$")).toBeNull();
    for (const bad of ["-5", "abc", "100 dollars", "1.234", "1.2.3"]) {
      expect(Number.isNaN(typedCents(bad)), bad).toBe(true);
      expect(parseFeeScheduleInput(typed({ docFee: bad }), "2026-10-03").problems.map((p) => p.code), bad).toContain("feeNotDollars");
    }
    expect(parseFeeScheduleInput(typed({ docFee: "" }), "2026-10-03").problems.map((p) => p.code)).toEqual(["docFeeRequired"]);
  });

  it("is $225.00 whatever is typed, with nothing recorded", () => {
    expect(docFeeCapCents(feeFields())).toBe(22500);
    expect(docFeeWithinLimit(225, feeFields())).toBe(true);
    expect(docFeeWithinLimit(225.01, feeFields())).toBe(false);
  });
});

describe("with a complete filing recorded", () => {
  it("accepts the filed maximum and refuses a cent more", () => {
    expect(codes(feeFields({ docFeeCents: 30000, occcFiling: occcFiling(30000) }))).toEqual([]);
    const [problem] = validateFeeSchedule(feeFields({ docFeeCents: 30001, occcFiling: occcFiling(30000) }));
    expect(problem).toEqual({ code: "docFeeOverFiled", field: "docFee", params: { limit: "$300.00" } });
    expect(docFeeCapCents({ occcFiling: occcFiling(30000) })).toBe(30000);
    expect(docFeeWithinLimit(300, { occcFiling: occcFiling(30000) })).toBe(true);
    expect(docFeeWithinLimit(300.01, { occcFiling: occcFiling(30000) })).toBe(false);
  });

  it("refuses a filing missing any one of its five facts", () => {
    const missing: Array<Partial<ReturnType<typeof occcFiling>>> = [
      { maxCents: Number.NaN },
      { filedOn: "" },
      { effectiveOn: "" },
      { licenseOrNmls: " " },
      { location: "" },
      { filedOn: "09/01/2026" },
      { effectiveOn: "2026-13-45" },
    ];
    for (const gap of missing) {
      expect(codes(feeFields({ docFeeCents: 30000, occcFiling: occcFiling(30000, gap) })), JSON.stringify(gap)).toEqual([
        "occcFilingIncomplete",
      ]);
    }
    // An incomplete filing never raises the limit.
    expect(docFeeCapCents({ occcFiling: occcFiling(Number.NaN) })).toBe(22500);
    expect(docFeeWithinLimit(300, { occcFiling: occcFiling(30000, { location: "" }) })).toBe(false);
  });

  it("refuses a filing at or under $225.00: the filing route exists only above it", () => {
    expect(validateFeeSchedule(feeFields({ occcFiling: occcFiling(22500) }))).toEqual([
      { code: "occcFilingNotHigher", field: "occcFiling.maxCents", params: { limit: "$225.00" } },
    ]);
    expect(codes(feeFields({ occcFiling: occcFiling(10000) }))).toEqual(["occcFilingNotHigher"]);
  });

  it("is read from what was typed, every part required", () => {
    const filing = { max: "$300", filedOn: "2026-09-01", effectiveOn: "2026-09-02", licenseOrNmls: "NMLS 1234567", location: "Main lot" };
    const ok = parseFeeScheduleInput(typed({ docFee: "300", occcFiling: filing }), "2026-10-03");
    expect(ok.problems).toEqual([]);
    expect(validateFeeSchedule(ok.fields)).toEqual([]);
    expect(ok.fields.occcFiling).toEqual(occcFiling(30000));
    const gap = parseFeeScheduleInput(typed({ docFee: "300", occcFiling: { ...filing, location: "" } }), "2026-10-03");
    expect(validateFeeSchedule(gap.fields).map((p) => p.code)).toEqual(["occcFilingIncomplete"]);
  });
});
