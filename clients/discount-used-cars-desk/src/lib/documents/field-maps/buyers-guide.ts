import {
  NEVER,
  allowed,
  answer,
  dealer,
  marker,
  statik,
  vehicle,
  when,
  type DocumentMap,
} from "@/lib/documents/field-maps/types";

/**
 * The FTC Buyers Guide (16 C.F.R. 455, 2016 template), printed and never
 * filed: page 1 the front, page 2 the alternate "Implied Warranties Only"
 * front (left untouched; the window copy prints pages 1 and 3), page 3 the
 * back. Ids are the keys `buyersGuideFieldsFor` returns.
 */
export const BUYERS_GUIDE_MAP: DocumentMap = {
  documentType: "buyersGuide",
  kind: "stateForm",
  template: "public/forms/buyers-guide-ftc-english-2016.pdf",
  askOrder: [],
  pages: [
    {
      page: 1,
      title: "Buyers Guide (Front)",
      fields: [
        { id: "make", label: "Vehicle Make", source: vehicle("make"), blank: NEVER },
        { id: "model", label: "Model", source: vehicle("model"), blank: NEVER },
        { id: "year", label: "Year", source: vehicle("year"), blank: NEVER },
        { id: "vin", label: "Vehicle Identification Number (VIN)", source: vehicle("vin"), blank: NEVER },
        { id: "asIs", label: "AS IS - NO DEALER WARRANTY", source: answer("billOfSale.conditionType"), blank: when("sold as is") },
        { id: "dealerWarranty", label: "DEALER WARRANTY", source: answer("billOfSale.conditionType"), blank: when("sold with a warranty") },
        { id: "fullWarranty", label: "FULL WARRANTY", source: answer("billOfSale.warrantyKind"), blank: when("a full warranty") },
        { id: "limitedWarranty", label: "LIMITED WARRANTY", source: answer("billOfSale.warrantyKind"), blank: when("a limited warranty") },
        { id: "laborPercent", label: "The dealer will pay ___% of the labor", source: answer("billOfSale.warrantyLaborPercent"), blank: when("a limited warranty") },
        { id: "partsPercent", label: "___% of the parts", source: answer("billOfSale.warrantyPartsPercent"), blank: when("a limited warranty") },
        { id: "systemsCovered", label: "SYSTEMS COVERED", source: answer("billOfSale.warrantySystems"), blank: when("a warranty") },
        { id: "duration", label: "DURATION", source: answer("billOfSale.warrantyDuration"), blank: when("a warranty") },
        { id: "serviceContract", label: "SERVICE CONTRACT", source: dealer("sellsServiceContracts"), blank: marker("sellsServiceContracts") },
      ],
    },
    {
      page: 3,
      title: "Buyers Guide (Back)",
      fields: [
        { id: "dealerName", label: "Dealer Name", source: dealer("legalName"), blank: NEVER },
        { id: "dealerAddress", label: "Address", source: dealer("address"), blank: NEVER },
        { id: "dealerPhone", label: "Telephone", source: dealer("phone"), blank: NEVER },
        { id: "dealerEmail", label: "Email", source: dealer("email"), blank: marker("email") },
        { id: "complaintsContact", label: "For Complaints After Sale, Contact", source: dealer("complaintsContact"), blank: marker("complaintsContact") },
        { id: "defectsList", label: "Major Defects List", source: statik("printed by the FTC"), blank: allowed("printed by the FTC"), printed: false },
      ],
    },
  ],
};
