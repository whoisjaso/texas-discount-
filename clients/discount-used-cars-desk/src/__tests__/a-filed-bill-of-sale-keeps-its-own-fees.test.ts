import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A filed bill of sale keeps its own fees (rulebook texas-dealer-fees.md
 * 5.1; SOP Freeze): a change to the fees after it is filed moves nothing on
 * that sale. The 130-U filed afterwards states the same figures, and voiding
 * and filing again keeps the sale's own fees. A sale started before each sale
 * kept a copy reads what its filed bill of sale printed.
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
import { CASH_SALE, FEE_DEAL, feeCopy, filedRow, moneyFor, seedFeeDeal } from "./helpers/fee-filing";
import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { finalizePaperwork } from "@/lib/actions/paperwork";
import { loadDealFees } from "@/lib/dealership-fees";
import { writeDealFees } from "@/lib/sales/fee-schedule";
import { decodeCompletedLinkFromUrl, encodeCompletedLink } from "@/lib/documents/customerPortal";
import { figuresDisagreeWithBillOfSale } from "@/lib/sales/refile-gates";

const file = (type: string, formData: Record<string, unknown>) =>
  finalizePaperwork(FEE_DEAL, type, { buyerName: "Andrea Salinas", vehicleDescription: "2017 Ford Explorer", vehicleVin: "1FM5K8D80HGA00001", formData, signature: null });

const printedOf = (id: string | undefined) => {
  const row = mockInserted("document_agreements").find((entry) => entry.id === id);
  return decodeCompletedLinkFromUrl(String(row?.completed_link ?? ""))!.dd as Record<string, unknown>;
};

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("after the owner changes the fees", () => {
  it("the filed bill of sale states its own, and the 130-U filed later agrees with it", async () => {
    await saveThroughMock(feeFields(), 0);
    const copy = feeCopy();
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData);
    const money = moneyFor(stepData, copy);
    const bill = await file("billOfSale", { ...money });
    expect(bill).toMatchObject({ ok: true });

    await saveThroughMock(feeFields({ docFeeCents: 17500 }), 1);

    const printed = printedOf(bill.agreementId);
    expect(printed).toMatchObject({ docFee: 150, titleFee: 33, registrationFee: 75 });
    expect(figuresDisagreeWithBillOfSale("form130U", { ...money }, printed)).toBe(false);
    const title = await file("form130U", { ...money });
    expect(title, JSON.stringify(title)).toMatchObject({ ok: true });
  });

  it("voiding and filing again keeps the sale's own fees", async () => {
    await saveThroughMock(feeFields(), 0);
    const copy = feeCopy();
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData, [
      filedRow("old-bos", "billOfSale", { voided_at: "2026-10-03T15:00:00.000Z", void_reason: "The price changed", void_group_id: "g1", voided_by_name: "Maria Lopez" }),
    ]);
    await saveThroughMock(feeFields({ docFeeCents: 17500 }), 1);
    const again = await file("billOfSale", { ...moneyFor(stepData, copy) });
    expect(again).toMatchObject({ ok: true });
    expect(printedOf(again.agreementId)).toMatchObject({ docFee: 150 });
  });
});

describe("a sale started before each sale kept its fees", () => {
  it("reads what its filed bill of sale printed, and the schedule once that copy is voided", async () => {
    await saveThroughMock(feeFields({ docFeeCents: 17500 }), 0);
    const printed = encodeCompletedLink("billOfSale", { salePrice: 9000, tax: 562.5, titleFee: 33, docFee: 199, registrationFee: 75 }, {}, "https://x.test");
    await seedFeeDeal(CASH_SALE, [filedRow("legacy-bos", "billOfSale", { completed_link: printed })]);
    const sale = { id: FEE_DEAL, stepData: CASH_SALE, vehicle: { titleStatus: "clean" } };
    const filed = await loadDealFees(sale);
    expect(filed.ok && filed.resolved.from).toBe("printed");
    expect(filed.ok && filed.lines).toMatchObject({ docFee: 199, titleFee: 33, registrationFee: 75 });

    await createMockSupabaseClient()
      .from("document_agreements")
      .update({ voided_at: "2026-10-03T15:00:00.000Z", void_reason: "The price changed", void_group_id: "g1" })
      .eq("id", "legacy-bos");
    const after = await loadDealFees(sale);
    expect(after.ok && after.resolved.from).toBe("schedule");
    expect(after.ok && after.lines.docFee).toBe(175);
  });
});
