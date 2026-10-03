import { NEVER, answer, type DocumentMap } from "@/lib/documents/field-maps/types";
import { SIGNATURE_BLOCK, buyerAndVehicleBlock } from "@/lib/documents/field-maps/shared-blocks";
import { towAwaySaleFields } from "@/lib/documents/field-maps/salvage-bill-of-sale";

/** The Tow-Away Acknowledgment: no plates, no registration, no temporary tag. Two pages. */
export const TOW_AWAY_ACKNOWLEDGMENT_MAP: DocumentMap = {
  documentType: "towAwayAcknowledgment",
  kind: "designedSheet",
  askOrder: [],
  pages: [
    {
      page: 1,
      title: "Vehicle, How It Leaves, Buyer",
      fields: [
        ...buyerAndVehicleBlock("salvageBillOfSale"),
        { id: "howLeaving", label: "Leaving The Lot", source: answer("salvageBillOfSale.howLeaving"), blank: NEVER },
        // The sale's money rides along so the gate can compare it with the
        // salvage bill of sale; this sheet prints none of it.
        ...towAwaySaleFields(false).map((field) =>
          field.id === "titleOriginState" ? { ...field, printed: undefined } : field,
        ),
      ],
    },
    { page: 2, title: "Clauses 3 To 5 And Signatures", fields: [...SIGNATURE_BLOCK] },
  ],
};
