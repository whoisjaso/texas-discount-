import { NEVER, answer, computed, type DocumentMap } from "@/lib/documents/field-maps/types";
import { SIGNATURE_BLOCK, buyerAndVehicleBlock } from "@/lib/documents/field-maps/shared-blocks";

/** The Insurance Acknowledgment (no proof of insurance shown): two pages. */
export const INSURANCE_ACKNOWLEDGMENT_MAP: DocumentMap = {
  documentType: "insuranceAcknowledgment",
  kind: "designedSheet",
  askOrder: [],
  pages: [
    {
      page: 1,
      title: "The Buyer, The Vehicle And What The Buyer Acknowledges",
      fields: [
        ...buyerAndVehicleBlock("billOfSale"),
        // The sheet exists because of this answer (No), and clause 5's
        // wording waits on counsel for the buyer-files branch (D-05).
        { id: "registrationBy", label: "(who files the registration)", source: answer("guide:plan.registrationBy"), blank: NEVER, printed: false },
        { id: "quotedRegistrationAmount", label: "(carried, not printed)", source: computed("money.registrationCost, when the review posts it"), blank: NEVER, printed: false },
      ],
    },
    { page: 2, title: "Clause 5 And Signatures", fields: [...SIGNATURE_BLOCK] },
  ],
};
