import { INK, NEVER, answer, buyer, computed, date, signature, statik, vehicle, type DocumentMap } from "@/lib/documents/field-maps/types";
import { SIGNATURE_BLOCK } from "@/lib/documents/field-maps/shared-blocks";

/**
 * The state's Rebuilt Motor Vehicle Written Disclosure (ENF-MV-RBLT-DSCLMR,
 * Rev. 02/17): one flat page, four values and a signature. The payload
 * carries more (the legacy designed sheet's shape); only these print.
 */
export const REBUILT_DISCLOSURE_MAP: DocumentMap = {
  documentType: "rebuiltDisclosure",
  kind: "stateForm",
  template: "public/forms/ENF-MV-RBLT-DSCLMR.pdf",
  askOrder: [],
  pages: [
    {
      page: 1,
      title: "Rebuilt Motor Vehicle Written Disclosure",
      fields: [
        { id: "vehicleYear", label: "(Year)", source: vehicle("year"), blank: NEVER },
        { id: "vehicleMake", label: "(Make)", source: vehicle("make"), blank: NEVER },
        { id: "vin", label: "(VIN#)", source: vehicle("vin"), blank: NEVER },
        { id: "buyerName", label: "Printed Name Of Purchaser", source: buyer("name"), blank: NEVER },
        { id: "buyerSignature", label: "Name Of Purchaser (Signature)", source: signature("buyer"), blank: INK },
        { id: "buyerSignatureDate", label: "Date Of Signature", source: date("signedOn"), blank: INK },
        { id: "officialForm", label: "(the state form marker)", source: statik("ENF-MV-RBLT-DSCLMR"), blank: NEVER, printed: false },
        // Carried for the legacy sheet's shape; the state page has no line for them.
        { id: "buyerIdNumber", label: "(carried)", source: buyer("idNumber"), blank: NEVER, printed: false },
        { id: "buyerIdKind", label: "(carried)", source: buyer("idKind"), blank: NEVER, printed: false },
        { id: "buyerIdIssuer", label: "(carried)", source: answer("billOfSale.buyerLicenseState"), blank: NEVER, printed: false },
        { id: "buyerPhone", label: "(carried)", source: buyer("phone"), blank: NEVER, printed: false },
        { id: "buyerAddress", label: "(carried)", source: buyer("address"), blank: NEVER, printed: false },
        { id: "vehicleModel", label: "(carried)", source: vehicle("model"), blank: NEVER, printed: false },
        { id: "vehicleDescription", label: "(carried)", source: vehicle("model"), blank: NEVER, printed: false },
        { id: "saleDate", label: "(carried)", source: date("saleDate"), blank: NEVER, printed: false },
        { id: "quotedRegistrationAmount", label: "(carried)", source: computed("money.registrationCost, when the review posts it"), blank: NEVER, printed: false },
        { id: "language", label: "(carried)", source: answer("guide:language.language"), blank: NEVER, printed: false },
        ...SIGNATURE_BLOCK.filter((field) => field.id.startsWith("dealer")).map((field) => ({ ...field, printed: false as const })),
      ],
    },
  ],
};
