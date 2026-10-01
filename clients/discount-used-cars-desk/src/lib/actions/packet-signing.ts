"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { verifySigningToken } from "@/lib/sales/signing-token";
import { decodeCompletedLinkFromUrl, encodeCompletedLink } from "@/lib/documents/customerPortal";
import { spanishEsignBlocked } from "@/lib/legal/spanish-esign";
import { businessDateToday } from "@/lib/documents/us-date";
import { SITE_URL } from "@/lib/dealership-config";

/**
 * The buyer's stroke, landing on the document it signs.
 *
 * Called from the signing ceremony with the session token rather than an
 * admin session: the person holding the iPad or their own phone is the
 * buyer, and they are signed in to nothing. The token is the authority, and
 * it is narrow: it names ONE deal, and this action refuses any row that
 * does not belong to that deal.
 *
 * What it writes is exactly what the desk pad writes when the buyer signs
 * on the review screen, so every print path downstream is unchanged: the
 * completed link is rebuilt with the buyer stroke and its date, and the
 * row's own signature facts are set. The 130-U's applicant band and the
 * bill of sale's buyer line draw from the same stored stroke they always
 * drew from. Nothing else on the row changes; a signature is an addition
 * to a filed record, never an edit of it.
 *
 * ESIGN's four legs, in the row: intent (a stroke on the sheet the buyer
 * scrolled to the end of), attribution (this session, minted for this deal
 * at this desk, and the browser that drew it), association (the stroke is
 * drawn onto the document it signs) and retention (the filed row).
 */

export type SignPacketResult = { ok: true; signedAt: string } | { ok: false; error: string };

const SIGNATURE_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export async function signPacketDocument(
  token: string,
  agreementId: string,
  signatureDataUrl: string,
  reading: {
    scrolledToEnd: boolean;
    /** The client says the stroke was kept from an earlier document. */
    reused?: boolean;
    /** And that the signer ticked the consent for putting it on this one. */
    reuseConsent?: boolean;
  },
): Promise<SignPacketResult> {
  const session = verifySigningToken(token);
  if (!session.ok) {
    return { ok: false, error: session.reason === "expired" ? "expired" : "invalid" };
  }
  if (!SIGNATURE_PATTERN.test(signatureDataUrl) || signatureDataUrl.length < 200) {
    return { ok: false, error: "noSignature" };
  }
  if (!reading.scrolledToEnd) {
    // The page cannot advance without the scroll, so this is belt and
    // braces against a client that skipped it: the reading is part of the
    // signing.
    return { ok: false, error: "notRead" };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("document_agreements")
    .select("id, deal_id, document_type, language, completed_link, form_data, finalized_at, completed_at, status")
    .eq("id", agreementId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "notFound" };

  const row = data as {
    id: string;
    deal_id: string | null;
    document_type: string | null;
    language: string | null;
    completed_link: string | null;
    form_data: unknown;
    finalized_at: string | null;
    completed_at: string | null;
    status: string | null;
  };

  if (row.deal_id !== session.dealId) return { ok: false, error: "notFound" };

  /*
    A stroke reused across documents needs the signer's say-so, each time.

    The client reports reuse; the server does not take its word for the
    opposite. The same bytes already on another signed row of this deal
    ARE a reused stroke, whatever the client said, and without the consent
    tick the signing is refused. This is the brief's rule made structural:
    one signature, several contracts, only with an explicit yes per
    contract, and the yes recorded beside the stroke.
  */
  const { data: siblings } = await supabase
    .from("document_agreements")
    .select("id, form_data")
    .eq("deal_id", session.dealId)
    .neq("id", agreementId)
    .eq("has_buyer_signature", true);
  const sameStroke = (siblings ?? []).some((sibling) => {
    const form = (sibling as { form_data: unknown }).form_data;
    return Boolean(form && typeof form === "object" && (form as Record<string, unknown>).signature === signatureDataUrl);
  });
  const reused = Boolean(reading.reused) || sameStroke;
  if (reused && !reading.reuseConsent) return { ok: false, error: "reuseConsent" };
  if (row.document_type === "powerOfAttorney") return { ok: false, error: "inkOnly" };
  const finalized =
    Boolean(row.finalized_at) || Boolean(row.completed_at) || row.status === "finalized" || row.status === "completed";
  if (!finalized || !row.completed_link) return { ok: false, error: "notFiled" };
  if (spanishEsignBlocked(row.language, signatureDataUrl)) return { ok: false, error: "spanishEsignBlocked" };

  const decoded = decodeCompletedLinkFromUrl(row.completed_link);
  if (!decoded) return { ok: false, error: "notFiled" };

  const signedOn = businessDateToday();
  const now = new Date().toISOString();
  const completedLink = encodeCompletedLink(
    decoded.s,
    decoded.dd as Record<string, unknown>,
    (decoded.cd ?? {}) as Record<string, unknown>,
    SITE_URL,
    decoded.ds,
    decoded.dsd,
    signatureDataUrl,
    signedOn,
    decoded.cs,
    decoded.csd,
    decoded.bi,
    decoded.ack as Record<string, boolean> | undefined,
  );

  // Who drew it, for the record beside the stroke. The user agent is what
  // the browser says it is; it is attribution evidence, not authentication.
  const agent = (await headers()).get("user-agent") ?? "";
  const form = row.form_data && typeof row.form_data === "object" ? (row.form_data as Record<string, unknown>) : {};

  const { error: writeError } = await supabase
    .from("document_agreements")
    .update({
      completed_link: completedLink,
      form_data: {
        ...form,
        signature: signatureDataUrl,
        signedAt: now,
        signedVia: "ceremony",
        signedUserAgent: agent.slice(0, 240),
        readToEndAt: now,
        // The record of the reuse and of the consent that allowed it.
        signatureReused: reused,
        ...(reused ? { signatureReuseConsentAt: now } : {}),
      },
      has_buyer_signature: true,
      signed_at: now,
    })
    .eq("id", row.id);
  if (writeError) return { ok: false, error: "writeFailed" };

  return { ok: true, signedAt: now };
}
