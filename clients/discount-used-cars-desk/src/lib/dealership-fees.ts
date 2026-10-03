import "server-only";

import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { filedBillOfSaleOn } from "@/lib/sales/filed-bill-of-sale";
import { readSalvagePlan } from "@/lib/sales/salvage-plan";
import {
  configFeeSchedule,
  configFeeLines,
  dealFeeLines,
  dealFeesFromSchedule,
  dealFeesGovernmentLinesAreDesks,
  dealFeesMatchRecord,
  docFeeLimitProblem,
  feeLinesOf,
  postedDealerChargesProblem,
  readDealFees,
  scheduleFromRow,
  withGovernmentFees,
  type DealerChargesProblem,
  type DealFeeDisplay,
  type DealFees,
  type FeeSchedule,
  type FeeScheduleFields,
  type OcccDocFeeFiling,
} from "@/lib/sales/fee-schedule";

/**
 * The fee schedule and each sale's fees, read on the server.
 *
 * The schedule is the owner's saved row (`dealer_fee_schedule`), or the
 * config seed until one is saved. Read through the admin data client, the
 * one every sale screen reads with: the operator's own session in
 * production, the shared preview store in preview. A read that errors is
 * reported, never guessed: Start A Sale and filing refuse on it.
 *
 * A database the migration has not reached (no table yet) reads as "no
 * owner schedule", so the desk keeps working on the config seed exactly as
 * before; the owner's save then fails until the migration is applied
 * (README, Owner's manual steps).
 */

export type ScheduleRead = { ok: true; schedule: FeeSchedule; tableMissing?: boolean } | { ok: false };

const MISSING_TABLE = new Set(["PGRST205", "42P01"]);

export async function getDealerFeeSchedule(): Promise<ScheduleRead> {
  try {
    const supabase = await createAdminDataClient();
    const { data, error } = await supabase.from("dealer_fee_schedule").select("*").eq("id", 1).maybeSingle();
    if (error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === "string" && MISSING_TABLE.has(code)) return { ok: true, schedule: configFeeSchedule(), tableMissing: true };
      return { ok: false };
    }
    if (!data) return { ok: true, schedule: configFeeSchedule() };
    return { ok: true, schedule: scheduleFromRow(data as Record<string, unknown>) };
  } catch {
    return { ok: false };
  }
}

export type FeeChange = {
  id: string;
  changedAt: string;
  changedByName: string;
  source: "onboarding" | "settings";
  previous: Record<string, unknown> | null;
  next: Record<string, unknown>;
  rulebookAsOf: string;
};

/** The change log, newest first. Owner only by row level security. */
export async function getDealerFeeChanges(limit = 50): Promise<{ ok: true; changes: FeeChange[] } | { ok: false }> {
  try {
    const supabase = await createAdminDataClient();
    const { data, error } = await supabase
      .from("dealer_fee_schedule_changes")
      .select("id, changed_at, changed_by_name, source, previous, next, rulebook_as_of")
      .order("changed_at", { ascending: false })
      .limit(limit);
    if (error) return { ok: false };
    const changes = ((data ?? []) as Array<Record<string, unknown>>)
      .map((row) => ({
        id: String(row.id ?? ""),
        changedAt: String(row.changed_at ?? ""),
        changedByName: String(row.changed_by_name ?? ""),
        source: row.source === "settings" ? ("settings" as const) : ("onboarding" as const),
        previous: row.previous && typeof row.previous === "object" ? (row.previous as Record<string, unknown>) : null,
        next: row.next && typeof row.next === "object" ? (row.next as Record<string, unknown>) : {},
        rulebookAsOf: String(row.rulebook_as_of ?? "").slice(0, 10),
      }))
      .sort((a, b) => (a.changedAt < b.changedAt ? 1 : a.changedAt > b.changedAt ? -1 : 0));
    return { ok: true, changes };
  } catch {
    return { ok: false };
  }
}

/**
 * What a saved version said about the doc fee: the change log's `next` for
 * an owner version (through `dealer_fee_record`, which the roles that file
 * may read), the config seed for version 0. Null when no such version was
 * ever saved.
 */
export async function dealerFeeRecord(
  version: number,
): Promise<{ ok: true; record: Pick<FeeScheduleFields, "docFeeCents" | "occcFiling"> | null } | { ok: false }> {
  if (version === 0) {
    const seed = configFeeSchedule();
    return { ok: true, record: { docFeeCents: seed.docFeeCents, occcFiling: seed.occcFiling } };
  }
  try {
    const supabase = await createAdminDataClient();
    const { data, error } = await supabase.rpc("dealer_fee_record", { p_version: version });
    if (error) return { ok: false };
    if (!data || typeof data !== "object") return { ok: true, record: null };
    const held = data as Record<string, unknown>;
    const filing = held.occcFiling && typeof held.occcFiling === "object" ? (held.occcFiling as OcccDocFeeFiling) : null;
    const doc = held.docFeeCents;
    return {
      ok: true,
      record: { docFeeCents: typeof doc === "number" ? doc : doc === null || doc === undefined ? null : Number(doc), occcFiling: filing },
    };
  } catch {
    return { ok: false };
  }
}

/**
 * Whether this is the tow-away salvage sale, which registers nothing: its
 * fee lines carry no registration fee, so the out-the-door split, the total
 * and the salvage bill of sale agree.
 */
export function registersNothing(sale: { stepData: unknown; vehicle?: { titleStatus?: string | null } | null }): boolean {
  return sale.vehicle?.titleStatus === "salvage_unrebuilt" && readSalvagePlan(sale.stepData).path === "towAway";
}

/**
 * A sale's fee lines from its resolved fees:
 *
 *   - the sale's government fees confirmed from webDEALER in place of the
 *     desk's title and registration defaults, with the inspection program
 *     fee and the plate fee on lines of their own (government-fees.ts);
 *   - no registration line on the tow-away sale, which registers nothing;
 *   - except where the fees are what an older filed bill of sale printed
 *     (`filedBillOfSaleOn`), which keep that paper's own figures.
 */
export function saleFeeLines(
  resolved: Pick<ResolvedFees, "fees" | "from">,
  sale: { stepData: unknown; vehicle?: { titleStatus?: string | null } | null },
): DealFeeDisplay {
  if (resolved.from === "printed") return dealFeeLines(resolved.fees);
  if (registersNothing(sale)) return dealFeeLines(resolved.fees, { noRegistration: true });
  return withGovernmentFees(dealFeeLines(resolved.fees), sale.stepData);
}

export type ResolvedFees = {
  fees: DealFees;
  /**
   * Where they came from: the sale's own copy, the current schedule (no copy,
   * or a copy taken while the doc fee was unset), or the fees a legacy sale's
   * filed bill of sale printed.
   */
  from: "copy" | "schedule" | "printed";
  /** A copy that is not one the desk could have written (filing refuses it). */
  malformed: boolean;
};

/**
 * A sale's fees, in this order: its own valid copy; the current schedule
 * when the copy's doc fee is unset (an unset fee was never quoted to
 * anyone); on a sale started before copies existed, what its current filed
 * bill of sale printed; otherwise the current schedule.
 */
export function resolveDealFees(
  stepData: unknown,
  schedule: FeeSchedule,
  printed?: { titleFee: number; docFee: number; registrationFee: number } | null,
  now: Date = new Date(),
): ResolvedFees {
  const read = readDealFees(stepData);
  if (read.kind === "valid" && read.fees.docFee !== null) return { fees: read.fees, from: "copy", malformed: false };
  if (read.kind === "absent" && printed) {
    const fromSchedule = dealFeesFromSchedule(schedule, now);
    return {
      fees: { ...fromSchedule, titleFee: printed.titleFee, docFee: printed.docFee, registrationFee: printed.registrationFee },
      from: "printed",
      malformed: false,
    };
  }
  return { fees: dealFeesFromSchedule(schedule, now), from: "schedule", malformed: read.kind === "malformed" };
}

export type LoadedDealFees =
  | { ok: true; resolved: ResolvedFees; schedule: FeeSchedule; lines: DealFeeDisplay }
  | { ok: false };

/** A sale's fees with everything they are resolved from, read now. Fails closed. */
export async function loadDealFees(sale: {
  id: string;
  stepData: unknown;
  vehicle?: { titleStatus?: string | null } | null;
}): Promise<LoadedDealFees> {
  const read = await getDealerFeeSchedule();
  if (!read.ok) return { ok: false };
  let printed: { titleFee: number; docFee: number; registrationFee: number } | null = null;
  if (readDealFees(sale.stepData).kind === "absent") {
    try {
      printed = (await filedBillOfSaleOn(sale.id))?.printed?.fees ?? null;
    } catch {
      return { ok: false };
    }
  }
  const resolved = resolveDealFees(sale.stepData, read.schedule, printed);
  return {
    ok: true,
    resolved,
    schedule: read.schedule,
    lines: saleFeeLines(resolved, sale),
  };
}

/**
 * The fee lines a screen shows and computes with. A read that fails falls
 * back to what the sale itself holds (its copy, else the config), because a
 * screen is not a filing: the filing re-reads and refuses.
 */
export async function dealFeeLinesForSale(sale: {
  id: string;
  stepData: unknown;
  vehicle?: { titleStatus?: string | null } | null;
}): Promise<DealFeeDisplay> {
  const loaded = await loadDealFees(sale).catch(() => ({ ok: false }) as const);
  if (loaded.ok) return loaded.lines;
  const fallback = feeLinesOf(sale.stepData, configFeeLines());
  return registersNothing(sale) ? { ...fallback, registrationFee: 0 } : fallback;
}

/**
 * Whether a sale's copy is what the record says its version saved. Only a
 * copy is checked: fees resolved from the schedule or a printed bill of sale
 * are the record's own.
 */
export async function verifyDealFeesAgainstLog(resolved: ResolvedFees): Promise<"ok" | "tampered" | "unreadable"> {
  if (resolved.malformed) return "tampered";
  if (resolved.from !== "copy") return "ok";
  const record = await dealerFeeRecord(resolved.fees.scheduleVersion);
  if (!record.ok) return "unreadable";
  return dealFeesMatchRecord(resolved.fees, record.record) ? "ok" : "tampered";
}

/**
 * The copy a sale started before copies existed should take now, or null.
 * Only fees the record can vouch for are copied: the current schedule's,
 * when no bill of sale is filed. While one is filed the sale keeps resolving
 * to what it printed (and its money is frozen anyway). Best effort: a read
 * that fails copies nothing, and every reader resolves the same fees without
 * a copy.
 */
export async function legacyFeeCopy(dealId: string): Promise<DealFees | null> {
  try {
    const supabase = await createAdminDataClient();
    const { data, error } = await supabase.from("deals").select("step_data").eq("id", dealId).maybeSingle();
    if (error || !data) return null;
    const stepData = (data as { step_data?: unknown }).step_data;
    if (readDealFees(stepData).kind !== "absent") return null;
    const read = await getDealerFeeSchedule();
    if (!read.ok) return null;
    const filed = await filedBillOfSaleOn(dealId);
    if (filed) return null;
    return dealFeesFromSchedule(read.schedule);
  } catch {
    return null;
  }
}

export type FilingFees =
  | {
      ok: true;
      resolved: ResolvedFees;
      schedule: FeeSchedule;
      /**
       * Whether the documentary fee is decided by the owner's saved schedule
       * or the sale's own copy. False is the config-only case, where the
       * config's facts decide exactly as they always have.
       */
      fromSaved: boolean;
    }
  | { ok: false };

/**
 * The fees a filing is checked against, read before anything else on the
 * filing: the current schedule and the sale's own fees resolved against it.
 * Fails closed: any read that errors refuses the filing.
 */
export async function filingFees(dealId: string): Promise<FilingFees> {
  const read = await getDealerFeeSchedule();
  if (!read.ok) return { ok: false };
  try {
    const supabase = await createAdminDataClient();
    const { data, error } = await supabase.from("deals").select("step_data").eq("id", dealId).maybeSingle();
    if (error) return { ok: false };
    const stepData = (data as { step_data?: unknown } | null)?.step_data ?? null;
    let printed: { titleFee: number; docFee: number; registrationFee: number } | null = null;
    if (readDealFees(stepData).kind === "absent") printed = (await filedBillOfSaleOn(dealId))?.printed?.fees ?? null;
    const resolved = resolveDealFees(stepData, read.schedule, printed);
    return {
      ok: true,
      resolved,
      schedule: read.schedule,
      fromSaved: read.schedule.source === "owner" || resolved.from === "copy",
    };
  } catch {
    return { ok: false };
  }
}

/**
 * The dealer-charges refusal at filing, or null (rulebook section 5.4), after
 * every existing refusal: the sale's copy is the one the record says it is;
 * its documentary fee is within the Texas limit under the law and the OCCC
 * record as they stand now; and the posted document carries no other dealer
 * fee, the sale's own doc fee and the state's title fee. Never lifted by
 * DESK_ALLOW_UNSET_FACTS, and nothing is trimmed.
 */
export async function dealerChargesBlockedReason(
  context: Extract<FilingFees, { ok: true }>,
  formData: Record<string, unknown>,
): Promise<DealerChargesProblem | "feeSettingsUnreadable" | null> {
  const verdict = await verifyDealFeesAgainstLog(context.resolved);
  if (verdict === "unreadable") return "feeSettingsUnreadable";
  if (verdict === "tampered") return "feeRecordTampered";
  const posted = postedDealerChargesProblem(formData, context.resolved.fees, context.schedule);
  if (posted) return posted;
  /*
    Every copy is written with the desk's own title and registration lines
    (`dealFeesFromSchedule`); a copy holding any other figure was not
    written by the desk. Checked after the posted figures, so a title fee
    that is not the state's is named as that.
  */
  if (context.resolved.from === "copy" && !dealFeesGovernmentLinesAreDesks(context.resolved.fees)) return "feeRecordTampered";
  return null;
}

export type ApplyFeesOffer = {
  /**
   * Why it is offered: the copy is over today's limit, higher than today's
   * fee, older than the owner's latest save, or no longer what its record
   * says (a config seed changed under it).
   */
  reason: "overLimit" | "aboveToday" | "older" | "changed";
  /** The sale's documentary fee, in dollars, and the one today's fees would give it. */
  docFee: number | null;
  todaysDocFee: number | null;
};

/**
 * Whether to offer "Apply Today's Fees" on a sale: only on a sale holding its
 * own copy, with no bill of sale filed (the action refuses then), whose copy
 * is over today's limit or is older than the owner's latest save and differs
 * from it. Null otherwise, and on any read that fails.
 */
export async function applyFeesOffer(sale: {
  id: string;
  stepData: unknown;
  vehicle?: { titleStatus?: string | null } | null;
}): Promise<ApplyFeesOffer | null> {
  const loaded = await loadDealFees(sale).catch(() => ({ ok: false }) as const);
  if (!loaded.ok || loaded.resolved.from !== "copy") return null;
  try {
    if (await filedBillOfSaleOn(sale.id)) return null;
  } catch {
    return null;
  }
  const copy = loaded.resolved.fees;
  const today = dealFeesFromSchedule(loaded.schedule);
  if (docFeeLimitProblem(copy.docFee, loaded.schedule)) return { reason: "overLimit", docFee: copy.docFee, todaysDocFee: today.docFee };
  const todaysCents = loaded.schedule.docFeeCents;
  if (copy.docFee !== null && todaysCents !== null && Number.isFinite(todaysCents) && Math.round(copy.docFee * 100) > todaysCents) {
    return { reason: "aboveToday", docFee: copy.docFee, todaysDocFee: today.docFee };
  }
  const differs = !dealFeesMatchRecord(copy, { docFeeCents: loaded.schedule.docFeeCents, occcFiling: loaded.schedule.occcFiling });
  if (loaded.schedule.source === "owner" && copy.scheduleVersion < loaded.schedule.version && differs) {
    return { reason: "older", docFee: copy.docFee, todaysDocFee: today.docFee };
  }
  /*
    A copy taken from the config seed (version 0) checks against the live
    seed at filing; if the seed changed since, the filing refuses with
    "Apply today's fees", so the offer must be on the screen to do it.
  */
  if (copy.scheduleVersion === 0 && loaded.schedule.source === "config" && (differs || !dealFeesGovernmentLinesAreDesks(copy))) {
    return { reason: "changed", docFee: copy.docFee, todaysDocFee: today.docFee };
  }
  return null;
}
