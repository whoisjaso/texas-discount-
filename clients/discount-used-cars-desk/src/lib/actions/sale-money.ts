"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import { readMoney, writeMoney, type MoneyAnswers } from "@/lib/sales/money";
import { casMergeStepData } from "@/lib/sales/step-data-write";
import { legacyFeeCopy } from "@/lib/dealership-fees";
import { readDealFees, writeDealFees } from "@/lib/sales/fee-schedule";
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
import {
  BILL_OF_SALE_FROZEN_CODE,
  FREEZE_MESSAGES,
  billOfSaleStatement,
  frozenFieldsChanged,
  statementInputsChanged,
  type FreezeField,
} from "@/lib/sales/bill-of-sale-freeze";

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
  code?: typeof DOWN_PAYMENT_FROZEN_CODE | typeof PAID_TODAY_INVALID_CODE | typeof BILL_OF_SALE_FROZEN_CODE;
  /** On a billOfSaleFrozen refusal: what the filed bill of sale states that this would change. */
  field?: FreezeField | "generic";
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
      decision 10/01/2026; SOP Freeze). Looked up up front when this save
      carries a down payment at all; the refusal itself is decided below, on
      the blob as it stands at write time.

      The price and what it includes are frozen the same way (owner's
      decision 10/02/2026): the bill of sale states them. Their lookup is
      lazy, so the common save costs nothing: pass 1 compares the raw inputs
      and writes when nothing the bill of sale states moved; only when
      something did is the filed bill of sale looked up and pass 2 compares
      what the paper prints.
    */
    let frozen =
      patch.paidTodayAmount !== undefined ? await filedBillOfSaleOn(dealId) : undefined;
    /*
      A sale started before each sale kept its own fees gets its copy on its
      next money save (fee-schedule.ts), so a later change to the fees no
      longer moves it. Only fees the record vouches for are copied, and only
      onto a sale that still has none (legacyFeeCopy).
    */
    const legacyFees = await legacyFeeCopy(dealId);
    let copiedLegacyFees = false;
    const withFeeCopy = (blob: Record<string, unknown>, current: Record<string, unknown>) => {
      copiedLegacyFees = Boolean(legacyFees) && readDealFees(current).kind === "absent";
      return copiedLegacyFees && legacyFees ? writeDealFees(blob, legacyFees) : blob;
    };
    let refused: boolean = false;
    let frozenField: FreezeField | null = null;
    let needsLookup: boolean = false;
    let merged: Awaited<ReturnType<typeof casMergeStepData>> = { ok: false, error: "write-failed" };

    for (let pass = 0; pass < 2; pass += 1) {
      needsLookup = false;
      // Version-checked: the second answer merges onto whatever is truly
      // there at write time, so it cannot erase the first — or anything
      // else that landed since this screen's read.
      merged = await casMergeStepData(supabase, dealId, (current) => {
        const next: MoneyAnswers = { ...readMoney(current), ...patch };
        // Only a change to the figure is refused: the same down payment saved
        // again (every Next on this screen resends it) goes through.
        refused =
          frozen !== undefined &&
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
        // The price and its basis, as the filed bill of sale prints them.
        frozenField = null;
        if (statementInputsChanged(current, written)) {
          if (frozen === undefined) {
            needsLookup = true;
            return null;
          }
          if (frozen !== null) {
            const context = { advertised: frozen.advertised, rootType: frozen.type, fees: frozen.printed?.fees ?? null };
            const [field] = frozenFieldsChanged(
              billOfSaleStatement(current, context),
              billOfSaleStatement(written, context),
            );
            if (field) {
              frozenField = field;
              return null;
            }
          }
        }
        // A changed "down today" also changes the contract's down payment once
        // the contract holds one: the same dollars, one fact (SOP "Money").
        // Only on a buy here pay here deal, the one packet the contract is in.
        if (
          patch.paidTodayAmount !== undefined &&
          readFunding(current).type === "inHouse" &&
          hasFinancingDownPayment(current)
        ) {
          return withFeeCopy(withDownPayment(written, next.paidTodayAmount), current);
        }
        return withFeeCopy(written, current);
      }, { writesFees: legacyFees !== null });
      if (!needsLookup) break;
      frozen = await filedBillOfSaleOn(dealId);
    }
    if (refused) return { ok: false, error: DOWN_PAYMENT_FROZEN_MESSAGE, code: DOWN_PAYMENT_FROZEN_CODE };
    if (frozenField) {
      const field: FreezeField = frozenField;
      return { ok: false, code: BILL_OF_SALE_FROZEN_CODE, field, error: FREEZE_MESSAGES[field] };
    }
    if (!merged.ok) throw new Error(merged.error);
    /*
      The sale's first copy of its fees is on record like every other fee
      change: the current schedule's, written once, by whom and when. Best
      effort: the copy is the schedule's own (the database refuses any
      other), so a log that fails loses no figure.
    */
    if (copiedLegacyFees && legacyFees) {
      const name = access.member?.full_name?.trim() || access.user?.email || "A team member";
      await supabase
        .from("team_activity_events")
        .insert({
          actor_id: access.member?.id ?? null,
          event_type: "deal_fees_copied",
          entity_type: "deal",
          entity_id: dealId,
          body: `${name} saved the money on a sale started before each sale kept its own fees; it now keeps today's (documentary fee ${legacyFees.docFee === null ? "not set" : `$${legacyFees.docFee.toFixed(2)}`}).`,
          metadata: { schedule_version: legacyFees.scheduleVersion, doc_fee: legacyFees.docFee },
        })
        .then(
          () => null,
          () => null,
        );
    }
  } catch {
    return { ok: false, error: "Could not save that. Try again." };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { ok: true };
}
