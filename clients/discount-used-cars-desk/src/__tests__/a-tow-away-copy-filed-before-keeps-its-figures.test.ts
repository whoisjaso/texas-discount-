import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Code review, 2026-10-03 (minor): the tow-away sale's registration line
 * went to $0 (so a $3,000 out-the-door tow-away sale totals $3,000), and the
 * change also rewrote what an OLDER filed salvage bill of sale was said to
 * have printed: its figures were computed with the desk's registration line
 * inside the out-the-door split, so recomputing them with $0 produced a
 * different price and tax, and the rest of that sale's packet was refused
 * as "figures changed" until the bill of sale was voided.
 *
 * Now a salvage copy filed before the change (it carries no documentary fee
 * notice stamp, stamped at the same change) keeps the registration figure
 * its own price and tax rest on, and a sale resolving to it computes the
 * same figures it printed. A copy filed since is $0, as it printed.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));

import { createMockSupabaseClient, resetMockWrites } from "@/lib/supabase/mock";
import { encodeCompletedLink } from "@/lib/documents/customerPortal";
import { filedBillOfSaleOn } from "@/lib/sales/filed-bill-of-sale";
import { loadDealFees } from "@/lib/dealership-fees";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { paperworkMoney, readPaperwork } from "@/lib/sales/paperwork";
import { readMoney } from "@/lib/sales/money";
import { dealerFees } from "@/lib/dealership-config";
import { DOC_FEE_NOTICE_VERSION } from "@/lib/legal/doc-fee-notice";

const DEAL = "tow-away-legacy";
const STEP_DATA = {
  languageConfirmed: { value: "en", at: "2026-10-01T13:00:00Z", by: "u1" },
  funding: { type: "cash", lenderId: null, lenderOther: null },
  money: { amount: "3000", priceBasis: "outTheDoor", paidTodayAmount: "" },
  salvagePlan: { path: "towAway" },
  paperwork: { salvageBillOfSale: { howLeaving: "towTruck", paymentMethod: "Cash", odometerStatus: "actual" } },
};

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

/** A tow-away sale with no fee copy (started before copies existed) and a filed salvage bill of sale. */
async function seed(printed: Record<string, unknown>) {
  const client = createMockSupabaseClient();
  await client.from("deals").insert({
    id: DEAL,
    status: "in_progress",
    language: "en",
    step_data: STEP_DATA,
    customers: { id: "tow-buyer", name: "Andrea Salinas", phone: "7135550188" },
    vehicles: { id: "tow-car", year: 2014, make: "Ford", model: "Fusion", vin: "3FA6P0H70ER000001", title_status: "salvage_unrebuilt", sale_price: 3000 },
  });
  await client.from("document_agreements").insert({
    id: "salvage-bos",
    deal_id: DEAL,
    document_type: "salvageBillOfSale",
    status: "finalized",
    finalized_at: "2026-10-01T14:00:00.000Z",
    completed_at: "2026-10-01T14:00:00.000Z",
    has_buyer_signature: true,
    language: "en",
    completed_link: encodeCompletedLink("billOfSale", printed, {}, "https://x.test"),
  });
}

describe("a tow-away copy filed before the change", () => {
  it("keeps the registration figure its price and tax were computed with", async () => {
    // The old split: $3,000 less the desk's fees ($33 + $292 + $75), backed out at 6.25%.
    const fees = { titleFee: 33, docFee: 292, registrationFee: dealerFees.registrationFee };
    const old = paperworkMoney(3000, {}, readMoney(STEP_DATA), "cash", fees);
    await seed({ salePrice: old.salePrice, tax: old.tax, titleFee: 33, docFee: 292, total: old.salePrice + old.tax + 33 + 292 });

    const filed = await filedBillOfSaleOn(DEAL);
    expect(filed?.printed?.fees).toEqual({ titleFee: 33, docFee: 292, registrationFee: dealerFees.registrationFee });

    const sale = (await getSaleDetail(DEAL))!;
    const loaded = await loadDealFees(sale);
    expect(loaded.ok && loaded.resolved.from).toBe("printed");
    if (!loaded.ok) return;
    const now = paperworkMoney(sale.vehicle?.salePrice, readPaperwork(sale.stepData, "billOfSale"), readMoney(sale.stepData), "cash", loaded.lines);
    expect(now.salePrice).toBe(old.salePrice);
    expect(now.tax).toBe(old.tax);
  });

  it("while a copy filed since the change printed, and is read as, $0", async () => {
    await seed({ salePrice: 2511.53, tax: 156.97, titleFee: 33, docFee: 292, total: 2993.5, docFeeNotice: DOC_FEE_NOTICE_VERSION });
    const filed = await filedBillOfSaleOn(DEAL);
    expect(filed?.printed?.fees).toEqual({ titleFee: 33, docFee: 292, registrationFee: 0 });
  });
});
