import type { SaleDetail } from "@/lib/admin/sale-desk";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { DEALER, FIELD_MAPPINGS, SELLER_NAME_FIELD_ID } from "@/lib/fill-130u/field-mapping";
import { poaFieldsFromSale, poaProbe } from "@/lib/documents/poa-fields";
import { buyersGuideInputFor, buyersGuideProbe } from "@/lib/documents/buyers-guide-input";
import { billOfSaleTotalPaid, calculateBillOfSale, type BillOfSaleData } from "@/lib/documents/billOfSale";
import { contractFigures, type ContractData } from "@/lib/documents/finance";
import { notSet } from "@/lib/dealership-config";
import { printsDocFeeNotice } from "@/lib/legal/doc-fee-notice";

/**
 * What a document would print, box by box, keyed by its field map's ids.
 *
 * The probe runs the same code the print path runs: the corridor's payload
 * builder and its decoder for the designed sheets and the rebuilt page, the
 * 130-U's own `buildAgreementData` for the state form, and the VTR-271 and
 * Buyers Guide builders their routes call. So the review's read-back, the
 * filing's blank-box refusal and the tests all read what the paper reads.
 *
 * Pure: no database, no PDF. Null for a document with no probe.
 */

export type ProbeOptions = {
  /** The current filed bill of sale's date of sale, when known. */
  saleDate?: string | null;
  /** The buyer's pad stroke and its date, when the review has one. */
  buyerSignature?: string | null;
  buyerSignatureDate?: string | null;
  dealerSignature?: string | null;
  dealerSignatureDate?: string | null;
  dealerSignerName?: string | null;
  /** False when the owner has not set the doc fee: the paper prints its marker. */
  docFeeSet?: boolean;
};

const DESIGNED = new Set([
  "billOfSale",
  "financing",
  "vehicleResponsibility",
  "insuranceAcknowledgment",
  "rebuiltDisclosure",
  "salvageBillOfSale",
  "towAwayAcknowledgment",
  "buyerResponsibilityStatement",
]);

/** The 130-U's printed value for one AcroForm field, as the filler would write it. */
function form130UValue(data: ReturnType<typeof buildAgreementData>, fieldId: string): unknown {
  const mapping = FIELD_MAPPINGS.find((entry) => entry.fieldId === fieldId);
  return mapping ? mapping.getValue(data) : undefined;
}

export function probe(
  documentType: string,
  sale: SaleDetail,
  formData: Record<string, unknown>,
  options: ProbeOptions = {},
): Record<string, unknown> | null {
  if (documentType === "powerOfAttorney") return poaProbe(poaFieldsFromSale(sale));
  if (documentType === "buyersGuide") {
    const vehicle = sale.vehicle;
    return buyersGuideProbe(
      buyersGuideInputFor(
        { year: vehicle?.year ?? null, make: vehicle?.make ?? null, model: vehicle?.model ?? null, vin: vehicle?.vin ?? null },
        sale,
        sale.language === "es" ? "es" : "en",
      ),
    );
  }
  if (!DESIGNED.has(documentType) && documentType !== "form130U") return null;

  const link = corridorCompletedLink(
    sale,
    documentType,
    formData,
    "https://probe.local",
    {
      buyerSignature: options.buyerSignature ?? null,
      buyerSignatureDate: options.buyerSignatureDate ?? null,
      dealerSignature: options.dealerSignature ?? null,
      dealerSignatureDate: options.dealerSignatureDate ?? null,
      dealerSignerName: options.dealerSignerName ?? null,
    },
    { saleDate: options.saleDate ?? null, docFeeSet: options.docFeeSet },
  );
  const decoded = link ? decodeCompletedLinkFromUrl(link) : null;
  if (!decoded) return null;

  if (documentType === "form130U") {
    const data = buildAgreementData(decoded, {}, null);
    return {
      ...data,
      dealer_gdn: DEALER.gdn,
      previous_owner_name: form130UValue(data, "20 Previous Owner Name or Entity Name City State"),
      e_reminder: form130UValue(data, "Yes Provide Email in 26") === true ? "yes" : "",
      // The printed-name line holds the person's name or, for an entity, its name: one AcroForm field, two rows.
      applicant_printed_name: data.applicant_type === "individual" ? form130UValue(data, "Applicant Owner") : "",
      applicant_printed_entity: data.applicant_type === "individual" ? "" : form130UValue(data, "Applicant Owner"),
      // Box 14 holds the FEIN for an entity and the photo ID number for a
      // person: one AcroForm field, two boxes on the map.
      buyer_dl_number: data.applicant_type === "individual" ? data.buyer_dl_number ?? "" : "",
      buyer_fein: data.applicant_type === "individual" ? "" : data.buyer_dl_number ?? "",
      trade_in_amount_38b: data.trade_in_amount ?? "",
      dealer_signer_name: form130UValue(data, SELLER_NAME_FIELD_ID),
      seller_signature: decoded.ds ?? "",
      applicant_signature: decoded.bs ?? "",
    };
  }

  const dd = decoded.dd as Record<string, unknown>;
  return {
    ...dd,
    ...workedOut(documentType, dd),
    // The fee the owner has not set prints its marker, never $0.00.
    ...(dd.docFeeUnset === true ? { docFee: notSet("doc fee") } : {}),
    buyerSignature: decoded.bs ?? "",
    buyerSignatureDate: decoded.bsd ?? "",
    dealerSignature: decoded.ds ?? "",
    dealerSignatureDate: decoded.dsd ?? "",
  };
}

/**
 * The figures a sheet works out from its payload and prints (the bill's
 * totals, the contract's Truth in Lending box), through the same functions
 * the sheet calls, so the read-back states them and a map can name them.
 */
function workedOut(documentType: string, dd: Record<string, unknown>): Record<string, unknown> {
  if (documentType === "billOfSale") {
    const data = dd as unknown as BillOfSaleData;
    const calc = calculateBillOfSale(data);
    const paid = billOfSaleTotalPaid(data);
    return {
      netTradeIn: calc.netTradeIn,
      balanceAfterTrade: calc.balanceAfterTrade,
      feesAndTax: calc.feesSubtotal,
      totalAmountDue: calc.totalDue,
      totalPaid: paid.totalPaid,
      ...(paid.financedByLender > 0 ? { financedByLender: paid.financedByLender } : {}),
    };
  }
  if (documentType === "financing") {
    const figures = contractFigures(dd as unknown as ContractData);
    return {
      // The itemization prints the doc fee on its own line beside its notice,
      // so its subtotal is the cash price before the fee; a copy filed before
      // the notice printed the whole total cash price there.
      cashPriceSubtotal: printsDocFeeNotice(dd) ? figures.totalCashPrice - Number(dd.docFee ?? 0) : figures.totalCashPrice,
      amountFinanced: figures.amountFinanced,
      totalOfPayments: figures.totalOfPayments,
      financeCharge: figures.financeCharge,
    };
  }
  return {};
}
