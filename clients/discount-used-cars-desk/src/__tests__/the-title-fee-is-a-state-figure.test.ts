import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The title fee is the state's, never the dealer's (rulebook
 * texas-dealer-fees.md 2.1; Transp. Code §501.138(a)): $33.00 in a
 * nonattainment or affected county, $28.00 elsewhere. A sale whose title fee
 * is anything else carries dealer margin on a government line, and does not
 * file.
 */

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: "owner", user: { id: "local-admin-preview" }, member: { id: "member-1", full_name: "Maria Lopez" } }),
  getCurrentAdminAccess: async () => ({ user: { id: "local-admin-preview" }, role: "owner", member: { id: "member-1" } }),
}));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));

import { feeFields, saveThroughMock } from "./helpers/fees";
import { CASH_SALE, FEE_DEAL, feeCopy, moneyFor, seedFeeDeal } from "./helpers/fee-filing";
import { mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { finalizePaperwork } from "@/lib/actions/paperwork";
import { postedDealerChargesProblem, writeDealFees } from "@/lib/sales/fee-schedule";

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("the title fee on paper", () => {
  it("is $33.00 or $28.00, and nothing else", () => {
    const schedule = { occcFiling: null };
    expect(postedDealerChargesProblem({ docFee: 150, titleFee: 33 }, { docFee: 150 }, schedule)).toBeNull();
    expect(postedDealerChargesProblem({ docFee: 150, titleFee: "28.00" }, { docFee: 150 }, schedule)).toBeNull();
    for (const fee of [40, 0, 33.01, 27]) {
      expect(postedDealerChargesProblem({ docFee: 150, titleFee: fee }, { docFee: 150 }, schedule), String(fee)).toBe("titleFeeNotState");
    }
  });

  it("refuses a sale whose fees carry any other title fee", async () => {
    expect((await saveThroughMock(feeFields(), 0)).error).toBeNull();
    const copy = feeCopy({ titleFee: 40 });
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData);
    const result = await finalizePaperwork(FEE_DEAL, "billOfSale", {
      buyerName: "Andrea Salinas",
      vehicleDescription: "2017 Ford Explorer",
      vehicleVin: "1FM5K8D80HGA00001",
      formData: { ...moneyFor(stepData, copy) },
      signature: null,
    });
    expect(result).toMatchObject({ ok: false, code: "titleFeeNotState" });
    expect(result.error).toMatch(/\$33\.00 or \$28\.00 \(Transp\. Code §501\.138\(a\)\)/);
    expect(mockInserted("document_agreements")).toEqual([]);
  });
});
