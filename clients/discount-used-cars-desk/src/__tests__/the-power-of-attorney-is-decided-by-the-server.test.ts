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

import { mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { WALKED_CASH, filePage, seedPageDeal, PAGE_DEAL } from "./helpers/page-filing";

/**
 * The power of attorney's instrument is the server's decision from the
 * model year, never the client's: an unknown year, or a posted instrument
 * the year does not allow, is refused. A filed copy records every box it
 * printed, so a reprint can state what was signed.
 */
const DEALER_SIGNS = {
  ...WALKED_CASH,
  // The intake's county: the form prints it in the grantor's County box.
  buyerId: { ...(WALKED_CASH.buyerId as Record<string, unknown>), mailing: { street: "7400 Metz St", city: "Houston", state: "TX", postal: "77034", county: "Harris" } },
  salePlan: { registrationBy: "dealer", titleSignedBy: "dealer", insuranceShown: true, inspectionBy: "done" } };
const posted = (instrument: string) => ({ grantorName: "Somebody Else", grantorAddress: "x", vehicle: "x", vin: "x", instrument, signedInInk: true });

beforeEach(() => {
  resetMockWrites();
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
});

describe("the power of attorney is decided by the server", () => {
  it("refuses a plain VTR-271 posted for a car too new for it", async () => {
    await seedPageDeal(DEALER_SIGNS, { year: 2019 });
    expect(await filePage("powerOfAttorney", posted("VTR-271"))).toMatchObject({ ok: false, code: "poaInstrument" });
  });

  it("refuses a car with no model year", async () => {
    await seedPageDeal(DEALER_SIGNS, { year: null });
    expect(await filePage("powerOfAttorney", posted("VTR-271-A"))).toMatchObject({ ok: false, code: "poaInstrument" });
  });

  it("files the instrument the year allows, with the grantor and every printed box from the sale", async () => {
    await seedPageDeal(DEALER_SIGNS, { year: 2004 });
    const result = await filePage("powerOfAttorney", posted("VTR-271"));
    expect(result).toMatchObject({ ok: true });
    const row = mockInserted("document_agreements").find((entry) => entry.deal_id === PAGE_DEAL);
    const form = row?.form_data as Record<string, unknown>;
    expect(form.instrument).toBe("VTR-271");
    expect(form.grantorName).toBe("Andrea Salinas");
    expect((form.printed as Record<string, unknown>).grantorAddress).toBe("7400 Metz St");
    expect((form.printed as Record<string, unknown>).granteeName).toBe("Discount Used Cars And Trucks, LLC");
  });
});
