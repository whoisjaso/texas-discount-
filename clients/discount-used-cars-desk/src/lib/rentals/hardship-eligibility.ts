import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hardship Bridge Program eligibility - single source of truth.
 *
 * Policy source: Triple J Renter Support Policy (Rev. 04/2026).
 * Mandatory conditions:
 *   1. Four consecutive weeks in good standing.
 *   2. Verified loss event, not at fault, with documentation.
 *   3. Active claim on record with claim/report number.
 *   4. Valid automatic payment method on customer record.
 *   5. No prior hardship grant within rolling 12 months.
 */

const FOUR_WEEKS_MS = 4 * 7 * 24 * 60 * 60 * 1000;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

export interface HardshipEligibility {
  eligible: boolean;
  reasons: string[];
  inputs: {
    weeks_in_good_standing: number;
    loss_event_verified: boolean;
    loss_event_not_at_fault: boolean;
    active_claim_documented: boolean;
    payment_method_on_file: boolean;
    prior_hardship_within_12mo: boolean;
  };
  lossEventId: string | null;
}

export async function checkHardshipEligibility(
  customerId: string,
  supabase: SupabaseClient,
): Promise<HardshipEligibility> {
  const now = new Date();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, good_standing_since, late_payment_count, default_billing_agreement_id")
    .eq("id", customerId)
    .maybeSingle();

  const weeksInGoodStanding = computeWeeksInGoodStanding(
    customer?.good_standing_since ?? null,
    customer?.late_payment_count ?? 0,
    now,
  );

  const { data: lossEvents } = await supabase
    .from("loss_events")
    .select("id, at_fault, claim_number, claim_status, documentation_urls, verified_at, incident_date")
    .eq("customer_id", customerId)
    .order("incident_date", { ascending: false })
    .limit(5);

  const recentVerified = (lossEvents ?? []).find(
    (event) => event.verified_at !== null && daysSince(event.incident_date, now) <= 60,
  );
  const lossEventVerified = !!recentVerified;
  const lossEventNotAtFault = !!recentVerified && recentVerified.at_fault === false;
  const activeClaimDocumented =
    !!recentVerified &&
    recentVerified.claim_status === "open" &&
    typeof recentVerified.claim_number === "string" &&
    recentVerified.claim_number.trim().length > 0 &&
    Array.isArray(recentVerified.documentation_urls) &&
    recentVerified.documentation_urls.length > 0;

  const paymentMethodOnFile =
    !!customer?.default_billing_agreement_id ||
    (await hasActiveStripePaymentMethod(supabase, customerId));

  const twelveMonthsAgoIso = new Date(now.getTime() - TWELVE_MONTHS_MS).toISOString();
  const { count: priorGrantCount } = await supabase
    .from("hardship_bridge_grants")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .gte("granted_at", twelveMonthsAgoIso);

  const priorHardshipWithin12mo = (priorGrantCount ?? 0) > 0;

  const reasons: string[] = [];
  if (weeksInGoodStanding < 4) {
    reasons.push(`Active rental in good standing for ${weeksInGoodStanding} week(s), need 4.`);
  }
  if (!lossEventVerified) {
    reasons.push("No verified loss-of-vehicle event on file within the last 60 days.");
  }
  if (lossEventVerified && !lossEventNotAtFault) {
    reasons.push("Most recent loss event is marked at fault.");
  }
  if (!activeClaimDocumented) {
    reasons.push("No active insurance claim with claim/report number and documentation URL on file.");
  }
  if (!paymentMethodOnFile) {
    reasons.push("No valid automatic payment method on file for installments.");
  }
  if (priorHardshipWithin12mo) {
    reasons.push("A prior Hardship Bridge grant exists within the last 12 months.");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    inputs: {
      weeks_in_good_standing: weeksInGoodStanding,
      loss_event_verified: lossEventVerified,
      loss_event_not_at_fault: lossEventNotAtFault,
      active_claim_documented: activeClaimDocumented,
      payment_method_on_file: paymentMethodOnFile,
      prior_hardship_within_12mo: priorHardshipWithin12mo,
    },
    lossEventId: recentVerified?.id ?? null,
  };
}

/**
 * Build the Hardship Bridge Week-1 installment split.
 *
 * The first installment is the non-waivable $100 signing payment. The
 * remaining Week-1 rate is split into Day 3 and Day 7 installments.
 * Week 2 onward returns to the standard weekly schedule.
 */
export function buildWeek1Split(
  weeklyRate: number,
  agreementEffectiveAt: Date = new Date(),
  signingMinimum: number = 100,
): Array<{ amount: number; due_at: string }> {
  if (!Number.isFinite(weeklyRate) || weeklyRate <= 0) {
    throw new Error("buildWeek1Split: weeklyRate must be positive");
  }
  if (!Number.isFinite(signingMinimum) || signingMinimum < 100) {
    throw new Error("buildWeek1Split: signingMinimum must be at least $100");
  }
  if (weeklyRate < signingMinimum) {
    throw new Error("buildWeek1Split: weeklyRate must be at least the $100 signing minimum");
  }

  const day0 = agreementEffectiveAt;
  const day3 = new Date(day0.getTime() + 3 * 24 * 60 * 60 * 1000);
  const day7 = new Date(day0.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (weeklyRate === signingMinimum) {
    return [{ amount: round2(weeklyRate), due_at: day0.toISOString() }];
  }

  const remainder = round2(weeklyRate - signingMinimum);
  const day3Amount = round2(remainder / 2);
  const day7Amount = round2(remainder - day3Amount);

  return [
    { amount: round2(signingMinimum), due_at: day0.toISOString() },
    { amount: day3Amount, due_at: day3.toISOString() },
    { amount: day7Amount, due_at: day7.toISOString() },
  ];
}

function computeWeeksInGoodStanding(
  since: string | null,
  latePaymentCount: number,
  now: Date,
): number {
  if (!since) return 0;
  if (latePaymentCount > 0) return 0;
  const sinceMs = new Date(`${since}T00:00:00Z`).getTime();
  if (!Number.isFinite(sinceMs)) return 0;
  const ms = now.getTime() - sinceMs;
  if (ms < FOUR_WEEKS_MS / 4) return 0;
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

async function hasActiveStripePaymentMethod(
  supabase: SupabaseClient,
  customerId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("customer_payment_methods")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("provider", "stripe")
    .eq("status", "active");

  if (error) return false;
  return (count ?? 0) > 0;
}

function daysSince(dateStr: string | null, now: Date): number {
  if (!dateStr) return Infinity;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
