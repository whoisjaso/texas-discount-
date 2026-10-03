import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Law review, 2026-10-03 (major): motorcycles, mopeds, ATVs, towable RVs and
 * boats are sold under Tex. Fin. Code ch. 345, whose documentary fee has a
 * hard maximum no filing raises ($200.00, or $250.00 when one contract
 * covers land vehicles and watercraft: §345.251(b)-(d); 7 TAC
 * §86.201(c)-(e)) and its own notice wording, charged to cash and credit
 * buyers alike. The desk never asked what kind of vehicle it was selling, so
 * a motorcycle's bill of sale could charge up to $225.00 and print the
 * ch. 348 notice.
 *
 * Now a sale whose vehicle reads as a ch. 345 vehicle refuses to file any
 * document that prints the documentary fee, with the reason, and
 * DESK_ALLOW_UNSET_FACTS does not lift it.
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

import { CASH_SALE, FEE_DEAL, feeCopy, moneyFor } from "./helpers/fee-filing";
import { feeFields, saveThroughMock } from "./helpers/fees";
import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { finalizePaperwork } from "@/lib/actions/paperwork";
import { writeDealFees } from "@/lib/sales/fee-schedule";
import { CHAPTER_345_MESSAGE, DOC_FEE_DOCUMENTS, isChapter345Vehicle } from "@/lib/legal/chapter-345";

beforeEach(() => {
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("which vehicles are ch. 345", () => {
  it("reads the body style", () => {
    for (const kind of ["Motorcycle", "motor cycle", "Moped", "Scooter", "Dirt Bike", "ATV", "UTV", "Side-by-Side", "Travel Trailer", "Fifth Wheel", "Toy Hauler", "Pop-up Camper", "Camper Trailer", "Boat", "Jet Ski", "Personal Watercraft", "PWC", "Outboard Motor"]) {
      expect(isChapter345Vehicle(kind), kind).toBe(true);
    }
    for (const kind of ["Sedan", "SUV", "Truck", "Coupe", "Van", "Hatchback", "Pickup", "Wagon", "Convertible", "Crossover", "Camper Van", "Motor Home", "", null, undefined]) {
      expect(isChapter345Vehicle(kind), String(kind)).toBe(false);
    }
  });

  it("names the hard maximum and the cites in the refusal", () => {
    expect(CHAPTER_345_MESSAGE).toContain("$200.00");
    expect(CHAPTER_345_MESSAGE).toContain("Fin. Code §345.251");
    expect(CHAPTER_345_MESSAGE).toContain("7 TAC §86.201");
    expect([...DOC_FEE_DOCUMENTS]).toEqual(["billOfSale", "salvageBillOfSale", "financing"]);
  });
});

describe("filing", () => {
  async function seed(bodyStyle: string) {
    expect((await saveThroughMock(feeFields(), 0)).error).toBeNull();
    const stepData = writeDealFees(CASH_SALE, feeCopy());
    await createMockSupabaseClient().from("deals").insert({
      id: FEE_DEAL,
      status: "in_progress",
      language: "en",
      step_data: stepData,
      customers: { id: "fee-buyer", name: "Andrea Salinas", phone: "7135550188" },
      vehicles: { id: "fee-bike", year: 2019, make: "Honda", model: "Rebel 500", vin: "JH2PC4400KK000001", title_status: "clean", sale_price: 9000, body_style: bodyStyle },
    });
    return stepData;
  }
  const file = (stepData: Record<string, unknown>) =>
    finalizePaperwork(FEE_DEAL, "billOfSale", {
      buyerName: "Andrea Salinas",
      vehicleDescription: "2019 Honda Rebel 500",
      vehicleVin: "JH2PC4400KK000001",
      formData: { ...moneyFor(stepData, feeCopy()) },
      signature: null,
    });

  it("refuses a motorcycle's bill of sale, demo flag or not", async () => {
    const stepData = await seed("Motorcycle");
    const result = await file(stepData);
    expect(result).toMatchObject({ ok: false, code: "chapter345Vehicle" });
    expect(result.error).toBe(CHAPTER_345_MESSAGE);
    expect(mockInserted("document_agreements")).toEqual([]);
  });

  it("files a car's as before", async () => {
    const stepData = await seed("Sedan");
    expect(await file(stepData)).toMatchObject({ ok: true });
  });

  it("tells the owner at onboarding that the desk will not file them", () => {
    const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
    expect(en.funnel.onboarding.fees.ch345Warning).toMatch(/will not file their bill of sale or contract/);
    expect(en.funnel.onboarding.fees.ch345Help).toContain("7 TAC §86.201(c)-(e); Fin. Code §345.251");
  });
});
