import { describe, expect, it } from "vitest";
import { readBack } from "@/lib/documents/field-maps/resolve";
import { probe } from "@/lib/documents/field-maps/probes";
import { paperworkFilingContext } from "@/lib/sales/paperwork-filing-context";
import { odometerWords, SALVAGE_COPY_EN } from "@/lib/documents/salvageSale";
import { filedFormData, routeSale } from "./fixtures/sales";

/**
 * The mileage statement prints only what the seller said. The page builder
 * used to fill an unanswered one with "actual", so the review's read-back
 * showed "Yes, That Is The Real Mileage" (and the 130-U's box 10 "Actual
 * Mileage") on a sale where nobody had sworn anything, right above the line
 * saying the statement still had to be answered.
 */

const UNSWORN = routeSale("unsworn", {
  stepData: {
    money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
    paperwork: { billOfSale: { paymentMethod: "Cash", tradeIn: "no", conditionType: "as_is" } },
  },
});

function rowsOf(documentType: string) {
  const { context } = paperworkFilingContext(UNSWORN, documentType, "Harris");
  return readBack(documentType, UNSWORN, filedFormData(documentType, UNSWORN), { context }).flatMap((page) => page.rows);
}

describe("an unanswered mileage statement reads blank", () => {
  it("is missing on the bill of sale's page, with the way to answer it", () => {
    const row = rowsOf("billOfSale").find((entry) => entry.id === "odometerStatus");
    expect(row).toMatchObject({ status: "missing", value: "" });
    expect(row?.changeHref).toBe("/admin/sales/unsworn/paperwork/billOfSale/odometerStatus?change=odometerStatus");
    expect(probe("billOfSale", UNSWORN, filedFormData("billOfSale", UNSWORN))?.odometerStatus).toBe("");
  });

  it("is missing on the 130-U's box 10 too, not read as actual", () => {
    const row = rowsOf("form130U").find((entry) => entry.id === "odometer_brand");
    expect(row).toMatchObject({ status: "missing", value: "" });
  });

  it("reads the answer once it is given", () => {
    const sworn = routeSale("sworn", {
      stepData: {
        money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
        paperwork: { billOfSale: { odometerStatus: "not_actual", paymentMethod: "Cash", tradeIn: "no", conditionType: "as_is" } },
      },
    });
    const { context } = paperworkFilingContext(sworn, "form130U", "Harris");
    const box10 = readBack("form130U", sworn, filedFormData("form130U", sworn), { context })
      .flatMap((page) => page.rows)
      .find((entry) => entry.id === "odometer_brand");
    expect(box10?.value).toBe("Not Actual");
  });

  it("prints no words on the tow-away sheet for a statement nobody made", () => {
    const copy = SALVAGE_COPY_EN;
    expect(odometerWords(copy, "")).toBe("");
    expect(odometerWords(copy, "actual")).toBe(copy.odometerActual);
  });
});
