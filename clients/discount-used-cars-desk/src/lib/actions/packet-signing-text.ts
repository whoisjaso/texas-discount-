"use server";

import { createHash } from "node:crypto";
import { requireCurrentAdminPermission } from "@/lib/admin/current-admin";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { getSalePacket } from "@/lib/admin/sale-packet";
import { createServiceClient } from "@/lib/supabase/service";
import { assertSmsConsent } from "@/lib/sms/compliance";
import { smsConsentFor } from "@/lib/sms/consent";
import { getSMSDeliveryStatus, normalizePhone, sendSMS } from "@/lib/sms/provider";
import { createSmsMessage } from "@/lib/supabase/queries/payments";
import { dealership, SITE_URL } from "@/lib/dealership-config";
import { isLanguageSettled } from "@/lib/sales/deal-language";
import { readSalePlan } from "@/lib/sales/sale-plan";
import { ceremonyCanSign, ceremonyDocuments } from "@/lib/sales/signing-ceremony";
import { issueSigningToken, signingUrl, SIGNING_TTL_MS } from "@/lib/sales/signing-token";
import { existingSigningText, SIGNING_TEXT_CONSENT, signingTextMessage, type SigningTextResult, type SigningTextStatus } from "@/lib/sales/signing-text";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Only the canonical buyer can receive a fixed, narrowly scoped signing link. */
export async function sendPacketSigningText(dealId: string, input: { attested: boolean; resend?: boolean }): Promise<SigningTextResult> {
  const access = await requireCurrentAdminPermission("documents:deliver");
  if (!access.ok) return { ok: false, code: "forbidden" };
  if (!dealership.paperworkTextsEnabled) return { ok: false, code: "disabled" };
  if (input.attested !== true) return { ok: false, code: "needsAttestation" };
  if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_PHONE_NUMBER || !process.env.TELNYX_MESSAGING_PROFILE_ID) return { ok: false, code: "notConfigured" };
  const sale = await getSaleDetail(dealId);
  if (!sale?.buyer?.id) return { ok: false, code: "noBuyer" };
  if (!isLanguageSettled(sale.stepData)) return { ok: false, code: "languageUnsettled" };
  const language = sale.language === "es" ? "es" : "en";
  if (!ceremonyCanSign(sale.language)) return { ok: false, code: "inkOnly" };
  let phone: string;
  try { phone = normalizePhone(sale.buyer.phone ?? ""); } catch { return { ok: false, code: "noPhone" }; }
  const service = createServiceClient();
  const phoneConsent = await smsConsentFor(service, phone);
  if (!phoneConsent.allowed && phoneConsent.reason !== "no_consent") {
    return { ok: false, code: phoneConsent.reason === "revoked" ? "optedOut" : "notConfigured" };
  }
  // A new transactional request cannot override STOP, revoked consent or a held reply.
  const consent = await assertSmsConsent(service, { customerId: sale.buyer.id, bypassQuietHours: true });
  if (!consent.allowed && consent.reason !== "no_consent") {
    return { ok: false, code: consent.reason === "review_hold" ? "reviewHold" : "optedOut" };
  }
  const documents = ceremonyDocuments(await getSalePacket(dealId), { dealerSignsTitle: readSalePlan(sale.stepData).titleSignedBy === "dealer" });
  if (!documents.some((document) => !document.signed)) return { ok: false, code: "nothingToSign" };
  const now = Date.now();
  const current = await service.from("packet_signing_texts").select("id, recipient_phone, status, created_at, expires_at").eq("deal_id", dealId).eq("active", true).maybeSingle();
  if (current.error) return { ok: false, code: "generic" };
  if (current.data) {
    const existing = existingSigningText(current.data, phone, input.resend === true, now);
    if (existing) return existing;
    const closed = await service.from("packet_signing_texts").update({ active: false }).eq("id", current.data.id).eq("active", true);
    if (closed.error) return { ok: false, code: "generic" };
  }
  let token: string;
  try { token = issueSigningToken(dealId, now); } catch { return { ok: false, code: "notConfigured" }; }
  const expiresAt = new Date(now + SIGNING_TTL_MS).toISOString();
  const claim = await service.from("packet_signing_texts").insert({
    deal_id: dealId, customer_id: sale.buyer.id, recipient_phone: phone,
    token_hash: hash(token), consent_wording_hash: hash(SIGNING_TEXT_CONSENT),
    issued_by: access.user!.id, expires_at: expiresAt,
  }).select("id").single();
  // The unique active-deal index elects one sender even across tabs/processes.
  if (claim.error || !claim.data) return { ok: false, code: claim.error?.code === "23505" ? "raceRetry" : "generic" };
  const id = claim.data.id as string;
  const sent = await sendSMS(phone, signingTextMessage(dealership.shortName, language, signingUrl(SITE_URL, token)), { timeoutMs: 15_000 });
  const status: SigningTextStatus = sent.success && sent.messageId ? "accepted" : sent.uncertain ? "unknown" : "failed";
  await service.from("packet_signing_texts").update({ status, provider_message_id: sent.messageId ?? null, last_status_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
  try {
    await createSmsMessage(service, { customerId: sale.buyer.id, direction: "outbound", body: `${signingTextMessage(dealership.shortName, language, "[link]")} [signing invite ${id}]`, fromNumber: process.env.TELNYX_PHONE_NUMBER!, toNumber: phone, telnyxMessageId: sent.messageId ?? null, status: status === "accepted" ? "sent" : status, providerStatus: status });
  } catch { /* The send claim remains the primary record. Never resend for a mirror failure. */ }
  return { ok: true, id, status, reused: false, expiresAt };
}

export async function readPacketSigningText(dealId: string, id: string): Promise<SigningTextResult> {
  const access = await requireCurrentAdminPermission("documents:deliver");
  if (!access.ok) return { ok: false, code: "forbidden" };
  const service = createServiceClient();
  const { data, error } = await service.from("packet_signing_texts").select("id, status, expires_at, created_at, recipient_phone, provider_message_id").eq("id", id).eq("deal_id", dealId).maybeSingle();
  if (error || !data) return { ok: false, code: "generic" };
  if (data.status === "accepted" && data.provider_message_id && Date.parse(data.expires_at) > Date.now()) {
    const terminal = await getSMSDeliveryStatus(data.provider_message_id, data.recipient_phone, { timeoutMs: 3000 });
    if (terminal) {
      const reconciled = await service.from("packet_signing_texts")
        .update({ status: terminal, last_status_at: new Date().toISOString() })
        .eq("id", id).eq("deal_id", dealId).eq("status", "accepted")
        .select("status").maybeSingle();
      if (!reconciled.error && reconciled.data) data.status = reconciled.data.status;
    }
  }
  return existingSigningText(data, data.recipient_phone, false, Date.now()) ?? { ok: false, code: "expired" };
}
