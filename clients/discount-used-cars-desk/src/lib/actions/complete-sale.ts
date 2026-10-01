"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";

/**
 * Complete a sale — one database transaction, with its invariants named.
 *
 * The work lives in the `complete_sale_atomic` RPC
 * (supabase/migrations/20260829020000): it locks the deal and its vehicle,
 * reloads the buyer from the customer row rather than trusting the caller,
 * writes the corrected ID onto the customer profile, snapshots the buyer
 * onto the vehicle with the America/Chicago business date, and closes the
 * deal — or none of it. A vehicle already claimed by a DIFFERENT customer
 * is refused, never repaired; a retry on a completed deal succeeds only
 * after verifying the vehicle really is sold to this deal's buyer.
 *
 * This used to be three separate writes across two actions, and any
 * failure between them left a half-completed pair the retry then trusted.
 */

export type CompleteSaleInput = {
  dealId: string;
  /** Sale price actually agreed, in USD. Optional — some deals record it later. */
  salePrice?: number | null;
  /** Corrected government ID number, carried into the customer record too. */
  buyerIdNumber?: string | null;
};

export type CompleteSaleResult =
  | { success: true; vehicleId: string; customerId: string }
  | { success: false; error: string };

/** The RPC's named refusals, said the way the desk needs to hear them. */
const RPC_ERRORS: Record<string, string> = {
  not_found: "That sale could not be found.",
  missing_parties:
    "This sale is missing a vehicle or a customer, so it cannot be completed yet.",
  vehicle_conflict:
    "This vehicle is already recorded as sold to a different buyer. Open that sale first.",
  bad_price: "Enter the sale price as a positive amount.",
};

async function sendCustomerWelcome(dealId: string): Promise<void> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const service = createServiceClient();
    const { data } = await service
      .from("deals")
      .select("language, customers(name, email, language), vehicles(year, make, model)")
      .eq("id", dealId)
      .maybeSingle();
    const row = data as unknown as {
      language: string | null;
      customers: { name: string | null; email: string | null; language: string | null } | null;
      vehicles: { year: number | null; make: string | null; model: string | null } | null;
    } | null;

    const email = row?.customers?.email?.trim();
    if (!email) return; // No email on file is a quiet non-event, not an error.

    const language: "en" | "es" =
      row?.language === "es" || row?.customers?.language === "es" ? "es" : "en";
    const vehicle = [row?.vehicles?.year, row?.vehicles?.make, row?.vehicles?.model]
      .filter(Boolean)
      .join(" ") || "vehicle";

    const { sendEmail } = await import("@/lib/email/send");
    const { customerWelcomeEmail } = await import("@/lib/email/templates");
    await sendEmail({
      businessKey: `customer-welcome/${dealId}`,
      template: "customerWelcome",
      to: email,
      language,
      from: "support",
      ...customerWelcomeEmail(language, row?.customers?.name ?? "", vehicle),
    });
  } catch (error) {
    console.error("sendCustomerWelcome failed:", error);
  }
}

export async function completeSale(
  input: CompleteSaleInput,
): Promise<CompleteSaleResult> {
  const gate = await requireAdminActionPermission("sales:manage");
  if (!gate.ok) return { success: false, error: gate.error };

  const { dealId } = input;
  if (!dealId) {
    return { success: false, error: "A deal is required to complete a sale." };
  }
  const salePrice =
    typeof input.salePrice === "number" && Number.isFinite(input.salePrice)
      ? input.salePrice
      : null;
  if (salePrice !== null && salePrice < 0) {
    return { success: false, error: RPC_ERRORS.bad_price };
  }

  try {
    const supabase = await createAdminDataClient();
    const { data, error } = await supabase.rpc("complete_sale_atomic", {
      p_deal_id: dealId,
      p_buyer_id_number: input.buyerIdNumber?.trim() || null,
      p_sale_price: salePrice,
    });

    if (error) {
      const named = RPC_ERRORS[error.message];
      return {
        success: false,
        error: named ?? `Could not complete the sale: ${error.message}`,
      };
    }

    const row = data as { vehicle_id?: string; customer_id?: string } | null;
    if (!row?.vehicle_id || !row.customer_id) {
      return { success: false, error: "The sale did not come back confirmed. Try again." };
    }

    revalidatePath("/admin/sales");
    revalidatePath("/admin/dealership/inventory");
    revalidatePath("/admin/dealership/dashboard");

    /*
      The welcome email, from the one committed sale-completion transition
      and nowhere else — never from document finalize, which completes a
      DOCUMENT and would welcome the same buyer once per paper (Track D
      review). The outbox key is the deal id, so a retried completion
      finds the claim and does not welcome twice. Best-effort by policy:
      the sale is closed either way, and it fires after the response so a
      slow provider cannot slow the desk.
    */
    try {
      after(() => sendCustomerWelcome(dealId));
    } catch {
      void sendCustomerWelcome(dealId);
    }

    return { success: true, vehicleId: row.vehicle_id, customerId: row.customer_id };
  } catch (error) {
    console.error("completeSale exception:", error);
    return {
      success: false,
      error: "Unexpected error while completing the sale.",
    };
  }
}
