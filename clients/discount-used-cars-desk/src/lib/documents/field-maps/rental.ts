import { INK, NEVER, buyer, coBuyer, dealer, statik, vehicle, when, type DocumentMap } from "@/lib/documents/field-maps/types";

/**
 * The vehicle rental agreement, mapped and kept as legacy: this dealer runs
 * no rental business, so no corridor walks it (owner decision D-15). The
 * map names what prints so a revival starts from the sources, not the JSX.
 */
export const RENTAL_MAP: DocumentMap = {
  documentType: "rental",
  kind: "designedSheet",
  legacy: true,
  askOrder: [],
  pages: [
    {
      page: 1,
      title: "Parties, Vehicle And Summary",
      fields: [
        { id: "renterName", label: "Renter: Name", source: buyer("name"), blank: NEVER },
        { id: "renterAddress", label: "Renter: Address", source: buyer("address"), blank: NEVER },
        { id: "renterPhone", label: "Renter: Phone", source: buyer("phone"), blank: NEVER },
        { id: "renterLicense", label: "Renter: DL#", source: buyer("idNumber"), blank: NEVER },
        { id: "coRenterName", label: "Additional Driver", source: coBuyer("name"), blank: when("an additional driver") },
        { id: "vehicleVin", label: "VIN", source: vehicle("vin"), blank: NEVER },
        { id: "rentalRate", label: "Standard Rate", source: statik("typed on the legacy rentals form"), blank: NEVER },
      ],
    },
    {
      page: 5,
      title: "Signatures",
      fields: [
        { id: "buyerSignature", label: "Renter Signature", source: { from: "signature", who: "buyer" }, blank: INK },
        { id: "representativeName", label: "Dealer Representative", source: dealer("signerName"), blank: { marker: "signerName" } },
      ],
    },
  ],
};
