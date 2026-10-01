"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  languageConfirmationPatch,
  type DealLanguage,
} from "@/lib/sales/deal-language";
import { casMergeStepData } from "@/lib/sales/step-data-write";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";

/**
 * Answer, for a deal that predates the question, what language the sale is
 * conducted in. New deals answer it at StartSale; this exists so a legacy
 * deal's guide can surface the same question as a step.
 *
 * The write merges its own key into `step_data` — the same discipline as
 * funding, money and the licence — so it cannot erase a photograph that
 * landed a moment earlier, and they cannot erase it: every writer in this
 * corridor re-reads the blob and touches only its own key.
 */
export async function setDealLanguage(
  dealId: string,
  language: DealLanguage,
): Promise<{ ok: boolean; error?: string }> {
  if (language !== "en" && language !== "es") {
    return { ok: false, error: "notALanguage" };
  }

  const gate = await requireAdminActionPermission("sales:manage");
  if (!gate.ok) return { ok: false, error: "unauthorized" };

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, error: "unauthorized" };

    const patch = languageConfirmationPatch(language, user.id);

    // The version-checked merge every step writer uses: this answer cannot
    // erase a licence upload landing between a read and a write, and
    // nothing can erase it. The helper owns the one preview-mode fallback.
    const merged = await casMergeStepData(
      supabase,
      dealId,
      (current) => ({ ...current, ...patch }),
      { language },
    );
    if (!merged.ok) throw new Error(merged.error);
  } catch {
    return { ok: false, error: "couldNotSave" };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { ok: true };
}
