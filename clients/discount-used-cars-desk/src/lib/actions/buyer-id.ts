"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  applyConfirmation,
  applyExtraction,
  MAILING_FIELDS,
  readBuyerId,
  writeBuyerId,
  type AamvaAddress,
  type IdFieldKey,
} from "@/lib/sales/buyer-id";
import { verifyCaptureToken } from "@/lib/sales/capture-token";
import { casMergeStepData } from "@/lib/sales/step-data-write";

/**
 * Writing the buyer's licence onto a deal.
 *
 * Two callers with different authority, kept apart on purpose.
 *
 *   the phone   holds a signed capture token and nothing else. It may attach
 *               an image and the reader's output to the one deal the token
 *               names. It cannot confirm anything.
 *   the desk    holds an admin session. It may confirm values, which is the
 *               only way a value becomes usable by a document.
 *
 * That division is the security model. Whoever is holding the phone is often
 * the customer, and a customer must not be able to mark their own address as
 * verified by the dealership.
 *
 * Every write reads `step_data` first and merges, because the retired
 * paperwork pipeline still keeps answers in there under numeric keys and a
 * whole-column write would drop them.
 */

export type BuyerIdState = { ok: boolean; error?: string };

type AnyClient =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createServiceClient>;

/** Version-checked merge; throws so the callers' try/catch shapes hold. */
async function mergeBuyerId(
  supabase: AnyClient,
  dealId: string,
  build: (current: ReturnType<typeof readBuyerId>) => ReturnType<typeof readBuyerId>,
): Promise<void> {
  const merged = await casMergeStepData(
    supabase as Parameters<typeof casMergeStepData>[0],
    dealId,
    (current) => writeBuyerId(current, build(readBuyerId(current))),
  );
  if (!merged.ok) throw new Error(merged.error);
}

/**
 * The phone, delivering a photograph.
 *
 * `service.ts` says not to use the service client in a server action, and that
 * rule is right: an action normally runs with the operator's session and should
 * be bound by their row-level policies. This is the exception it carves out for
 * webhooks, and for the same reason. The phone has no session at all. The
 * customer holding it is not a user of this system and never will be.
 *
 * What keeps it safe is that the token is verified before the client is
 * created, and `verified.dealId` is the only deal touched. There is no
 * caller-supplied id anywhere in this function, so a service client here cannot
 * be steered at another record.
 *
 * The image is stored as a path rather than the bytes: `step_data` is read on
 * every desk render, and a base64 licence in there would be carried on every
 * one of those reads.
 */
export async function saveCapturedId(
  token: string,
  imagePath: string,
): Promise<BuyerIdState> {
  const verified = verifyCaptureToken(token);
  if (!verified.ok) {
    // The reason is deliberately visible: somebody standing at the desk with an
    // expired link needs to know to ask for a fresh one, and none of the three
    // reasons tells an attacker anything they could not already try.
    const message =
      verified.reason === "expired"
        ? "That link has expired. Ask the desk for a new one."
        : "That link is not valid.";
    return { ok: false, error: message };
  }

  const path = imagePath.trim();
  if (!path) return { ok: false, error: "No image was uploaded." };

  const supabase = createServiceClient();
  await mergeBuyerId(supabase, verified.dealId, (current) => ({
    ...current,
    image: path,
    capturedAt: new Date().toISOString(),
  }));

  // The desk is watching this row, so it advances without anyone refreshing.
  revalidatePath(`/admin/sales/${verified.dealId}`);
  return { ok: true };
}

/**
 * The reader's output.
 *
 * Only ever fills `read`. `applyExtraction` cannot touch a confirmed value, so
 * running this on a second, better photograph never un-decides what a person
 * already settled.
 */
export async function saveExtractedId(
  token: string,
  extracted: Partial<Record<IdFieldKey, string | null>>,
): Promise<BuyerIdState> {
  const verified = verifyCaptureToken(token);
  if (!verified.ok) return { ok: false, error: "That link is not valid." };

  const supabase = createServiceClient();
  await mergeBuyerId(supabase, verified.dealId, (current) =>
    applyExtraction(current, extracted),
  );
  revalidatePath(`/admin/sales/${verified.dealId}`);
  return { ok: true };
}

/**
 * The desk, confirming values.
 *
 * Admin session required, because confirming is the act that makes a value
 * usable by a document. A capture token deliberately cannot reach this.
 */
export async function saveConfirmedId(
  dealId: string,
  formData: FormData,
): Promise<BuyerIdState> {
  const access = await requireAdminActionPermission("sales:manage");
  if (!access.ok) return { ok: false, error: access.error };

  const text = (key: string): string | null => {
    const value = formData.get(key);
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const fields: Partial<Record<IdFieldKey, string | null>> = {};
  for (const key of [
    "name",
    "licenseNumber",
    "dateOfBirth",
    "expires",
    "address",
  ] as const) {
    if (formData.has(key)) fields[key] = text(key);
  }

  const supabase = await createClient();

  // Sent as four parts, because that is what the licence encoded and what the
  // title application asks for. Only applied when the form actually carried
  // them, so a save from somewhere that does not know about the address cannot
  // blank one somebody already confirmed.
  const mailing: Partial<AamvaAddress> = {};
  let sentMailing = false;
  for (const { key } of MAILING_FIELDS) {
    if (!formData.has(`mailing.${key}`)) continue;
    sentMailing = true;
    mailing[key] = text(`mailing.${key}`);
  }

  await mergeBuyerId(supabase, dealId, (current) =>
    applyConfirmation(current, {
      fields,
      ...(sentMailing ? { mailing } : {}),
      // Only a literal "true" from the confirm control counts. Absence is not
      // a confirmation, and neither is any other value.
      ...(formData.has("mailingConfirmed")
        ? { mailingConfirmed: formData.get("mailingConfirmed") === "true" }
        : {}),
    }),
  );
  revalidatePath(`/admin/sales/${dealId}`);
  return { ok: true };
}
