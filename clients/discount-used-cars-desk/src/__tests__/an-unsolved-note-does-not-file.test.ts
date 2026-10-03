import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: "owner", user: { id: "local-admin-preview", email: "owner@example.dev" }, member: { id: "member-1", full_name: "Maria Lopez" } }),
  getCurrentAdminAccess: async () => ({ user: { id: "local-admin-preview" }, role: "owner", member: { id: "member-1" } }),
}));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "tj-local-admin-preview" ? { value: "owner@example.dev" } : undefined), set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));

import { resetMockWrites } from "@/lib/supabase/mock";
import { WALKED_CASH, filePage, filedPage, moneyOf, seedPageDeal } from "./helpers/page-filing";
import { encodeCompletedLink } from "@/lib/documents/customerPortal";

/**
 * A contract with no worked-out note does not file: it would print no
 * payments, a schedule of nothing or a negative finance charge.
 */
const BHPH = {
  ...WALKED_CASH,
  funding: { type: "inHouse", lenderId: null, lenderOther: null },
  money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "1500" },
  paperwork: {
    billOfSale: { odometerStatus: "actual", tradeIn: "no", conditionType: "as_is" },
    financing: { downPayment: "1500", paymentFrequency: "Monthly", firstPaymentDate: "2026-11-03" },
  },
};

beforeEach(() => {
  resetMockWrites();
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
});

describe("an unsolved note does not file", () => {
  it("refuses the contract until the terms are agreed, then files it", async () => {
    const money = moneyOf(BHPH, "inHouse");
    const bill = filedPage("bos", "billOfSale", {
      completed_link: encodeCompletedLink("billOfSale", { salePrice: money.salePrice, tax: money.tax, amountPaidToday: money.paidToday, sellerLienEnabled: true, sellerLienAmount: money.sellerLienAmount }, {}, "https://x.test"),
    });
    await seedPageDeal(BHPH, {}, [bill]);
    expect(await filePage("financing", { ...money, downPayment: "1500" })).toMatchObject({ ok: false, code: "termsUnsolved" });

    resetMockWrites();
    const agreed = { ...BHPH, paperwork: { ...BHPH.paperwork, financing: { ...BHPH.paperwork.financing, termsBy: "count", numberOfPayments: "36" } } };
    await seedPageDeal(agreed, {}, [bill]);
    expect(await filePage("financing", { ...money, downPayment: "1500" })).toMatchObject({ ok: true });
  });
});
