import { createHash } from "node:crypto";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/service";
import { brand } from "@/lib/dealership-config";
import { isGmailConfigured } from "@/lib/gmail";
import { gmailSendFrom, sendViaGmail } from "@/lib/email/gmail-transport";
import { titleCaseSubject } from "@/lib/email/subject";
import { brandInlineImages } from "@/lib/email/brand-images";

/**
 * The one way this product sends an email.
 *
 * Shaped by the Track D review, finding by finding:
 *
 *   - The outbox row is claimed BEFORE the provider call, under a unique
 *     business key: a retry of the same event finds the claim and does not
 *     send twice; a crash between claim and result leaves `pending`, which
 *     an operator can see and resolve instead of guessing.
 *   - The result is a discriminated state, never a boolean, and never a
 *     throw: `accepted` means the provider took it (acceptance, NOT
 *     delivery), `rejected` means it said no, `unknown` means the call
 *     itself died after dispatch, `not_configured` names the missing key.
 *     Each CALLER decides what its failure means — an owner alert is
 *     best-effort; a recovery email is the whole feature.
 *   - The outbox stores template, recipient fingerprint, provider id,
 *     state, error code. Never a body, never an address, never a token:
 *     bodies hold bearer links and temporary credentials, and a log that
 *     stores them is a breach with timestamps.
 *
 * Identities: `support` signs people mail and is the reply-to for
 * everything; `documents` signs document mail (owner's split, 29 Aug).
 */

export type EmailIdentity = "support" | "documents";

export type SendEmailInput = {
  /** Unique per business EVENT (e.g. `password-reset/<uid>/<hour-bucket>`). */
  businessKey: string;
  template: string;
  to: string;
  language: "en" | "es";
  subject: string;
  html: string;
  text: string;
  from?: EmailIdentity;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
};

/** What the transports are handed: the caller's files plus the brand's inline pictures. */
type TransportAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  contentId?: string;
  inline?: boolean;
};

export type SendEmailResult =
  | { state: "accepted"; providerId: string }
  | { state: "rejected"; errorCode: string }
  | { state: "unknown" }
  | { state: "not_configured" }
  | { state: "duplicate"; priorState: string };

export function recipientFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function fromAddress(identity: EmailIdentity): string {
  return identity === "documents"
    ? `${brand.full} <${brand.mailFrom}>`
    : `${brand.full} <${brand.supportFrom}>`;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const identity = input.from ?? "support";
  // Every word capitalised, on every subject, decided here rather than in ten
  // templates that each have to remember. Both providers below read this.
  const subject = titleCaseSubject(input.subject);
  const resendKey = process.env.RESEND_API_KEY?.trim();

  let outbox: ReturnType<typeof createServiceClient>;
  try {
    outbox = createServiceClient();
  } catch {
    // No service credentials (local preview). Nothing durable can be
    // claimed, so nothing sends: preview never emails real people.
    return { state: "not_configured" };
  }

  // The claim. A duplicate business key answers with the prior state
  // instead of a second send — this is the idempotency, durable-first.
  const { data: claimed, error: claimError } = await outbox
    .from("email_outbox")
    .insert({
      business_key: input.businessKey,
      template: input.template,
      recipient_fingerprint: recipientFingerprint(input.to),
      language: input.language,
      from_identity: identity,
      state: "pending",
      attempts: 1,
    })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") {
      const { data: prior } = await outbox
        .from("email_outbox")
        .select("state")
        .eq("business_key", input.businessKey)
        .maybeSingle();
      return { state: "duplicate", priorState: (prior?.state as string) ?? "pending" };
    }
    // The claim itself failed: without durability there is no safe send.
    return { state: "unknown" };
  }
  const rowId = (claimed as { id: string }).id;

  async function record(patch: Record<string, unknown>) {
    await outbox
      .from("email_outbox")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", rowId);
  }

  /**
   * Which door the mail leaves by.
   *
   * The dealership's own Gmail, when GMAIL_SEND_FROM names it and the
   * pipeline's OAuth token is there (owner's call: mail comes from one of
   * our Gmails). Resend otherwise. Neither configured is recorded as such
   * rather than guessed at.
   */
  const gmailFrom = gmailSendFrom();
  const viaGmail = Boolean(gmailFrom) && isGmailConfigured();

  // The monogram and the wordmark ride inside the message, so the letter
  // carries its own mark wherever it is opened (see brand-images.ts).
  const attachments: TransportAttachment[] = [
    ...(input.attachments ?? []),
    ...(await brandInlineImages(input.html).catch(() => [])),
  ];

  if (!viaGmail && !resendKey) {
    await record({ state: "rejected", error_code: "no_transport" });
    return { state: "not_configured" };
  }

  if (viaGmail && gmailFrom) {
    try {
      const { id } = await sendViaGmail({
        from: `${brand.full} <${gmailFrom}>`,
        to: input.to,
        replyTo: brand.supportReplyTo,
        subject,
        html: input.html,
        text: input.text,
        attachments,
      });
      await record({ state: "accepted", provider_id: `gmail:${id}` });
      return { state: "accepted", providerId: `gmail:${id}` };
    } catch (error) {
      // Gmail answers synchronously: a thrown send is a rejection with a
      // reason (scope, quota, a bad address), not an unknown.
      const code = error instanceof Error ? error.message : "gmail_rejected";
      await record({ state: "rejected", error_code: String(code).slice(0, 80) });
      return { state: "rejected", errorCode: String(code) };
    }
  }

  try {
    const resend = new Resend(resendKey);
    const { data, error } = await resend.emails.send({
      from: fromAddress(identity),
      to: input.to,
      replyTo: brand.supportReplyTo,
      subject,
      html: input.html,
      text: input.text,
      ...(attachments.length > 0
        ? {
            attachments: attachments.map((file) => ({
              filename: file.filename,
              content: file.content,
              ...(file.contentType ? { contentType: file.contentType } : {}),
              ...(file.contentId ? { contentId: file.contentId } : {}),
            })),
          }
        : {}),
    });

    // A resolved error is a rejection, not a success — two of the old
    // senders marked these sent (Track D review).
    if (error || !data?.id) {
      const code = (error && "name" in error ? error.name : null) ?? "rejected_no_id";
      await record({ state: "rejected", error_code: String(code).slice(0, 80) });
      return { state: "rejected", errorCode: String(code) };
    }

    await record({ state: "accepted", provider_id: data.id });
    return { state: "accepted", providerId: data.id };
  } catch {
    // Dispatch died mid-call: the provider MAY have taken it. Saying
    // "failed" could double-send on retry; saying "sent" could lose it.
    // sent_unknown says exactly what is known.
    await record({ state: "sent_unknown", error_code: "dispatch_exception" });
    return { state: "unknown" };
  }
}

/**
 * Mark a claim as deliberately not sent (eligibility said no). The claim
 * still exists, so the request is on the record without a byte leaving.
 */
export async function skipEmail(businessKey: string, template: string, reason: string): Promise<void> {
  try {
    const outbox = createServiceClient();
    await outbox.from("email_outbox").insert({
      business_key: businessKey,
      template,
      recipient_fingerprint: "skipped",
      state: "skipped",
      error_code: reason.slice(0, 80),
    });
  } catch {
    // Best-effort by definition.
  }
}
