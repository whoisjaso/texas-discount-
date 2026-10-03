import { describe, expect, it } from "vitest";
import { missingPrintedFields, readBack } from "@/lib/documents/field-maps/resolve";
import { ROUTES, filedFormData, owedDocuments, routeSale } from "./fixtures/sales";

/**
 * On every route the desk walks (cash paid, cash with a balance, buy here
 * pay here with a trade-in, a bank with a typed lender, a buyer who files
 * and showed no insurance, a rebuilt car, a tow-away salvage sale, a
 * Spanish sale, a business buyer, a warranty sale), every box the sale
 * should fill on every document it owes is filled. The filing refuses one
 * that is not (`fieldMissing`), so this is also the proof the refusal never
 * stops a sale walked the way the corridor walks it.
 */
describe("no box prints blank that the sale can fill", () => {
  for (const [route, sale] of Object.entries(ROUTES)) {
    for (const documentType of [...owedDocuments(sale), "buyersGuide"]) {
      it(`${route}: ${documentType}`, () => {
        expect(missingPrintedFields(documentType, sale, filedFormData(documentType, sale), { saleDate: "2026-10-03" })).toEqual([]);
      });
    }
  }

  it("names the box a sale left empty, page by page", () => {
    const sale = routeSale("no-mailing", {
      stepData: {
        buyerId: { name: { read: null, confirmed: "Avery Collins" }, licenseNumber: { read: null, confirmed: "12345678" } },
        money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
        paperwork: { billOfSale: { odometerStatus: "actual", tradeIn: "no", conditionType: "as_is", paymentMethod: "Cash" } },
      },
      buyer: { address: null },
    });
    const missing = missingPrintedFields("billOfSale", sale, filedFormData("billOfSale", sale));
    expect(missing).toEqual(
      expect.arrayContaining(["Buyer Information: Street", "Buyer Information: City", "Buyer Information: State", "Buyer Information: ZIP"]),
    );
    const rows = readBack("billOfSale", sale, filedFormData("billOfSale", sale)).flatMap((page) => page.rows);
    const street = rows.find((row) => row.id === "buyerAddress");
    expect(street?.status).toBe("missing");
    expect(street?.changeHref).toBe("/admin/sales/no-mailing/guide/buyerId");
  });

  it("never adds a state to an address that has none", () => {
    const sale = routeSale("no-state", {
      stepData: {
        buyerId: { mailing: { street: "7400 Metz St", city: "Houston", state: "", postal: "77034" }, mailingConfirmed: true },
        money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
        paperwork: { billOfSale: { odometerStatus: "actual" } },
      },
    });
    expect(missingPrintedFields("billOfSale", sale, filedFormData("billOfSale", sale))).toContain("Buyer Information: State");
  });
});
