import { INK, NEVER, allowed, dealer, answer, vehicle, when, type DocumentMap } from "@/lib/documents/field-maps/types";

/**
 * The Rebuilt Vehicle Statement (VTR-61): title work on a salvage car before
 * it is sold, never a sale document. Ids are the keys `vtr61FieldsFor`
 * (fill-vtr61/fields.ts) returns.
 */
export const VTR_61_MAP: DocumentMap = {
  documentType: "vtr61",
  kind: "stateForm",
  template: "public/forms/VTR-61.pdf",
  askOrder: [],
  pages: [
    {
      page: 1,
      title: "Vehicle, Owner, Rebuilder And Work",
      fields: [
        { id: "vin", label: "Vehicle Identification Number", source: vehicle("vin"), blank: NEVER, acroField: "Vehicle Identification Number" },
        { id: "year", label: "Year", source: vehicle("year"), blank: NEVER, acroField: "Year" },
        { id: "make", label: "Make", source: vehicle("make"), blank: NEVER, acroField: "Make" },
        { id: "bodyStyle", label: "Body Style", source: vehicle("bodyStyle"), blank: NEVER, acroField: "Body Style" },
        { id: "model", label: "Model", source: vehicle("model"), blank: NEVER, acroField: "Model" },
        { id: "ownerName", label: "Owner: Name", source: dealer("legalName"), blank: NEVER, acroField: "First Name or Entity Name Middle Name Last Name Suffix if any" },
        { id: "rebuilderName", label: "Rebuilder: Name", source: answer("guide:titleWork.vtr61"), blank: NEVER, acroField: "First Name or Entity Name Middle Name Last Name Suffix if any_2" },
        { id: "rebuilderAddress", label: "Rebuilder: Address", source: answer("guide:titleWork.vtr61"), blank: NEVER, acroField: "Address City State Zip" },
        { id: "dateWorkCompleted", label: "Date Work Completed", source: answer("guide:titleWork.vtr61"), blank: NEVER, acroField: "Date Work Completed" },
        { id: "details1", label: "Details Of Work Performed (Line 1)", source: answer("guide:titleWork.vtr61"), blank: NEVER, acroField: "1" },
        { id: "details2", label: "Details Of Work Performed (Line 2)", source: answer("guide:titleWork.vtr61"), blank: when("the statement runs past one line"), acroField: "2" },
        { id: "details3", label: "Details Of Work Performed (Line 3)", source: answer("guide:titleWork.vtr61"), blank: when("the statement runs past two lines"), acroField: "3" },
        { id: "details4", label: "Details Of Work Performed (Line 4)", source: answer("guide:titleWork.vtr61"), blank: when("the statement runs past three lines"), acroField: "4" },
        { id: "rebuilderPrintedName", label: "Rebuilder: Printed Name", source: dealer("signerName"), blank: NEVER, acroField: "Printed Name (Same as Signature)" },
        { id: "rebuilderDate", label: "Rebuilder: Date", source: { from: "date", which: "signedOn" }, blank: INK, acroField: "Date" },
        { id: "ownerPrintedName", label: "Owner: Printed Name", source: dealer("signerName"), blank: NEVER, acroField: "Printed Name (Same as Signature)_2" },
        { id: "ownerDate", label: "Owner: Date", source: { from: "date", which: "signedOn" }, blank: INK, acroField: "Date_2" },
      ],
    },
    {
      page: 2,
      title: "Component Parts",
      fields: [
        { id: "parts", label: "Origin And Part Number Of Each Component", source: answer("guide:titleWork.vtr61"), blank: allowed("only the components replaced") },
      ],
    },
  ],
  notOnThisDesk: {},
};

/** VTR-61 page-2 AcroForm names: each component's origin and part-number boxes. */
export const VTR_61_COMPONENT_FIELDS = /^(Origin of Component PartPurchased from Name and Complete Address|Component Part Number (required|if available))/;
