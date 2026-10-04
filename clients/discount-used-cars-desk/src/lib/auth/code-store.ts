import { sendEmail } from "@/lib/email/send";
import { signInCodeEmail, verifyEmailCodeEmail } from "@/lib/email/templates";
import { adminSigningSecret } from "@/lib/auth/signing-secret";
import { createServiceClient } from "@/lib/supabase/service";
import {
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  codeBusinessKey,
  codeHash,
  codeState,
  emailFingerprint,
  expiryFrom,
  generateCode,
  hashesMatch,
  normalizeCode,
  type CodePurpose,
  type CodeRow,
} from "@/lib/auth/sign-in-codes";

/**
 * The rows and the mail behind a one-time code.
 *
 * Not a server action file on purpose: everything exported from a "use
 * server" module is callable from a browser, and "issue a code for any
 * address" must not be. The actions in `@/lib/actions/sign-in-code` and
 * the access request call in here after deciding who may.
 */

export type IssueResult =
  | { ok: true; resent: boolean }
  | { ok: false; reason: "not_configured" | "no_secret" | "rejected" | "unknown" };

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "none" | "wrong" | "expired" | "locked" | "consumed" | "no_secret" | "unavailable" };

/**
 * Mint a code, mail it, then record its hash.
 *
 * The mail goes first because the outbox claim inside `sendEmail` is the
 * rate limit: a second request in the same minute finds the claim, sends
 * nothing, and the code already in the person's inbox stays good. A code
 * is only recorded once the provider accepted the mail, so a row can never
 * exist for a code nobody received.
 */
/**
 * Where the code goes. The address is always the identity; the phone is only
 * a delivery route, chosen by the person asking.
 */
export type CodeDelivery = { channel: "email" } | { channel: "sms"; phone: string };

export async function issueCode(
  email: string,
  purpose: CodePurpose,
  language: "en" | "es",
  delivery: CodeDelivery = { channel: "email" },
): Promise<IssueResult> {
  const secret = adminSigningSecret();
  if (!secret) return { ok: false, reason: "no_secret" };

  const code = generateCode();

  if (delivery.channel === "sms") {
    const sms = await sendCodeBySms(delivery.phone, code, language);
    if (!sms.ok) return sms;
    return await recordCode(email, purpose, code, secret);
  }

  const content =
    purpose === "sign_in"
      ? signInCodeEmail(language, code, CODE_TTL_MINUTES)
      : verifyEmailCodeEmail(language, code, CODE_TTL_MINUTES);

  const sent = await sendEmail({
    businessKey: codeBusinessKey(email, purpose),
    template: purpose === "sign_in" ? "sign-in-code" : "verify-email-code",
    to: email,
    language,
    from: "support",
    ...content,
  });

  if (sent.state === "duplicate") {
    return sent.priorState === "accepted"
      ? { ok: true, resent: false }
      : { ok: false, reason: sent.priorState === "rejected" ? "rejected" : "unknown" };
  }
  if (sent.state === "not_configured") return { ok: false, reason: "not_configured" };
  if (sent.state === "rejected") return { ok: false, reason: "rejected" };
  if (sent.state === "unknown") return { ok: false, reason: "unknown" };

  return await recordCode(email, purpose, code, secret);
}

/**
 * The row, written only once something accepted the code for delivery.
 *
 * Shared by both routes so a texted code and a mailed one are the same code
 * to `verifyCode`: the address is the identity either way, and the phone was
 * only how it travelled.
 */
async function recordCode(
  email: string,
  purpose: CodePurpose,
  code: string,
  secret: string,
): Promise<IssueResult> {
  const service = createServiceClient();
  const { error } = await service.from("sign_in_codes").insert({
    email_fingerprint: emailFingerprint(email),
    purpose,
    code_hash: codeHash(email, purpose, code, secret),
    expires_at: expiryFrom(),
  });
  if (error) return { ok: false, reason: "unknown" };
  return { ok: true, resent: true };
}

/**
 * The same code, by text.
 *
 * Consent is written down before the message goes, the way the pre-approval
 * flow does it: asking for a code by text is the opt-in, and a text we cannot
 * evidence consent for is a text we do not send.
 *
 * The body carries the code in a sentence containing the word "code", which
 * is what iOS reads to offer it above the keyboard, and then the origin-bound
 * line WebOTP wants on Chrome. Both fit one segment.
 */
async function sendCodeBySms(
  phone: string,
  code: string,
  language: "en" | "es",
): Promise<IssueResult> {
  const { normalizePhone } = await import("@/lib/sms/provider");
  let e164: string;
  try {
    e164 = normalizePhone(phone);
  } catch {
    return { ok: false, reason: "rejected" };
  }

  const { recordSmsConsent } = await import("@/lib/sms/consent");
  const { SMS_CODE_CONSENT_WORDING } = await import("@/lib/sms/pre-approval-text");
  const service = createServiceClient();
  const consent = await recordSmsConsent(service, {
    phone: e164,
    source: "team_access_code",
    wording: SMS_CODE_CONSENT_WORDING[language],
    language,
  });
  if (!consent.allowed) {
    return { ok: false, reason: consent.reason === "not_configured" ? "not_configured" : "rejected" };
  }

  const { sendSMS } = await import("@/lib/sms");
  const { brand, SITE_URL } = await import("@/lib/dealership-config");
  const host = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const line =
    language === "es"
      ? `${brand.short}: su codigo de acceso es ${code}. No lo comparta.`
      : `${brand.short}: your access code is ${code}. Do not share it.`;
  const sent = await sendSMS(e164, `${line}\n\n@${host} #${code}`);
  if (!sent.success) return { ok: false, reason: "rejected" };
  return { ok: true, resent: true };
}

/**
 * Check what was typed against the newest code for this address and
 * purpose. A wrong guess is counted on the row; five lock it. A right one
 * consumes it, so it never works twice.
 */
export async function verifyCode(email: string, purpose: CodePurpose, typed: string): Promise<VerifyResult> {
  const secret = adminSigningSecret();
  if (!secret) return { ok: false, reason: "no_secret" };
  const code = normalizeCode(typed);
  if (!code) return { ok: false, reason: "wrong" };

  const service = createServiceClient();
  const { data, error: readError } = await service
    .from("sign_in_codes")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("email_fingerprint", emailFingerprint(email))
    .eq("purpose", purpose)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) return { ok: false, reason: "unavailable" };
  const row = data as (CodeRow & { id: string; code_hash: string }) | null;
  if (!row) return { ok: false, reason: "none" };

  const state = codeState(row);
  if (state !== "open") return { ok: false, reason: state };

  const matches = hashesMatch(row.code_hash, codeHash(email, purpose, code, secret));
  const now = new Date().toISOString();
  // One conditional write claims the attempt and, when correct, consumes it.
  // Concurrent requests cannot reuse a code or overwrite each other's counter.
  const { data: claimed, error: claimError } = await service
    .from("sign_in_codes")
    .update({ attempts: row.attempts + 1, ...(matches ? { consumed_at: now } : {}) })
    .eq("id", row.id)
    .eq("attempts", row.attempts)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) return { ok: false, reason: "unavailable" };
  return matches
    ? { ok: true }
    : { ok: false, reason: row.attempts + 1 >= MAX_ATTEMPTS ? "locked" : "wrong" };
}

/**
 * Whether an address may be sent a sign-in code at all: the configured
 * owner, or an active member of the roster. Anyone else is told the same
 * neutral sentence and sent nothing.
 */
export async function mayReceiveSignInCode(email: string): Promise<boolean> {
  const configuredOwner = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (configuredOwner && configuredOwner === email.trim().toLowerCase()) return true;
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("team_members")
      .select("id")
      .eq("email", email.trim().toLowerCase())
      .eq("status", "active")
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}
