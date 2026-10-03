import { NEVER, answer, computed, dealer, fees, marker, statik, vehicle, when, type DocumentMap, type MapField } from "@/lib/documents/field-maps/types";
import { bankDeal } from "@/lib/documents/field-maps/conditions";
import { SIGNATURE_BLOCK, buyerAndVehicleBlock } from "@/lib/documents/field-maps/shared-blocks";

/** The tow-away sale's money and salvage facts, which all three sheets carry. */
export function towAwaySaleFields(printed: boolean): MapField[] {
  const p = printed ? {} : { printed: false as const };
  return [
    { id: "vehicleMileage", label: "Odometer (Reading)", source: vehicle("mileage"), blank: NEVER, ...p },
    { id: "odometerStatus", label: "Odometer (Qualification)", source: answer("salvageBillOfSale.odometerStatus"), blank: NEVER, ...p },
    { id: "salePrice", label: "Price", source: computed("money.salePrice"), blank: NEVER, ...p },
    { id: "tax", label: "Sales Tax", source: computed("money.tax"), blank: NEVER, ...p },
    { id: "titleFee", label: "Title Fee", source: fees("titleFee"), blank: NEVER, ...p },
    { id: "docFee", label: "Documentary Fee", source: fees("docFee"), blank: marker("docFee"), ...p },
    { id: "total", label: "Total", source: computed("price + tax + title + doc"), blank: NEVER, ...p },
    { id: "amountPaidToday", label: "Paid Today", source: answer("guide:price.paidTodayAmount"), blank: NEVER, ...p },
    { id: "balanceOwed", label: "Balance Owed", source: computed("money.lien"), blank: when("money is still owed"), ...p },
    { id: "paymentMethod", label: "Paid By", source: answer("salvageBillOfSale.paymentMethod"), fallback: computed("the funding answer: Financing"), blank: NEVER, ...p },
    { id: "paymentMethodOther", label: "Paid By: Lender", source: answer("guide:lender.lender"), on: bankDeal, blank: when("a bank deal"), ...p },
    { id: "salvageLicense", label: "Salvage Dealer Licence", source: dealer("salvageDealerLicense"), blank: { marker: "salvageDealerLicense" }, ...p },
    { id: "titleOriginState", label: "Title Issued By", source: answer("guide:start.titleOrigin"), blank: NEVER, ...p },
  ];
}

/** The salvage bill of sale, the tow-away sale's buyer's order: two pages. */
export const SALVAGE_BILL_OF_SALE_MAP: DocumentMap = {
  documentType: "salvageBillOfSale",
  kind: "designedSheet",
  askOrder: [
    "salvageBillOfSale.odometerStatus",
    "salvageBillOfSale.buyerLicenseState",
    "salvageBillOfSale.paymentMethod",
    "salvageBillOfSale.howLeaving",
  ],
  pages: [
    {
      page: 1,
      title: "Vehicle, Buyer And Money",
      fields: [
        ...buyerAndVehicleBlock("salvageBillOfSale"),
        ...towAwaySaleFields(true),
        { id: "docFeeNotice", label: "Documentary Fee Notice", source: statik("Fin. Code §348.006(c)(3)"), blank: NEVER },
        { id: "docFeeNoticeSpanish", label: "Documentary Fee Notice (Spanish)", source: answer("guide:language.language"), blank: when("the sale is in Spanish") },
        // Asked here, printed on the Tow-Away Acknowledgment.
        { id: "howLeaving", label: "Leaving The Lot", source: answer("salvageBillOfSale.howLeaving"), blank: NEVER, printed: false, carriedFor: "towAwayAcknowledgment" },
        { id: "docFeeUnset", label: "(the owner has not set the doc fee)", source: dealer("docFee"), blank: when("a demo filing with the fee unset"), printed: false },
      ],
    },
    { page: 2, title: "Clauses And Signatures", fields: [...SIGNATURE_BLOCK] },
  ],
};
