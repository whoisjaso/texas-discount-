"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import { readMoney, writeMoney, type MoneyAnswers } from "@/lib/sales/money";
import { casMergeStepData } from "@/lib/sales/step-data-write";
import { hasFinancingDownPayment, withDownPayment } from "@/lib/sales/paperwork";
import { readFunding } from "@/lib/sales/deal-type";
import {
  DOWN_PAYMENT_FROZEN_CODE,
  DOWN_PAYMENT_FROZEN_MESSAGE,
  PAID_TODAY_INVALID_CODE,
  PAID_TODAY_INVALID_MESSAGE,
  canonicalPaidToday,
  downPaymentChanges,
} from "@/lib/sales/down-payment-freeze";
import { filedBillOfSaleOn } from "@/lib/sales/filed-bill-of-sale";

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

export type MoneyState = {
  ok: boolean;
  error?: string;
  code?: typeof DOWN_PAYMENT_FROZEN_CODE | typeof PAID_TODAY_INVALID_CODE;
};

export async function saveSaleMoney(
  dealId: string,
  typedPatch: Partial<MoneyAnswers>,
): Promise<MoneyState> {
  const access = await requireAdminActionPermission("sales:manage");
  if (!access.ok) return { ok: false, error: access.error };

  /*
    The paid-today figure is stored as one plain figure ("1,500" as "1500"),
    or refused when it is not a dollar amount of zero or more: the contract's
    payment, its printed itemisation and the bill of sale's balance must all
    read the same text (down-payment-freeze.ts, canonicalPaidToday).
  */
  let patch = typedPatch;
  if (typedPatch.paidTodayAmount !== undefined) {
    const paidTodayAmount = canonicalPaidToday(typedPatch.paidTodayAmount);
    if (paidTodayAmount === null) {
      return { ok: false, error: PAID_TODAY_INVALID_MESSAGE, code: PAID_TODAY_INVALID_CODE };
    }
    patch = { ...typedPatch, paidTodayAmount };
  }

  try {
    const supabase = await createClient();

    /*
      The down payment is frozen once the bill of sale is filed (owner's
      decision 10/01/2026; SOP Freeze). Looked up only when this save carries
      a down payment at all; the refusal itself is decided below, on the
      blob as it stands at write time.
    */
    const frozen =
      patch.paidTodayAmount !== undefined ? await filedBillOfSaleOn(dealId) : null;
    let refused: boolean = false;

    // Version-checked: the second answer merges onto whatever is truly
    // there at write time, so it cannot erase the first — or anything
    // else that landed since this screen's read.
    const merged = await casMergeStepData(supabase, dealId, (current) => {
      const next: MoneyAnswers = { ...readMoney(current), ...patch };
      // Only a change to the figure is refused: the same down payment saved
      // again (every Next on this screen resends it) goes through.
      refused =
        frozen !== null &&
        patch.paidTodayAmount !== undefined &&
        downPaymentChanges({
          advertised: frozen.advertised,
          stepData: current,
          money: next,
          to: patch.paidTodayAmount,
        });
      if (refused) return null;
      const written = writeMoney(current, next);
      // A changed "down today" also changes the contract's down payment once
      // the contract holds one: the same dollars, one fact (SOP "Money").
      // Only on a buy here pay here deal, the one packet the contract is in.
      if (
        patch.paidTodayAmount !== undefined &&
        readFunding(current).type === "inHouse" &&
        hasFinancingDownPayment(current)
      ) {
        return withDownPayment(written, next.paidTodayAmount);
      }
      return written;
    });
    if (refused) return { ok: false, error: DOWN_PAYMENT_FROZEN_MESSAGE, code: DOWN_PAYMENT_FROZEN_CODE };
    if (!merged.ok) throw new Error(merged.error);
  } catch {
    return { ok: false, error: "Could not save that. Try again." };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { ok: true };
}
