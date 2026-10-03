import type { SaleDetail } from "@/lib/admin/sale-desk";
import type {
  BuyersGuideInput,
  BuyersGuideLanguage,
  BuyersGuideVehicleInput,
  BuyersGuideWarrantyInput,
} from "@/lib/documents/buyersGuide";
import { readPaperwork } from "@/lib/sales/paperwork";
import { readSalvagePlan } from "@/lib/sales/salvage-plan";
import { warrantySystemLabels } from "@/lib/sales/deal-facts";
import { DEALER_ADDRESS, DEALER_NAME, DEALER_PHONE } from "@/lib/documents/shared";
import { dealership, factOr } from "@/lib/dealership-config";

/**
 * The Buyers Guide's boxes, from the car and, when it is printed for a sale,
 * the sale's own warranty answer (field-maps/buyers-guide).
 *
 * The AS IS box used to be marked on every guide, so a sale whose bill of
 * sale said "With A Warranty" printed a window form that said AS IS, and
 * the form says it is part of the contract. Now the bill of sale's answer
 * decides: AS IS when it says as-is (or nobody has answered, or the car is
 * leaving on a tow, which is sold as is by its nature); DEALER WARRANTY with
 * FULL or LIMITED, the labor and parts shares, the systems and the duration
 * when it says warranty. Without a sale the guide prints as it always did.
 */
export function buyersGuideWarrantyFor(sale: SaleDetail | null): BuyersGuideWarrantyInput | null {
  if (!sale) return null;
  const towAway = sale.vehicle?.titleStatus === "salvage_unrebuilt" && readSalvagePlan(sale.stepData).path === "towAway";
  const bill = readPaperwork(sale.stepData, "billOfSale");
  if (towAway || bill.conditionType !== "warranty") return { conditionType: "as_is" };
  return {
    conditionType: "warranty",
    kind: bill.warrantyKind === "full" ? "full" : bill.warrantyKind === "limited" ? "limited" : null,
    laborPercent: bill.warrantyLaborPercent ?? null,
    partsPercent: bill.warrantyPartsPercent ?? null,
    systems: warrantySystemLabels(bill.warrantySystems),
    duration: bill.warrantyDuration ?? null,
  };
}

/** What is missing from the vehicle row for a guide that hangs on the car. */
export function buyersGuideVehicleGaps(vehicle: BuyersGuideVehicleInput): string[] {
  const missing: string[] = [];
  if (!String(vehicle.vin ?? "").trim()) missing.push("VIN");
  if (!String(vehicle.year ?? "").trim()) missing.push("year");
  if (!String(vehicle.make ?? "").trim()) missing.push("make");
  if (!String(vehicle.model ?? "").trim()) missing.push("model");
  return missing;
}

export function buyersGuideInputFor(
  vehicle: BuyersGuideVehicleInput,
  sale: SaleDetail | null,
  language: BuyersGuideLanguage,
  contact?: string,
): BuyersGuideInput {
  return {
    vehicle,
    dealer: { contact: contact ?? "Sales Office" },
    language,
    warranty: buyersGuideWarrantyFor(sale),
  };
}

/** The boxes keyed by the map's ids, for the read-back and the tests. */
export function buyersGuideProbe(input: BuyersGuideInput): Record<string, unknown> {
  const warranty = input.warranty;
  const asIs = !warranty || warranty.conditionType === "as_is";
  return {
    make: input.vehicle.make ?? "",
    model: input.vehicle.model ?? "",
    year: input.vehicle.year ?? "",
    vin: input.vehicle.vin ?? "",
    asIs: asIs ? "X" : "",
    dealerWarranty: asIs ? "" : "X",
    fullWarranty: warranty?.kind === "full" ? "X" : "",
    limitedWarranty: warranty?.kind === "limited" ? "X" : "",
    laborPercent: warranty?.kind === "limited" ? warranty.laborPercent ?? "" : "",
    partsPercent: warranty?.kind === "limited" ? warranty.partsPercent ?? "" : "",
    systemsCovered: (warranty?.systems ?? []).join(", "),
    duration: warranty?.duration ?? "",
    serviceContract: "",
    dealerName: input.dealer?.name ?? DEALER_NAME,
    dealerAddress: input.dealer?.address ?? DEALER_ADDRESS,
    dealerPhone: input.dealer?.phone ?? DEALER_PHONE,
    dealerEmail: input.dealer?.email ?? factOr(dealership.email, "dealer email"),
    complaintsContact: input.dealer?.contact ?? "Sales Office",
  };
}
