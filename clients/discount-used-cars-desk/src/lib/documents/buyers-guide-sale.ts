import type { SaleDetail } from "@/lib/admin/sale-desk";
import { missingPrintedFields } from "@/lib/documents/field-maps/resolve";

/**
 * Whether a Buyers Guide printed for a sale may print, from what the route
 * read. A guide for a sale states that sale's warranty, so it is refused
 * rather than printed AS IS when:
 *
 *   the sale could not be read    a failed read used to fall back to AS IS,
 *                                 the very misprint the sale link fixes
 *   the sale is another car's     the dealId's car is not the vehicleId
 *   the warranty is incomplete    DEALER WARRANTY with neither FULL nor
 *                                 LIMITED ticked, or no systems or duration
 */
export type BuyersGuideSaleProblem = { status: 404 | 409 | 400 | 502; error: string; missing?: string[] };

export function buyersGuideSaleProblem(input: {
  dealId: string | undefined;
  vehicleId: string | undefined;
  sale: SaleDetail | null;
  readFailed: boolean;
}): BuyersGuideSaleProblem | null {
  if (!input.dealId) return null;
  if (input.readFailed) return { status: 502, error: "Could not load the sale for this Buyers Guide. Try again." };
  if (!input.sale) return { status: 404, error: "Sale not found." };
  if (input.vehicleId && input.sale.vehicle?.id && input.sale.vehicle.id !== input.vehicleId) {
    return { status: 409, error: "This sale is for a different car. Open the Buyers Guide from the sale itself." };
  }
  const missing = missingPrintedFields("buyersGuide", input.sale, {});
  if (missing.length > 0) {
    return {
      status: 400,
      error: `The sale's warranty answers are incomplete: ${missing.join(", ")}. Answer them on the bill of sale first.`,
      missing,
    };
  }
  return null;
}
