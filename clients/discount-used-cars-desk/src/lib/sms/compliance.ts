import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "./provider";

export const SMS_OPT_OUT_BLOCKED_MESSAGE =
  "Customer has opted out of SMS. Ask them to text START or use copy link.";

export const SMS_CONSENT_NOT_GRANTED_MESSAGE =
  "Customer has not granted positive SMS consent. Capture consent at portal stage 3 before automated dunning.";

type SmsOptOutLike = {
  smsOptedOut?: boolean | null;
  sms_opted_out?: boolean | null;
};

type SmsOptOutRow = {
  id?: string | null;
  sms_opted_out?: boolean | null;
};

type SmsConsentRow = {
  id?: string | null;
  sms_opted_out?: boolean | null;
  sms_consent_status?: 'unknown' | 'granted' | 'revoked' | null;
  sms_consent_at?: string | null;
  sms_review_hold_at?: string | null;
  sms_review_hold_cleared_by?: string | null;
};

export type SmsOptOutDecision = {
  blocked: boolean;
  customerId: string | null;
};

export type SmsConsentDecision = {
  allowed: boolean;
  reason: 'ok' | 'no_consent' | 'revoked' | 'opted_out' | 'quiet_hours' | 'unknown_customer' | 'review_hold';
  customerId: string | null;
};

export function isSmsOptedOut(value: SmsOptOutLike | null | undefined): boolean {
  return Boolean(value?.smsOptedOut ?? value?.sms_opted_out ?? false);
}

export async function getCustomerSmsOptOut(
  supabase: SupabaseClient,
  input: { customerId?: string | null; phone?: string | null },
): Promise<SmsOptOutDecision> {
  const customerId = input.customerId?.trim() || null;
  if (customerId) {
    const { data, error } = await supabase
      .from("customers")
      .select("id,sms_opted_out")
      .eq("id", customerId)
      .maybeSingle<SmsOptOutRow>();
    if (error) throw error;
    return {
      blocked: Boolean(data?.sms_opted_out),
      customerId: data?.id ?? customerId,
    };
  }

  const phone = input.phone?.trim() || null;
  if (!phone) return { blocked: false, customerId: null };

  const phones = new Set<string>([phone]);
  try {
    phones.add(normalizePhone(phone));
  } catch {
    // Keep the raw phone only; the send path will surface invalid numbers.
  }

  const { data, error } = await supabase
    .from("customers")
    .select("id,sms_opted_out")
    .in("phone", [...phones])
    .limit(1)
    .maybeSingle<SmsOptOutRow>();
  if (error) throw error;
  return {
    blocked: Boolean(data?.sms_opted_out),
    customerId: data?.id ?? null,
  };
}

/**
 * Positive consent gate. Required for AT&T-style automated dunning.
 * Reads both sms_consent_status (positive) and sms_opted_out (negative).
 * Optionally checks quiet hours (skipped for STOP/START confirmations).
 *
 * See: MESH_PLAN.md §3.7, COMPLIANCE_REVIEW.md §3 (TCPA), §10 (bilingual).
 */
export async function assertSmsConsent(
  supabase: SupabaseClient,
  input: { customerId?: string | null; phone?: string | null; bypassQuietHours?: boolean },
): Promise<SmsConsentDecision> {
  const customerId = input.customerId?.trim() || null;
  let row: SmsConsentRow | null = null;

  if (customerId) {
    const { data, error } = await supabase
      .from("customers")
      .select("id,sms_opted_out,sms_consent_status,sms_consent_at,sms_review_hold_at,sms_review_hold_cleared_by")
      .eq("id", customerId)
      .maybeSingle<SmsConsentRow>();
    if (error) throw error;
    row = data;
  } else if (input.phone) {
    const phones = new Set<string>([input.phone]);
    try { phones.add(normalizePhone(input.phone)); } catch { /* fall through */ }
    const { data, error } = await supabase
      .from("customers")
      .select("id,sms_opted_out,sms_consent_status,sms_consent_at,sms_review_hold_at,sms_review_hold_cleared_by")
      .in("phone", [...phones])
      .limit(1)
      .maybeSingle<SmsConsentRow>();
    if (error) throw error;
    row = data;
  }

  if (!row) return { allowed: false, reason: 'unknown_customer', customerId: null };

  const cid = row.id ?? customerId ?? null;

  if (row.sms_consent_status === 'revoked') {
    return { allowed: false, reason: 'revoked', customerId: cid };
  }
  // An ambiguous negative reply put this customer's messaging in a person's
  // hands. Every automated send waits until somebody reads it and clears
  // the hold on the SMS screen — FCC 24-24's reasonable-means rule applied
  // as a pause rather than a guess.
  if (row.sms_review_hold_at && !row.sms_review_hold_cleared_by) {
    return { allowed: false, reason: 'review_hold', customerId: cid };
  }
  if (row.sms_opted_out) {
    return { allowed: false, reason: 'opted_out', customerId: cid };
  }
  if (row.sms_consent_status !== 'granted') {
    return { allowed: false, reason: 'no_consent', customerId: cid };
  }
  if (!input.bypassQuietHours && !withinQuietHours()) {
    return { allowed: false, reason: 'quiet_hours', customerId: cid };
  }

  return { allowed: true, reason: 'ok', customerId: cid };
}

/**
 * 8 AM – 9 PM Central time window. Per CTIA Short Code Monitoring + industry
 * standard. Caller can bypass with `bypassQuietHours: true` for STOP/START
 * confirmations and admin manual sends.
 *
 * See: COMPLIANCE_REVIEW.md §3.3.
 */
export function withinQuietHours(timezone = 'America/Chicago'): boolean {
  try {
    const hour = Number.parseInt(
      new Date().toLocaleString('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      }),
      10,
    );
    if (!Number.isFinite(hour)) return true;
    return hour >= 8 && hour < 21;
  } catch {
    // If timezone resolution fails, fail open (send). Better than silently dropping.
    return true;
  }
}
