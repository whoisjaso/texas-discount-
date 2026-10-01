/**
 * Vehicle Responsibility Acknowledgment — types, constants, and body copy.
 *
 * Signed by the buyer when they elect to handle their own title and
 * registration rather than have Triple J file it. It records that:
 *   (1) the buyer takes responsibility for titling and registering the
 *       vehicle in their own name within the statutory window,
 *   (2) the buyer received the documents needed to do so,
 *   (3) if the buyer later asks Triple J to complete the filing, the cost is
 *       the quoted registration amount plus a late-handling fee, because the
 *       dealership absorbs a WebDealer penalty on a late transfer.
 *
 * Persisted as a row in `document_agreements` with:
 *   document_type = 'vehicleResponsibility'
 *   status        = 'finalized'
 *   form_data     = full form data incl. signature data URL
 *   deal_id       = source paperwork deal (nullable)
 *   language      = 'en' | 'es'
 *
 * Follows the same conventions as `chargebackAcknowledgment`:
 *   - Legal language lives in the constants below so counsel can revise it
 *     without touching a React component. Do not inline this text into JSX.
 *   - Both language versions are kept in sync.
 *   - The dealer line on the printout is signed with a pen, not a canvas.
 */

import { brand, dealership, factOr } from "@/lib/dealership-config";

import { withSpanishReviewCaveat } from "@/lib/documents/translation-status";

// ============================================================
// Types
// ============================================================

export type VehicleResponsibilityLanguage = "en" | "es";

export interface VehicleResponsibilityFormData {
  /** UUID of source paperwork deal; null if ad-hoc / no active deal. */
  dealId: string | null;
  buyerName: string;
  buyerIdNumber: string;
  buyerPhone: string;
  buyerAddress: string;
  /** 17-char VIN. */
  vin: string;
  /** Human-readable, e.g. "2019 Toyota Camry". */
  vehicleDescription: string;
  /** ISO date YYYY-MM-DD. */
  saleDate: string;
  /**
   * Registration amount quoted to the buyer at the time of sale, in USD.
   * This is the figure the buyer would owe if they later hand the filing
   * back to the dealership — it is quoted, never invented at signing time.
   */
  quotedRegistrationAmount: number;
  /** data:image/png;base64,... from signature_pad. */
  buyerSignatureDataUrl: string;
  language: VehicleResponsibilityLanguage;
}

// ============================================================
// Dealer metadata — printed on every acknowledgment
// ============================================================

export const DEALER_METADATA = {
  legalName: factOr(dealership.legalName, "dealer legal name"),
  addressLine: dealership.address.street,
  city: dealership.address.locality,
  state: dealership.address.region,
  zip: dealership.address.postalCode,
  license: factOr(dealership.license, "dealer licence (GDN)"),
  phone: dealership.phone.display,
} as const;

/**
 * Fee charged on top of the quoted registration amount when the buyer returns
 * the filing to the dealership after taking responsibility for it. Covers the
 * WebDealer late-transfer penalty the dealership then absorbs.
 *
 * Single source of truth: the form, the printed document, and both language
 * versions all read this value.
 */
export const LATE_HANDLING_FEE_USD = 100;

/**
 * Texas requires the buyer to apply for title transfer within 30 calendar days
 * of the date of sale. Stated as a constant so it tracks statute rather than
 * being retyped into copy.
 */
export const TRANSFER_WINDOW_DAYS = 30;

// ============================================================
// Validation
// ============================================================

export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export type ValidationResult =
  | { ok: true }
  | { ok: false; field: keyof VehicleResponsibilityFormData; message: string };

export function validateVehicleResponsibility(
  data: VehicleResponsibilityFormData,
): ValidationResult {
  if (!data.buyerName.trim()) {
    return { ok: false, field: "buyerName", message: "Buyer name is required." };
  }
  if (!data.buyerIdNumber.trim()) {
    return {
      ok: false,
      field: "buyerIdNumber",
      message: "Buyer ID number is required.",
    };
  }
  if (!VIN_REGEX.test(data.vin.trim())) {
    return { ok: false, field: "vin", message: "Enter a valid 17-character VIN." };
  }
  if (!ISO_DATE_REGEX.test(data.saleDate)) {
    return { ok: false, field: "saleDate", message: "Enter the date of sale." };
  }
  if (
    !Number.isFinite(data.quotedRegistrationAmount) ||
    data.quotedRegistrationAmount < 0
  ) {
    return {
      ok: false,
      field: "quotedRegistrationAmount",
      message:
        "Enter the registration amount quoted to the buyer. Leave it at 0 only if no amount was quoted.",
    };
  }
  if (!data.buyerSignatureDataUrl) {
    return {
      ok: false,
      field: "buyerSignatureDataUrl",
      message: "The buyer must sign before this can be finalized.",
    };
  }
  return { ok: true };
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

// ============================================================
// ⚠ LEGAL LANGUAGE — Review with your attorney before production use.
// These constants state what the buyer is agreeing to, including a fee.
// Counsel may edit them directly without touching any React component.
// Keep both language versions in sync.
// ============================================================

export interface LegalBodyCopy {
  heading: string;
  intro: string;
  clauses: readonly string[];
  /** Rendered with the quoted amount and fee substituted in. */
  returnClauseTemplate: string;
  /**
   * The three lines of the reckoning block.
   *
   * The same figures the return clause states in prose. The clause is the
   * agreement and stays; these are so the number can be READ. On the bill of
   * sale the amount a buyer owes is set large and reckoned line by line, and
   * this is the one figure on this sheet that costs them anything later.
   */
  quotedLabel: string;
  feeLabel: string;
  owedTotalLabel: string;
  attestation: string;
  buyerSignatureLabel: string;
  buyerPrintedNameLabel: string;
  dealerSignatureLabel: string;
  dateLabel: string;
}

export const LEGAL_BODY_EN: LegalBodyCopy = {
  heading: "Vehicle Responsibility Acknowledgment",
  intro:
    "By signing below, the undersigned buyer acknowledges and agrees to each of the following statements with respect to the above-described vehicle:",
  clauses: [
    `The buyer has elected to apply for title and registration of this vehicle in the buyer's own name, and accepts full responsibility for doing so.`,
    `The buyer understands that Texas law requires the application for title transfer to be filed within ${TRANSFER_WINDOW_DAYS} calendar days of the date of sale shown above, and that penalties assessed for a late filing are the buyer's responsibility.`,
    `The buyer confirms receipt of the documents required to complete the title transfer and registration.`,
    `${brand.legal} is not responsible for any penalty, fine, citation, or towing, storage, or impound cost arising from the buyer's failure to title or register the vehicle.`,
  ],
  returnClauseTemplate:
    `If the buyer later asks ${brand.legal} to complete the title transfer and registration on the buyer's behalf, the buyer agrees to pay the quoted registration amount of {quoted}, plus a late-handling fee of {fee}, for a total of {total}. The late-handling fee covers the late-transfer penalty the dealership incurs as a result of the delayed filing.`,
  quotedLabel: "Quoted registration",
  feeLabel: "Late-handling fee",
  owedTotalLabel: "Total if it comes back to us",
  attestation:
    "The buyer has read and understands this acknowledgment and signs it voluntarily.",
  buyerSignatureLabel: "Buyer signature",
  buyerPrintedNameLabel: "Buyer printed name",
  dealerSignatureLabel: "Dealer representative",
  dateLabel: "Date",
};

export const LEGAL_BODY_ES: LegalBodyCopy = {
  heading: "Reconocimiento De Responsabilidad Del Vehículo",
  intro:
    "Al firmar a continuación, el comprador reconoce y acepta cada una de las siguientes declaraciones con respecto al vehículo descrito anteriormente:",
  clauses: [
    "El comprador ha decidido solicitar el título y el registro de este vehículo a su propio nombre, y acepta la responsabilidad total de hacerlo.",
    `El comprador entiende que la ley de Texas exige presentar la solicitud de transferencia de título dentro de los ${TRANSFER_WINDOW_DAYS} días calendario a partir de la fecha de venta indicada arriba, y que las multas por presentación tardía son responsabilidad del comprador.`,
    "El comprador confirma haber recibido los documentos necesarios para completar la transferencia de título y el registro.",
    `${brand.legal} no es responsable de ninguna multa, sanción, infracción, ni de costos de grúa, almacenamiento o corralón que resulten de que el comprador no titule ni registre el vehículo.`,
  ],
  returnClauseTemplate:
    `Si posteriormente el comprador solicita que ${brand.legal} complete la transferencia de título y el registro en su nombre, el comprador acepta pagar el monto de registro cotizado de {quoted}, más un cargo por gestión tardía de {fee}, para un total de {total}. El cargo por gestión tardía cubre la penalización por transferencia tardía que el concesionario asume como resultado de la presentación demorada.`,
  quotedLabel: "Registro cotizado",
  feeLabel: "Cargo por gestión tardía",
  owedTotalLabel: "Total si nos lo devuelve",
  attestation:
    "El comprador ha leído y entiende este reconocimiento y lo firma voluntariamente.",
  buyerSignatureLabel: "Firma del comprador",
  buyerPrintedNameLabel: "Nombre en letra de molde",
  dealerSignatureLabel: "Representante del concesionario",
  dateLabel: "Fecha",
};

export function getLegalBody(
  language: VehicleResponsibilityLanguage,
): LegalBodyCopy {
  return language === "es" ? LEGAL_BODY_ES : LEGAL_BODY_EN;
}

/**
 * Fill the return clause with real figures.
 *
 * The quoted amount comes from the deal, never from a default, so the buyer is
 * agreeing to a number that was actually discussed with them.
 */
export function buildReturnClause(
  language: VehicleResponsibilityLanguage,
  quotedRegistrationAmount: number,
  lateFee: number = LATE_HANDLING_FEE_USD,
): string {
  const body = getLegalBody(language);
  return body.returnClauseTemplate
    .replace("{quoted}", formatUsd(quotedRegistrationAmount))
    .replace("{fee}", formatUsd(lateFee))
    .replace("{total}", formatUsd(quotedRegistrationAmount + lateFee));
}

export const ADMIN_WARNING_BANNER_EN =
  "Confirm the registration amount you quoted this buyer before finalizing. It is the figure they are agreeing to pay if the filing comes back to us.";

export const ADMIN_WARNING_BANNER_ES =
  "Confirme el monto de registro que cotizó a este comprador antes de finalizar. Es la cifra que aceptará pagar si la gestión regresa a nosotros.";

export function getAdminWarningBanner(
  language: VehicleResponsibilityLanguage,
): string {
  const banner =
    language === "es" ? ADMIN_WARNING_BANNER_ES : ADMIN_WARNING_BANNER_EN;
  // The Spanish clauses below are an unreviewed translation. Say so here,
  // where the operator is about to hand the buyer a pen.
  return withSpanishReviewCaveat(banner, language);
}

// ============================================================
// The form's shape, in one place
// ============================================================

/**
 * The fields this acknowledgment collects.
 *
 * These lived inside the standalone admin page, which meant the sale
 * corridor had no way to render the same document: it could ask the
 * questions and then produce nothing, because the only description of the
 * form was in a page component nothing else could import. Both callers read
 * this now, so the corridor and the standalone page cannot drift into
 * describing two different documents.
 *
 * Typed structurally rather than against DocSection to keep this module free
 * of a React import; AcknowledgmentDocument accepts it as-is.
 */
export const VEHICLE_RESPONSIBILITY_SECTIONS = [
  {
    heading: "Buyer",
    fields: [
      { name: "buyerName", label: "Buyer name", required: true },
      { name: "buyerIdNumber", label: "ID number", required: true },
      { name: "buyerPhone", label: "Phone", type: "tel" as const },
      { name: "buyerAddress", label: "Address", wide: true },
    ],
  },
  {
    heading: "Vehicle",
    fields: [
      { name: "vehicleDescription", label: "Vehicle", wide: true },
      { name: "vin", label: "VIN", required: true },
      { name: "saleDate", label: "Date of sale", type: "date" as const, required: true },
      {
        name: "quotedRegistrationAmount",
        label: "Registration amount quoted",
        type: "number" as const,
        required: true,
        help: `The buyer agrees to this figure plus a $${LATE_HANDLING_FEE_USD} late-handling fee if the filing later comes back to us. Enter what you actually quoted.`,
      },
    ],
  },
];
