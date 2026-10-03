import type { SupabaseClient } from "@supabase/supabase-js";
import { casMergeStepData, type StepDataBlob, type StepDataMergeResult } from "@/lib/sales/step-data-write";
import { filedBillOfSaleOn, type FiledBillOfSale } from "@/lib/sales/filed-bill-of-sale";
import {
  billOfSaleFrozen,
  billOfSaleStatement,
  frozenFieldsChanged,
  heldByPowerOfAttorney,
  statementInputsChanged,
  type BillOfSaleFrozenRefusal,
} from "@/lib/sales/bill-of-sale-freeze";
import { currentCopy, readDealAgreements } from "@/lib/sales/filed-documents";
import { createAdminDataClient } from "@/lib/supabase/admin-data";

/**
 * A step-data write that the filed bill of sale holds (owner's decision
 * 10/02/2026; SOP Freeze), for the writers with no pinned shape of their own:
 * the funding, the lender, the plate and the buyer's confirmed details.
 *
 * Two passes of the one version-checked merge. Pass 1 builds the patch and
 * compares the statement's raw inputs: nothing the bill of sale could state
 * moved, so it writes with no lookup at all. When something did move, the
 * filed bill of sale is looked up (failing closed: a lookup that throws
 * refuses the save) and pass 2 compares what the paper prints, before and
 * after. A refusal writes nothing.
 *
 * The lookup sits between the two passes, so a bill of sale filed in that
 * instant is missed once; the filing's own `figuresChanged` check and the
 * packet's re-file rule catch what that leaves.
 */
export type FrozenMergeOptions = {
  /**
   * A check against what the filed copy PRINTED rather than against the deal
   * before the write (the plate). Returns the refusal, or null.
   */
  checkPrinted?: (filed: FiledBillOfSale, current: StepDataBlob, after: StepDataBlob) => BillOfSaleFrozenRefusal | null;
  /**
   * Hold the buyer's name and address while a power of attorney is filed: it
   * prints them and is signed in ink, so voiding the bill of sale does not
   * release them.
   */
  holdForPowerOfAttorney?: boolean;
};

export type FrozenMergeResult = { ok: true; merged: StepDataMergeResult } | BillOfSaleFrozenRefusal;

export async function mergeUnderBillOfSaleFreeze(
  supabase: SupabaseClient,
  dealId: string,
  build: (current: StepDataBlob) => StepDataBlob | null,
  options: FrozenMergeOptions = {},
): Promise<FrozenMergeResult> {
  let filed: FiledBillOfSale | null | undefined;
  let powerOfAttorney: boolean | undefined;
  let refusal: BillOfSaleFrozenRefusal | null = null;
  let needsLookup = false;
  let merged: StepDataMergeResult = { ok: false, error: "write-failed" };

  for (let pass = 0; pass < 2; pass += 1) {
    needsLookup = false;
    refusal = null;
    merged = await casMergeStepData(supabase, dealId, (current) => {
      const patch = build(current);
      if (patch === null) return null;
      const after = { ...current, ...patch };
      if (!statementInputsChanged(current, after)) return patch;
      if (filed === undefined) {
        needsLookup = true;
        return null;
      }
      const statementBefore = billOfSaleStatement(current, { advertised: filed?.advertised ?? null, rootType: filed?.type });
      const statementAfter = billOfSaleStatement(after, { advertised: filed?.advertised ?? null, rootType: filed?.type });
      const fields = frozenFieldsChanged(statementBefore, statementAfter);
      if (powerOfAttorney) {
        const held = fields.find((field) => field === "buyerName" || field === "buyerAddress");
        if (held === "buyerName" || held === "buyerAddress") {
          refusal = heldByPowerOfAttorney(held);
          return null;
        }
      }
      if (filed === null) return patch;
      const printed = options.checkPrinted?.(filed, current, after) ?? null;
      if (printed) {
        refusal = printed;
        return null;
      }
      if (fields.length > 0) {
        refusal = billOfSaleFrozen(fields[0]);
        return null;
      }
      return patch;
    });
    if (!needsLookup) break;
    filed = await filedBillOfSaleOn(dealId);
    if (options.holdForPowerOfAttorney) {
      const rows = await readDealAgreements(await createAdminDataClient(), dealId);
      powerOfAttorney = Boolean(currentCopy(rows, "powerOfAttorney"));
    }
  }

  if (refusal) return refusal;
  return { ok: true, merged };
}
