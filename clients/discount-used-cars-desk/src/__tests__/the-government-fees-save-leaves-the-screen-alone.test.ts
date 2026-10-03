import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Walked on 5190, 2026-10-03 (390 wide, every time; 1440 wide, once): the
 * government fees save revalidated the sale's path, so the router re-rendered
 * the screen being left (it sits in the workspace chrome) while the form's
 * navigation swapped to the sale corridor's chrome for the review. React then
 * removed the workspace twice ("Failed to execute 'removeChild' on 'Node'",
 * caught with an instrumented removeChild: the node was the .ed-workspace
 * div, already detached) and the review came up blank. Without the
 * revalidation the same probe passed every time at both sizes.
 *
 * The record is still written and logged; every screen that reads it is
 * rendered per request (force-dynamic) and fetched by the navigation that
 * follows, so nothing is left stale.
 */

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/cache", () => cache);
vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: "owner", user: { id: "local-admin-preview", email: "owner@example.dev" }, member: { id: "member-1", full_name: "Maria Lopez" } }),
  getCurrentAdminAccess: async () => ({ user: { id: "local-admin-preview" }, role: "owner", member: { id: "member-1" } }),
}));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => null }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));

import { readFileSync } from "node:fs";
import { CASH_SALE, FEE_DEAL, feeCopy, seedFeeDeal } from "./helpers/fee-filing";
import { feeFields, saveThroughMock } from "./helpers/fees";
import { mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { confirmGovernmentFeesAction } from "@/lib/actions/government-fees";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { readGovernmentFees } from "@/lib/sales/government-fees";
import { writeDealFees } from "@/lib/sales/fee-schedule";

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  cache.revalidatePath.mockReset();
  cache.revalidateTag.mockReset();
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("saving a sale's government fees", () => {
  it("writes and logs the record without re-rendering the screen it leaves", async () => {
    expect((await saveThroughMock(feeFields(), 0)).error).toBeNull();
    await seedFeeDeal(writeDealFees(CASH_SALE, feeCopy()));
    const result = await confirmGovernmentFeesAction(FEE_DEAL, {
      county: "Harris",
      titleFee: "33",
      registrationFee: "70.75",
      inspectionFee: "7.50",
      plateFee: "10",
      exemptFromRegistrationFees: false,
    });
    expect(result).toEqual({ ok: true });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
    expect(cache.revalidateTag).not.toHaveBeenCalled();

    const sale = (await getSaleDetail(FEE_DEAL))!;
    const recorded = readGovernmentFees(sale.stepData);
    expect(recorded.kind).toBe("valid");
    expect(mockInserted("team_activity_events").some((row) => row.event_type === "deal_government_fees_confirmed")).toBe(true);
  });

  it("is read by screens rendered per request, so the navigation that follows fetches it", () => {
    for (const page of [
      "src/app/admin/sales/[dealId]/page.tsx",
      "src/app/admin/sales/[dealId]/government-fees/page.tsx",
      "src/app/admin/sales/[dealId]/paperwork/[doc]/[q]/page.tsx",
      "src/app/admin/sales/[dealId]/guide/[step]/page.tsx",
    ]) {
      expect(readFileSync(page, "utf8"), page).toMatch(/export const dynamic = "force-dynamic"/);
    }
  });
});
