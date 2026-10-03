import { refileTypes } from "@/lib/sales/filed-documents";

/** Public packet facts only: no signing tokens, completed links or form data. */
export type PacketStatusDocument = {
  id: string;
  documentType: string;
  title: string;
  gloss: string;
  filedAt: string | null;
  finalized: boolean;
  printable: boolean;
  signed: boolean;
  /**
   * Voided with the bill of sale (owner's decision 10/02/2026). Optional so a
   * status reader from before the void keeps validating. A voided copy is a
   * record: never current, never counted, never signed.
   */
  voided?: boolean;
  voidedAt?: string | null;
  voidedByName?: string | null;
  voidReason?: string | null;
  voidGroupId?: string | null;
  /** On a re-filed copy, the voided copy it replaces. */
  replacesId?: string | null;
  /** When it was filed (not signed): orders a re-filing against the bill of sale. */
  finalizedAt?: string | null;
};

/**
 * Where the packet stands.
 *
 * `refile` counts what must be filed again after a void: a voided type the
 * sale still owes with no current copy, and a document printing the bill of
 * sale's figures that was filed before the current bill of sale. The packet
 * is never "ready" while one is waiting. `owed` is the sale's own packet when
 * the caller knows it.
 */
export function packetProgress(
  documents: readonly PacketStatusDocument[],
  dealerSignsTitle = false,
  owed?: readonly string[],
) {
  const current = currentPacketDocuments(documents);
  const filed = current.filter((document) => document.finalized);
  const needsBuyer = filed.filter((document) => document.documentType !== "powerOfAttorney" && !(dealerSignsTitle && document.documentType === "form130U"));
  const signed = needsBuyer.filter((document) => document.signed).length;
  const drafts = current.length - filed.length;
  const refile = packetRefileTypes(documents, owed).length;
  return {
    filed: filed.length,
    signed,
    total: needsBuyer.length,
    pending: needsBuyer.length - signed,
    drafts,
    refile,
    complete: filed.length > 0 && signed === needsBuyer.length && drafts === 0 && refile === 0,
  };
}

/** What must be filed again after a void, by document type (filed-documents.ts, refileTypes). */
export function packetRefileTypes(documents: readonly PacketStatusDocument[], owed?: readonly string[]): string[] {
  return refileTypes(
    documents.map((document) => ({
      id: document.id,
      document_type: document.documentType,
      voided_at: document.voided ? (document.voidedAt ?? "voided") : null,
      finalized_at: document.finalized ? (document.finalizedAt ?? document.filedAt ?? null) : null,
      status: document.finalized ? "finalized" : "pending",
    })),
    owed,
  );
}

/** The signing ceremony uses the newest filed copy of each document type. A voided copy is never current. */
export function currentPacketDocuments(documents: readonly PacketStatusDocument[]) {
  const live = documents.filter((document) => !document.voided);
  const filedTypes = new Set(live.filter((document) => document.finalized).map((document) => document.documentType));
  const seen = new Set<string>();
  return live.filter((document) => {
    if (!document.finalized) return !filedTypes.has(document.documentType);
    if (seen.has(document.documentType)) return false;
    seen.add(document.documentType);
    return true;
  });
}

export function packetRevision(documents: readonly PacketStatusDocument[]) {
  return JSON.stringify(documents.map(({ id, documentType, finalized, printable, signed, filedAt, voided }) => [id, documentType, finalized, printable, signed, filedAt, Boolean(voided)]));
}

export function packetPollDelay(failures: number, waiting: boolean) {
  return failures > 0 ? Math.min(30_000, 2_000 * 2 ** Math.min(failures, 4)) : waiting ? 2_000 : 20_000;
}

const optionalText = (value: unknown) => value === undefined || value === null || typeof value === "string";

export function isPacketStatusDocument(value: unknown): value is PacketStatusDocument {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return ["id", "documentType", "title", "gloss"].every((key) => typeof row[key] === "string") &&
    ["finalized", "printable", "signed"].every((key) => typeof row[key] === "boolean") &&
    (row.filedAt === null || typeof row.filedAt === "string") &&
    (row.voided === undefined || typeof row.voided === "boolean") &&
    ["voidedAt", "voidedByName", "voidReason", "voidGroupId", "replacesId", "finalizedAt"].every((key) => optionalText(row[key]));
}
