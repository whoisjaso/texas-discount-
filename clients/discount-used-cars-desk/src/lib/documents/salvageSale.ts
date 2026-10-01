/**
 * The tow-away packet: a salvage vehicle sold as salvage.
 *
 * Three sheets, on the house paper, for the one path where the dealership
 * files nothing with the state. A car on a salvage title cannot be
 * registered or driven on a public road until it is rebuilt, inspected and
 * retitled (Transportation Code ch. 501, subch. E). When the sale's answer
 * to "what happens with the salvage title" is that the buyer takes it as
 * salvage, the packet has to say, in writing and in the buyer's signature,
 * the three things a phone call is tempted to leave out:
 *
 *   salvageBillOfSale             what they bought: a salvage vehicle, as
 *                                 is, with the odometer disclosed, for the
 *                                 price, and no representation that it can
 *                                 be titled or registered for the road.
 *   towAwayAcknowledgment         how it leaves: on a tow, a trailer or a
 *                                 flatbed. No plates, no temporary tag, no
 *                                 registration, and none was promised.
 *   buyerResponsibilityStatement  what is theirs from here: the salvage
 *                                 title in their own name, the rebuild, the
 *                                 VTR-61, the inspection and the 130-U, at
 *                                 their own cost and on their own account.
 *
 * Persisted as rows in `document_agreements` with those document types,
 * status = 'finalized', filed from the corridor like every other sheet.
 *
 * Legal language lives here so counsel can revise it without touching a
 * React component. Both languages are kept in sync; "Salvage" and the form
 * numbers stay in English in the Spanish copy, as the paper itself reads.
 */

import { brand } from "@/lib/dealership-config";

export type SalvageLanguage = "en" | "es";

export type HowLeaving = "towTruck" | "trailer" | "flatbed";

export interface SalvageSaleData {
  buyerName: string;
  buyerIdNumber: string;
  buyerPhone: string;
  buyerAddress: string;
  /** Human-readable, e.g. "2019 BMW 530i". */
  vehicleDescription: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vin: string;
  /** ISO date YYYY-MM-DD. */
  saleDate: string;
  vehicleMileage: string;
  odometerStatus: "actual" | "exceeds" | "not_actual" | "";
  salePrice: number;
  tax: number;
  titleFee: number;
  docFee: number;
  total: number;
  amountPaidToday: number;
  paymentMethod: string;
  howLeaving: HowLeaving | "";
  /** The dealership's salvage dealer licence, when it holds one. */
  salvageLicense: string;
  /** Two letters when the salvage title came from another state. */
  titleOriginState: string;
}

export interface SalvageSaleCopy {
  billHeading: string;
  billSubtitle: string;
  towHeading: string;
  towSubtitle: string;
  responsibilityHeading: string;
  responsibilitySubtitle: string;

  buyerHeading: string;
  vehicleHeading: string;
  moneyHeading: string;
  nameLabel: string;
  idLabel: string;
  phoneLabel: string;
  addressLabel: string;
  yearLabel: string;
  makeLabel: string;
  modelLabel: string;
  odometerLabel: string;
  odometerActual: string;
  odometerExceeds: string;
  odometerNotActual: string;
  titleBrandLabel: string;
  titleBrand: string;
  titleFromLabel: string;
  salvageLicenseLabel: string;
  salvageLicenseNone: string;
  priceLabel: string;
  taxLabel: string;
  titleFeeLabel: string;
  docFeeLabel: string;
  totalLabel: string;
  paidTodayLabel: string;
  paymentMethodLabel: string;
  howLeavingLabel: string;
  howLeaving: Record<HowLeaving, string>;
  dateLabel: string;

  /** The one sentence on each sheet that must be read, set apart in the lien red. */
  billImportant: string;
  towImportant: string;
  responsibilityImportant: string;

  billHeadingClauses: string;
  billClauses: readonly string[];
  towHeadingClauses: string;
  towClauses: readonly string[];
  responsibilityHeadingClauses: string;
  responsibilityClauses: readonly string[];

  attestation: string;
  buyerSignatureLabel: string;
  dealerSignatureLabel: string;
}

// ============================================================
// LEGAL LANGUAGE. Review with your attorney before production use.
// Counsel may edit these constants directly. Keep both languages in sync.
// ============================================================

export const SALVAGE_COPY_EN: SalvageSaleCopy = {
  billHeading: "Salvage Bill Of Sale",
  billSubtitle: "Sold As Salvage, As Is, Not For Use On A Public Road",
  towHeading: "Tow-Away Acknowledgment",
  towSubtitle: "No Plates, No Registration, No Temporary Tag",
  responsibilityHeading: "Buyer Responsibility Statement",
  responsibilitySubtitle: "The Salvage Title And Everything After It Are The Buyer's",

  buyerHeading: "Buyer",
  vehicleHeading: "Vehicle",
  moneyHeading: "The Money",
  nameLabel: "Name",
  idLabel: "ID number",
  phoneLabel: "Phone",
  addressLabel: "Address",
  yearLabel: "Year",
  makeLabel: "Make",
  modelLabel: "Model",
  odometerLabel: "Odometer",
  odometerActual: "Actual mileage",
  odometerExceeds: "Exceeds mechanical limits",
  odometerNotActual: "Not the actual mileage",
  titleBrandLabel: "Title brand",
  titleBrand: "Salvage",
  titleFromLabel: "Title issued by",
  salvageLicenseLabel: "Salvage dealer licence",
  salvageLicenseNone: "Not on file",
  priceLabel: "Price",
  taxLabel: "Sales tax",
  titleFeeLabel: "Title fee",
  docFeeLabel: "Documentary fee",
  totalLabel: "Total",
  paidTodayLabel: "Paid today",
  paymentMethodLabel: "Paid by",
  howLeavingLabel: "Leaving the lot",
  howLeaving: {
    towTruck: "On a tow truck",
    trailer: "On a trailer",
    flatbed: "On a flatbed",
  },
  dateLabel: "Date",

  billImportant:
    "This vehicle is sold on a SALVAGE title. It cannot be registered or driven on a public road until it is rebuilt, inspected and retitled by the State of Texas. No plates or registration come with this sale.",
  towImportant:
    "This vehicle leaves the lot on a tow, a trailer or a flatbed. It does not leave under its own power on a public road. No licence plate, temporary tag or registration is issued or promised with it.",
  responsibilityImportant:
    "From the moment of sale, the salvage title, the rebuild, the inspection and any application to the State of Texas are the buyer's, in the buyer's own name and at the buyer's own cost.",

  billHeadingClauses: "What This Bill Of Sale Says",
  billClauses: [
    "The vehicle described above is sold with a title branded SALVAGE by its issuing state. An insurer or an owner declared it a salvage vehicle: it was damaged to the point that the cost of repair exceeded the threshold set by law.",
    "The vehicle is sold AS IS, WHERE IS, with all faults, for its salvage value, without any warranty of merchantability, fitness for a particular purpose, or roadworthiness, express or implied.",
    `${brand.legal} makes no representation that this vehicle can be repaired, that it will pass a state inspection, or that the State of Texas or any other state will issue a rebuilt title, a registration or a licence plate for it.`,
    "The odometer reading above is disclosed as required by federal and Texas law, with the qualification shown. A salvage brand is not an odometer brand; the two are disclosed separately.",
    "The price, tax and fees above are the whole of what the buyer pays for this vehicle. The title fee covers the assignment of the salvage title only; no registration fee is charged because no registration is applied for.",
    "The buyer has had the opportunity to inspect the vehicle, to have it inspected by a mechanic of the buyer's choosing, and to ask about the damage it sustained.",
  ],

  towHeadingClauses: "What The Buyer Acknowledges",
  towClauses: [
    "The buyer acknowledges that this vehicle is a salvage vehicle under Texas law (Transportation Code, Chapter 501, Subchapter E) and may not be operated on a public road until it has been rebuilt, passed inspection, and been issued a rebuilt salvage title and a registration by the State of Texas.",
    `The buyer acknowledges that ${brand.legal} has not issued and will not issue a licence plate, a temporary tag, a buyer's tag, a registration, or a title application for this vehicle, and that nobody at ${brand.legal} promised any of these.`,
    "The buyer will remove the vehicle from the lot on a tow truck, a trailer or a flatbed, as recorded above, and will not drive it off the lot or onto a public road.",
    "The buyer understands that operating this vehicle on a public road before it is retitled and registered is unlawful, that any citation, fine, impound or liability that results is the buyer's alone, and that the buyer's insurance may not cover a salvage vehicle.",
    `${brand.legal} is released from any claim arising from the buyer's operation, transport or storage of this vehicle after it leaves the lot.`,
  ],

  responsibilityHeadingClauses: "What Is The Buyer's From Here",
  responsibilityClauses: [
    "The salvage title is assigned to the buyer at the sale. Applying to the State of Texas for a title in the buyer's own name, salvage or rebuilt, is the buyer's to do, in the buyer's own name, and no title application is made by the dealer.",
    "If the buyer rebuilds the vehicle, the buyer is responsible for keeping receipts and bills of sale for every component part used, for the Rebuilt Vehicle Statement (Form VTR-61), for any inspection the county requires, and for the Application for Texas Title (Form 130-U) with the rebuilt salvage remark.",
    "The buyer is responsible for the cost of the rebuild, the inspection, the title, the registration and any fee, tax or penalty the State assesses, and for meeting any deadline the State sets for applying.",
    `${brand.legal} will not file, sign or submit any title or registration document for this vehicle after the sale, and will not be asked to. Any temporary tag or plate obtained for this vehicle in ${brand.legal}'s name is the buyer's responsibility to surrender.`,
    "The buyer understands that a rebuilt salvage title, if issued, carries the brand permanently, that it may affect the vehicle's value, insurability and resale, and that some lenders and insurers treat a rebuilt salvage vehicle differently from one with a clean title.",
  ],

  attestation:
    "The buyer has read and understands this document, has had the opportunity to ask questions about it, and signs it voluntarily.",
  buyerSignatureLabel: "Buyer signature",
  dealerSignatureLabel: "Dealer representative",
};

export const SALVAGE_COPY_ES: SalvageSaleCopy = {
  billHeading: "Factura De Venta De Vehículo Salvage",
  billSubtitle: "Vendido Como Salvamento, Tal Como Está, No Para Circular En Vía Pública",
  towHeading: "Reconocimiento De Retiro En Grúa",
  towSubtitle: "Sin Placas, Sin Registro, Sin Permiso Temporal",
  responsibilityHeading: "Declaración De Responsabilidad Del Comprador",
  responsibilitySubtitle: "El Título Salvage Y Todo Lo Que Sigue Son Del Comprador",

  buyerHeading: "Comprador",
  vehicleHeading: "Vehículo",
  moneyHeading: "El Dinero",
  nameLabel: "Nombre",
  idLabel: "Número de identificación",
  phoneLabel: "Teléfono",
  addressLabel: "Dirección",
  yearLabel: "Año",
  makeLabel: "Marca",
  modelLabel: "Modelo",
  odometerLabel: "Odómetro",
  odometerActual: "Millaje real",
  odometerExceeds: "Excede el límite mecánico",
  odometerNotActual: "No es el millaje real",
  titleBrandLabel: "Marca del título",
  titleBrand: "Salvage (salvamento)",
  titleFromLabel: "Título emitido por",
  salvageLicenseLabel: "Licencia de concesionario de salvamento",
  salvageLicenseNone: "No registrada",
  priceLabel: "Precio",
  taxLabel: "Impuesto sobre la venta",
  titleFeeLabel: "Cuota de título",
  docFeeLabel: "Cuota documental",
  totalLabel: "Total",
  paidTodayLabel: "Pagado hoy",
  paymentMethodLabel: "Forma de pago",
  howLeavingLabel: "Sale del lote",
  howLeaving: {
    towTruck: "En grúa",
    trailer: "En remolque",
    flatbed: "En plataforma",
  },
  dateLabel: "Fecha",

  billImportant:
    "Este vehículo se vende con un título SALVAGE. No puede registrarse ni circular en vía pública hasta que sea reconstruido, inspeccionado y vuelto a titular por el Estado de Texas. Esta venta no incluye placas ni registro.",
  towImportant:
    "Este vehículo sale del lote en grúa, remolque o plataforma. No sale por sus propios medios a una vía pública. No se emite ni se promete ninguna placa, permiso temporal ni registro.",
  responsibilityImportant:
    "Desde el momento de la venta, el título salvage, la reconstrucción, la inspección y cualquier solicitud ante el Estado de Texas son del comprador, a su propio nombre y por su propia cuenta.",

  billHeadingClauses: "Lo Que Dice Esta Factura De Venta",
  billClauses: [
    "El vehículo descrito arriba se vende con un título marcado SALVAGE por el estado que lo emitió. Una aseguradora o un dueño lo declaró vehículo de salvamento: sufrió daños a tal grado que el costo de la reparación superó el límite fijado por la ley.",
    "El vehículo se vende TAL COMO ESTÁ, DONDE ESTÁ, con todos sus defectos, por su valor de salvamento, sin ninguna garantía de comerciabilidad, de idoneidad para un fin determinado ni de aptitud para circular, expresa o implícita.",
    `${brand.legal} no declara que este vehículo pueda repararse, que vaya a pasar una inspección estatal, ni que el Estado de Texas o cualquier otro estado vaya a emitirle un título reconstruido, un registro o una placa.`,
    "La lectura del odómetro se declara arriba como lo exigen la ley federal y la de Texas, con la calificación indicada. La marca de salvamento no es una marca de odómetro; las dos se declaran por separado.",
    "El precio, el impuesto y las cuotas indicados arriba son la totalidad de lo que el comprador paga por este vehículo. La cuota de título cubre únicamente la cesión del título salvage; no se cobra cuota de registro porque no se solicita ningún registro.",
    "El comprador ha tenido la oportunidad de inspeccionar el vehículo, de hacerlo inspeccionar por un mecánico de su elección y de preguntar sobre los daños que sufrió.",
  ],

  towHeadingClauses: "Lo Que El Comprador Reconoce",
  towClauses: [
    "El comprador reconoce que este vehículo es un vehículo de salvamento conforme a la ley de Texas (Código de Transporte, Capítulo 501, Subcapítulo E) y que no puede circular en vía pública hasta que haya sido reconstruido, haya pasado la inspección y el Estado de Texas le haya emitido un título rebuilt salvage y un registro.",
    `El comprador reconoce que ${brand.legal} no ha emitido ni emitirá placa, permiso temporal, permiso de comprador, registro ni solicitud de título para este vehículo, y que nadie en ${brand.legal} prometió ninguno de ellos.`,
    "El comprador retirará el vehículo del lote en grúa, remolque o plataforma, según consta arriba, y no lo conducirá fuera del lote ni en vía pública.",
    "El comprador entiende que conducir este vehículo en vía pública antes de que sea vuelto a titular y registrado es ilegal, que cualquier infracción, multa, decomiso o responsabilidad resultante es únicamente suya, y que su seguro puede no cubrir un vehículo de salvamento.",
    `${brand.legal} queda liberado de toda reclamación derivada de la conducción, el transporte o el almacenamiento de este vehículo por parte del comprador después de que salga del lote.`,
  ],

  responsibilityHeadingClauses: "Lo Que Corresponde Al Comprador Desde Ahora",
  responsibilityClauses: [
    "El título salvage se cede al comprador en la venta. Solicitar al Estado de Texas un título a su propio nombre, salvage o reconstruido, le corresponde al comprador, a su propio nombre, y el concesionario no presenta ninguna solicitud de título.",
    "Si el comprador reconstruye el vehículo, es responsable de conservar recibos y facturas de cada pieza usada, de la Declaración de Vehículo Reconstruido (formulario VTR-61), de cualquier inspección que exija el condado y de la Solicitud de Título de Texas (formulario 130-U) con la anotación rebuilt salvage.",
    "El comprador es responsable del costo de la reconstrucción, la inspección, el título, el registro y de cualquier cuota, impuesto o multa que imponga el Estado, y de cumplir cualquier plazo que el Estado fije para solicitarlos.",
    `${brand.legal} no presentará, firmará ni entregará ningún documento de título o registro para este vehículo después de la venta, y no se le pedirá que lo haga. Cualquier permiso temporal o placa obtenida para este vehículo a nombre de ${brand.legal} es responsabilidad del comprador devolverla.`,
    "El comprador entiende que un título rebuilt salvage, si se emite, lleva la marca de forma permanente, que puede afectar el valor, la asegurabilidad y la reventa del vehículo, y que algunos prestamistas y aseguradoras tratan un vehículo reconstruido de salvamento de manera distinta a uno con título limpio.",
  ],

  attestation:
    "El comprador ha leído y entiende este documento, ha tenido la oportunidad de hacer preguntas sobre él y lo firma voluntariamente.",
  buyerSignatureLabel: "Firma del comprador",
  dealerSignatureLabel: "Representante del concesionario",
};

export function getSalvageCopy(language: SalvageLanguage): SalvageSaleCopy {
  return language === "es" ? SALVAGE_COPY_ES : SALVAGE_COPY_EN;
}

/** Year, make and model from wherever the row keeps them, as the rebuilt sheet does. */
export function salvageVehicleParts(data: SalvageSaleData): { year: string; make: string; model: string } {
  const words = data.vehicleDescription.trim().split(/\s+/).filter(Boolean);
  const yearFromLine = /^\d{4}$/.test(words[0] ?? "") ? words[0] : "";
  const rest = yearFromLine ? words.slice(1) : words;
  return {
    year: data.vehicleYear?.trim() || yearFromLine,
    make: data.vehicleMake?.trim() || rest[0] || "",
    model: data.vehicleModel?.trim() || rest.slice(1).join(" "),
  };
}

export function odometerWords(copy: SalvageSaleCopy, status: SalvageSaleData["odometerStatus"]): string {
  if (status === "exceeds") return copy.odometerExceeds;
  if (status === "not_actual") return copy.odometerNotActual;
  return copy.odometerActual;
}
