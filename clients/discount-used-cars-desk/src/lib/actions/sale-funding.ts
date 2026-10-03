"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import {
  writeFunding,
  type DealFunding,
  type DealType,
} from "@/lib/sales/deal-type";
import { writePlate, writePlateLater } from "@/lib/sales/webdealer";
import { casMergeStepData } from "@/lib/sales/step-data-write";
import { mergeUnderBillOfSaleFreeze } from "@/lib/sales/frozen-merge";
import { billOfSaleFrozen, platePrintedConflict, type BillOfSaleFrozenRefusal } from "@/lib/sales/bill-of-sale-freeze";
import { readPlate } from "@/lib/sales/webdealer";

/**
 * Recording how a sale is paid for, and the plate it ends up with.
 *
 * Both write into `step_data` through the version-checked merge, so a
 * funding answer can never replay over a licence upload or a paperwork
 * answer that landed between this screen's read and its write.
 */

export type FundingState =
  | { ok: boolean; error?: string; code?: undefined }
  | BillOfSaleFrozenRefusal;

function isDealType(value: unknown): value is DealType {
  return value === "cash" || value === "inHouse" || value === "lender";
}

export async function saveDealFunding(
  dealId: string,
  formData: FormData,
): Promise<FundingState> {
  const access = await requireAdminActionPermission("sales:manage");
  if (!access.ok) return { ok: false, error: access.error };

  const rawType = formData.get("dealType");
  if (!isDealType(rawType)) {
    return { ok: false, error: "Pick cash, we finance, or an outside lender." };
  }

  const text = (key: string): string | null => {
    const value = formData.get(key);
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const funding: DealFunding = {
    type: rawType,
    lenderId: rawType === "lender" ? text("lenderId") : null,
    lenderOther: rawType === "lender" ? text("lenderOther") : null,
  };

  /*
    A lender deal with no lender named yet is allowed to save, on purpose.

    Refusing it forced the funding screen to invent a placeholder to get past
    this check, and the placeholder then counted as an answer: the lender
    question marked itself done and lender deals reached the packet with
    "Not chosen yet" on record. The funding choice and the lender's name are
    two separate answers on two separate screens, and the guide holds the
    deal at the lender step until the second one is given, by the step's own
    done check rather than by this action.
  */

  try {
    const supabase = await createClient();
    /*
      The filed bill of sale states how the buyer pays and the lender it
      names (owner's decision 10/02/2026; SOP Freeze): a change to either is
      refused until the bill of sale is voided and filed again. The same
      answer saved again goes through.
    */
    const saved = await mergeUnderBillOfSaleFreeze(supabase, dealId, (current) =>
      writeFunding(current, funding),
    );
    if (!saved.ok) return saved;
    if (!saved.merged.ok) throw new Error("Could not save that. Try again.");
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not save that. Try again.",
    };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { ok: true };
}

export async function saveSalePlate(
  dealId: string,
  formData: FormData,
): Promise<FundingState> {
  const access = await requireAdminActionPermission("sales:manage");
  if (!access.ok) return { ok: false, error: access.error };

  const raw = formData.get("plate");
  const plate = typeof raw === "string" ? raw.trim() : "";
  if (plate.length === 0) return { ok: false, error: "Enter the plate." };

  try {
    const supabase = await createClient();
    /*
      The plate against the plate the filed bill of sale PRINTED: a bill of
      sale filed with "no plate yet" lets the title step record the issued
      plate, and one that printed a plate refuses any other. A plate that
      changes is recorded with its time (plateRecordedAt), the desk's evidence
      that the title application went to the county.
    */
    const at = new Date().toISOString();
    const saved = await mergeUnderBillOfSaleFreeze(
      supabase,
      dealId,
      (current) => writePlate(current, plate, { at }),
      {
        checkPrinted: (filed, _current, after) =>
          platePrintedConflict(filed.printed?.plate, readPlate(after)) ? billOfSaleFrozen("plate") : null,
      },
    );
    if (!saved.ok) return saved;
    if (!saved.merged.ok) throw new Error("Could not save the plate. Try again.");
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not save the plate. Try again.",
    };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { ok: true };
}

/**
 * "No plate yet", as an answer.
 *
 * The plate step sits right after the registration answer so a plate on the
 * shelf prints on every document. When there is none yet, the step is still
 * answered: nothing is invented, and the handoff screen at the end takes the
 * plate webDEALER issues.
 */
export async function saveSalePlateLater(dealId: string): Promise<FundingState> {
  const access = await requireAdminActionPermission("sales:manage");
  if (!access.ok) return { ok: false, error: access.error };

  try {
    const supabase = await createClient();
    const merged = await casMergeStepData(supabase, dealId, (current) =>
      writePlateLater(current),
    );
    if (!merged.ok) throw new Error("Could not save that. Try again.");
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save that. Try again.",
    };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { ok: true };
}
