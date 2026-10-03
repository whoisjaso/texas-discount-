import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { ROUTES, routeSale } from "./fixtures/sales";

/** The lot's stock number prints on the bill of sale and the contract, from the car. */
describe("the stock number is the car's", () => {
  const dd = (sale: ReturnType<typeof routeSale>, type: string) =>
    decodeCompletedLinkFromUrl(corridorCompletedLink(sale, type, { salePrice: 9000 }, "https://x.test")!)!.dd;

  it("prints on the bill of sale and the contract", () => {
    expect(dd(ROUTES.cashPaid, "billOfSale").stockNumber).toBe("D-1042");
    expect(dd(ROUTES.bhphTrade, "financing").stockNumber).toBe("D-1042");
  });

  it("is blank, and omitted, when the car has none", () => {
    expect(dd(routeSale("no-stock", { vehicle: { stockNumber: null } }), "billOfSale").stockNumber).toBe("");
  });

  it("is read with the sale", () => {
    expect(readFileSync("src/lib/admin/sale-desk.ts", "utf8")).toMatch(/vehicles\([^)]*stock_number/);
  });
});
