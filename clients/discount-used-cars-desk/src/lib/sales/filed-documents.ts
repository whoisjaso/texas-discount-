import { isFiledAgreement, type FiledAgreementRow } from "@/lib/sales/down-payment-freeze";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";

/**
 * A deal's filed documents, as records that can be voided (owner's decision
 * 10/02/2026; SOP "The documents", Voiding and filing again).
 *
 * A document row goes draft, then filed, then signed, then voided. Voided is
 * terminal: the row is never updated, deleted, signed or counted again, and
 * it stays readable under the packet's Voided Copies with who voided it, when
 * and why. "Current" means filed and not voided (`isFiledAgreement` itself now
 * answers false for a voided row), so every reader that counts the packet
 * skips a voided copy without a second rule of its own.
 *
 * Pure apart from `readDealAgreements`, which is the one read the filing
 * gates, Complete Sale and the void action share, so none of them hand-rolls
 * the select or forgets to fail closed.
 */

export type AgreementRecord = FiledAgreementRow & {
  id?: string | null;
  created_at?: string | null;
  voided_at?: string | null;
  voided_by_name?: string | null;
  void_reason?: string | null;
  void_group_id?: string | null;
  parent_agreement_id?: string | null;
  has_buyer_signature?: boolean | null;
  signed_at?: string | null;
  language?: string | null;
};

/** The columns every void-aware reader selects. No payloads: no links, no form data. */
export const AGREEMENT_RECORD_COLUMNS =
  "id, document_type, status, finalized_at, completed_at, created_at, voided_at, voided_by_name, void_reason, void_group_id, parent_agreement_id, has_buyer_signature, signed_at, language";

/** Whether a row was voided. A voided row is a record, never a current document. */
export function isVoided(row: { voided_at?: string | null }): boolean {
  return Boolean(row.voided_at);
}

/** Filed and not voided: the copy the packet counts and the ceremony offers. */
export function isCurrentFiled(row: AgreementRecord): boolean {
  return !isVoided(row) && isFiledAgreement(row);
}

function at(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** When the deal's latest void happened, or null when nothing was ever voided. */
export function latestVoidAt(
  rows: readonly { voided_at?: string | null; id?: string | null; document_type?: string | null }[],
): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (!row.voided_at) continue;
    const ms = at(row.voided_at);
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
      latest = row.voided_at;
    } else if (!Number.isFinite(ms) && latest === null) {
      // An unreadable time still says a void happened.
      latest = row.voided_at;
    }
  }
  return latest;
}

/** When a row was filed, by the same columns the packet dates it with. */
export function filedAtOf(row: AgreementRecord): string | null {
  return row.finalized_at ?? row.completed_at ?? row.created_at ?? null;
}

/**
 * The bill of sale's figure list: the documents that print the bill of sale's
 * own figures or answers (verified against the renderers: corridor-link.ts and
 * the salvage sheets). Filing one of them needs a current bill of sale first,
 * and one filed before the current bill of sale counts as owed again.
 */
export const PRINTS_BILL_OF_SALE_FIGURES: Readonly<Record<"billOfSale" | "salvageBillOfSale", readonly string[]>> = {
  billOfSale: ["financing", "form130U", "vehicleResponsibility"],
  salvageBillOfSale: ["financing", "towAwayAcknowledgment"],
};

/** The newest current copy of one type, or null. */
export function currentCopy(rows: readonly AgreementRecord[], type: string): AgreementRecord | null {
  let best: AgreementRecord | null = null;
  for (const row of rows) {
    if (row.document_type !== type || !isCurrentFiled(row)) continue;
    if (!best || (at(filedAtOf(row)) || 0) > (at(filedAtOf(best)) || 0)) best = row;
  }
  return best;
}

/**
 * What has to be filed again before the packet is whole.
 *
 * 1. Every type that was voided and has no current copy (limited to what the
 *    sale owes now, when that is known: a plan changed after the void may no
 *    longer owe a voided acknowledgment).
 * 2. On a deal that has had a void, any current document in the bill of
 *    sale's figure list filed before the current bill of sale: it was drawn
 *    from figures the void took away (the race between a void and a filing at
 *    the same moment). Deals that never had a void are left exactly as they
 *    were, whatever order their documents were filed in.
 */
export function refileTypes(rows: readonly AgreementRecord[], owed?: readonly string[]): string[] {
  const voided = new Set<string>();
  const current = new Set<string>();
  for (const row of rows) {
    const type = row.document_type;
    if (!type) continue;
    if (isVoided(row)) voided.add(type);
    else if (isFiledAgreement(row)) current.add(type);
  }
  const out: string[] = [];
  const push = (type: string) => {
    if (owed && !owed.includes(type)) return;
    if (!out.includes(type)) out.push(type);
  };
  for (const type of voided) if (!current.has(type)) push(type);
  if (voided.size > 0) {
    for (const root of ["billOfSale", "salvageBillOfSale"] as const) {
      const bill = currentCopy(rows, root);
      if (!bill) {
        /*
          No current bill of sale of this kind, but its voided copy: a
          document from its figure list that is still current was filed while
          no bill of sale stated its figures (the race with the void), so it
          is owed again too. The database refuses that filing now; this keeps
          the count honest for any row that slipped through before.
        */
        if (voided.has(root)) {
          for (const type of PRINTS_BILL_OF_SALE_FIGURES[root]) if (currentCopy(rows, type)) push(type);
        }
        continue;
      }
      const billAt = at(filedAtOf(bill));
      for (const type of PRINTS_BILL_OF_SALE_FIGURES[root]) {
        const copy = currentCopy(rows, type);
        if (copy && Number.isFinite(billAt) && at(filedAtOf(copy)) < billAt) push(type);
      }
    }
  }
  return out;
}

type AgreementReader = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};

/**
 * Every document row of one deal, voided ones included, without payloads.
 * Throws when the read fails: every caller refuses rather than act on a
 * packet nobody could read.
 */
export async function readDealAgreements(client: unknown, dealId: string): Promise<AgreementRecord[]> {
  const { data, error } = await (client as AgreementReader)
    .from("document_agreements")
    .select(AGREEMENT_RECORD_COLUMNS)
    .eq("deal_id", dealId);
  if (error) throw new Error("Filed documents could not be checked.");
  return ((data ?? []) as AgreementRecord[]).filter((row) => Boolean(row));
}

type LinkReader = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

/**
 * What one filed copy printed: the document data of its completed link (the
 * dealer half, where every figure lives), or null when it carries no link.
 * Throws when the read fails, so a filing compared against it refuses.
 */
export async function readPrintedData(client: unknown, agreementId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await (client as LinkReader)
    .from("document_agreements")
    .select("completed_link")
    .eq("id", agreementId)
    .maybeSingle();
  if (error) throw new Error("Filed documents could not be checked.");
  const link = (data as { completed_link?: unknown } | null)?.completed_link;
  if (typeof link !== "string" || !link) return null;
  const decoded = decodeCompletedLinkFromUrl(link);
  return decoded?.dd && typeof decoded.dd === "object" ? (decoded.dd as Record<string, unknown>) : null;
}
