import { describe, expect, it } from "vitest";
import { paperworkAnswers, type PaperworkContext } from "@/lib/sales/paperwork";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { routeSale } from "./fixtures/sales";

/**
 * An answer to a question the sale no longer asks never prints: a trade-in
 * described and then answered No, a warranty period typed and then sold
 * as-is. The answers are pruned where they are resolved, and the bill of
 * sale prints the trade-in block only while the sale says there is one.
 */
const context = (answers: Record<string, string>): PaperworkContext => ({
  funding: "cash",
  bodyStyle: "sedan",
  licenceState: "TX",
  paidToday: null,
  buyerCity: "Houston",
  buyerCounty: "Harris",
  answers,
});

describe("a stale answer does not print", () => {
  it("drops the trade-in's description and VIN when the trade-in goes back to No", () => {
    const resolved = paperworkAnswers("billOfSale", context({ tradeIn: "no", tradeInDescription: "2012 Honda Civic LX", tradeInVin: "1HGCM82633A004352", tradeInAllowance: "2000" }));
    expect(resolved.tradeInDescription).toBeUndefined();
    expect(resolved.tradeInVin).toBeUndefined();
    expect(resolved.tradeInAllowance).toBeUndefined();
  });

  it("drops the warranty's period, kind, shares and systems when the sale goes back to as-is", () => {
    const resolved = paperworkAnswers(
      "billOfSale",
      context({ conditionType: "as_is", warrantyDuration: "30 days", warrantyKind: "limited", warrantyLaborPercent: "50", warrantyPartsPercent: "50", warrantySystems: "engine" }),
    );
    for (const key of ["warrantyDuration", "warrantyKind", "warrantyLaborPercent", "warrantyPartsPercent", "warrantySystems"]) {
      expect(resolved[key], key).toBeUndefined();
    }
  });

  it("prints no trade-in block from a description posted beside a No", () => {
    const sale = routeSale("stale");
    const link = corridorCompletedLink(sale, "billOfSale", { tradeIn: "no", tradeInDescription: "2012 Honda Civic LX", salePrice: 9000 }, "https://x.test");
    const dd = decodeCompletedLinkFromUrl(link!)!.dd;
    expect(dd.tradeInDescription).toBe("");
    expect(dd.tradeInVin).toBe("");
  });
});
