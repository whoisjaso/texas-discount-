import { NEVER, computed, dealer, marker, answer, type DocumentMap } from "@/lib/documents/field-maps/types";
import { SIGNATURE_BLOCK, buyerAndVehicleBlock } from "@/lib/documents/field-maps/shared-blocks";

/** The Vehicle Responsibility Acknowledgment (buyer files their own title): two pages. */
export const VEHICLE_RESPONSIBILITY_MAP: DocumentMap = {
  documentType: "vehicleResponsibility",
  kind: "designedSheet",
  askOrder: [],
  pages: [
    {
      page: 1,
      title: "The Buyer, The Vehicle And What The Buyer Agrees To",
      fields: [
        ...buyerAndVehicleBlock("billOfSale"),
        { id: "quotedRegistrationAmount", label: "Quoted Registration", source: computed("money.registrationCost"), blank: NEVER },
        // The dealer's own figure (NEXT_PUBLIC_DEALER_LATE_HANDLING_FEE), not a
        // line of the owner's fee schedule; stamped at filing with its total.
        { id: "lateHandlingFee", label: "Late-Handling Fee", source: dealer("lateHandlingFee"), blank: marker("lateHandlingFee") },
        { id: "registrationBy", label: "(who files the registration)", source: answer("guide:plan.registrationBy"), blank: NEVER, printed: false },
      ],
    },
    {
      page: 2,
      title: "If It Comes Back To Us, And Signatures",
      fields: [
        { id: "lateHandlingTotal", label: "Total If It Comes Back To Us", source: computed("quoted + lateHandlingFee"), blank: marker("lateHandlingFee") },
        ...SIGNATURE_BLOCK,
      ],
    },
  ],
};
