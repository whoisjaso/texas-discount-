import {
  INK,
  NEVER,
  answer,
  buyer,
  coBuyer,
  computed,
  date,
  dealer,
  fees,
  marker,
  none,
  signature,
  statik,
  vehicle,
  when,
  type DocumentMap,
} from "@/lib/documents/field-maps/types";
import { bankDeal, hasCoBuyer, limitedWarranty, sellerLien, tradeIn, warranty } from "@/lib/documents/field-maps/conditions";

/** The co-buyer writes their own address, phone and ID beside their ink signature (D-02). */
const CO_BUYER_INK = INK;

/**
 * The bill of sale, page by page (BillOfSalePreview, four Letter pages).
 *
 * Its sections flow rather than sit on fixed pages, so the pages here are
 * the sections in the order they print: the transaction, the money and the
 * statements, the liens and the terms, and the signatures. Ids are the keys
 * of the filed `completed_link` payload.
 */
export const BILL_OF_SALE_MAP: DocumentMap = {
  documentType: "billOfSale",
  kind: "designedSheet",
  askOrder: [
    "billOfSale.odometerStatus",
    "billOfSale.buyerLicenseState",
    "billOfSale.paymentMethod",
    "billOfSale.tradeIn",
    "billOfSale.tradeInVin",
    "billOfSale.tradeInDescription",
    "billOfSale.tradeInAllowance",
    "billOfSale.conditionType",
    "billOfSale.warrantyKind",
    "billOfSale.warrantyLaborPercent",
    "billOfSale.warrantyPartsPercent",
    "billOfSale.warrantySystems",
    "billOfSale.warrantyDuration",
  ],
  pages: [
    {
      page: 1,
      title: "The Transaction",
      fields: [
        { id: "saleDate", label: "Date", source: date("saleDate"), blank: NEVER },
        { id: "stockNumber", label: "Stock #", source: vehicle("stockNumber"), blank: when("the car has a stock number") },
        { id: "buyerName", label: "Buyer Information: Name", source: buyer("name"), blank: NEVER },
        { id: "buyerAddress", label: "Buyer Information: Street", source: buyer("street"), blank: NEVER },
        { id: "buyerCity", label: "Buyer Information: City", source: buyer("city"), blank: NEVER },
        { id: "buyerState", label: "Buyer Information: State", source: buyer("state"), blank: NEVER },
        { id: "buyerZip", label: "Buyer Information: ZIP", source: buyer("zip"), blank: NEVER },
        { id: "buyerPhone", label: "Buyer Information: Phone", source: buyer("phone"), blank: NEVER },
        { id: "buyerEmail", label: "Buyer Information: Email", source: buyer("email"), blank: when("the buyer gave an email") },
        { id: "buyerLicense", label: "Buyer Information: ID Number", source: buyer("idNumber"), blank: NEVER },
        { id: "buyerIdKind", label: "Buyer Information: ID Kind", source: buyer("idKind"), blank: NEVER },
        { id: "buyerLicenseState", label: "Buyer Information: Issued By", source: answer("billOfSale.buyerLicenseState"), fallback: buyer("idIssuer"), blank: when("the ID is issued by a state or a country") },
        // The co-buyer the intake named: the name prints, the rest is written
        // in ink beside their signature until the co-buyer step exists (D-02).
        { id: "coBuyerName", label: "Co-Buyer Information: Name", source: coBuyer("name"), on: hasCoBuyer, blank: NEVER },
        { id: "coBuyerAddress", label: "Co-Buyer Information: Street", source: coBuyer("address"), on: hasCoBuyer, blank: CO_BUYER_INK },
        { id: "coBuyerCity", label: "Co-Buyer Information: City", source: coBuyer("address"), on: hasCoBuyer, blank: CO_BUYER_INK },
        { id: "coBuyerState", label: "Co-Buyer Information: State", source: coBuyer("address"), on: hasCoBuyer, blank: CO_BUYER_INK },
        { id: "coBuyerZip", label: "Co-Buyer Information: ZIP", source: coBuyer("address"), on: hasCoBuyer, blank: CO_BUYER_INK },
        { id: "coBuyerPhone", label: "Co-Buyer Information: Phone", source: coBuyer("phone"), on: hasCoBuyer, blank: CO_BUYER_INK },
        { id: "coBuyerEmail", label: "Co-Buyer Information: Email", source: coBuyer("email"), on: hasCoBuyer, blank: CO_BUYER_INK },
        { id: "coBuyerLicense", label: "Co-Buyer Information: ID Number", source: coBuyer("idNumber"), on: hasCoBuyer, blank: CO_BUYER_INK },
        { id: "coBuyerLicenseState", label: "Co-Buyer Information: Issued By", source: coBuyer("idIssuer"), on: hasCoBuyer, blank: CO_BUYER_INK },
        { id: "vehicleYear", label: "Year", source: vehicle("year"), blank: NEVER },
        { id: "vehicleMake", label: "Make", source: vehicle("make"), blank: NEVER },
        { id: "vehicleModel", label: "Model", source: vehicle("model"), blank: NEVER },
        { id: "vehicleTrim", label: "Trim", source: vehicle("trim"), blank: when("the vehicle row has a trim") },
        { id: "vehicleColor", label: "Color", source: vehicle("exteriorColor"), blank: when("the vehicle row has a colour") },
        { id: "vehicleBodyStyle", label: "Body", source: vehicle("bodyStyle"), blank: when("the vehicle row has a body style") },
        { id: "vehicleMileage", label: "Mileage", source: vehicle("mileage"), blank: NEVER },
        { id: "vehicleVin", label: "VIN", source: vehicle("vin"), blank: NEVER },
        { id: "vehiclePlate", label: "License Plate", source: answer("guide:plate.plate"), blank: when("a plate is recorded") },
        { id: "salePrice", label: "Vehicle Price", source: computed("money.salePrice"), blank: NEVER },
        // The name parts and the ID kind's own keys ride in the shared block
        // the 130-U reads; the bill of sale prints the whole name.
        { id: "applicantFirstName", label: "(first name, for the 130-U)", source: buyer("nameParts"), blank: NEVER, printed: false },
        { id: "applicantMiddleName", label: "(middle name, for the 130-U)", source: buyer("nameParts"), blank: when("a middle name"), printed: false },
        { id: "applicantLastName", label: "(last name, for the 130-U)", source: buyer("nameParts"), blank: when("a last name"), printed: false },
        { id: "applicantSuffix", label: "(suffix, for the 130-U)", source: buyer("nameParts"), blank: when("a suffix"), printed: false },
      ],
    },
    {
      page: 2,
      title: "Trade-In, Itemization And Statements",
      fields: [
        { id: "tradeInDescription", label: "Trade-In Vehicle: Description", source: answer("billOfSale.tradeInDescription"), blank: when("tradeIn=yes", tradeIn) },
        { id: "tradeInVin", label: "Trade-In Vehicle: VIN", source: answer("billOfSale.tradeInVin"), on: tradeIn, blank: when("tradeIn=yes and a VIN was given") },
        { id: "tradeInAllowance", label: "Trade-In Allowance", source: answer("billOfSale.tradeInAllowance"), blank: when("tradeIn=yes", tradeIn) },
        { id: "tradeInPayoff", label: "Trade-In Payoff Owed", source: none("never asked (owner decision D-04)"), on: tradeIn, blank: when("always $0.00 until the owner decides") },
        { id: "tax", label: "Sales Tax", source: computed("money.tax"), blank: NEVER },
        { id: "titleFee", label: "Title Fee", source: fees("titleFee"), blank: NEVER },
        // The owner's fee: "[Not set: doc fee]" until Your Fees holds it (a demo only).
        { id: "docFee", label: "Documentary Fee", source: fees("docFee"), blank: marker("docFee") },
        { id: "docFeeNotice", label: "Documentary Fee Notice", source: statik("Fin. Code §348.006(c)(3)"), blank: NEVER },
        { id: "docFeeNoticeSpanish", label: "Documentary Fee Notice (Spanish)", source: answer("guide:language.language"), blank: when("the sale is in Spanish") },
        { id: "registrationFee", label: "Registration Fee", source: fees("registrationFee"), blank: NEVER },
        { id: "inspectionFee", label: "Inspection Program Replacement Fee", source: fees("inspectionFee"), blank: when("recorded from webDEALER") },
        { id: "plateFee", label: "License Plate Fee", source: fees("plateFee"), blank: when("recorded from webDEALER") },
        { id: "otherFees", label: "Other Fees", source: none("no other dealer fee is allowed (Fin. Code §348.005)"), blank: when("never printed at $0") },
        { id: "otherFeesDescription", label: "Other Fees: Description", source: none("no other dealer fee is allowed"), blank: when("never printed") },
        { id: "netTradeIn", label: "Net Trade-In", source: computed("tradeInAllowance - tradeInPayoff"), on: tradeIn, blank: NEVER },
        { id: "balanceAfterTrade", label: "2. Balance After Trade", source: computed("price - net trade-in"), blank: NEVER },
        { id: "feesAndTax", label: "Fees And Tax", source: computed("tax + title + doc + registration + government lines"), blank: NEVER },
        { id: "totalAmountDue", label: "Total Amount Due", source: computed("price - net trade-in + fees and tax"), blank: NEVER },
        { id: "amountPaidToday", label: "Paid Today", source: answer("guide:price.paidTodayAmount"), blank: NEVER },
        { id: "financedByLender", label: "Financed By The Lender", source: computed("total due - paid today, on a bank deal"), on: bankDeal, blank: when("a bank deal filed under the page-by-page paperwork") },
        { id: "paymentMethod", label: "Payment Method", source: answer("billOfSale.paymentMethod"), fallback: computed("the funding answer: Financing"), blank: NEVER },
        { id: "paymentMethodOther", label: "Payment Method: Lender", source: answer("guide:lender.lender"), on: bankDeal, blank: when("a bank deal") },
        { id: "tradeIn", label: "(is there a trade-in)", source: answer("billOfSale.tradeIn"), blank: NEVER, printed: false, decides: "whether the trade-in block prints" },
        { id: "conditionType", label: "As Is / Warranty", source: answer("billOfSale.conditionType"), blank: NEVER },
        { id: "warrantyDuration", label: "Warranty Period", source: answer("billOfSale.warrantyDuration"), blank: when("conditionType=warranty", warranty) },
        { id: "warrantyDescription", label: "Coverage", source: answer("billOfSale.warrantySystems"), blank: when("conditionType=warranty", warranty) },
        /*
          Asked with the bill of sale, which holds the warranty once filed,
          and printed on the Buyers Guide's DEALER WARRANTY box: the bill's
          own warranty block prints the period and the systems, and its
          heading is counsel's (D-05). Read back under the Buyers Guide.
        */
        { id: "warrantyKind", label: "Full Or Limited Warranty", source: answer("billOfSale.warrantyKind"), blank: when("conditionType=warranty", warranty), printed: false, carriedFor: "buyersGuide" },
        { id: "warrantyLaborPercent", label: "Share Of Labor The Dealer Pays", source: answer("billOfSale.warrantyLaborPercent"), on: warranty, blank: when("a limited warranty", limitedWarranty), printed: false, carriedFor: "buyersGuide" },
        { id: "warrantyPartsPercent", label: "Share Of Parts The Dealer Pays", source: answer("billOfSale.warrantyPartsPercent"), on: warranty, blank: when("a limited warranty", limitedWarranty), printed: false, carriedFor: "buyersGuide" },
        { id: "odometerReading", label: "Odometer Reading", source: vehicle("mileage"), blank: NEVER },
        { id: "odometerStatus", label: "Odometer Status", source: answer("billOfSale.odometerStatus"), blank: NEVER },
      ],
    },
    {
      page: 3,
      title: "Liens, Still To Do And Terms",
      fields: [
        { id: "sellerLienEnabled", label: "Seller Lien / Balance Owed", source: computed("money.lien > 0"), blank: when("money is owed to the seller"), printed: false },
        { id: "sellerLienAmount", label: "Secured Balance", source: computed("money.lien"), on: sellerLien, blank: NEVER },
        { id: "sellerLienReason", label: "Reason", source: statik("BALANCE_OWED_REASON"), on: sellerLien, blank: NEVER },
        { id: "sellerLienDate", label: "Lien Date", source: date("lienDate"), on: sellerLien, blank: NEVER },
        { id: "sellerLienholderName", label: "Lienholder", source: dealer("legalName"), on: sellerLien, blank: marker("legalName") },
        { id: "sellerLienholderAddress", label: "Lienholder: Street", source: dealer("address"), on: sellerLien, blank: when("money is owed to the seller") },
        { id: "sellerLienholderCity", label: "Lienholder: City", source: dealer("address"), on: sellerLien, blank: when("money is owed to the seller") },
        { id: "sellerLienholderState", label: "Lienholder: State", source: dealer("address"), on: sellerLien, blank: when("money is owed to the seller") },
        { id: "sellerLienholderZip", label: "Lienholder: ZIP", source: dealer("address"), on: sellerLien, blank: when("money is owed to the seller") },
        { id: "titleLienholderName", label: "Lien On Title: Lienholder", source: answer("guide:lender.lender"), on: bankDeal, blank: when("a bank deal") },
        { id: "titleLienholderAddress", label: "Lien On Title: Street", source: answer("guide:lender.lender"), on: bankDeal, blank: when("the lender's titling address is on file") },
        { id: "titleLienholderCity", label: "Lien On Title: City", source: answer("guide:lender.lender"), on: bankDeal, blank: when("the lender's titling address is on file") },
        { id: "titleLienholderState", label: "Lien On Title: State", source: answer("guide:lender.lender"), on: bankDeal, blank: when("the lender's titling address is on file") },
        { id: "titleLienholderZip", label: "Lien On Title: ZIP", source: answer("guide:lender.lender"), on: bankDeal, blank: when("the lender's titling address is on file") },
        { id: "titleLienReason", label: "Lien On Title: Reason", source: computed("Purchase money financed by {lender}"), on: bankDeal, blank: when("a bank deal") },
        { id: "outstanding", label: "Still To Do", source: answer("guide:plan.registrationBy"), blank: NEVER },
        // Filing's own stamps: which reading a reprint takes, and the doc fee's marker.
        { id: "pageLayout", label: "(filed under the page-by-page paperwork)", source: statik("PAGE_LAYOUT"), blank: NEVER, printed: false },
        { id: "docFeeUnset", label: "(the owner has not set the doc fee)", source: dealer("docFee"), blank: when("a demo filing with the fee unset"), printed: false },
      ],
    },
    {
      page: 4,
      title: "Buyer Acknowledgment And Signatures",
      fields: [
        { id: "totalPaid", label: "Buyer Acknowledgment: Total Paid", source: computed("paid today; the total due on a bank deal"), blank: NEVER },
        { id: "buyerSignature", label: "Buyer Signature", source: signature("buyer"), blank: INK },
        { id: "buyerSignatureDate", label: "Date (Buyer)", source: date("signedOn"), blank: INK },
        { id: "dealerSignature", label: "Seller (Dealer) Signature", source: signature("dealer"), blank: INK },
        { id: "dealerSignatureDate", label: "Date (Dealer)", source: date("signedOn"), blank: INK },
        { id: "dealerSignerName", label: "Seller (Dealer) Printed Name", source: dealer("signerName"), blank: marker("signerName") },
      ],
    },
  ],
};
