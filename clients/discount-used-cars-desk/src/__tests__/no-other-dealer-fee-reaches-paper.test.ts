import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * No dealer fee outside the documentary fee, the deputy fee and the inventory
 * tax reaches paper (rulebook texas-dealer-fees.md 5.4, refusal 4; Tex. Fin.
 * Code §348.005): the corridor's filing refuses a posted "other fee", and so
 * does the older agreements route, which takes a finished document as an
 * encoded link. Prep, add-ons and "service" fees belong in the vehicle price.
 */

const inserted = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: "owner", user: { id: "local-admin-preview" }, member: { id: "member-1", full_name: "Maria Lopez" } }),
  getCurrentAdminAccess: async () => ({ user: { id: "local-admin-preview" }, role: "owner", member: { id: "member-1" } }),
}));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: async () => null }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.rows.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "agreement-1", ...row }, error: null }) }) };
      },
    }),
  }),
}));

import { feeFields, saveThroughMock } from "./helpers/fees";
import { CASH_SALE, FEE_DEAL, feeCopy, moneyFor, seedFeeDeal } from "./helpers/fee-filing";
import { mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { finalizePaperwork } from "@/lib/actions/paperwork";
import { writeDealFees } from "@/lib/sales/fee-schedule";
import { encodeCompletedLink } from "@/lib/documents/customerPortal";
import { POST } from "@/app/api/documents/agreements/route";

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
  inserted.rows = [];
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("the corridor's filing", () => {
  it("refuses a bill of sale posted with any other dealer fee, and files nothing", async () => {
    expect((await saveThroughMock(feeFields(), 0)).error).toBeNull();
    const copy = feeCopy();
    const stepData = writeDealFees(CASH_SALE, copy);
    await seedFeeDeal(stepData);
    const result = await finalizePaperwork(FEE_DEAL, "billOfSale", {
      buyerName: "Andrea Salinas",
      vehicleDescription: "2017 Ford Explorer",
      vehicleVin: "1FM5K8D80HGA00001",
      formData: { ...moneyFor(stepData, copy), otherFees: 90, otherFeesDescription: "Window etch" },
      signature: null,
    });
    expect(result.ok).toBe(false);
    expect(mockInserted("document_agreements")).toEqual([]);
  });
});

describe("the agreements route", () => {
  const post = (body: Record<string, unknown>) =>
    POST(
      new NextRequest(new URL("http://localhost/api/documents/agreements"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const link = (dd: Record<string, unknown>) =>
    encodeCompletedLink("billOfSale", { salePrice: 9000, tax: 562.5, titleFee: 33, docFee: 292, registrationFee: 75, otherFees: 0, ...dd }, {}, "https://x.test");

  it("refuses a finished bill of sale carrying another dealer fee", async () => {
    const response = await post({ document_type: "billOfSale", status: "pending", completed_link: link({ otherFees: 90, otherFeesDescription: "Dealer service" }) });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "otherDealerFee" });
    expect(inserted.rows).toEqual([]);
  });

  it("refuses a documentary fee over the limit, and a title fee that is not the state's", async () => {
    // The fixture's config seed: $292 with a fixture OCCC filing of $292 (vitest.config.ts).
    const over = await post({ document_type: "billOfSale", status: "pending", completed_link: link({ docFee: 300 }) });
    expect(over.status).toBe(422);
    expect(await over.json()).toMatchObject({ code: "feeOverLimit" });
    const title = await post({ document_type: "billOfSale", status: "pending", completed_link: link({ titleFee: 45 }) });
    expect(title.status).toBe(422);
    expect(await title.json()).toMatchObject({ code: "titleFeeNotState" });
    expect(inserted.rows).toEqual([]);
  });

  it("files a clean one, and leaves documents without fees alone", async () => {
    expect((await post({ document_type: "billOfSale", status: "pending", completed_link: link({}) })).status).toBe(200);
    expect((await post({ document_type: "vehicleResponsibility", status: "pending", completed_link: link({ otherFees: 90 }) })).status).toBe(200);
    expect(inserted.rows).toHaveLength(2);
  });
});
