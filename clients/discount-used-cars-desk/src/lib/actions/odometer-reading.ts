"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { hasTeamPermission } from "@/lib/operations/team";
import { filedBillOfSaleOn } from "@/lib/sales/filed-bill-of-sale";
import { BILL_OF_SALE_FROZEN_CODE, FREEZE_MESSAGES } from "@/lib/sales/bill-of-sale-freeze";
import { ODOMETER_READING_MESSAGES, readOdometerReading } from "@/lib/sales/odometer-reading";

/**
 * The odometer reading, recorded on a sale that started without one.
 *
 * The reading belongs to the car: Start A Sale writes it to `vehicles.mileage`
 * and every document prints it from there (the bill of sale's disclosure, the
 * 130-U's box 9, the contract). A sale whose car has none (one started before
 * the reading was required, a seeded preview deal) could never be filed: its
 * review named the blank boxes and its Fix It opened a page that does not
 * exist. This writes the same column Start A Sale writes, with the same check
 * Start A Sale makes (a number of miles, not negative, rounded to the mile;
 * `readOdometerReading`), and nothing more.
 *
 * The bill of sale holds what it states (owner's decision 10/02/2026): while a
 * bill of sale is filed, a different reading is refused with the way out
 * (void it and file it again). The same reading typed again is no change.
 *
 * The vehicle row is written under the operator's own session, so the row's
 * own rule applies (a role that sells or keeps the inventory); the
 * registration role walks the paperwork and is told whom to ask.
 */

export type OdometerReadingCode =
  | "odometerReadingInvalid"
  | "odometerReadingNotAllowed"
  | typeof BILL_OF_SALE_FROZEN_CODE;

export type OdometerReadingState = {
  ok: boolean;
  error?: string;
  code?: OdometerReadingCode;
  field?: "mileage";
  /** The reading as recorded, in miles. */
  miles?: number;
};

export async function saveOdometerReading(dealId: string, typed: string): Promise<OdometerReadingState> {
  const access = await requireAdminActionPermission(["sales:manage", "paperwork:manage"]);
  if (!access.ok) return { ok: false, error: access.error };

  const miles = readOdometerReading(typed);
  if (miles === null) {
    return { ok: false, code: "odometerReadingInvalid", error: ODOMETER_READING_MESSAGES.odometerReadingInvalid };
  }

  try {
    const sale = await getSaleDetail(dealId);
    if (!sale?.vehicle?.id) return { ok: false, error: "That sale's car could not be found." };
    const before = sale.vehicle.mileage;
    // The same reading again changes nothing, filed or not.
    if (before === miles) return { ok: true, miles };

    // The filed bill of sale states the reading: changed only by voiding it.
    if (await filedBillOfSaleOn(dealId)) {
      return { ok: false, code: BILL_OF_SALE_FROZEN_CODE, field: "mileage", error: FREEZE_MESSAGES.mileage };
    }
    if (!hasTeamPermission(access.role, "sales:manage") && !hasTeamPermission(access.role, "inventory:manage")) {
      return { ok: false, code: "odometerReadingNotAllowed", error: ODOMETER_READING_MESSAGES.odometerReadingNotAllowed };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("vehicles").update({ mileage: miles }).eq("id", sale.vehicle.id);
    if (error) return { ok: false, error: "Could not save that. Try again." };
  } catch {
    return { ok: false, error: "Could not save that. Try again." };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { ok: true, miles };
}
