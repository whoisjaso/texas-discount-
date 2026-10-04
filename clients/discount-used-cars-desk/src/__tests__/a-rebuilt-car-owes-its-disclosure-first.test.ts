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
import { SALE_DOCUMENTS, describeDocumentState } from "@/lib/admin/sale-desk";

/**
 * A rebuilt car owes its disclosure before anything is sold (43 TAC
 * 215.160, as the SOP cites it): the sale page says it is not started
 * rather than "not needed yet", and the bill of sale waits for it.
 */
beforeEach(() => {
  resetMockWrites();
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
});

describe("a rebuilt car owes its disclosure first", () => {
  const disclosure = SALE_DOCUMENTS.find((entry) => entry.documentType === "rebuiltDisclosure")!;

  it("reads Not started on a sale that owes it, and Not needed yet on one that does not", () => {
    expect(describeDocumentState(disclosure, "none", true)).toBe("Not started");
    expect(describeDocumentState(disclosure, "none", false)).toBe("Not needed yet");
    expect(describeDocumentState(disclosure, "none")).toBe("Not needed yet");
  });

  it("holds the bill of sale until the disclosure is filed", async () => {
    await seedPageDeal(WALKED_CASH, { title_status: "rebuilt_salvage" });
    expect(await filePage("billOfSale", { ...moneyOf(WALKED_CASH) })).toMatchObject({ ok: false, code: "rebuiltDisclosureFirst" });

    resetMockWrites();
    await seedPageDeal(WALKED_CASH, { title_status: "rebuilt_salvage" }, [filedPage("rd", "rebuiltDisclosure")]);
    expect(await filePage("billOfSale", { ...moneyOf(WALKED_CASH) })).toMatchObject({ ok: true });
  });

  it("files the disclosure itself first, with nothing before it", async () => {
    await seedPageDeal(WALKED_CASH, { title_status: "rebuilt_salvage" });
    expect(await filePage("rebuiltDisclosure", { ...moneyOf(WALKED_CASH) })).toMatchObject({ ok: true });
  });
});
