"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import { businessDateToday } from "@/lib/documents/us-date";
import { RULEBOOK_AS_OF, centsAsDollars } from "@/lib/legal/texas-dealer-fees";
import {
  FEE_PROBLEM_CODES,
  dealFeesFromSchedule,
  feeProblemSentence,
  parseFeeScheduleInput,
  readDealFees,
  scheduleToJson,
  validateFeeSchedule,
  writeDealFees,
  type FeeProblem,
  type FeeProblemCode,
  type DealFees,
  type FeeScheduleInput,
} from "@/lib/sales/fee-schedule";
import { getDealerFeeSchedule } from "@/lib/dealership-fees";
import { filedBillOfSaleOn } from "@/lib/sales/filed-bill-of-sale";
import { casMergeStepData } from "@/lib/sales/step-data-write";

/**
 * Saving the dealership's fees, and applying today's fees to one open sale.
 *
 * The save is the owner's alone (`admin:all`; managers hold team:manage but
 * not this). It goes through the database function
 * `save_dealer_fee_schedule` under the owner's own session, which checks the
 * owner again, compares the version the screen read (a stale screen is
 * refused, never overwrites), validates with the same codes, writes the row
 * and the change log and the activity event in one transaction. The preview
 * mock runs the same validator in place of the database.
 *
 * Refused, never trimmed: an over-limit figure comes back with its code and
 * the citation, for the screen to say in its own language.
 */

export type DealerFeesErrorCode = FeeProblemCode | "notOwner" | "feesStale" | "feeSaveFailed";

export type DealerFeesResult =
  | { ok: true; version: number }
  | {
      ok: false;
      code: DealerFeesErrorCode;
      error: string;
      params?: Record<string, string | number>;
      /** Every problem the answers have, for the screen to show beside each. */
      problems?: FeeProblem[];
    };

const ACTION_SENTENCES: Record<"notOwner" | "feesStale" | "feeSaveFailed", string> = {
  notOwner: "Only the owner can set the dealership's fees.",
  feesStale: "Someone saved the fees a moment ago. Look at them again before saving.",
  feeSaveFailed: "The fees could not be saved. Try again.",
};

function refusal(code: DealerFeesErrorCode, problems?: FeeProblem[], params?: Record<string, string | number>): DealerFeesResult {
  const error = (FEE_PROBLEM_CODES as readonly string[]).includes(code)
    ? feeProblemSentence({ code: code as FeeProblemCode, field: "", params })
    : ACTION_SENTENCES[code as "notOwner" | "feesStale" | "feeSaveFailed"];
  return { ok: false, code, error, ...(params ? { params } : {}), ...(problems ? { problems } : {}) };
}

export async function saveDealerFeesAction(
  input: FeeScheduleInput,
  expectedVersion: number,
  /**
   * The screen the save came from. Only checked for shape: the change log's
   * source is the server's own answer (below), never the browser's.
   */
  screen: "onboarding" | "settings",
): Promise<DealerFeesResult> {
  const access = await requireAdminActionPermission(["admin:all"]);
  if (!access.ok) return refusal("notOwner");
  if (screen !== "onboarding" && screen !== "settings") return refusal("feeSaveFailed");
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return refusal("feesStale");
  /*
    Where the save happened, as the record states it: at first sign-in while
    the owner's onboarding is not finished, under Your Fees after. Read off
    the owner's own roster row, so a request cannot choose its label.
  */
  const source: "onboarding" | "settings" = access.member?.onboarding_completed_at ? "settings" : "onboarding";

  const today = businessDateToday();
  const { fields, problems: typed } = parseFeeScheduleInput(input, today);
  const seen = new Set<string>();
  const problems = [...typed, ...validateFeeSchedule(fields, { today })].filter((problem) => {
    const key = `${problem.code}:${problem.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (problems.length > 0) return refusal(problems[0].code, problems, problems[0].params);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_dealer_fee_schedule", {
      p_expected_version: expectedVersion,
      p_next: { ...scheduleToJson(fields), rulebookAsOf: RULEBOOK_AS_OF },
      p_source: source,
    });
    if (error) {
      const message = String((error as { message?: unknown }).message ?? "");
      if (/\bstale\b/.test(message)) return refusal("feesStale");
      if (/\bforbidden\b/.test(message)) return refusal("notOwner");
      const code = FEE_PROBLEM_CODES.find((candidate) => new RegExp(`\\b${candidate}\\b`).test(message));
      if (code) return refusal(code);
      return refusal("feeSaveFailed");
    }
    revalidatePath("/admin", "layout");
    return { ok: true, version: Number(data) || expectedVersion + 1 };
  } catch {
    return refusal("feeSaveFailed");
  }
}

export type ApplyFeesResult =
  | { ok: true }
  | {
      ok: false;
      code: "voidFirst" | "feeSettingsUnreadable" | "couldNotSave" | "notAllowed" | "saleClosed";
      error: string;
    };

const VOID_FIRST =
  "The bill of sale is filed with the fees it states. Void the bill of sale first, then apply today's fees.";

/**
 * Apply today's fees to one open sale: the sale's copy is rewritten from the
 * current schedule and the change is logged on the sale. Offered where a
 * sale's copy is above today's limit or higher than today's fee, older than
 * the owner's latest save, or no longer what its record says. Refused while
 * a bill of sale is current (the paper states its fees, and voiding it is the
 * way to change them) and on a sale that is no longer open.
 *
 * The copy and its record go together: if the activity event cannot be
 * written, or a bill of sale was filed in the same moment, the copy is put
 * back as it was and nothing is reported as applied.
 */
export async function applyCurrentFeesToSaleAction(dealId: string): Promise<ApplyFeesResult> {
  const access = await requireAdminActionPermission("sales:manage");
  if (!access.ok) return { ok: false, code: "notAllowed", error: access.error };
  if (!dealId) return { ok: false, code: "couldNotSave", error: "That sale could not be found." };

  const supabase = await createClient();
  try {
    const { data: deal, error: dealError } = await supabase.from("deals").select("status").eq("id", dealId).maybeSingle();
    if (dealError || !deal) return { ok: false, code: "couldNotSave", error: "That sale could not be found." };
    const status = (deal as { status?: unknown }).status;
    if (status !== "in_progress") {
      return { ok: false, code: "saleClosed", error: "This sale is closed. Its fees are the ones its paperwork states." };
    }
    if (await filedBillOfSaleOn(dealId)) return { ok: false, code: "voidFirst", error: VOID_FIRST };
  } catch {
    return { ok: false, code: "feeSettingsUnreadable", error: "The filed documents could not be checked. Nothing changed." };
  }

  const read = await getDealerFeeSchedule();
  if (!read.ok) return { ok: false, code: "feeSettingsUnreadable", error: "The fee settings could not be read. Nothing changed." };
  const fees = dealFeesFromSchedule(read.schedule);

  // What the copy was, read inside the write (the fresh state), to put back.
  const held: { previous: DealFees | null; before: number | null | undefined } = { previous: null, before: undefined };
  try {
    const merged = await casMergeStepData(
      supabase,
      dealId,
      (current) => {
        const copy = readDealFees(current);
        held.previous = copy.kind === "valid" ? copy.fees : null;
        held.before = copy.kind === "valid" ? copy.fees.docFee : undefined;
        return { fees: writeDealFees(current, fees).fees as Record<string, unknown> };
      },
      { writesFees: true },
    );
    if (!merged.ok) return { ok: false, code: "couldNotSave", error: "That could not be saved. Try again." };
  } catch {
    return { ok: false, code: "couldNotSave", error: "That could not be saved. Try again." };
  }

  /** Put the sale's copy back as it was (or as none), when what follows the write fails. */
  const putBack = async () => {
    await casMergeStepData(
      supabase,
      dealId,
      (current) => (held.previous ? { fees: writeDealFees(current, held.previous).fees as Record<string, unknown> } : { fees: null }),
      { writesFees: true },
    ).catch(() => null);
  };

  // A bill of sale filed in the same moment keeps the fees it printed.
  try {
    if (await filedBillOfSaleOn(dealId)) {
      await putBack();
      return { ok: false, code: "voidFirst", error: VOID_FIRST };
    }
  } catch {
    await putBack();
    return { ok: false, code: "feeSettingsUnreadable", error: "The filed documents could not be checked. Nothing changed." };
  }

  const name = access.member?.full_name?.trim() || access.user?.email || "A team member";
  const said = (value: number | null | undefined) =>
    value === null || value === undefined ? "not set" : centsAsDollars(Math.round(value * 100));
  const logged = await supabase
    .from("team_activity_events")
    .insert({
      actor_id: access.member?.id ?? null,
      event_type: "deal_fees_applied",
      entity_type: "deal",
      entity_id: dealId,
      body: `${name} applied today's fees to this sale: documentary fee ${said(fees.docFee)} (was ${said(held.before)}).`,
      metadata: { schedule_version: fees.scheduleVersion, previous_doc_fee: held.before ?? null, doc_fee: fees.docFee },
    })
    .then(
      (result) => result as { error: unknown },
      (thrown) => ({ error: thrown }),
    );
  if (logged.error) {
    await putBack();
    return { ok: false, code: "couldNotSave", error: "The change could not be recorded, so nothing was applied. Try again." };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { ok: true };
}
