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
};

export function packetProgress(documents: readonly PacketStatusDocument[], dealerSignsTitle = false) {
  const current = currentPacketDocuments(documents);
  const filed = current.filter((document) => document.finalized);
  const needsBuyer = filed.filter((document) => document.documentType !== "powerOfAttorney" && !(dealerSignsTitle && document.documentType === "form130U"));
  const signed = needsBuyer.filter((document) => document.signed).length;
  const drafts = current.length - filed.length;
  return {
    filed: filed.length,
    signed,
    total: needsBuyer.length,
    pending: needsBuyer.length - signed,
    drafts,
    complete: filed.length > 0 && signed === needsBuyer.length && drafts === 0,
  };
}

/** The signing ceremony uses the newest filed copy of each document type. */
export function currentPacketDocuments(documents: readonly PacketStatusDocument[]) {
  const filedTypes = new Set(documents.filter((document) => document.finalized).map((document) => document.documentType));
  const seen = new Set<string>();
  return documents.filter((document) => {
    if (!document.finalized) return !filedTypes.has(document.documentType);
    if (seen.has(document.documentType)) return false;
    seen.add(document.documentType);
    return true;
  });
}

export function packetRevision(documents: readonly PacketStatusDocument[]) {
  return JSON.stringify(documents.map(({ id, documentType, finalized, printable, signed, filedAt }) => [id, documentType, finalized, printable, signed, filedAt]));
}

export function packetPollDelay(failures: number, waiting: boolean) {
  return failures > 0 ? Math.min(30_000, 2_000 * 2 ** Math.min(failures, 4)) : waiting ? 2_000 : 20_000;
}

export function isPacketStatusDocument(value: unknown): value is PacketStatusDocument {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return ["id", "documentType", "title", "gloss"].every((key) => typeof row[key] === "string") &&
    ["finalized", "printable", "signed"].every((key) => typeof row[key] === "boolean") &&
    (row.filedAt === null || typeof row.filedAt === "string");
}
