import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "./provider";

/**
 * Consent to be texted, kept by phone number.
 *
 * The dunning consent in `compliance.ts` hangs off a `customers` row, which
 * is right for someone who has bought a car and wrong for everyone else. A
 * client who taps "Text it to me" on the pre-approval page is a lead with a
 * phone number and nothing else, and the number is the only thing an
 * inbound STOP arrives with.
 *
 * So this ledger is keyed by the number. One row per number, holding the
 * current answer, the exact sentence the person agreed to, and where they
 * agreed to it. A send asks `smsConsentFor`; an inbound STOP calls
 * `revokeSmsConsent`; START calls `restoreSmsConsent`.
 *
 * Nothing here throws at a caller. Until the migration is applied the table
 * is not there, and a missing table is reported as `not_configured` rather
 * than as an exception, so a client is told plainly that we could not text
 * them and is handed their link on screen instead of meeting a stack trace.
 */

const TABLE = "sms_consents";

/** Postgres: relation does not exist. The migration has not been applied. */
const UNDEFINED_TABLE = "42P01";

export type SmsConsentReason =
  | "ok"
  | "revoked"
  | "no_consent"
  | "not_configured"
  | "bad_number"
  | "unavailable";

export type SmsConsentDecision = {
  allowed: boolean;
  reason: SmsConsentReason;
  /** E.164, when the number could be read at all. */
  phone: string | null;
};

export type SmsConsentRecord = {
  phone: string;
  status: "granted" | "revoked";
  source: string;
  wording: string | null;
  leadId: string | null;
  language: "en" | "es";
  grantedAt: string | null;
  revokedAt: string | null;
};

type Row = {
  phone: string;
  status: string;
  source: string;
  wording: string | null;
  lead_id: string | null;
  language: string;
  granted_at: string | null;
  revoked_at: string | null;
};

function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  try {
    return normalizePhone(phone);
  } catch {
    return null;
  }
}

/**
 * One write, and it can never be the reason something else fails.
 *
 * An inbound STOP is answered by the Telnyx webhook, and the person who
 * texted it is owed their confirmation whether or not this ledger accepted
 * the row. So a thrown client error is caught here and returned as an error
 * value: the caller decides what to do about it, and nothing upstream gets
 * a 500 because a consent row could not be written.
 */
async function upsert(
  service: SupabaseClient,
  row: Record<string, unknown>,
): Promise<{ error: { code?: string } | null }> {
  try {
    const { error } = await service.from(TABLE).upsert(row, { onConflict: "phone" });
    return { error };
  } catch (thrown) {
    console.error("[sms/consent] write threw", thrown);
    return { error: { code: "threw" } };
  }
}

function mapRow(row: Row): SmsConsentRecord {
  return {
    phone: row.phone,
    status: row.status === "revoked" ? "revoked" : "granted",
    source: row.source,
    wording: row.wording,
    leadId: row.lead_id,
    language: row.language === "es" ? "es" : "en",
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * What this number has agreed to, if anything.
 *
 * A number with no row has not agreed to anything, which is the honest
 * answer for a lead the desk has never texted: `no_consent`, not silence.
 */
export async function smsConsentFor(
  service: SupabaseClient,
  phone: string | null | undefined,
): Promise<SmsConsentDecision> {
  const e164 = toE164(phone);
  if (!e164) return { allowed: false, reason: "bad_number", phone: null };

  let data: Row | null = null;
  let error: { code?: string } | null = null;
  try {
    const result = await service
      .from(TABLE)
      .select("phone,status,source,wording,lead_id,language,granted_at,revoked_at")
      .eq("phone", e164)
      .maybeSingle<Row>();
    data = result.data;
    error = result.error;
  } catch (thrown) {
    console.error("[sms/consent] read threw", thrown);
    return { allowed: false, reason: "unavailable", phone: e164 };
  }

  if (error) {
    if (error.code === UNDEFINED_TABLE) return { allowed: false, reason: "not_configured", phone: e164 };
    console.error("[sms/consent] read failed", error);
    return { allowed: false, reason: "unavailable", phone: e164 };
  }
  if (!data) return { allowed: false, reason: "no_consent", phone: e164 };
  if (data.status === "revoked") return { allowed: false, reason: "revoked", phone: e164 };
  return { allowed: true, reason: "ok", phone: e164 };
}

/**
 * Record that this number agreed, in the words it agreed to.
 *
 * Someone who previously texted STOP and now taps the button on the page has
 * asked for the message in as plain a way as a person can, so the grant
 * clears the revocation. That is a deliberate call: the tap is a fresh,
 * documented opt-in, and it is written down as one.
 */
export async function recordSmsConsent(
  service: SupabaseClient,
  input: { phone: string; source: string; wording: string; leadId?: string | null; language?: "en" | "es" },
): Promise<SmsConsentDecision> {
  const e164 = toE164(input.phone);
  if (!e164) return { allowed: false, reason: "bad_number", phone: null };
  const now = new Date().toISOString();

  const { error } = await upsert(service, {
      phone: e164,
      status: "granted",
      source: input.source,
      wording: input.wording,
      lead_id: input.leadId ?? null,
      language: input.language ?? "en",
      granted_at: now,
      revoked_at: null,
      revoked_reason: null,
      updated_at: now,
  });

  if (error) {
    if (error.code === UNDEFINED_TABLE) return { allowed: false, reason: "not_configured", phone: e164 };
    console.error("[sms/consent] write failed", error);
    return { allowed: false, reason: "unavailable", phone: e164 };
  }
  return { allowed: true, reason: "ok", phone: e164 };
}

/**
 * A STOP, from any number, whether or not we know whose it is.
 *
 * Written as a row even for a number that has never consented here, because
 * "this number said stop" is the fact that matters to the next send.
 */
export async function revokeSmsConsent(
  service: SupabaseClient,
  phone: string,
  reason?: string | null,
): Promise<boolean> {
  const e164 = toE164(phone);
  if (!e164) return false;
  const now = new Date().toISOString();

  const { error } = await upsert(service, {
    phone: e164,
    status: "revoked",
    source: "inbound_stop",
    revoked_at: now,
    revoked_reason: reason ? reason.slice(0, 200) : null,
    updated_at: now,
  });

  if (error) {
    if (error.code !== UNDEFINED_TABLE) console.error("[sms/consent] revoke failed", error);
    return false;
  }
  return true;
}

/** A START from a number that had opted out. */
export async function restoreSmsConsent(service: SupabaseClient, phone: string): Promise<boolean> {
  const e164 = toE164(phone);
  if (!e164) return false;
  const now = new Date().toISOString();

  const { error } = await upsert(service, {
    phone: e164,
    status: "granted",
    source: "inbound_start",
    wording: "Texted START to re-subscribe.",
    granted_at: now,
    revoked_at: null,
    revoked_reason: null,
    updated_at: now,
  });

  if (error) {
    if (error.code !== UNDEFINED_TABLE) console.error("[sms/consent] restore failed", error);
    return false;
  }
  return true;
}

/** The ledger row itself, for the desk's screens. */
export async function getSmsConsentRecord(
  service: SupabaseClient,
  phone: string,
): Promise<SmsConsentRecord | null> {
  const e164 = toE164(phone);
  if (!e164) return null;
  try {
    const { data, error } = await service
      .from(TABLE)
      .select("phone,status,source,wording,lead_id,language,granted_at,revoked_at")
      .eq("phone", e164)
      .maybeSingle<Row>();
    if (error || !data) return null;
    return mapRow(data);
  } catch {
    return null;
  }
}
