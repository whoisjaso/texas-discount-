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
import { paperworkAnswers, paperworkDefault, unansweredSwornFacts, type PaperworkContext } from "@/lib/sales/paperwork";
import { savePaperworkAnswer } from "@/lib/actions/paperwork";
import { WALKED_CASH, filePage, moneyOf, seedPageDeal, PAGE_DEAL } from "./helpers/page-filing";

/**
 * A sworn statement or a signed date files only from an answer: the
 * mileage statement, how a salvage car leaves, the first payment date. The
 * screen still opens on "actual" for the mileage; it is never filed unseen.
 */
const context = (answers: Record<string, string>, over: Partial<PaperworkContext> = {}): PaperworkContext => ({
  funding: "cash", bodyStyle: "sedan", licenceState: "TX", paidToday: null, buyerCity: "Houston", buyerCounty: "Harris", answers, ...over,
});

beforeEach(() => {
  resetMockWrites();
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
});

describe("a sworn answer is never a default", () => {
  it("starts the mileage question at actual, and files it only once answered", () => {
    expect(paperworkDefault("billOfSale", "odometerStatus", context({}))).toBe("actual");
    expect(paperworkAnswers("billOfSale", context({})).odometerStatus).toBeUndefined();
    expect(paperworkAnswers("billOfSale", context({ odometerStatus: "actual" })).odometerStatus).toBe("actual");
    expect(unansweredSwornFacts("billOfSale", context({})).map((fact) => fact.key)).toEqual(["odometerStatus"]);
  });

  it("files how a salvage car leaves only once somebody said", () => {
    expect(paperworkAnswers("salvageBillOfSale", context({ odometerStatus: "actual" })).howLeaving).toBeUndefined();
    expect(unansweredSwornFacts("salvageBillOfSale", context({ odometerStatus: "actual" })).map((fact) => fact.key)).toEqual(["howLeaving"]);
  });

  it("refuses a bill of sale whose mileage statement nobody answered", async () => {
    const unanswered = { ...WALKED_CASH, paperwork: { billOfSale: { paymentMethod: "Cash", tradeIn: "no", conditionType: "as_is" } } };
    await seedPageDeal(unanswered);
    const result = await filePage("billOfSale", { ...moneyOf(unanswered) });
    expect(result).toMatchObject({ ok: false, code: "mustAnswer" });
    expect(result.missing).toEqual(["Is That The Real Mileage?"]);
  });

  it("refuses an empty answer to a question that has to be answered", async () => {
    await seedPageDeal({ ...WALKED_CASH, funding: { type: "inHouse", lenderId: null, lenderOther: null } });
    expect(await savePaperworkAnswer(PAGE_DEAL, "financing", "firstPaymentDate", "")).toMatchObject({ ok: false });
    expect(await savePaperworkAnswer(PAGE_DEAL, "financing", "firstPaymentDate", "2026-11-03")).toMatchObject({ ok: true });
  });
});
