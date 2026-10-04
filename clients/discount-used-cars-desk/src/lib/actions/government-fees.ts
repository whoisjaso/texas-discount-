"use server";

import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import { filedBillOfSaleOn } from "@/lib/sales/filed-bill-of-sale";
import { casMergeStepData } from "@/lib/sales/step-data-write";
import { readSalvagePlan } from "@/lib/sales/salvage-plan";
import {
  GOVERNMENT_FEES_KEY,
  governmentFeesProblemSentence,
  parseGovernmentFeesInput,
  readGovernmentFees,
  type GovernmentFees,
  type GovernmentFeesInput,
  type GovernmentFeesProblem,
} from "@/lib/sales/government-fees";

/**
 * Record a sale's government fees as webDEALER computed them
 * (government-fees.ts): the title fee, the registration side, the inspection
 * program replacement fee and the license plate fee, for the buyer's county.
 *
 * The people who close sales or do the title work record them
 * (`sales:manage` or `paperwork:manage`, the filing's own roles). Refused,
 * never trimmed: a figure outside the cited lines comes back with its code.
 * Refused while a bill of sale is filed (the paper states these lines; void
 * it to change them), on a sale that is no longer open, and on a tow-away
 * sale, which registers nothing. The record and its activity event go
 * together: if the event cannot be written, the record is put back.
 */

export type GovernmentFeesResult =
  | { ok: true }
  | {
      ok: false;
      code: "notAllowed" | "notFound" | "saleClosed" | "voidFirst" | "towAway" | "unreadable" | "couldNotSave" | GovernmentFeesProblem["code"];
      error: string;
      problems?: GovernmentFeesProblem[];
    };

const VOID_FIRST =
  "The bill of sale is filed with the government fees it states. Void the bill of sale first, then record them again.";

export async function confirmGovernmentFeesAction(dealId: string, input: GovernmentFeesInput): Promise<GovernmentFeesResult> {
  const access = await requireAdminActionPermission(["sales:manage", "paperwork:manage"]);
  if (!access.ok) return { ok: false, code: "notAllowed", error: access.error };
  if (!dealId) return { ok: false, code: "notFound", error: "That sale could not be found." };

  const { figures, problems } = parseGovernmentFeesInput(input);
  if (problems.length > 0) {
    return { ok: false, code: problems[0].code, error: governmentFeesProblemSentence(problems[0]), problems };
  }

  const supabase = await createClient();
  try {
    const { data: deal, error } = await supabase.from("deals").select("status, step_data").eq("id", dealId).maybeSingle();
    if (error || !deal) return { ok: false, code: "notFound", error: "That sale could not be found." };
    const row = deal as { status?: unknown; step_data?: unknown };
    if (row.status !== "in_progress") {
      return { ok: false, code: "saleClosed", error: "This sale is closed. Its fees are the ones its paperwork states." };
    }
    if (readSalvagePlan(row.step_data).path === "towAway") {
      return { ok: false, code: "towAway", error: "A tow-away sale registers nothing, so it has no registration fees to record." };
    }
    if (await filedBillOfSaleOn(dealId)) return { ok: false, code: "voidFirst", error: VOID_FIRST };
  } catch {
    return { ok: false, code: "unreadable", error: "The sale could not be checked. Nothing changed." };
  }

  const name = access.member?.full_name?.trim() || access.user?.email || "A team member";
  const record: GovernmentFees = {
    ...figures,
    source: "webDEALER",
    confirmedAt: new Date().toISOString(),
    confirmedByName: name,
    confirmedById: access.member?.id ?? null,
  };

  const held: { previous: GovernmentFees | null } = { previous: null };
  const merged = await casMergeStepData(
    supabase,
    dealId,
    (current) => {
      const before = readGovernmentFees(current);
      held.previous = before.kind === "valid" ? before.fees : null;
      return { [GOVERNMENT_FEES_KEY]: { ...record } };
    },
    { writesFees: true },
  ).catch(() => ({ ok: false as const, error: "write-failed" as const }));
  if (!merged.ok) return { ok: false, code: "couldNotSave", error: "That could not be saved. Try again." };

  const putBack = async () => {
    await casMergeStepData(
      supabase,
      dealId,
      () => ({ [GOVERNMENT_FEES_KEY]: held.previous ? { ...held.previous } : null }),
      { writesFees: true },
    ).catch(() => null);
  };

  // A bill of sale filed in the same moment keeps the lines it printed.
  try {
    if (await filedBillOfSaleOn(dealId)) {
      await putBack();
      return { ok: false, code: "voidFirst", error: VOID_FIRST };
    }
  } catch {
    await putBack();
    return { ok: false, code: "unreadable", error: "The sale could not be checked. Nothing changed." };
  }

  const dollars = (value: number) => `$${value.toFixed(2)}`;
  const logged = await supabase
    .from("team_activity_events")
    .insert({
      actor_id: access.member?.id ?? null,
      event_type: "deal_government_fees_confirmed",
      entity_type: "deal",
      entity_id: dealId,
      body: `${name} recorded this sale's government fees from webDEALER for ${record.county} County: title ${dollars(record.titleFee)}, registration ${dollars(record.registrationFee)}, inspection program ${dollars(record.inspectionFee)}, license plate ${dollars(record.plateFee)}.`,
      metadata: { previous: held.previous, next: record },
    })
    .then(
      (result) => result as { error: unknown },
      (thrown) => ({ error: thrown }),
    );
  if (logged.error) {
    await putBack();
    return { ok: false, code: "couldNotSave", error: "The change could not be recorded, so nothing was saved. Try again." };
  }

  // No revalidatePath here, on purpose. Every screen that reads this record
  // (the sale, the guide, the paperwork review) is rendered per request and
  // fetched again by the navigation the form makes next. A revalidation made
  // the router re-render the screen being left while that navigation swapped
  // the chrome around it (this screen sits in the workspace, the review in
  // the sale corridor), and React removed the workspace twice: "Failed to
  // execute 'removeChild' on 'Node'", and a blank review. Walked at 390 on
  // 5190, 2026-10-03; gone without it.
  return { ok: true };
}
