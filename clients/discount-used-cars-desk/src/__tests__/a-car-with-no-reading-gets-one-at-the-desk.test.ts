import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Walked on 5190, 2026-10-04: the seeded pickup's car had no odometer
 * reading, only Start A Sale ever writes one, and its bill of sale review
 * said "Fill these in first: Mileage, Odometer Reading." with a Fix It that
 * opened a 404. A sale like that could never be filed from the desk.
 *
 * Now the bill of sale asks "What Does The Odometer Read?" before the
 * mileage statement on a car with none, writes the column Start A Sale writes
 * (vehicles.mileage) with Start A Sale's own check, refuses a statement with
 * no reading to swear to, and holds the reading once a bill of sale is filed.
 */

const state = vi.hoisted(() => ({ role: "owner" as string }));

vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({
    ok: true,
    role: state.role,
    user: { id: "local-admin-preview", email: "owner@example.dev" },
    member: { id: "member-1", full_name: "Maria Lopez" },
  }),
  getCurrentAdminAccess: async () => ({ user: { id: "local-admin-preview" }, role: state.role, member: { id: "member-1" } }),
}));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "tj-local-admin-preview" ? { value: "owner@example.dev" } : undefined), set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));

import { resetMockWrites } from "@/lib/supabase/mock";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { savePaperworkAnswer } from "@/lib/actions/paperwork";
import { paperworkAnswers, paperworkQuestions, readPaperwork, type PaperworkContext } from "@/lib/sales/paperwork";
import { readOdometerReading } from "@/lib/sales/odometer-reading";
import { PAGE_DEAL, WALKED_CASH, filedPage, seedPageDeal } from "./helpers/page-filing";

const context = (vehicleMileage: number | null, over: Partial<PaperworkContext> = {}): PaperworkContext => ({
  funding: "cash", bodyStyle: "pickup", licenceState: "TX", paidToday: null, buyerCity: "Houston", buyerCounty: "Harris",
  vehicleMileage, answers: {}, ...over,
});

const UNANSWERED = { ...WALKED_CASH, paperwork: { billOfSale: { paymentMethod: "Cash", tradeIn: "no", conditionType: "as_is" } } };

beforeEach(() => {
  resetMockWrites();
  state.role = "owner";
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
});

describe("a car with no reading gets one at the desk", () => {
  it("asks the reading before the statement that swears to it, only on a car with none", () => {
    const none = paperworkQuestions("billOfSale", context(null)).map((question) => question.key);
    expect(none.slice(0, 2)).toEqual(["odometerReading", "odometerStatus"]);
    const salvage = paperworkQuestions("salvageBillOfSale", context(null)).map((question) => question.key);
    expect(salvage.slice(0, 2)).toEqual(["odometerReading", "odometerStatus"]);
    // A car with a reading is not asked again; Change reopens it.
    expect(paperworkQuestions("billOfSale", context(84512)).map((question) => question.key)).not.toContain("odometerReading");
    expect(paperworkQuestions("billOfSale", context(84512, { reopen: "odometerReading" })).map((question) => question.key)[0]).toBe("odometerReading");
    // The reading files as the car states it, never as an answer of its own.
    expect(paperworkAnswers("billOfSale", context(84512)).odometerReading).toBe("84512");
    expect(paperworkAnswers("billOfSale", context(null)).odometerReading).toBeUndefined();
  });

  it("checks a reading the way Start A Sale does, and nothing more", () => {
    expect(readOdometerReading("100000")).toBe(100000);
    expect(readOdometerReading("84,512")).toBe(84512);
    expect(readOdometerReading("0")).toBe(0);
    expect(readOdometerReading("61042.6")).toBe(61043);
    for (const bad of ["", "   ", "-5", "abc", "12 miles"]) expect(readOdometerReading(bad), bad).toBeNull();
  });

  it("writes the reading to the car, where every document prints it from", async () => {
    await seedPageDeal(UNANSWERED, { mileage: null });
    expect((await getSaleDetail(PAGE_DEAL))?.vehicle?.mileage).toBeNull();
    expect(await savePaperworkAnswer(PAGE_DEAL, "billOfSale", "odometerReading", "61,042")).toMatchObject({ ok: true });
    const sale = await getSaleDetail(PAGE_DEAL);
    expect(sale?.vehicle?.mileage).toBe(61042);
    // Not an answer on the bill of sale: the car holds it.
    expect(readPaperwork(sale?.stepData, "billOfSale").odometerReading).toBeUndefined();
  });

  it("refuses a reading that is not a number of miles", async () => {
    await seedPageDeal(UNANSWERED, { mileage: null });
    for (const bad of ["", "-5", "abc"]) {
      expect(await savePaperworkAnswer(PAGE_DEAL, "billOfSale", "odometerReading", bad), bad).toMatchObject({
        ok: false,
        code: "odometerReadingInvalid",
      });
    }
    expect((await getSaleDetail(PAGE_DEAL))?.vehicle?.mileage).toBeNull();
  });

  it("swears to no mileage statement on a car with no reading", async () => {
    await seedPageDeal(UNANSWERED, { mileage: null });
    expect(await savePaperworkAnswer(PAGE_DEAL, "billOfSale", "odometerStatus", "actual")).toMatchObject({
      ok: false,
      code: "odometerReadingMissing",
    });
    // Borrowed by the 130-U, the same statement is held to the same rule.
    expect(await savePaperworkAnswer(PAGE_DEAL, "form130U", "odometerStatus", "not_actual")).toMatchObject({
      ok: false,
      code: "odometerReadingMissing",
    });
    expect(await savePaperworkAnswer(PAGE_DEAL, "billOfSale", "odometerReading", "61042")).toMatchObject({ ok: true });
    expect(await savePaperworkAnswer(PAGE_DEAL, "billOfSale", "odometerStatus", "actual")).toMatchObject({ ok: true });
  });

  it("holds the reading a filed bill of sale states, and frees it after a void", async () => {
    await seedPageDeal(WALKED_CASH, { mileage: 61042 }, [filedPage("bos-1", "billOfSale")]);
    expect(await savePaperworkAnswer(PAGE_DEAL, "billOfSale", "odometerReading", "70000")).toMatchObject({
      ok: false,
      code: "billOfSaleFrozen",
      field: "mileage",
    });
    // The same reading typed again is no change.
    expect(await savePaperworkAnswer(PAGE_DEAL, "billOfSale", "odometerReading", "61,042")).toMatchObject({ ok: true });
    expect((await getSaleDetail(PAGE_DEAL))?.vehicle?.mileage).toBe(61042);

    resetMockWrites();
    await seedPageDeal(WALKED_CASH, { mileage: 61042 }, [
      filedPage("bos-1", "billOfSale", { status: "voided", voided_at: "2026-10-04T15:00:00.000Z" }),
    ]);
    expect(await savePaperworkAnswer(PAGE_DEAL, "billOfSale", "odometerReading", "70000")).toMatchObject({ ok: true });
    expect((await getSaleDetail(PAGE_DEAL))?.vehicle?.mileage).toBe(70000);
  });

  it("leaves the car's record to a role that may change it", async () => {
    await seedPageDeal(UNANSWERED, { mileage: null });
    state.role = "registration";
    expect(await savePaperworkAnswer(PAGE_DEAL, "billOfSale", "odometerReading", "61042")).toMatchObject({
      ok: false,
      code: "odometerReadingNotAllowed",
    });
    state.role = "sales";
    expect(await savePaperworkAnswer(PAGE_DEAL, "billOfSale", "odometerReading", "61042")).toMatchObject({ ok: true });
  });
});
