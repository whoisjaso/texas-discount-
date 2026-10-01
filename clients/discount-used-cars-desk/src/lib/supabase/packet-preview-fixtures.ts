import { encodeCompletedLink } from "@/lib/documents/customerPortal";

/** Synthetic local-preview records only. No delivery provider or real buyer is used. */
const cases = ["mobile", "desktop", "official-rebuilt-mobile", "official-rebuilt-desktop", "official-130u-mobile", "official-130u-desktop"] as const;
export const packetPreviewDeals = cases.map((device) => ({
  id: `preview-signing-deal-${device}`,
  status: "in_progress",
  current_step: 4,
  step_data: {},
  language: "en",
  created_at: "2026-09-08T16:00:00Z",
  completed_at: null,
  vehicles: { id: `preview-signing-vehicle-${device}`, year: 2019, make: "Toyota", model: "Camry", vin: "4T1B11HK0KU123456", title_status: "clean", sale_price: 14500, body_style: "Sedan" },
  customers: { id: `preview-signing-buyer-${device}`, name: "Jordan Example", phone: "+17135550120" },
}));

export const packetPreviewAgreements = cases.flatMap((device) => {
  const buyer = { buyerName: "Jordan Example", buyerAddress: "100 Example St", buyerCity: "Houston", buyerState: "TX", buyerZip: "77087", buyerPhone: "+17135550120" };
  const common = {
    deal_id: `preview-signing-deal-${device}`, status: "finalized", language: "en",
    buyer_name: buyer.buyerName, vehicle_description: "2019 Toyota Camry", vehicle_vin: "4T1B11HK0KU123456",
    finalized_at: "2026-09-08T16:00:00Z", completed_at: "2026-09-08T16:00:00Z", created_at: "2026-09-08T16:00:00Z",
    has_buyer_signature: false, signed_at: null, form_data: {},
  };
  if (device.startsWith("official-")) {
    const documentType = device.includes("130u") ? "form130U" : "rebuiltDisclosure";
    return [{ ...common, id: `preview-signing-${device}`, document_type: documentType,
      completed_link: encodeCompletedLink(documentType, {
        officialForm: "ENF-MV-RBLT-DSCLMR", vehicleDescription: "2019 Toyota Camry", vehicleYear: "2019", vehicleMake: "Toyota", vehicleModel: "Camry",
        vin: "4T1B11HK0KU123456", year: "2019", make: "Toyota", model: "Camry", applicationType: "title_and_registration", saleDate: "2026-09-08", salesPrice: 14500,
      }, buyer, "http://localhost"),
    }];
  }
  return [
    { ...common, id: `preview-signing-bill-${device}`, document_type: "billOfSale", completed_link: encodeCompletedLink("billOfSale", { saleDate: "2026-09-08", vehicleYear: "2019", vehicleMake: "Toyota", vehicleModel: "Camry", vehicleVin: "4T1B11HK0KU123456", vehicleMileage: "65000", odometerReading: "65000", odometerStatus: "actual", salePrice: 14500, tradeInAllowance: 0, tradeInPayoff: 0, tax: 906.25, titleFee: 33, docFee: 292, registrationFee: 75, otherFees: 0, paymentMethod: "Cash", conditionType: "as_is" }, buyer, "http://localhost") },
    { ...common, id: `preview-signing-responsibility-${device}`, document_type: "vehicleResponsibility", completed_link: encodeCompletedLink("vehicleResponsibility", { vehicleDescription: "2019 Toyota Camry", vin: "4T1B11HK0KU123456", saleDate: "2026-09-08", quotedRegistrationAmount: "0" }, buyer, "http://localhost") },
  ];
});
