/**
 * Rebuilt Salvage Title Disclosure.
 *
 * Texas puts the rebuilt-vehicle disclosure at the OFFER, not the closing
 * table: the notice goes on the car while it is displayed for sale, and the
 * purchaser signs a separate written acknowledgment before any instrument
 * that consummates the sale (43 Texas Administrative Code §215.160;
 * Transportation Code, Chapter 501, Subchapter E). That is why the sale reads
 * the title status off the vehicle rather than asking, why this document is
 * the FIRST one the corridor walks on such a car, and why it exists at all:
 * the plan has required it since the title gate was built, and until now
 * nothing could render it. A rebuilt car sold with no written disclosure is
 * the dealer's problem, not the buyer's, and it is the kind of problem that
 * arrives as a complaint to the DMV.
 *
 * Persisted as a row in `document_agreements` with
 *   document_type = 'rebuiltDisclosure', status = 'finalized'.
 *
 * Legal language lives here so counsel can revise it without touching a
 * React component. Both language versions are kept in sync. "Rebuilt
 * Salvage" is the brand the State prints on the title, so it is kept in
 * English in both versions, the way the title itself will read.
 */

import { brand } from "@/lib/dealership-config";

export type DisclosureLanguage = "en" | "es";

export interface RebuiltDisclosureData {
  buyerName: string;
  buyerIdNumber: string;
  buyerPhone: string;
  buyerAddress: string;
  /** Human-readable, e.g. "2019 BMW 530i". */
  vehicleDescription: string;
  /**
   * The parts as well as the line. The state's own written disclosure form
   * (ENF-MV-RBLT DSCLMR) has a rule for the year and a rule for the make,
   * and this sheet prints them the same way so it answers for that form.
   * Older rows carry only the description; the sheet splits it when it can.
   */
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vin: string;
  /** ISO date YYYY-MM-DD. */
  saleDate: string;
}

/**
 * Year, make and model from wherever the row keeps them.
 *
 * A row filed after the parts existed carries them; an older one carries
 * "2011 Ford Explorer" and nothing else, whose first word is the year and
 * second the make. Both print, so a rebuilt sale from last month still
 * answers for the state's form.
 */
export function vehicleParts(data: RebuiltDisclosureData): { year: string; make: string; model: string } {
  const words = data.vehicleDescription.trim().split(/\s+/).filter(Boolean);
  const yearFromLine = /^\d{4}$/.test(words[0] ?? "") ? words[0] : "";
  const rest = yearFromLine ? words.slice(1) : words;
  return {
    year: data.vehicleYear?.trim() || yearFromLine,
    make: data.vehicleMake?.trim() || rest[0] || "",
    model: data.vehicleModel?.trim() || rest.slice(1).join(" "),
  };
}

export interface RebuiltDisclosureCopy {
  heading: string;
  subtitle: string;
  buyerHeading: string;
  vehicleHeading: string;
  nameLabel: string;
  idLabel: string;
  phoneLabel: string;
  addressLabel: string;
  vehicleLabel: string;
  yearLabel: string;
  makeLabel: string;
  modelLabel: string;
  titleBrandLabel: string;
  titleBrand: string;
  disclosureHeading: string;
  intro: string;
  clauses: readonly string[];
  /** The one sentence that must be read, set apart on the page. */
  important: string;
  /**
   * The state's written disclosure, in the purchaser's own voice.
   *
   * The sentence on TxDMV Form ENF-MV-RBLT DSCLMR, with `{name}` where the
   * printed name of the purchaser goes. Our sheet prints it so the packet
   * answers for that form without stapling the state's PDF behind it.
   */
  writtenHeading: string;
  written: string;
  /** Where the wording comes from, in small type under it. */
  writtenSource: string;
  /**
   * The English original, printed under a translation, because the state's
   * sentence is English and the sheet has to say it in the state's words
   * as well as the buyer's.
   */
  writtenOriginal?: string;
  attestation: string;
  buyerSignatureLabel: string;
  dealerSignatureLabel: string;
  dateLabel: string;
}

// ============================================================
// LEGAL LANGUAGE. Review with your attorney before production use.
// Counsel may edit these constants directly. Keep both languages in sync.
// ============================================================

export const REBUILT_COPY_EN: RebuiltDisclosureCopy = {
  heading: "Rebuilt Salvage Title Disclosure",
  subtitle: "Given In Writing Before Any Document Of Sale Is Signed",
  buyerHeading: "Buyer",
  vehicleHeading: "Vehicle",
  nameLabel: "Name",
  idLabel: "ID number",
  phoneLabel: "Phone",
  addressLabel: "Address",
  vehicleLabel: "Vehicle",
  yearLabel: "Year",
  makeLabel: "Make",
  modelLabel: "Model",
  titleBrandLabel: "Title brand",
  titleBrand: "Rebuilt Salvage",
  writtenHeading: "Written Disclosure",
  written:
    "I, {name}, acknowledge that at the time of purchase, I am aware that this vehicle has been repaired, rebuilt, or reconstructed and was formerly titled as a salvage motor vehicle.",
  writtenSource:
    "The wording of the Texas Department of Motor Vehicles' Rebuilt Motor Vehicle Written Disclosure, Form ENF-MV-RBLT DSCLMR (Rev. 02/17).",
  disclosureHeading: "What This Disclosure Says",
  intro:
    "The dealer discloses, and by signing below the undersigned buyer acknowledges, each of the following statements with respect to the above-described vehicle:",
  clauses: [
    "The State of Texas has issued this vehicle a title branded REBUILT SALVAGE. Before it was rebuilt, an insurer or owner declared it a salvage vehicle: it was damaged to the point that the cost of repair exceeded the threshold set by Texas law.",
    "This disclosure is given to the buyer in writing before any document of sale is signed, as Texas law requires of a dealer offering a rebuilt salvage vehicle for sale.",
    "The buyer has had the opportunity to inspect the vehicle, to have it inspected by a mechanic of the buyer's choosing, and to ask about the damage it sustained and the repairs that were made.",
    "The buyer understands that the rebuilt salvage brand stays on the title permanently, that it may affect the vehicle's value, insurability, and resale, and that some lenders and insurers treat a rebuilt salvage vehicle differently from one with a clean title.",
    `${brand.legal} makes no representation about the quality of the repairs beyond what is stated in writing on the Buyer's Guide and the bill of sale.`,
  ],
  important:
    "This vehicle has a Rebuilt Salvage title. The buyer is told this now, in writing, before signing anything else.",
  attestation:
    "The buyer acknowledges receiving this disclosure before signing any document of sale, has read and understands it, and signs it voluntarily.",
  buyerSignatureLabel: "Buyer signature",
  dealerSignatureLabel: "Dealer representative",
  dateLabel: "Date",
};

export const REBUILT_COPY_ES: RebuiltDisclosureCopy = {
  heading: "Divulgación De Título Rebuilt Salvage",
  subtitle: "Entregada Por Escrito Antes De Firmar Cualquier Documento De Venta",
  buyerHeading: "Comprador",
  vehicleHeading: "Vehículo",
  nameLabel: "Nombre",
  idLabel: "Número de identificación",
  phoneLabel: "Teléfono",
  addressLabel: "Dirección",
  vehicleLabel: "Vehículo",
  yearLabel: "Año",
  makeLabel: "Marca",
  modelLabel: "Modelo",
  titleBrandLabel: "Marca del título",
  titleBrand: "Rebuilt Salvage (reconstruido de salvamento)",
  writtenHeading: "Divulgación Escrita",
  written:
    "Yo, {name}, reconozco que al momento de la compra estoy consciente de que este vehículo ha sido reparado, reconstruido o reensamblado y que anteriormente tenía título de vehículo de salvamento.",
  writtenSource:
    "Texto de la Divulgación Escrita de Vehículo Reconstruido del Departamento de Vehículos Motorizados de Texas, formulario ENF-MV-RBLT DSCLMR (rev. 02/17). El original en inglés:",
  writtenOriginal:
    "I, {name}, acknowledge that at the time of purchase, I am aware that this vehicle has been repaired, rebuilt, or reconstructed and was formerly titled as a salvage motor vehicle.",
  disclosureHeading: "Lo Que Dice Esta Divulgación",
  intro:
    "El concesionario divulga, y al firmar a continuación el comprador reconoce, cada una de las siguientes declaraciones con respecto al vehículo descrito arriba:",
  clauses: [
    "El Estado de Texas emitió para este vehículo un título con la marca REBUILT SALVAGE. Antes de ser reconstruido, una aseguradora o un dueño lo declaró vehículo de salvamento: sufrió daños a tal grado que el costo de la reparación superó el límite fijado por la ley de Texas.",
    "Esta divulgación se entrega al comprador por escrito antes de firmar cualquier documento de venta, como lo exige la ley de Texas a un concesionario que ofrece a la venta un vehículo reconstruido de salvamento.",
    "El comprador ha tenido la oportunidad de inspeccionar el vehículo, de hacerlo inspeccionar por un mecánico de su elección, y de preguntar sobre los daños que sufrió y las reparaciones realizadas.",
    "El comprador entiende que la marca Rebuilt Salvage permanece en el título de forma permanente, que puede afectar el valor, la asegurabilidad y la reventa del vehículo, y que algunos prestamistas y aseguradoras tratan un vehículo reconstruido de salvamento de manera distinta a uno con título limpio.",
    `${brand.legal} no hace ninguna declaración sobre la calidad de las reparaciones más allá de lo que consta por escrito en la Guía del Comprador y en la factura de venta.`,
  ],
  important:
    "Este vehículo tiene un título Rebuilt Salvage. Se le informa al comprador ahora, por escrito, antes de firmar cualquier otra cosa.",
  attestation:
    "El comprador reconoce haber recibido esta divulgación antes de firmar cualquier documento de venta, la ha leído y la entiende, y la firma voluntariamente.",
  buyerSignatureLabel: "Firma del comprador",
  dealerSignatureLabel: "Representante del concesionario",
  dateLabel: "Fecha",
};

export function getRebuiltCopy(language: DisclosureLanguage): RebuiltDisclosureCopy {
  return language === "es" ? REBUILT_COPY_ES : REBUILT_COPY_EN;
}
