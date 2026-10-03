"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { getSaleDetail, SALE_DOCUMENTS } from "@/lib/admin/sale-desk";
import { readDealAgreements, refileTypes } from "@/lib/sales/filed-documents";
import { requiredDocumentTypes } from "@/lib/sales/deal-type";
import { settledPlan } from "@/lib/sales/sale-plan";
import { readSalvagePlan } from "@/lib/sales/salvage-plan";
import { filedBillOfSaleOn } from "@/lib/sales/filed-bill-of-sale";
import { readMoney } from "@/lib/sales/money";
import {
  BILL_OF_SALE_FROZEN_CODE,
  FREEZE_MESSAGES,
  billOfSaleStatement,
  frozenFieldsChanged,
  idPrintedConflict,
  type FreezeField,
} from "@/lib/sales/bill-of-sale-freeze";

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
  | {
      success: false;
      error: string;
      code?: "voidedNotRefiled" | typeof BILL_OF_SALE_FROZEN_CODE | "couldNotCheck";
      field?: FreezeField;
    };

/** Whether the money step holds a typed amount (the figures no longer follow the vehicle row). */
function hasTypedAmount(stepData: unknown): boolean {
  return readMoney(stepData).amount.trim() !== "";
}

/** The English refusal when voided paperwork has not been filed again. */
function voidedNotRefiledMessage(titles: string[]): string {
  return `Some paperwork was voided and has not been filed again: ${titles.join(", ")}. File it before closing the sale.`;
}

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

  /*
    Voided paperwork comes back before the sale closes (owner's decision
    10/02/2026): a sale whose bill of sale was voided, or anything voided
    with it, is not closed until every document it still owes is filed again.
    And the filed bill of sale holds what it states: the price it prints
    (moved here only through the vehicle row on a deal with no typed amount)
    and the buyer's licence number it prints. Both read fail closed.
  */
  try {
    const supabase = await createAdminDataClient();
    const sale = await getSaleDetail(dealId);
    if (sale) {
      const rows = await readDealAgreements(supabase, dealId);
      const owed = requiredDocumentTypes(
        sale.funding.type,
        settledPlan(sale.stepData),
        sale.vehicle?.titleStatus ?? null,
        readSalvagePlan(sale.stepData).path,
      );
      const refile = refileTypes(rows, owed);
      if (refile.length > 0) {
        const titles = refile.map(
          (type) => SALE_DOCUMENTS.find((entry) => entry.documentType === type)?.title ?? type,
        );
        return { success: false, code: "voidedNotRefiled", error: voidedNotRefiledMessage(titles) };
      }
      const filed = await filedBillOfSaleOn(dealId);
      if (filed) {
        if (salePrice !== null && salePrice !== filed.advertised) {
          const context = { rootType: filed.type, fees: filed.printed?.fees ?? null };
          const [field] = frozenFieldsChanged(
            billOfSaleStatement(sale.stepData, { ...context, advertised: filed.advertised }),
            billOfSaleStatement(sale.stepData, { ...context, advertised: salePrice }),
          );
          if (field) {
            return { success: false, code: BILL_OF_SALE_FROZEN_CODE, field, error: FREEZE_MESSAGES[field] };
          }
        }
        /*
          And on a deal whose amount was typed at the money step (so the
          vehicle row no longer feeds the figures above), the car is marked
          sold at the price the paper states: a different figure here would
          leave the vehicle's sold price disagreeing with the filed bill of
          sale (the verify walk's cash out-the-door deal closed at $12,345
          that way). On a deal with no typed amount the vehicle row IS the
          price the figures are drawn from, and the check above holds it.
        */
        const printedPrice = filed.printed?.salePrice;
        if (
          salePrice !== null &&
          hasTypedAmount(sale.stepData) &&
          typeof printedPrice === "number" &&
          Math.round(salePrice * 100) !== Math.round(printedPrice * 100)
        ) {
          return { success: false, code: BILL_OF_SALE_FROZEN_CODE, field: "price", error: FREEZE_MESSAGES.price };
        }
        if (idPrintedConflict(filed.printed?.buyerLicense, input.buyerIdNumber)) {
          return { success: false, code: BILL_OF_SALE_FROZEN_CODE, field: "buyerId", error: FREEZE_MESSAGES.buyerId };
        }
      }
    }
  } catch {
    return {
      success: false,
      code: "couldNotCheck",
      error: "The paperwork could not be checked, so the sale was not closed. Try again.",
    };
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
