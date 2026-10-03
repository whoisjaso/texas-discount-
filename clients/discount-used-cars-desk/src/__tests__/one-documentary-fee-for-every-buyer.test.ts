import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Law review, 2026-10-03 (minor): when the owner lowered the documentary fee,
 * an open sale kept the higher fee it started with and could still file at
 * it, so two buyers at the same location paid different doc fees after the
 * change. "Apply Today's Fees" was offered but not required. The desk's
 * policy (rulebook 1.1 and 5.1, on Fin. Code §348.006(c)(1); and the FTC
 * staff position that a fee varying between buyers may not be advertised at
 * its lower figure) is one documentary fee for every buyer.
 *
 * Now a sale may keep a LOWER fee it started with after the owner raises it
 * (the buyer was quoted it), never a HIGHER one after the owner lowers it:
 * the filing refuses with "Apply today's fees", and the sale page offers it.
 * The code review's companion finding (a copy pointed at an older, higher
 * saved version) is refused the same way, and by the database.
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
import { applyCurrentFeesToSaleAction } from "@/lib/actions/dealer-fees";
import { applyFeesOffer } from "@/lib/dealership-fees";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { postedDealerChargesProblem, writeDealFees, type DealFees } from "@/lib/sales/fee-schedule";

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

const file = (copy: DealFees) =>
  finalizePaperwork(FEE_DEAL, "billOfSale", {
    buyerName: "Andrea Salinas",
    vehicleDescription: "2017 Ford Explorer",
    vehicleVin: "1FM5K8D80HGA00001",
    formData: { ...moneyFor(writeDealFees(CASH_SALE, copy), copy) },
    signature: null,
  });

describe("one documentary fee for every buyer", () => {
  it("refuses an open sale at $225.00 after the owner lowered the fee to $150.00", async () => {
    expect((await saveThroughMock(feeFields({ docFeeCents: 22500 }), 0)).error).toBeNull();
    const copy = feeCopy({ docFee: 225, scheduleVersion: 1 });
    await seedFeeDeal(writeDealFees(CASH_SALE, copy));
    expect((await saveThroughMock(feeFields({ docFeeCents: 15000 }), 1)).error).toBeNull();

    const result = await file(copy);
    expect(result).toMatchObject({ ok: false, code: "feeAboveToday" });
    expect(result.error).toMatch(/higher than today's/);
    expect(mockInserted("document_agreements")).toEqual([]);

    // The sale page offers today's fees, and with them the sale files at $150.00.
    const offer = await applyFeesOffer((await getSaleDetail(FEE_DEAL))!);
    expect(offer).toMatchObject({ reason: "aboveToday", docFee: 225, todaysDocFee: 150 });
    expect(await applyCurrentFeesToSaleAction(FEE_DEAL)).toEqual({ ok: true });
    expect(await file(feeCopy({ docFee: 150, scheduleVersion: 2 }))).toMatchObject({ ok: true });
  });

  it("lets an open sale keep the lower fee it was quoted after the owner raised it", async () => {
    expect((await saveThroughMock(feeFields(), 0)).error).toBeNull();
    const copy = feeCopy({ docFee: 150, scheduleVersion: 1 });
    await seedFeeDeal(writeDealFees(CASH_SALE, copy));
    expect((await saveThroughMock(feeFields({ docFeeCents: 17500 }), 1)).error).toBeNull();
    expect(await file(copy)).toMatchObject({ ok: true });
  });

  it("is the pure rule", () => {
    const schedule = { occcFiling: null, docFeeCents: 15000 };
    expect(postedDealerChargesProblem({ docFee: 225 }, { docFee: 225 }, schedule)).toBe("feeAboveToday");
    expect(postedDealerChargesProblem({ docFee: 150 }, { docFee: 150 }, schedule)).toBeNull();
    expect(postedDealerChargesProblem({ docFee: 100 }, { docFee: 100 }, schedule)).toBeNull();
  });
});
