import {
  INK,
  NEVER,
  allowed,
  answer,
  buyer,
  dealer,
  none,
  signature,
  vehicle,
  when,
  type DocumentMap,
} from "@/lib/documents/field-maps/types";

/**
 * The Limited Power of Attorney (VTR-271), the state's AcroForm: fifteen
 * fields on one page; the four multi-box rows are emptied and drawn in their
 * columns. Ids are the keys `poaFieldsFor` (documents/poa-fields.ts) returns.
 */
export const POWER_OF_ATTORNEY_MAP: DocumentMap = {
  documentType: "powerOfAttorney",
  kind: "stateForm",
  template: "public/forms/VTR-271.pdf",
  askOrder: [],
  pages: [
    {
      page: 1,
      title: "Limited Power Of Attorney",
      fields: [
        { id: "vin", label: "Vehicle Identification Number", source: vehicle("vin"), blank: NEVER, acroField: "Vehicle Identification Number" },
        { id: "year", label: "Year", source: vehicle("year"), blank: NEVER, acroField: "Year" },
        { id: "make", label: "Make", source: vehicle("make"), blank: NEVER, acroField: "Make" },
        { id: "bodyStyle", label: "Body Style", source: vehicle("bodyStyle"), blank: NEVER, acroField: "Body Style" },
        { id: "model", label: "Model", source: vehicle("model"), blank: NEVER, acroField: "Model" },
        { id: "licensePlate", label: "License Plate State And Number (if any)", source: answer("guide:plate.plate"), blank: allowed("(if any)"), acroField: "License Plate State and Number if any" },
        { id: "titleDocumentNumber", label: "Title/Document Number", source: none("no title document number is recorded"), blank: allowed("if unknown, leave blank"), acroField: "Title Document Number if unknown leave blank" },
        { id: "grantorFirst", label: "Grantor: First Name", source: buyer("nameParts"), blank: NEVER, acroField: "First Name or Entity Name Middle Name Last Name Suffix if any" },
        { id: "grantorMiddle", label: "Grantor: Middle Name", source: buyer("nameParts"), blank: when("a middle name") },
        { id: "grantorLast", label: "Grantor: Last Name", source: buyer("nameParts"), blank: NEVER },
        { id: "grantorSuffix", label: "Grantor: Suffix (if any)", source: buyer("nameParts"), blank: allowed("(if any)") },
        { id: "grantorAddress", label: "Grantor: Address", source: buyer("street"), blank: NEVER, acroField: "Address" },
        { id: "grantorCity", label: "Grantor: City", source: buyer("city"), blank: NEVER, acroField: "City County State Zip" },
        { id: "grantorCounty", label: "Grantor: County", source: answer("form130U.countyOfResidence"), blank: NEVER },
        { id: "grantorState", label: "Grantor: State", source: buyer("state"), blank: NEVER },
        { id: "grantorZip", label: "Grantor: Zip", source: buyer("zip"), blank: NEVER },
        { id: "granteeName", label: "Grantee: Entity Name", source: dealer("legalName"), blank: NEVER, acroField: "First Name or Entity Name Middle Name Last Name Suffix if any_2" },
        { id: "granteeAddress", label: "Grantee: Address", source: dealer("address"), blank: NEVER, acroField: "Address_2" },
        { id: "granteeCity", label: "Grantee: City", source: dealer("address"), blank: NEVER, acroField: "City County State Zip_2" },
        { id: "granteeCounty", label: "Grantee: County", source: dealer("county"), blank: NEVER },
        { id: "granteeState", label: "Grantee: State", source: dealer("address"), blank: NEVER },
        { id: "granteeZip", label: "Grantee: Zip", source: dealer("address"), blank: NEVER },
        { id: "printedName", label: "Printed Name (Same As Signature)", source: buyer("nameParts"), blank: NEVER, acroField: "Printed Name" },
        { id: "executedDate", label: "Date", source: none("dated by the grantor in ink"), blank: INK, acroField: "Date" },
        { id: "grantorSignature", label: "Signature Of Grantor", source: signature("buyer"), blank: INK },
      ],
    },
  ],
};
