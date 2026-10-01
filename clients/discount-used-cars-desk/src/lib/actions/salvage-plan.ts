"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import { casMergeStepData } from "@/lib/sales/step-data-write";
import {
  SALVAGE_PLAN_KEY,
  isSalvagePath,
  readSalvagePlan,
  type SalvagePath,
} from "@/lib/sales/salvage-plan";

/**
 * Recording what happens with a salvage title on this sale.
 *
 * One answer, three values, and one rule about changing it: once any
 * document on the sale is finalized, the path is frozen. The tow-away
 * packet and the ordinary packet share no sheet, so switching after a
 * filing would drop a signed document from the required list and, switched
 * back, would reattach it as already done. Answering for the first time is
 * always allowed; "not sure yet" may always become a decision, because an
 * undecided sale has no documents to drop.
 */

export type SalvagePathState = { ok: true; path: SalvagePath } | { ok: false; error: string };

export async function saveSalvagePath(dealId: string, rawPath: string): Promise<SalvagePathState> {
  const access = await requireAdminActionPermission("sales:manage");
  if (!access.ok) return { ok: false, error: access.error };
  if (!dealId) return { ok: false, error: "No sale was named." };
  if (!isSalvagePath(rawPath)) return { ok: false, error: "That is not one of the three answers." };
  const path: SalvagePath = rawPath;

  try {
    const supabase = await createClient();

    const { data: finalized } = await supabase
      .from("document_agreements")
      .select("document_type")
      .eq("deal_id", dealId)
      .not("finalized_at", "is", null);
    const filed = ((finalized ?? []) as Array<{ document_type: string | null }>)
      .map((row) => row.document_type)
      .filter((type): type is string => Boolean(type));

    let refusal: string | null = null;
    const merged = await casMergeStepData(supabase, dealId, (current) => {
      const stored = readSalvagePlan(current);
      const decided = stored.path === "rebuild" || stored.path === "towAway";
      if (decided && stored.path !== path && filed.length > 0) {
        refusal = `This cannot change now: ${filed.join(", ")} already filed on the other path. Void that document first.`;
        return null;
      }
      refusal = null;
      return { [SALVAGE_PLAN_KEY]: { path, decidedAt: new Date().toISOString() } };
    });
    if (refusal) return { ok: false, error: refusal };
    if (!merged.ok) throw new Error("Could not save that. Try again.");

    revalidatePath(`/admin/sales/${dealId}`);
    revalidatePath("/admin/sales");
    return { ok: true, path };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save that. Try again." };
  }
}
