"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import { readMoney, writeMoney, type MoneyAnswers } from "@/lib/sales/money";
import { casMergeStepData } from "@/lib/sales/step-data-write";

/**
 * What the price meant, and whether the registration is paid.
 *
 * Two answers, saved one at a time as they are given, because the screen that
 * asks them shows a running total and a person changes their mind about the
 * first one after seeing what it does to the second.
 *
 * Deliberately not a document write. Nothing is signed here: this is the deal
 * saying what its own numbers mean, and the bill of sale and the 130-U read it
 * when they are filed.
 */

export type MoneyState = { ok: boolean; error?: string };

export async function saveSaleMoney(
  dealId: string,
  patch: Partial<MoneyAnswers>,
): Promise<MoneyState> {
  const access = await requireAdminActionPermission("sales:manage");
  if (!access.ok) return { ok: false, error: access.error };

  try {
    const supabase = await createClient();
    // Version-checked: the second answer merges onto whatever is truly
    // there at write time, so it cannot erase the first — or anything
    // else that landed since this screen's read.
    const merged = await casMergeStepData(supabase, dealId, (current) => {
      const next: MoneyAnswers = { ...readMoney(current), ...patch };
      return writeMoney(current, next);
    });
    if (!merged.ok) throw new Error(merged.error);
  } catch {
    return { ok: false, error: "Could not save that. Try again." };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { ok: true };
}
