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
  signature,
  statik,
  vehicle,
  when,
  type DocumentMap,
} from "@/lib/documents/field-maps/types";
import { hasCoBuyer, tradeIn } from "@/lib/documents/field-maps/conditions";

/**
 * The retail installment contract (ContractPreview): the disclosure box,
 * the itemization, the terms, the signatures and, once the first payment
 * date is answered, the amortization schedule on its own page.
 */
export const FINANCING_MAP: DocumentMap = {
  documentType: "financing",
  kind: "designedSheet",
  askOrder: [
    "financing.downPayment",
    "financing.paymentFrequency",
    "financing.termsBy",
    "financing.paymentAmount",
    "financing.numberOfPayments",
    "financing.apr",
    "financing.firstPaymentDate",
  ],
  pages: [
    {
      page: 1,
      title: "Parties, Vehicle And Truth In Lending",
      fields: [
        { id: "contractDate", label: "Date", source: date("contractDate"), blank: NEVER },
        { id: "stockNumber", label: "Stock #", source: vehicle("stockNumber"), blank: when("the car has a stock number") },
        { id: "buyerName", label: "Buyer Information: Name", source: buyer("name"), blank: NEVER },
        { id: "buyerAddress", label: "Buyer Information: Address", source: buyer("address"), blank: NEVER },
        { id: "buyerPhone", label: "Buyer Information: Phone", source: buyer("phone"), blank: NEVER },
        { id: "buyerEmail", label: "Buyer Information: Email", source: buyer("email"), blank: when("the buyer gave an email") },
        // The co-buyer the intake named; their details are written in ink (D-02).
        { id: "coBuyerName", label: "Co-Buyer Information: Name", source: coBuyer("name"), on: hasCoBuyer, blank: NEVER },
        { id: "coBuyerAddress", label: "Co-Buyer Information: Address", source: coBuyer("address"), on: hasCoBuyer, blank: INK },
        { id: "coBuyerPhone", label: "Co-Buyer Information: Phone", source: coBuyer("phone"), on: hasCoBuyer, blank: INK },
        { id: "coBuyerEmail", label: "Co-Buyer Information: Email", source: coBuyer("email"), on: hasCoBuyer, blank: INK },
        { id: "vehicleYear", label: "Year", source: vehicle("year"), blank: NEVER },
        { id: "vehicleMake", label: "Make", source: vehicle("make"), blank: NEVER },
        { id: "vehicleModel", label: "Model", source: vehicle("model"), blank: NEVER },
        { id: "vehicleMileage", label: "Mileage", source: vehicle("mileage"), blank: NEVER },
        { id: "vehicleVin", label: "VIN", source: vehicle("vin"), blank: NEVER },
        { id: "vehiclePlate", label: "Plate", source: answer("guide:plate.plate"), blank: when("a plate is recorded") },
        // Whichever two of the three were agreed, the solver works out the
        // third: a rate implied by the payment and the count is not an answer.
        { id: "apr", label: "Annual Percentage Rate", source: answer("financing.apr"), fallback: computed("terms: the rate the payment and the count imply"), blank: NEVER },
        { id: "financeCharge", label: "Finance Charge", source: computed("totalOfPayments - amountFinanced"), blank: NEVER },
        { id: "amountFinanced", label: "Amount Financed", source: computed("totalCashPrice - downPayment - tradeIn"), blank: NEVER },
        { id: "totalOfPayments", label: "Total Of Payments", source: computed("payment x count"), blank: NEVER },
        { id: "numberOfPayments", label: "Number Of Payments", source: answer("financing.numberOfPayments"), fallback: computed("terms: the count the payment and the rate imply"), blank: NEVER },
        { id: "paymentAmount", label: "Amount Of Payments", source: answer("financing.paymentAmount"), fallback: computed("terms: the payment the rate and the count imply"), blank: NEVER },
        { id: "lastPaymentAmount", label: "Final Payment", source: computed("terms.lastPayment"), blank: when("the last payment differs") },
        { id: "paymentFrequency", label: "When Payments Are Due: How Often", source: answer("financing.paymentFrequency"), blank: NEVER },
        { id: "termsBy", label: "(what was agreed)", source: answer("financing.termsBy"), blank: NEVER, printed: false, decides: "which of the rate, the count and the payment the solver works out" },
        { id: "firstPaymentDate", label: "When Payments Are Due: Beginning", source: answer("financing.firstPaymentDate"), blank: NEVER },
      ],
    },
    {
      page: 2,
      title: "Itemization Of Amount Financed",
      fields: [
        { id: "cashPrice", label: "1. Cash Price Of Vehicle", source: computed("money.salePrice"), blank: NEVER },
        { id: "tax", label: "a. Sales Tax", source: computed("money.tax"), blank: NEVER },
        { id: "titleFee", label: "b. Title Fee", source: fees("titleFee"), blank: NEVER },
        { id: "registrationFee", label: "c. Registration Fee", source: fees("registrationFee"), blank: NEVER },
        { id: "inspectionFee", label: "d. Inspection Program Replacement Fee", source: fees("inspectionFee"), blank: when("recorded from webDEALER") },
        { id: "plateFee", label: "e. License Plate Fee", source: fees("plateFee"), blank: when("recorded from webDEALER") },
        { id: "cashPriceSubtotal", label: "2. Cash Price (Including Tax And Government Fees)", source: computed("price + tax + government fees; the total cash price on a copy filed before the notice"), blank: NEVER },
        { id: "docFee", label: "3. Documentary Fee", source: fees("docFee"), blank: marker("docFee") },
        { id: "docFeeNotice", label: "Documentary Fee Notice", source: statik("Fin. Code §348.006(c)(3)"), blank: NEVER },
        { id: "docFeeNoticeSpanish", label: "Documentary Fee Notice (Spanish)", source: answer("guide:language.language"), blank: when("the sale is in Spanish") },
        { id: "tradeInAllowance", label: "a. Trade-In Allowance", source: answer("billOfSale.tradeInAllowance"), blank: when("tradeIn=yes", tradeIn) },
        { id: "downPayment", label: "b. Cash Down Payment", source: answer("financing.downPayment"), blank: NEVER },
        { id: "dueAtSigning", label: "Total Due At Signing", source: computed("downPayment"), blank: when("money is put down") },
        // Carried so the contract can follow the bill of sale's warranty
        // answer once counsel words it (D-05); not printed differently yet.
        { id: "conditionType", label: "(the bill of sale's as-is or warranty answer)", source: answer("billOfSale.conditionType"), blank: NEVER, printed: false },
        { id: "warrantyDuration", label: "(the bill of sale's warranty period)", source: answer("billOfSale.warrantyDuration"), blank: when("a warranty"), printed: false },
        { id: "pageLayout", label: "(filed under the page-by-page paperwork)", source: statik("PAGE_LAYOUT"), blank: NEVER, printed: false },
        { id: "docFeeUnset", label: "(the owner has not set the doc fee)", source: dealer("docFee"), blank: when("a demo filing with the fee unset"), printed: false },
      ],
    },
    {
      page: 5,
      title: "Signatures",
      fields: [
        { id: "buyerSignature", label: "Buyer Signature", source: signature("buyer"), blank: INK },
        { id: "buyerSignatureDate", label: "Date (Buyer)", source: date("signedOn"), blank: INK },
        { id: "dealerSignature", label: "Dealer Representative Signature", source: signature("dealer"), blank: INK },
        { id: "dealerSignatureDate", label: "Date (Dealer)", source: date("signedOn"), blank: INK },
        { id: "dealerSignerName", label: "Dealer Representative Printed Name", source: dealer("signerName"), blank: marker("signerName") },
      ],
    },
  ],
};
