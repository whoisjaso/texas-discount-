import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Code review, 2026-10-03 (major), the half the database cannot see: a
 * sale's fee copy holds the desk's title and registration defaults, and the
 * filing's tamper check compared only the doc fee and the OCCC filing with
 * the record. A copy whose registrationFee was rewritten to $999 passed
 * every gate and flowed into the money, the totals and the filed bill of
 * sale. (The database refuses a copy whose version or doc fee is not the
 * schedule's; it cannot know the desk's configured defaults.)
 *
 * Now a copy whose government lines are not the desk's own is refused at
 * filing as not written by the desk. And every key a bill of sale prints,
 * the government lines of their own included, is classified for the freeze.
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
import { dealFeesGovernmentLinesAreDesks, writeDealFees } from "@/lib/sales/fee-schedule";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { BILL_OF_SALE_CONDITIONAL_PRINTED_KEYS, BILL_OF_SALE_PRINTED_KEYS } from "@/lib/sales/bill-of-sale-freeze";
import type { SaleDetail } from "@/lib/admin/sale-desk";

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("the copy's government lines", () => {
  it("are the desk's own, or the copy was not written by the desk", () => {
    expect(dealFeesGovernmentLinesAreDesks(feeCopy())).toBe(true);
    expect(dealFeesGovernmentLinesAreDesks(feeCopy({ registrationFee: 999 }))).toBe(false);
    expect(dealFeesGovernmentLinesAreDesks(feeCopy({ titleFee: 28 }))).toBe(false);
  });

  it("refuse a filing whose copy says $999 registration (the review's probe)", async () => {
    expect((await saveThroughMock(feeFields(), 0)).error).toBeNull();
    const copy = feeCopy({ registrationFee: 999 });
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData);
    const result = await finalizePaperwork(FEE_DEAL, "billOfSale", {
      buyerName: "Andrea Salinas",
      vehicleDescription: "2017 Ford Explorer",
      vehicleVin: "1FM5K8D80HGA00001",
      formData: { ...moneyFor(stepData, copy) },
      signature: null,
    });
    expect(result).toMatchObject({ ok: false, code: "feeRecordTampered" });
    expect(mockInserted("document_agreements")).toEqual([]);
  });
});

describe("every key the bill of sale prints is classified", () => {
  it("including the government lines of their own, when a sale carries them", () => {
    const sale = {
      id: "d1", status: "in_progress", language: "en", plate: "abc1234", plateAsked: true,
      buyer: { id: "c1", name: "Andrea Salinas", phone: "7135550188", email: null, idNumber: "12345678", idState: "TX", idKind: "stateLicence", address: "7400 Metz St" },
      vehicle: { id: "v1", year: 2017, make: "Ford", model: "Explorer", vin: "1FM5K8D80HGA00001", salePrice: 9000, bodyStyle: "SUV", titleStatus: "clean", mileage: 88000 },
      documents: {}, registration: null, funding: { type: "cash", lenderId: null, lenderOther: null }, stepData: CASH_SALE,
    } as unknown as SaleDetail;
    const money = { salePrice: 9000, tax: 562.5, titleFee: 33, docFee: 150, registrationFee: 70.75, inspectionFee: 7.5, plateFee: 10, total: 9833.75, paidToday: 9833.75, sellerLienEnabled: false, sellerLienAmount: 0 };
    const link = corridorCompletedLink(sale, "billOfSale", money, "https://x.test", { dealerSignerName: "Maria Lopez" });
    const printed = Object.keys(decodeCompletedLinkFromUrl(link!)!.dd as Record<string, unknown>);
    expect(printed).toEqual(expect.arrayContaining(["inspectionFee", "plateFee"]));
    const known = { ...BILL_OF_SALE_PRINTED_KEYS, ...BILL_OF_SALE_CONDITIONAL_PRINTED_KEYS };
    expect(printed.filter((key) => !(key in known))).toEqual([]);
    for (const why of Object.values(BILL_OF_SALE_CONDITIONAL_PRINTED_KEYS)) expect(why).toMatch(/^fixed:\S/);
  });
});
