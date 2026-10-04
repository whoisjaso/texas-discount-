import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildGuideSteps } from "@/lib/sales/guide";
import { buildHandoffFields } from "@/lib/sales/webdealer";
import { selectDeliverable } from "@/lib/paperwork-delivery/manifest";
import { requiredDocumentTypes } from "@/lib/sales/deal-type";
import { settledPlan } from "@/lib/sales/sale-plan";
import { createMockSupabaseClient, resetMockWrites } from "@/lib/supabase/mock";
import type { SaleDetail } from "@/lib/admin/sale-desk";
import { ROUTES, owedDocuments, routeSale } from "./fixtures/sales";

/**
 * The desk's last steps read the whole packet, the confirmed licence and
 * the sale's own path:
 *   - "Print Or Save The Paperwork" was done once any one document was, so a
 *     sale with only its bill of sale filed read as finished;
 *   - a sale the buyer registers offered "File The Title And Get Plates",
 *     a 130-U it does not owe and a plate it never records;
 *   - the webDEALER copy list printed the intake's name and number, not the
 *     licence step's confirmed ones;
 *   - the text-the-paperwork send read the funding packet for a tow-away
 *     sale, whose packet is its three salvage sheets.
 */

const withDocuments = (sale: SaleDetail, done: string[]): SaleDetail => ({
  ...sale,
  documents: Object.fromEntries(done.map((type) => [type, "finalized"])) as SaleDetail["documents"],
});

describe("the packet step", () => {
  it("is not done with one document of several filed", () => {
    const owed = owedDocuments(ROUTES.bhphTrade);
    expect(owed.length).toBeGreaterThan(1);
    const step = buildGuideSteps(withDocuments(ROUTES.bhphTrade, ["billOfSale"])).find((s) => s.key === "packet");
    expect(step?.done).toBe(false);
  });

  it("is done once every document the sale owes is filed", () => {
    const sale = withDocuments(ROUTES.bhphTrade, owedDocuments(ROUTES.bhphTrade));
    expect(buildGuideSteps(sale).find((s) => s.key === "packet")?.done).toBe(true);
  });
});

describe("a sale the buyer registers", () => {
  it("has no title-and-plates step; a sale we register still does", () => {
    expect(buildGuideSteps(ROUTES.buyerFilesNoInsurance).some((s) => s.key === "title")).toBe(false);
    expect(buildGuideSteps(ROUTES.cashPaid).some((s) => s.key === "title")).toBe(true);
    expect(buildGuideSteps(ROUTES.towAway).some((s) => s.key === "title")).toBe(false);
  });
});

describe("the webDEALER copy list", () => {
  it("reads the name and number the licence step confirmed", () => {
    const sale = routeSale("webdealer", {
      buyer: { name: "Avery Colins", idNumber: "12345670" },
      stepData: {
        buyerId: {
          ...(ROUTES.cashPaid.stepData as { buyerId: Record<string, unknown> }).buyerId,
          name: { read: "AVERY J COLLINS JR", confirmed: "Avery J Collins Jr" },
          licenseNumber: { read: "12345678", confirmed: "12345678" },
        },
      },
    });
    const fields = buildHandoffFields(sale, "P12345");
    expect(fields.find((f) => f.key === "buyerName")?.value).toBe("Avery J Collins Jr");
    expect(fields.find((f) => f.key === "buyerIdNumber")?.value).toBe("12345678");
  });

  it("falls back to the intake only when nothing was confirmed", () => {
    const sale = routeSale("webdealer-old", { buyer: { name: "Avery Collins", idNumber: "99999999" }, stepData: { buyerId: {} } });
    const fields = buildHandoffFields(sale, "P12345");
    expect(fields.find((f) => f.key === "buyerName")?.value).toBe("Avery Collins");
    expect(fields.find((f) => f.key === "buyerIdNumber")?.value).toBe("99999999");
  });
});

describe("texting the paperwork on a tow-away sale", () => {
  beforeEach(() => resetMockWrites());

  it("waits for the tow-away packet, not the funding packet", async () => {
    const selection = await selectDeliverable(
      createMockSupabaseClient() as unknown as SupabaseClient,
      "no-such-deal",
      "cash",
      "en",
      settledPlan(ROUTES.towAway.stepData),
      "salvage_unrebuilt",
      "towAway",
    );
    const towAway = requiredDocumentTypes("cash", settledPlan(ROUTES.towAway.stepData), "salvage_unrebuilt", "towAway").filter((type) => type !== "powerOfAttorney");
    expect(towAway).toContain("salvageBillOfSale");
    expect(selection.missing).toEqual(towAway);
    expect(selection.missing).not.toContain("billOfSale");
  });

  it("the send passes the sale's salvage path", () => {
    const source = readFileSync("src/lib/actions/paperwork-delivery.ts", "utf8");
    expect(source).toMatch(/sale\.vehicle\?\.titleStatus \?\? null,\s*\/\/[^\n]*\n\s*readSalvagePlan\(sale\.stepData\)\.path,/);
  });
});
