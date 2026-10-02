import { beforeEach, describe, expect, it } from "vitest";
import { createMockSupabaseClient, resetMockWrites } from "@/lib/supabase/mock";
import { filedBillOfSaleOn } from "@/lib/sales/filed-bill-of-sale";

/**
 * The down-payment freeze asks one question of the deal's documents: is its
 * bill of sale filed? Answered from the filed rows of that deal alone, a
 * pending row or another deal's bill of sale never freezing it. Run against
 * the preview store (tests run with preview on), through the same client
 * `getSaleDetail` reads with.
 */

async function file(dealId: string, documentType: string, finalized: boolean) {
  await createMockSupabaseClient()
    .from("document_agreements")
    .insert({
      deal_id: dealId,
      document_type: documentType,
      status: finalized ? "finalized" : "pending",
      finalized_at: finalized ? "2026-10-01T15:00:00.000Z" : null,
    });
}

beforeEach(() => resetMockWrites());

describe("the filed bill of sale", () => {
  it("is none on a deal with nothing filed", async () => {
    expect(await filedBillOfSaleOn("freeze-deal-1")).toBeNull();
  });

  it("is none while the bill of sale is only a draft, or filed on another deal", async () => {
    await file("freeze-deal-1", "billOfSale", false);
    await file("freeze-deal-2", "billOfSale", true);
    await file("freeze-deal-1", "form130U", true);
    expect(await filedBillOfSaleOn("freeze-deal-1")).toBeNull();
  });

  it("is found once it is filed on this deal", async () => {
    await file("freeze-deal-1", "billOfSale", true);
    expect(await filedBillOfSaleOn("freeze-deal-1")).toMatchObject({ type: "billOfSale" });
  });

  it("counts the salvage bill of sale of a tow-away sale", async () => {
    await file("freeze-deal-3", "salvageBillOfSale", true);
    expect(await filedBillOfSaleOn("freeze-deal-3")).toMatchObject({ type: "salvageBillOfSale" });
  });
});
