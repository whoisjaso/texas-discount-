import { type DocumentMap } from "@/lib/documents/field-maps/types";
import { SIGNATURE_BLOCK, buyerAndVehicleBlock } from "@/lib/documents/field-maps/shared-blocks";
import { towAwaySaleFields } from "@/lib/documents/field-maps/salvage-bill-of-sale";

/** The Buyer Responsibility Statement: the salvage title and everything after it. Two pages. */
export const BUYER_RESPONSIBILITY_STATEMENT_MAP: DocumentMap = {
  documentType: "buyerResponsibilityStatement",
  kind: "designedSheet",
  askOrder: [],
  pages: [
    {
      page: 1,
      title: "Vehicle, Buyer And What Is The Buyer's From Here",
      fields: [
        ...buyerAndVehicleBlock("salvageBillOfSale"),
        ...towAwaySaleFields(false).map((field) =>
          field.id === "titleOriginState" ? { ...field, printed: undefined } : field,
        ),
        { id: "howLeaving", label: "(carried)", source: { from: "answer", fact: "salvageBillOfSale.howLeaving" }, blank: "never", printed: false },
      ],
    },
    { page: 2, title: "Clauses 4 And 5 And Signatures", fields: [...SIGNATURE_BLOCK] },
  ],
};
