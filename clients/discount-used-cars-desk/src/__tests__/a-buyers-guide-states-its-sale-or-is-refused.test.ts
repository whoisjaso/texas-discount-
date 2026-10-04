import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buyersGuideSaleProblem } from "@/lib/documents/buyers-guide-sale";
import { ROUTES, routeSale } from "./fixtures/sales";

/**
 * A Buyers Guide printed for a sale states that sale's warranty. A failed
 * sale read used to fall back to AS IS, the very misprint the sale link
 * fixed, and nothing checked the sale's car was the car being printed.
 */
describe("a Buyers Guide states its sale or is refused", () => {
  it("prints for no sale at all as it always did", () => {
    expect(buyersGuideSaleProblem({ dealId: undefined, vehicleId: "v1", sale: null, readFailed: false })).toBeNull();
  });

  it("refuses when the sale could not be read, rather than printing AS IS", () => {
    expect(buyersGuideSaleProblem({ dealId: "d1", vehicleId: "v1", sale: null, readFailed: true })?.status).toBe(502);
    expect(buyersGuideSaleProblem({ dealId: "d1", vehicleId: "v1", sale: null, readFailed: false })?.status).toBe(404);
  });

  it("refuses another car's sale", () => {
    const sale = ROUTES.warranty;
    expect(buyersGuideSaleProblem({ dealId: sale.id, vehicleId: "some-other-car", sale, readFailed: false })?.status).toBe(409);
    expect(buyersGuideSaleProblem({ dealId: sale.id, vehicleId: sale.vehicle!.id, sale, readFailed: false })).toBeNull();
  });

  it("refuses a warranty sale whose warranty is incomplete, naming the boxes", () => {
    const sale = routeSale("half-warranty", { stepData: { paperwork: { billOfSale: { conditionType: "warranty" } } } });
    const problem = buyersGuideSaleProblem({ dealId: sale.id, vehicleId: sale.vehicle!.id, sale, readFailed: false });
    expect(problem?.status).toBe(400);
    expect(problem?.missing).toEqual(expect.arrayContaining(["FULL WARRANTY Or LIMITED WARRANTY (the one ticked)", "DURATION"]));
  });

  it("is what the route answers with", () => {
    const route = readFileSync("src/app/api/documents/buyers-guide/route.ts", "utf8");
    expect(route).toContain("buyersGuideSaleProblem({ dealId, vehicleId, sale, readFailed })");
    expect(route).not.toContain("getSaleDetail(dealId).catch(() => null)");
  });
});
