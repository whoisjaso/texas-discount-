import { describe, expect, it } from "vitest";
import { feeFields } from "./helpers/fees";
import { DOC_FEE, OTHER_DEALER_CHARGES, PLATE_DATABASE_FEE } from "@/lib/legal/texas-dealer-fees";
import { parseFeeScheduleInput, postedDealerChargesProblem, validateFeeSchedule } from "@/lib/sales/fee-schedule";

/**
 * Every paperwork charge is the documentary fee, whatever it is called
 * (rulebook texas-dealer-fees.md 1.3; Tex. Fin. Code §348.006(a)(1)(C)), and
 * there is no other dealer line (§348.005). So the schedule has no free-form
 * fee to type into, the plate-database fee is off, and a "processing" charge
 * beside a $200 doc fee is a $230 doc fee: refused at $225.
 */

describe("the schedule has no free-form fee", () => {
  it("refuses any field that is not a known fee, at any depth", () => {
    expect(validateFeeSchedule({ ...feeFields(), adminFee: 3000 })).toEqual([{ code: "unknownField", field: "adminFee" }]);
    expect(validateFeeSchedule({ ...feeFields(), deputy: { isDeputy: false, feeCents: 0, eFileFee: 500 } })).toEqual([
      { code: "unknownField", field: "deputy.eFileFee" },
    ]);
    const typed = parseFeeScheduleInput(
      {
        docFee: "200",
        occcFiling: null,
        writesFinanceContracts: false,
        nmlsId: "",
        legacyLicense: "",
        deputy: { isDeputy: false, fee: "" },
        vit: { inBusinessJan1: false, passesThrough: null, unitFactor: "" },
        financesCh345: false,
        processingFee: "30",
      },
      "2026-10-03",
    );
    expect(typed.problems).toEqual([{ code: "unknownField", field: "processingFee" }]);
  });

  it("keeps the plate-database fee off, and inside the doc fee if counsel ever turns it on", () => {
    expect(PLATE_DATABASE_FEE.platformMaxCents).toBe(0);
    expect(PLATE_DATABASE_FEE.statutoryMaxCents).toBe(2000);
    expect(PLATE_DATABASE_FEE.ifEnabledCountsInDocFeeBucket).toBe(true);
    expect(PLATE_DATABASE_FEE.status).toBe("conflicting");
  });

  it("names every label a paperwork charge goes by as the doc fee", () => {
    for (const label of ["documentary", "admin", "processing", "paperwork", "e-file", "filing", "title service", "compliance", "plate database"]) {
      expect(DOC_FEE.bucketIncludesAnyChargeFor as readonly string[]).toContain(label);
    }
    expect(OTHER_DEALER_CHARGES.separateLineMaxCents).toBe(0);
    expect(OTHER_DEALER_CHARGES.routeTo).toBe("vehiclePrice");
  });
});

describe("a $200 doc fee and a $30 processing charge", () => {
  it("is one $230 documentary fee, refused at $225", () => {
    expect(validateFeeSchedule(feeFields({ docFeeCents: 20000 + 3000 })).map((p) => p.code)).toEqual(["docFeeOverPresumed"]);
  });

  it("cannot reach paper as a line of its own either", () => {
    const schedule = { occcFiling: null };
    expect(postedDealerChargesProblem({ docFee: 200, otherFees: 30, otherFeesDescription: "Processing" }, { docFee: 200 }, schedule)).toBe(
      "otherDealerFee",
    );
    expect(postedDealerChargesProblem({ docFee: 200, otherFees: 0, otherFeesDescription: "Processing" }, { docFee: 200 }, schedule)).toBe(
      "otherDealerFee",
    );
    expect(postedDealerChargesProblem({ docFee: 200, otherFees: "abc" }, { docFee: 200 }, schedule)).toBe("otherDealerFee");
    expect(postedDealerChargesProblem({ docFee: 200, otherFees: 0, otherFeesDescription: "" }, { docFee: 200 }, schedule)).toBeNull();
  });
});
