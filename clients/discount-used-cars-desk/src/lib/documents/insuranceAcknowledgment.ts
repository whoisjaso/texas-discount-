/**
 * Insurance Acknowledgment, when no proof was shown at the desk.
 *
 * The prescreen asks whether the buyer showed proof of insurance today. A No
 * puts this document in the packet, and until now that was the whole story:
 * the plan required a document type, and nothing anywhere could ask for it,
 * render it, or print it. A buyer who drove off without showing insurance
 * signed nothing about it, on the deal where a signature matters most.
 *
 * What it records, in the buyer's own signature:
 *   (1) no proof of financial responsibility was shown at the time of sale,
 *   (2) the buyer knows Texas requires it to drive on a public road,
 *   (3) the buyer will get it before driving and keep it in force,
 *   (4) the dealership is not the buyer's insurer, and
 *   (5) the State needs proof of it to register the vehicle, so the
 *       dealership cannot finish the registration until the buyer brings it.
 *
 * The fifth is the operational one. Texas asks for proof of financial
 * responsibility on a registration application (Transportation Code
 * §502.046), and since HB 718 the dealer is the one filing. A buyer who never
 * comes back with an insurance card is a registration the dealership cannot
 * complete inside its filing window, and this is the page that says so
 * before it happens.
 *
 * Persisted as a row in `document_agreements` with
 *   document_type = 'insuranceAcknowledgment', status = 'finalized'.
 *
 * Legal language lives here so counsel can revise it without touching a
 * React component. Both language versions are kept in sync.
 */

import { brand } from "@/lib/dealership-config";

export type AcknowledgmentLanguage = "en" | "es";

export interface InsuranceAcknowledgmentData {
  buyerName: string;
  buyerIdNumber: string;
  buyerPhone: string;
  buyerAddress: string;
  /** Human-readable, e.g. "2019 BMW 530i". */
  vehicleDescription: string;
  vin: string;
  /** ISO date YYYY-MM-DD. */
  saleDate: string;
}

export interface InsuranceAcknowledgmentCopy {
  heading: string;
  subtitle: string;
  buyerHeading: string;
  vehicleHeading: string;
  nameLabel: string;
  idLabel: string;
  phoneLabel: string;
  addressLabel: string;
  vehicleLabel: string;
  agreesHeading: string;
  intro: string;
  clauses: readonly string[];
  attestation: string;
  buyerSignatureLabel: string;
  dealerSignatureLabel: string;
  dateLabel: string;
}

// ============================================================
// LEGAL LANGUAGE. Review with your attorney before production use.
// Counsel may edit these constants directly. Keep both languages in sync.
// ============================================================

export const INSURANCE_COPY_EN: InsuranceAcknowledgmentCopy = {
  heading: "Insurance Acknowledgment",
  subtitle: "No Proof Of Insurance Shown At The Time Of Sale",
  buyerHeading: "Buyer",
  vehicleHeading: "Vehicle",
  nameLabel: "Name",
  idLabel: "ID number",
  phoneLabel: "Phone",
  addressLabel: "Address",
  vehicleLabel: "Vehicle",
  agreesHeading: "What The Buyer Acknowledges",
  intro:
    "By signing below, the undersigned buyer acknowledges and agrees to each of the following statements with respect to the above-described vehicle:",
  clauses: [
    "The buyer did not show proof of financial responsibility (liability insurance) covering this vehicle at the time of sale.",
    "The buyer understands that Texas law (Transportation Code, Chapter 601) requires a person to establish and maintain financial responsibility to operate a motor vehicle on a public road, and that operating this vehicle without it can result in a citation, a fine, and suspension of the buyer's driver's licence and vehicle registration.",
    "The buyer agrees to obtain liability insurance meeting the Texas minimum before operating this vehicle on a public road, and to keep it in force for as long as the buyer owns the vehicle.",
    `${brand.legal} is not the buyer's insurer. Any loss, damage, injury, or liability arising from the use of this vehicle after delivery is the buyer's responsibility.`,
    `The buyer understands that the State of Texas requires proof of financial responsibility to register this vehicle, that ${brand.legal} cannot complete the title and registration filing until the buyer provides it, and the buyer agrees to bring proof of insurance to ${brand.legal} promptly so the filing can be made on time.`,
  ],
  attestation:
    "The buyer has read and understands this acknowledgment and signs it voluntarily.",
  buyerSignatureLabel: "Buyer signature",
  dealerSignatureLabel: "Dealer representative",
  dateLabel: "Date",
};

export const INSURANCE_COPY_ES: InsuranceAcknowledgmentCopy = {
  heading: "Reconocimiento De Seguro",
  subtitle: "No Se Mostró Comprobante De Seguro Al Momento De La Venta",
  buyerHeading: "Comprador",
  vehicleHeading: "Vehículo",
  nameLabel: "Nombre",
  idLabel: "Número de identificación",
  phoneLabel: "Teléfono",
  addressLabel: "Dirección",
  vehicleLabel: "Vehículo",
  agreesHeading: "Lo Que El Comprador Reconoce",
  intro:
    "Al firmar a continuación, el comprador reconoce y acepta cada una de las siguientes declaraciones con respecto al vehículo descrito arriba:",
  clauses: [
    "El comprador no mostró comprobante de responsabilidad financiera (seguro de responsabilidad civil) que cubra este vehículo al momento de la venta.",
    "El comprador entiende que la ley de Texas (Código de Transporte, Capítulo 601) exige establecer y mantener responsabilidad financiera para conducir un vehículo en la vía pública, y que conducir este vehículo sin ella puede resultar en una infracción, una multa y la suspensión de la licencia de conducir y del registro del vehículo.",
    "El comprador se compromete a obtener un seguro de responsabilidad civil que cumpla con el mínimo exigido en Texas antes de conducir este vehículo en la vía pública, y a mantenerlo vigente mientras sea dueño del vehículo.",
    `${brand.legal} no es la aseguradora del comprador. Toda pérdida, daño, lesión o responsabilidad que surja del uso de este vehículo después de la entrega es responsabilidad del comprador.`,
    `El comprador entiende que el Estado de Texas exige comprobante de responsabilidad financiera para registrar este vehículo, que ${brand.legal} no puede completar el trámite de título y registro hasta que el comprador lo presente, y se compromete a llevar el comprobante de seguro a ${brand.legal} lo antes posible para que el trámite se presente a tiempo.`,
  ],
  attestation:
    "El comprador ha leído y entiende este reconocimiento y lo firma voluntariamente.",
  buyerSignatureLabel: "Firma del comprador",
  dealerSignatureLabel: "Representante del concesionario",
  dateLabel: "Fecha",
};

export function getInsuranceCopy(language: AcknowledgmentLanguage): InsuranceAcknowledgmentCopy {
  return language === "es" ? INSURANCE_COPY_ES : INSURANCE_COPY_EN;
}
