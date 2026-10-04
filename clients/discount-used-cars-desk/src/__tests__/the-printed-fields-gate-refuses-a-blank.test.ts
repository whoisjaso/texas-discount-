import { readFileSync } from "node:fs";
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
import { WALKED_CASH, filePage, moneyOf, seedPageDeal, PAGE_DEAL } from "./helpers/page-filing";

/**
 * A box the sale should fill and would print blank is refused by name,
 * after every refusal that already existed, and the demo flag that lifts a
 * missing dealer fact never lifts it.
 */
beforeEach(() => {
  resetMockWrites();
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
});

describe("the blank-box refusal", () => {
  it("files a walked sale", async () => {
    await seedPageDeal(WALKED_CASH);
    expect(await filePage("billOfSale", { ...moneyOf(WALKED_CASH) })).toMatchObject({ ok: true });
  });

  it("refuses a bill of sale whose buyer has no mailing address, naming the boxes, and writes nothing", async () => {
    const noMailing = { ...WALKED_CASH, buyerId: { name: { read: null, confirmed: "Andrea Salinas" }, licenseNumber: { read: null, confirmed: "12345678" } } };
    await seedPageDeal(noMailing);
    const result = await filePage("billOfSale", { ...moneyOf(noMailing) });
    expect(result).toMatchObject({ ok: false, code: "fieldMissing" });
    expect(result.missing).toEqual(expect.arrayContaining(["Buyer Information: Street", "Buyer Information: City", "Buyer Information: ZIP"]));
    expect(result.error).toMatch(/Buyer Information: Street/);
    expect(mockInserted("document_agreements").filter((row) => row.deal_id === PAGE_DEAL)).toHaveLength(0);
  });

  it("refuses a car with no odometer reading on record", async () => {
    await seedPageDeal(WALKED_CASH, { mileage: null });
    const result = await filePage("billOfSale", { ...moneyOf(WALKED_CASH) });
    expect(result).toMatchObject({ ok: false, code: "fieldMissing" });
    expect(result.missing).toContain("Mileage");
  });

  it("is checked after every refusal that already existed, and the demo flag does not lift it", () => {
    const source = readFileSync("src/lib/actions/paperwork.ts", "utf8");
    const order = [
      "dealerSignerProblem(",
      "filingGate({",
      "answersDiffer(",
      "emptyWeightForFiling(",
      "dealerChargesBlockedReason(",
      "isChapter345Vehicle(",
      "governmentFeesFilingProblem(",
      "unansweredSwornFacts(",
      "missingPrintedFields(",
    ].map((needle) => source.indexOf(needle));
    for (const at of order) expect(at).toBeGreaterThan(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const gates = source.slice(source.indexOf("unansweredSwornFacts("), source.indexOf("const staffSignature"));
    expect(gates).not.toMatch(/DESK_ALLOW_UNSET_FACTS/);
  });
});
