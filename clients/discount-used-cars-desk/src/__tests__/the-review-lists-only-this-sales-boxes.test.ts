import { describe, expect, it } from "vitest";
import { readBack } from "@/lib/documents/field-maps/resolve";
import { ROUTES, filedFormData } from "./fixtures/sales";

/**
 * The bill of sale's review listed all 74 boxes on every sale, with 7
 * co-buyer rows and 14 lien rows reading "Left blank" on a cash sale: about
 * seven phone screens before the File button. A box the map puts on some
 * sales only (a co-buyer, a seller's lien, a bank's lien, a trade-in) is
 * listed only on those sales.
 */
const ids = (sale: typeof ROUTES.cashPaid) =>
  readBack("billOfSale", sale, filedFormData("billOfSale", sale)).flatMap((page) => page.rows.map((row) => row.id));

describe("the review lists only this sale's boxes", () => {
  it("a sale paid in full: no co-buyer, lien or trade-in rows", () => {
    const rows = ids(ROUTES.buyerFilesNoInsurance);
    expect(rows.filter((id) => /^coBuyer|^sellerLien|^titleLien|^tradeIn|^netTradeIn|^financedByLender/.test(id))).toEqual([]);
    expect(rows.length).toBeLessThan(55);
  });

  it("a cash sale with a balance: the seller's lien", () => {
    const rows = ids(ROUTES.cashBalance);
    expect(rows).toEqual(expect.arrayContaining(["sellerLienAmount", "sellerLienReason", "sellerLienDate", "sellerLienholderName"]));
    expect(rows.some((id) => id.startsWith("titleLien"))).toBe(false);
  });

  it("a bank deal: the lender's lien and its part of the price", () => {
    const rows = ids(ROUTES.bankTypedLender);
    expect(rows).toEqual(expect.arrayContaining(["titleLienholderName", "paymentMethodOther", "financedByLender"]));
    expect(rows.some((id) => id.startsWith("sellerLien"))).toBe(false);
  });

  it("a trade-in: its block", () => {
    expect(ids(ROUTES.bhphTrade)).toEqual(expect.arrayContaining(["tradeInDescription", "tradeInVin", "tradeInAllowance", "netTradeIn"]));
  });
});
