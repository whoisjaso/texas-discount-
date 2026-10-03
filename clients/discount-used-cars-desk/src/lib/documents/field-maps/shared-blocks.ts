import {
  INK,
  NEVER,
  answer,
  buyer,
  date,
  dealer,
  marker,
  signature,
  statik,
  vehicle,
  when,
  type MapField,
} from "@/lib/documents/field-maps/types";

/**
 * The buyer and vehicle block every desk-signed sheet prints (the
 * acknowledgments and the tow-away sheets), as one list so the five maps
 * cannot describe the same block five ways.
 */
export function buyerAndVehicleBlock(licenceStateOwner: "billOfSale" | "salvageBillOfSale"): MapField[] {
  return [
    { id: "saleDate", label: "Date Of Sale", source: date("saleDate"), blank: NEVER },
    { id: "buyerName", label: "Buyer: Name", source: buyer("name"), blank: NEVER },
    { id: "buyerIdNumber", label: "Buyer: ID Number", source: buyer("idNumber"), blank: NEVER },
    { id: "buyerIdKind", label: "Buyer: ID Kind", source: buyer("idKind"), blank: NEVER },
    { id: "buyerIdIssuer", label: "Buyer: ID Issued By", source: answer(`${licenceStateOwner}.buyerLicenseState`), fallback: buyer("idIssuer"), blank: when("the ID is issued by a state or a country") },
    { id: "buyerPhone", label: "Buyer: Phone", source: buyer("phone"), blank: NEVER },
    { id: "buyerAddress", label: "Buyer: Address", source: buyer("address"), blank: NEVER },
    { id: "vehicleDescription", label: "Vehicle", source: vehicle("model"), blank: NEVER },
    { id: "vehicleYear", label: "Year", source: vehicle("year"), blank: NEVER },
    { id: "vehicleMake", label: "Make", source: vehicle("make"), blank: NEVER },
    { id: "vehicleModel", label: "Model", source: vehicle("model"), blank: NEVER },
    { id: "vin", label: "VIN", source: vehicle("vin"), blank: NEVER },
    { id: "language", label: "(the sheet's language)", source: answer("guide:language.language"), blank: NEVER, printed: false },
  ];
}

/** The two signature lines every desk-signed sheet ends with. */
export const SIGNATURE_BLOCK: MapField[] = [
  { id: "buyerSignature", label: "Buyer Signature", source: signature("buyer"), blank: INK },
  { id: "buyerSignatureDate", label: "Date (Buyer)", source: date("signedOn"), blank: INK },
  { id: "dealerSignature", label: "Dealer Representative Signature", source: signature("dealer"), blank: INK },
  { id: "dealerSignatureDate", label: "Date (Dealer)", source: date("signedOn"), blank: INK },
  { id: "dealerSignerName", label: "Dealer Representative Printed Name", source: dealer("signerName"), blank: marker("signerName") },
];

/** The letterhead every designed sheet opens with. */
export const LETTERHEAD: MapField[] = [
  { id: "letterhead", label: "Dealer Name, Address, Phone, Website, Licence", source: dealer("legalName"), blank: NEVER, printed: false },
];

export const CLAUSES = (label: string): MapField => ({
  id: "clauses",
  label,
  source: statik("counsel-editable copy"),
  blank: NEVER,
  printed: false,
});
