import { describe, expect, it } from "vitest";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { routeSale } from "./fixtures/sales";

/**
 * Box 10 states the bill of sale's mileage statement. It used to default
 * to "actual" on its own, so a 130-U said the mileage was actual beside a
 * bill of sale that said it was not.
 */
const brand = (status: string, path: "bill" | "salvage" = "bill") => {
  const sale =
    path === "bill"
      ? routeSale(`m-${status}`, { stepData: { paperwork: { billOfSale: { odometerStatus: status } } } })
      : routeSale(`s-${status}`, { stepData: { paperwork: { salvageBillOfSale: { odometerStatus: status } } } });
  const link = corridorCompletedLink(sale, path === "bill" ? "form130U" : "salvageBillOfSale", { salePrice: 9000 }, "https://x.test");
  return decodeCompletedLinkFromUrl(link!)!;
};

describe("the 130-U states the bill of sale's mileage", () => {
  it("brands not actual N and rolled over X", () => {
    expect(buildAgreementData(brand("not_actual"), {}, null).odometer_brand).toBe("N");
    expect(buildAgreementData(brand("exceeds"), {}, null).odometer_brand).toBe("X");
    expect(buildAgreementData(brand("actual"), {}, null).odometer_brand).toBe("A");
  });

  it("carries the salvage bill's own statement on the tow-away path", () => {
    expect(brand("not_actual", "salvage").dd.odometerStatus).toBe("not_actual");
  });
});
