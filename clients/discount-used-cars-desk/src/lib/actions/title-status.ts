"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { isTitleStatus, type TitleStatus } from "@/lib/vehicles/title-status";

/**
 * Record a vehicle's verified title status.
 *
 * This is the acquisition-time verification the sale flow reads back and
 * never re-asks. It records who looked at the paper and when; 'unknown' is
 * refused as a target because unmarking a car is not a verification, it is
 * the absence of one.
 */
export type SetTitleStatusResult =
  | { success: true; status: TitleStatus }
  | { success: false; error: string };

export async function setVehicleTitleStatus(input: {
  vehicleId: string;
  status: string;
  /** What was looked at: the title itself, an NMVTIS/Carfax pull, the auction sheet. */
  evidence?: string;
}): Promise<SetTitleStatusResult> {
  const gate = await requireAdminActionPermission("inventory:manage");
  if (!gate.ok) return { success: false, error: gate.error };

  const vehicleId = input.vehicleId?.trim();
  if (!vehicleId) return { success: false, error: "No vehicle named." };

  if (!isTitleStatus(input.status) || input.status === "unknown") {
    return {
      success: false,
      error: "Pick the verified title status. A car cannot be marked back to unverified.",
    };
  }
  const status: TitleStatus = input.status;

  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not signed in." };

    const { data, error } = await supabase
      .from("vehicles")
      .update({
        title_status: status,
        title_status_verified_at: new Date().toISOString(),
        title_status_verified_by: user.id,
        title_status_evidence: input.evidence?.trim() || null,
      })
      .eq("id", vehicleId)
      .select("id")
      .maybeSingle();

    if (error) {
      return { success: false, error: `Could not save the title status: ${error.message}` };
    }
    if (!data) {
      return { success: false, error: "That vehicle no longer exists." };
    }

    revalidatePath("/admin/inventory");
    revalidatePath("/admin/inventory/title-status");
    revalidatePath("/admin/sales/new");
    return { success: true, status };
  } catch (err) {
    console.error("setVehicleTitleStatus exception:", err);
    return { success: false, error: "Unexpected error while saving the title status." };
  }
}
