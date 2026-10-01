import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePdf } from "@/lib/documents/pdf-generator";
import { requiredDocumentTypes } from "@/lib/sales/deal-type";
import type { SalePlan } from "@/lib/sales/sale-plan";
import type { DealType } from "@/lib/sales/deal-type";

/**
 * What a texted packet actually contains, frozen to the byte.
 *
 * The DELIVERY-REQUIRED set is defined separately from the sale-required
 * set on purpose: the walked Power of Attorney is ink on paper and the
 * lender's contract is the lender's portal's — their absence never blocks a
 * send, they are simply named on the send screen as ink-only. The Buyers
 * Guide is a window sticker, printed and never stored, so it has no bytes
 * to freeze.
 *
 * Within the set, selection is CURRENT ROW FIRST, THEN EXECUTED: the latest
 * finalized row per document type must itself be signed. Falling back to an
 * older signed copy of a superseded agreement would text the buyer a
 * version of the deal that no longer stands.
 *
 * The bytes are materialized by the send itself: rendered once through the
 * existing PDF pipeline in buyer-delivery mode (signatures kept, licence
 * imagery stripped), stored content-addressed — the SHA-256 is the path —
 * with upsert off, in a bucket no operator policy can rewrite. A storage
 * failure fails the send closed; there is no warning-and-continue on a path
 * that promises frozen bytes.
 */

export const DELIVERY_BUCKET = "paperwork-deliveries";

/** Renderer version, stamped into every manifest entry. Bump on any change
 *  to the buyer-delivery render path so old manifests say what made them. */
export const DELIVERY_RENDERER_VERSION = "buyer-copy-1";

/** Sale-required types that are ink-on-paper by design, never texted. */
const INK_ONLY_TYPES = new Set(["powerOfAttorney"]);

export type ManifestEntry = {
  agreementId: string;
  documentType: string;
  storagePath: string;
  sha256: string;
  bytes: number;
  contentType: "application/pdf";
  language: string;
  rendererVersion: string;
};

export type DeliverySelection = {
  /** The rows the packet will carry, one per delivery-required type. */
  deliverable: Array<{ id: string; documentType: string; language: string }>;
  /** Sale-required, ink-only, named on the send screen. */
  inkOnly: string[];
  /** Delivery-required types with no executed current row. */
  missing: string[];
};

type AgreementRow = {
  id: string;
  document_type: string | null;
  status: string | null;
  finalized_at: string | null;
  created_at: string | null;
  has_buyer_signature: boolean | null;
  language: string | null;
};

export async function selectDeliverable(
  service: SupabaseClient,
  dealId: string,
  funding: DealType | null,
  dealLanguage: string,
  /**
   * The sale's answered plan, when it has one.
   *
   * Without it this texted the funding-only packet, so a buyer who registers
   * their own vehicle was sent a power of attorney they never signed and the
   * send failed closed on a document that sale does not owe.
   */
  plan?: SalePlan,
  titleStatus?: string | null,
): Promise<DeliverySelection> {
  const required = requiredDocumentTypes(funding, plan, titleStatus);
  const deliveryRequired = required.filter((type) => !INK_ONLY_TYPES.has(type));
  const inkOnly = required.filter((type) => INK_ONLY_TYPES.has(type));

  const { data, error } = await service
    .from("document_agreements")
    .select("id, document_type, status, finalized_at, created_at, has_buyer_signature, language")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as AgreementRow[];
  const deliverable: DeliverySelection["deliverable"] = [];
  const missing: string[] = [];

  for (const type of deliveryRequired) {
    // Current row first: the newest finalized row of this type is THE
    // record of the deal, whatever older rows exist.
    const current = rows.find(
      (row) =>
        row.document_type === type &&
        (row.status === "finalized" || row.status === "completed") &&
        row.finalized_at,
    );
    // ...then executed: that exact row must be signed. An unsigned current
    // row means the packet is not ready, not that an older signed one will
    // do.
    if (current && current.has_buyer_signature) {
      deliverable.push({
        id: current.id,
        documentType: type,
        // The STORED language, unlaundered. A null here is a row from
        // before agreements recorded their language, and the caller's
        // mismatch gate must see it as "does not match", not have it
        // dressed up as the deal's language on the way past.
        language: current.language ?? "",
      });
    } else {
      missing.push(type);
    }
  }

  return { deliverable, inkOnly, missing };
}

/**
 * Render, hash, store, freeze — one entry per agreement, failing closed.
 *
 * The "already exists" answer from storage is treated as success ONLY after
 * re-reading the stored object and matching its bytes: content addressing
 * makes a same-hash collision a same-bytes file, and the verify is what
 * lets a retry after a partially-failed send complete instead of erroring.
 */
export async function materializeEntry(
  service: SupabaseClient,
  dealId: string,
  agreement: { id: string; documentType: string; language: string },
): Promise<ManifestEntry> {
  const pdf = await generatePdf({
    agreementId: agreement.id,
    copyLabel: "BUYER COPY",
    includeSignatures: true,
    stripIdImagery: true,
  });
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const storagePath = `${dealId}/${sha256}.pdf`;

  const upload = await service.storage.from(DELIVERY_BUCKET).upload(storagePath, pdf, {
    contentType: "application/pdf",
    upsert: false,
  });

  if (upload.error) {
    const already = /exists|duplicate/i.test(upload.error.message ?? "");
    if (!already) {
      throw new Error(`Could not store the buyer copy: ${upload.error.message}`);
    }
    const existing = await service.storage.from(DELIVERY_BUCKET).download(storagePath);
    if (existing.error || !existing.data) {
      throw new Error("A stored copy exists but could not be read back to verify.");
    }
    const storedSha = createHash("sha256")
      .update(Buffer.from(await existing.data.arrayBuffer()))
      .digest("hex");
    if (storedSha !== sha256) {
      throw new Error("A stored copy exists under this path with different bytes.");
    }
  }

  return {
    agreementId: agreement.id,
    documentType: agreement.documentType,
    storagePath,
    sha256,
    bytes: pdf.length,
    contentType: "application/pdf",
    language: agreement.language,
    rendererVersion: DELIVERY_RENDERER_VERSION,
  };
}

export function manifestHash(entries: ManifestEntry[]): string {
  const canonical = entries
    .map((entry) => `${entry.documentType}:${entry.sha256}`)
    .sort()
    .join("|");
  return createHash("sha256").update(canonical).digest("hex");
}
