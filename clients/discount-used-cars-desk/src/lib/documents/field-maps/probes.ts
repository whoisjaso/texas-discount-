import type { SaleDetail } from "@/lib/admin/sale-desk";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { buildAgreementData } from "@/lib/fill-130u/from-agreement";
import { DEALER, FIELD_MAPPINGS, SELLER_NAME_FIELD_ID } from "@/lib/fill-130u/field-mapping";
import { poaFieldsFromSale, poaProbe } from "@/lib/documents/poa-fields";
import { buyersGuideInputFor, buyersGuideProbe } from "@/lib/documents/buyers-guide-input";

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
    { saleDate: options.saleDate ?? null },
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
      applicant_printed_name: form130UValue(data, "Applicant Owner"),
      trade_in_amount_38b: data.trade_in_amount ?? "",
      dealer_signer_name: form130UValue(data, SELLER_NAME_FIELD_ID),
      seller_signature: decoded.ds ?? "",
      applicant_signature: decoded.bs ?? "",
    };
  }

  return {
    ...decoded.dd,
    buyerSignature: decoded.bs ?? "",
    buyerSignatureDate: decoded.bsd ?? "",
    dealerSignature: decoded.ds ?? "",
    dealerSignatureDate: decoded.dsd ?? "",
  };
}
