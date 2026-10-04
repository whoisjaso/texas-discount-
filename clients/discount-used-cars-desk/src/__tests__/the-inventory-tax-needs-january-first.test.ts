import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feeFields, saveThroughMock } from "./helpers/fees";
import { resetMockWrites } from "@/lib/supabase/mock";
import { getDealerFeeSchedule } from "@/lib/dealership-fees";
import { scheduleFields, validateFeeSchedule } from "@/lib/sales/fee-schedule";

/**
 * The vehicle inventory tax (rulebook texas-dealer-fees.md 1.6; Tax Code
 * §23.121-.122): $0 for a dealer not in business on January 1, and passed on
 * only by the dealer's unit property tax factor. Recorded at onboarding, $0
 * on sales until it gets its own line.
 */

const codes = (fields: unknown) => validateFeeSchedule(fields).map((problem) => problem.code);

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("the inventory tax", () => {
  it("refuses a factor, or passing it on, without January 1", () => {
    expect(codes(feeFields({ vit: { year: 2026, inBusinessJan1: false, passesThrough: null, unitFactor: 0.0019 } }))).toEqual(["vitNeedsJan1"]);
    expect(codes(feeFields({ vit: { year: 2026, inBusinessJan1: null, passesThrough: true, unitFactor: 0.0019 } }))).toEqual(["vitNeedsJan1"]);
  });

  it("refuses passing it on without a factor, and a factor that is not one", () => {
    expect(codes(feeFields({ vit: { year: 2026, inBusinessJan1: true, passesThrough: true, unitFactor: null } }))).toEqual(["vitFactorMissing"]);
    expect(codes(feeFields({ vit: { year: 2026, inBusinessJan1: true, passesThrough: true, unitFactor: 1.2 } }))).toEqual(["vitFactorInvalid"]);
    expect(codes(feeFields({ vit: { year: 2026, inBusinessJan1: true, passesThrough: true, unitFactor: -0.1 } }))).toEqual(["vitFactorInvalid"]);
  });

  it("accepts January 1 with a factor, and a dealer that opened after it", () => {
    expect(codes(feeFields({ vit: { year: 2026, inBusinessJan1: true, passesThrough: true, unitFactor: 0.0019 } }))).toEqual([]);
    expect(codes(feeFields({ vit: { year: 2026, inBusinessJan1: false, passesThrough: null, unitFactor: null } }))).toEqual([]);
  });

  it("keeps the recorded answers exactly as saved", async () => {
    const saved = feeFields({
      vit: { year: 2026, inBusinessJan1: true, passesThrough: true, unitFactor: 0.0019 },
      deputy: { isDeputy: true, feeCents: 1000 },
      nmlsId: "1234567",
      legacyLicense: "MV-1234",
      financesCh345: true,
    });
    expect((await saveThroughMock(saved, 0)).error).toBeNull();
    const read = await getDealerFeeSchedule();
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.schedule.source).toBe("owner");
    expect(read.schedule.version).toBe(1);
    expect(scheduleFields(read.schedule)).toEqual(saved);
  });
});
