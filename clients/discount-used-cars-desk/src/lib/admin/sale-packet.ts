import { createClient } from "@/lib/supabase/server";
import { SALE_DOCUMENTS } from "@/lib/admin/sale-desk";

/**
 * Everything one sale produced, in one place, reachable from anywhere.
 *
 * The reason this exists is a working day, not an architecture. A sale can be
 * run start to finish on a phone at the kerb, and a phone cannot reach a
 * printer without an adapter or a cable nobody has. So the paperwork has to be
 * somewhere a computer can open half an hour later: sign in, find the deal,
 * print. Nothing is regenerated from live rows to do it, because a document is
 * a record of what was agreed on a day and rebuilding it later would quietly
 * rewrite it every time a phone number changed.
 *
 * What is filed is what is offered. The rows below come from
 * `document_agreements` and each one already has a PDF endpoint behind it, so
 * this module's whole job is to say which documents exist for a deal, when
 * each was filed, and what to call it.
 */

export type PacketDocument = {
  /** The `document_agreements` row, which is what the PDF endpoint wants. */
  id: string;
  documentType: string;
  /** The name a person uses for it, from the packet registry. */
  title: string;
  /** Three or four words answering "which one is that?". */
  gloss: string;
  /** When it was signed and filed. Null on a row that never finalized. */
  filedAt: string | null;
  /** A draft is listed too, and says so, rather than being hidden. */
  finalized: boolean;
  /**
   * Whether a PDF can be opened for it at all.
   *
   * Every document but one prints from its row. The power of attorney
   * signed on the county's secure VTR-271-A is the exception: that is a
   * controlled paper form, the signed original is the record, and nothing
   * on this screen can reproduce it. Its row says so instead of offering
   * two buttons that answer with an error.
   */
  printable: boolean;
  /** The buyer's own stroke is on it, from the desk pad or the signing ceremony. */
  signed: boolean;
  /** A printable payload exists, so the ceremony can show a sheet. */
  hasCompletedLink: boolean;
};

/** A title for a `document_type` the packet registry does not name. */
function titleFor(documentType: string): { title: string; gloss: string } {
  const entry = SALE_DOCUMENTS.find((candidate) => candidate.documentType === documentType);
  if (entry) return { title: entry.title, gloss: entry.gloss };
  // A type filed by some older path. Better a readable fallback than a row
  // that reads "chargebackAcknowledgment" to somebody at a desk.
  const spaced = documentType.replace(/([a-z])([A-Z0-9])/g, "$1 $2");
  return { title: spaced.charAt(0).toUpperCase() + spaced.slice(1), gloss: "On file" };
}

/**
 * Every document filed against one deal, newest first.
 *
 * Ordered by when it was filed rather than by the packet's own order, because
 * this screen answers "what came out of this sale" rather than "what is left
 * to do". The guide answers the second one and is the right place for it.
 */
export async function getSalePacket(dealId: string, options: { statusOnly?: boolean } = {}): Promise<PacketDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_agreements")
    .select(options.statusOnly
      ? "id, document_type, status, finalized_at, completed_at, created_at, has_buyer_signature, signed_at, instrument:form_data->>instrument, legacy_signature:form_data->>signature"
      : "id, document_type, status, finalized_at, completed_at, created_at, form_data, has_buyer_signature, signed_at, completed_link")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    document_type: string | null;
    status: string | null;
    finalized_at: string | null;
    completed_at: string | null;
    created_at: string | null;
    form_data: unknown;
    has_buyer_signature: boolean | null;
    signed_at: string | null;
    completed_link: string | null;
    instrument?: string | null;
    legacy_signature?: string | null;
  }>;

  const documents = rows
    .filter((row) => Boolean(row.id && row.document_type))
    .map((row) => {
      const documentType = row.document_type as string;
      const { title, gloss } = titleFor(documentType);
      const form =
        row.form_data && typeof row.form_data === "object"
          ? (row.form_data as Record<string, unknown>)
          : {};
      return {
        id: row.id,
        documentType,
        title,
        gloss,
        filedAt: row.signed_at ?? row.finalized_at ?? row.completed_at ?? row.created_at,
        finalized:
          Boolean(row.finalized_at) ||
          Boolean(row.completed_at) ||
          row.status === "completed" ||
          row.status === "finalized",
        printable: !(documentType === "powerOfAttorney" && (row.instrument ?? form.instrument) === "VTR-271-A"),
        signed: Boolean(row.has_buyer_signature) || Boolean(row.signed_at) || Boolean(row.legacy_signature ?? form.signature),
        hasCompletedLink: Boolean(row.completed_link),
      };
    });

  /*
    A draft under a filed copy is not "started, not signed".

    "Preview The PDF" saves the deal's draft row for that document so the
    preview draws the same bytes the filing would. Preview after filing (to
    check a signature landed, to print again) and that draft outlived the
    signed copy on this screen as a second row reading "Started, not
    signed", which is the one sentence a packet must not say about a
    document the buyer has signed. The filed row is the record; a draft of
    the same type is its scaffolding.
  */
  const filedTypes = new Set(documents.filter((d) => d.finalized).map((d) => d.documentType));
  return documents.filter((d) => d.finalized || !filedTypes.has(d.documentType));
}

/** Where a filed document's PDF lives. Opens in the browser rather than saving. */
export function packetViewHref(agreementId: string): string {
  return `/api/documents/agreements/${encodeURIComponent(agreementId)}/pdf?inline=true`;
}

/** The same PDF, as a download. */
export function packetDownloadHref(agreementId: string): string {
  return `/api/documents/agreements/${encodeURIComponent(agreementId)}/pdf`;
}
