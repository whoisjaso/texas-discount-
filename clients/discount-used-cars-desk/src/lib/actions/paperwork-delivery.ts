"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentAdminPermission } from "@/lib/admin/current-admin";
import { createServiceClient } from "@/lib/supabase/service";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { isLanguageSettled } from "@/lib/sales/deal-language";
import { readBuyerId, settled } from "@/lib/sales/buyer-id";
import { settledPlan } from "@/lib/sales/sale-plan";
import { getCustomerSmsOptOut, assertSmsConsent } from "@/lib/sms/compliance";
import { smsConsentFor } from "@/lib/sms/consent";
import { sendSMS, normalizePhone } from "@/lib/sms/provider";
import { createSmsMessage } from "@/lib/supabase/queries/payments";
import { dealership, SITE_URL } from "@/lib/dealership-config";
import {
  INVITE_TTL_DAYS,
  inviteUrl,
  newAccessCode,
  newInviteToken,
  sha256Hex,
} from "@/lib/paperwork-delivery/invites";
import {
  manifestHash,
  materializeEntry,
  selectDeliverable,
  type ManifestEntry,
} from "@/lib/paperwork-delivery/manifest";
import { CONSENT_WORDING } from "@/lib/paperwork-delivery/consent";

/**
 * Text the buyer their paperwork — the packet screen's one send button.
 *
 * The whole shape was decided in five rounds of review (PLAN.md §E,
 * PLAN-REVIEW-LOG.md), and the load-bearing parts are:
 *
 *   input        a deal id and a typed attestation. Recipient, manifest and
 *                message are all derived server-side; no caller-supplied
 *                message text exists anywhere on this path.
 *   consent      transactional basis (FCC 1992 Order ¶31) — the guard
 *                passes on global `granted` OR the operator's point-of-send
 *                attestation that the buyer asked, while opt-out, revoked
 *                and the review hold override every purpose. The wording
 *                the attestation stands for is versioned by hash below.
 *   idempotency  the invite row is persisted (pending) BEFORE Telnyx is
 *                called, and one partial unique index makes a second
 *                concurrent send land on the winner instead of texting
 *                twice. An identical re-request while an invite is live
 *                reuses it; only an explicit resend supersedes.
 *   the link     carries only the token, on this site's own domain. Bearer
 *                material never reaches sms_messages — the logged body is
 *                the redacted template plus the invite id.
 */


const TEMPLATE_EN = (name: string, url: string) =>
  `${dealership.shortName} Auto: ${name ? `${name}, your` : "Your"} paperwork is ready. Open your copy here: ${url} (link works for ${INVITE_TTL_DAYS} days)`;
const TEMPLATE_ES = (name: string, url: string) =>
  `${dealership.shortName} Auto: ${name ? `${name}, sus` : "Sus"} papeles están listos. Abra su copia aquí: ${url} (el enlace funciona ${INVITE_TTL_DAYS} días)`;

export type SendPaperworkResult =
  | {
      ok: true;
      inviteId: string;
      reused: boolean;
      status: "pending" | "accepted" | "failed";
      /** Only when the deal has no DOB/licence factor: shown once, spoken. */
      accessCode?: string;
      documents: string[];
      inkOnly: string[];
    }
  | {
      ok: false;
      code: string;
      error: string;
      missing?: string[];
      /** On reviewHold: the reply that raised it, whose hold, and when. */
      heldMessage?: string;
      heldAt?: string;
      customerId?: string;
    };

export async function sendPaperworkText(
  dealId: string,
  input: { attested: boolean; resend?: boolean },
): Promise<SendPaperworkResult> {
  const access = await requireCurrentAdminPermission("documents:deliver");
  if (!access.ok) {
    return { ok: false, code: "forbidden", error: access.error };
  }

  if (!dealership.paperworkTextsEnabled) {
    return {
      ok: false,
      code: "disabled",
      error: "Texting paperwork is not turned on for this dealership yet.",
    };
  }

  const sale = await getSaleDetail(dealId);
  if (!sale) return { ok: false, code: "noDeal", error: "No such sale." };
  if (!sale.buyer?.id) {
    return { ok: false, code: "noBuyer", error: "This sale has no buyer on it." };
  }
  if (!isLanguageSettled(sale.stepData)) {
    return {
      ok: false,
      code: "languageUnsettled",
      error: "Answer what language the sale is in first.",
    };
  }

  const rawPhone = sale.buyer.phone?.trim() ?? "";
  let phone: string;
  try {
    phone = normalizePhone(rawPhone);
  } catch {
    return { ok: false, code: "noPhone", error: "The buyer has no usable phone number." };
  }

  const service = createServiceClient();
  // STOP received before a customer record existed must still win now.
  const phoneConsent = await smsConsentFor(service, phone);
  if (!phoneConsent.allowed && phoneConsent.reason !== "no_consent") {
    return { ok: false, code: phoneConsent.reason === "revoked" ? "optedOut" : "generic", error: "Text permission could not be confirmed." };
  }

  // Opt-out and the review hold override everything, whatever the operator
  // attests. Consent passes on global granted OR the attestation.
  const optOut = await getCustomerSmsOptOut(service, { customerId: sale.buyer.id });
  if (optOut.blocked) {
    return { ok: false, code: "optedOut", error: "This customer has opted out of texts." };
  }
  const { data: holdRow } = await service
    .from("customers")
    .select("sms_review_hold_at, sms_review_hold_reason, sms_review_hold_cleared_by")
    .eq("id", sale.buyer.id)
    .maybeSingle();
  if (holdRow?.sms_review_hold_at && !holdRow.sms_review_hold_cleared_by) {
    return {
      ok: false,
      code: "reviewHold",
      error:
        "This customer's last reply needs a person to read it first.",
      // The words that raised the hold, so the person clearing it has
      // actually read them — the screen shows this above the clear button.
      heldMessage: holdRow.sms_review_hold_reason ?? "",
      heldAt: holdRow.sms_review_hold_at,
      customerId: sale.buyer.id,
    };
  }
  const consent = await assertSmsConsent(service, {
    customerId: sale.buyer.id,
    bypassQuietHours: true, // the buyer is at the desk; this is their receipt
  });
  if (!consent.allowed && consent.reason !== "no_consent") {
    return { ok: false, code: consent.reason, error: "This customer cannot be texted." };
  }
  if (!consent.allowed && !input.attested) {
    return {
      ok: false,
      code: "needsAttestation",
      error: "Tick the box saying the buyer asked for the text, or capture consent first.",
    };
  }

  // A deal whose funding nobody has answered has no defined document set;
  // requiredDocumentTypes would quietly assume cash, and an unclassified
  // in-house deal would text without its financing contract. Fail closed.
  if (!sale.funding.type) {
    return {
      ok: false,
      code: "fundingUnset",
      error: "Answer how they are paying first.",
    };
  }

  // What the packet will carry, current-row-first-then-executed.
  const selection = await selectDeliverable(
    service,
    dealId,
    sale.funding.type,
    sale.language ?? "en",
    settledPlan(sale.stepData),
    sale.vehicle?.titleStatus ?? null,
  );
  /**
   * Fail closed on ANY missing required document, not only on all of them:
   * a cash deal texting its bill of sale while the 130-U is unsigned is a
   * packet claiming to be the paperwork while missing a third of it. Same
   * for language: on a Spanish-conducted deal every delivered document must
   * be the Spanish record (FTC 455.5); a stored null is not a match.
   */
  if (selection.missing.length > 0) {
    return {
      ok: false,
      code: "nothingEligible",
      error: "Not everything is signed yet. Sign the paperwork first.",
      missing: selection.missing,
    };
  }
  const dealLanguage = sale.language === "es" ? "es" : "en";
  const mismatched = selection.deliverable.filter(
    (agreement) => agreement.language !== dealLanguage,
  );
  if (mismatched.length > 0) {
    return {
      ok: false,
      code: "languageMismatch",
      error: "A signed document does not match the language of the sale.",
      missing: mismatched.map((agreement) => agreement.documentType),
    };
  }

  // An identical live invite is reused rather than superseded: double-click,
  // two tabs, and an impatient second press all land here.
  const { data: liveInvite } = await service
    .from("paperwork_invites")
    .select("id, manifest_hash, recipient_phone, status, expires_at")
    .eq("deal_id", dealId)
    .eq("active", true)
    .maybeSingle();

  // Materialize the frozen bytes first — before any invite row exists — so
  // a storage failure leaves nothing half-issued.
  const entries: ManifestEntry[] = [];
  for (const agreement of selection.deliverable) {
    entries.push(await materializeEntry(service, dealId, agreement));
  }
  const hash = manifestHash(entries);

  /**
   * Reuse only an invite that actually went somewhere. A row still
   * `pending` means the process died between persisting and Telnyx
   * answering — the buyer has no text — so it is superseded and reissued
   * like a failure rather than reported as sent.
   */
  if (
    liveInvite &&
    !input.resend &&
    liveInvite.status !== "pending" &&
    liveInvite.status !== "failed" &&
    liveInvite.manifest_hash === hash &&
    liveInvite.recipient_phone === phone &&
    new Date(liveInvite.expires_at).getTime() > Date.now()
  ) {
    return {
      ok: true,
      inviteId: liveInvite.id,
      reused: true,
      status: "accepted",
      documents: entries.map((entry) => entry.documentType),
      inkOnly: selection.inkOnly,
    };
  }

  // Supersede whatever is live — a corrected packet or a corrected phone
  // must never leave the old 14-day link alive — then insert the successor.
  // The partial unique index is the serialization point: if two requests
  // race, the loser's insert fails and it reuses the winner.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86400000);
  const token = newInviteToken();

  // The gate's factor: DOB or licence last-4 off the confirmed licence.
  // Neither on file -> a one-time access code the operator conveys out
  // loud. Never phone digits; the SMS holder has the phone.
  const licence = readBuyerId(sale.stepData);
  const hasFactor = Boolean(settled(licence.dateOfBirth) || settled(licence.licenseNumber));
  const accessCode = hasFactor ? null : newAccessCode();

  if (liveInvite) {
    await service
      .from("paperwork_invites")
      .update({ active: false, revoked_at: now.toISOString() })
      .eq("id", liveInvite.id)
      .eq("active", true);
    await service.from("paperwork_invite_events").insert({
      invite_id: liveInvite.id,
      event: "superseded",
    });
  }

  const insert = await service
    .from("paperwork_invites")
    .insert({
      deal_id: dealId,
      customer_id: sale.buyer.id,
      recipient_phone: phone,
      token_hash: sha256Hex(token),
      access_code_hash: accessCode ? sha256Hex(accessCode) : null,
      manifest: entries,
      manifest_hash: hash,
      consent_basis: "paperwork_delivery",
      consent_attested: input.attested,
      consent_wording_hash: input.attested ? sha256Hex(CONSENT_WORDING) : null,
      issued_by: access.user!.id,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (insert.error || !insert.data) {
    if (insert.error?.code === "23505") {
      // Lost the race. The winner's invite stands ONLY if it is the same
      // packet to the same phone; anything else means the deal changed
      // under two concurrent sends, and the honest answer is "press it
      // again" rather than claiming somebody's stale link was sent.
      const { data: winner } = await service
        .from("paperwork_invites")
        .select("id, status, manifest_hash, recipient_phone")
        .eq("deal_id", dealId)
        .eq("active", true)
        .maybeSingle();
      if (
        winner &&
        winner.status !== "pending" &&
        winner.status !== "failed" &&
        winner.manifest_hash === hash &&
        winner.recipient_phone === phone
      ) {
        return {
          ok: true,
          inviteId: winner.id,
          reused: true,
          status: "accepted",
          documents: entries.map((entry) => entry.documentType),
          inkOnly: selection.inkOnly,
        };
      }
      // The winner is stalled, failed, or a different packet: nobody can
      // honestly claim a text went out. Say so and let the operator press
      // it again — the retry supersedes whatever is stuck.
      return {
        ok: false,
        code: "raceRetry",
        error: "Two sends collided. Press it again.",
      };
    }
    return { ok: false, code: "notIssued", error: "Could not issue the link. Try again." };
  }
  const inviteId = insert.data.id as string;
  await service.from("paperwork_invite_events").insert({
    invite_id: inviteId,
    event: "issued",
    detail: { by: access.user!.id, manifestHash: hash },
  });

  // The message: fixed template, deal's language, the link and nothing else.
  const url = inviteUrl(SITE_URL, token);
  const name = sale.buyer.name?.trim().split(/\s+/)[0] ?? "";
  const body = sale.language === "es" ? TEMPLATE_ES(name, url) : TEMPLATE_EN(name, url);

  const sent = await sendSMS(phone, body);
  const sentAt = new Date().toISOString();

  await service
    .from("paperwork_invites")
    .update(
      sent.success
        ? {
            status: "accepted",
            provider_message_id: sent.messageId ?? null,
            sent_at: sentAt,
            accepted_at: sentAt,
          }
        : {
            status: "failed",
            sent_at: sentAt,
            failed_at: sentAt,
            failure_reason: sent.error ?? "Send failed",
          },
    )
    .eq("id", inviteId)
    .eq("status", "pending");
  await service.from("paperwork_invite_events").insert({
    invite_id: inviteId,
    event: "sent",
    detail: { success: sent.success, error: sent.error ?? null },
  });

  // The log the operations screens read: redacted template, token elided.
  try {
    await createSmsMessage(service, {
      customerId: sale.buyer.id,
      direction: "outbound",
      body: `${sale.language === "es" ? TEMPLATE_ES(name, "[enlace]") : TEMPLATE_EN(name, "[link]")} [paperwork invite ${inviteId}]`,
      fromNumber: process.env.TELNYX_PHONE_NUMBER || "",
      toNumber: phone,
      telnyxMessageId: sent.messageId ?? null,
      status: sent.success ? "sent" : "failed",
      providerStatus: sent.success ? "accepted" : "send_failed",
      errorMessage: sent.error ?? null,
    });
  } catch {
    // The invite row and its events already hold the record; the operations
    // log is a mirror, and a mirror failing is not a reason to unsend.
  }

  revalidatePath(`/admin/sales/${dealId}/packet`);
  return {
    ok: true,
    inviteId,
    reused: false,
    status: sent.success ? "accepted" : "failed",
    ...(accessCode ? { accessCode } : {}),
    documents: entries.map((entry) => entry.documentType),
    inkOnly: selection.inkOnly,
  };
}
