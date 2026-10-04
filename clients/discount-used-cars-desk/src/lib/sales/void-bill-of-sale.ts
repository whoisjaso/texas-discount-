import { hasTeamPermission, type TeamRole } from "@/lib/operations/team";
import {
  PRINTS_BILL_OF_SALE_FIGURES,
  filedAtOf,
  isCurrentFiled,
  latestVoidAt,
  type AgreementRecord,
} from "@/lib/sales/filed-documents";
import { PLATE_RECORDED_AT_KEY, readPlate } from "@/lib/sales/webdealer";

export { PRINTS_BILL_OF_SALE_FIGURES };

/**
 * Voiding a filed bill of sale, and what goes with it (owner's decision
 * 10/02/2026: "Void the bill of sale and file it again" now has a way to do
 * it). Pure: the action, the database function's mirror in the preview mock,
 * the packet screen and the tests all read these rules.
 *
 * Nothing is deleted. Voiding marks the filed rows voided, with who, when and
 * why, and they stay in the packet under Voided Copies; the buyer's signature
 * on them stops counting, and the new copies are filed and signed again.
 */

/** The bill-of-sale family: the sheets that state the sale's figures as a bill of sale. */
export const BILL_OF_SALE_ROOTS = ["billOfSale", "salvageBillOfSale"] as const;

/**
 * Every current filed copy of these is voided with the bill of sale.
 *
 * Wider than the documents that print its figures, on purpose: the owner's
 * decision unfreezes the sale's money AND its plan, and every plan-derived
 * sheet (insurance acknowledgment, rebuilt disclosure, the tow-away sheets)
 * holds the plan while it is filed; every one of them also prints the buyer's
 * name and address the bill of sale freezes. Voiding them costs a signature,
 * never a record.
 */
export const VOIDED_WITH_BILL_OF_SALE = [
  "billOfSale",
  "salvageBillOfSale",
  "financing",
  "form130U",
  "vehicleResponsibility",
  "insuranceAcknowledgment",
  "rebuiltDisclosure",
  "towAwayAcknowledgment",
  "buyerResponsibilityStatement",
] as const;

/**
 * Never voided at the desk: the power of attorney is ink on the county's
 * form (and, on a newer car, the secure VTR-271-A), so the paper is the
 * record and the desk cannot take it back. While it is filed it keeps the
 * plan answers and the buyer's name and address as they are.
 */
export const NEVER_VOIDED_AT_DESK = ["powerOfAttorney"] as const;

export const VOID_REASON_MIN = 10;
export const VOID_REASON_MAX = 500;

/** Owner and Manager: the roles holding documents:manage. */
export function canVoidDocuments(role: TeamRole | null | undefined): boolean {
  return hasTeamPermission(role, "documents:manage");
}

export type VoidRefusalCode =
  | "voidNotAllowed"
  | "voidNeedsTeamRow"
  | "voidReasonRequired"
  | "voidReasonTooLong"
  | "voidTitleQuestion"
  | "voidTitleSubmitted"
  | "voidTitleFiled"
  | "voidSaleClosed"
  | "voidNothingFiled"
  | "voidNotCurrent"
  | "voidCouldNotCheck"
  | "voidFailed";

/** The English sentences; the screens render funnel.void.errors.* in the corridor's language. */
export const VOID_MESSAGES: Record<VoidRefusalCode, string> = {
  voidNotAllowed: "Only an owner or a manager can void a filed bill of sale.",
  voidNeedsTeamRow:
    "Your account has no row on the team, so the record could not name who voided it. Add your team row first.",
  voidReasonRequired: `Say why it is being voided, in at least ${VOID_REASON_MIN} characters.`,
  voidReasonTooLong: `Keep the reason under ${VOID_REASON_MAX} characters.`,
  voidTitleQuestion: "Answer whether the title application has gone to the county.",
  voidTitleSubmitted:
    "The title application already went to the county with these figures, so the bill of sale is not voided at the desk. Correct it with the county first; ask the owner.",
  voidTitleFiled:
    "A plate was recorded on this sale after the bill of sale was filed, so the title application has gone to the county. The bill of sale is not voided at the desk; ask the owner.",
  voidSaleClosed:
    "This sale is closed: the car is marked sold and the sale is in Past Sales. Its paperwork is not voided at the desk; ask the owner.",
  voidNothingFiled: "There is no filed bill of sale on this sale to void.",
  voidNotCurrent: "That copy is no longer the filed one. Reload the paperwork.",
  voidCouldNotCheck: "The paperwork could not be checked, so nothing was voided. Try again.",
  voidFailed: "It could not be voided. Nothing changed. Try again.",
};

/**
 * Invisible format characters: soft hyphen, zero-width spaces and joiners,
 * the bidi marks and overrides, word joiners and the byte-order mark. Ten of
 * them passed as a ten-character reason that reads as nothing, and a bidi
 * override can make the kept reason read backwards in the packet history.
 * The database function drops the same set.
 */
const FORMAT_CHARACTERS = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/**
 * The reason as it is kept: control characters turned to spaces, invisible
 * format characters dropped, whitespace collapsed, trimmed, and between 10
 * and 500 characters, counted as the database counts them (code points, so
 * an emoji is one character, not two). Anyone who opens the record reads it,
 * so it must say something.
 */
export function cleanVoidReason(
  raw: unknown,
): { ok: true; reason: string } | { ok: false; code: "voidReasonRequired" | "voidReasonTooLong" } {
  const text = typeof raw === "string" ? raw : "";
  const reason = text
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(FORMAT_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim();
  const length = [...reason].length;
  if (length < VOID_REASON_MIN) return { ok: false, code: "voidReasonRequired" };
  if (length > VOID_REASON_MAX) return { ok: false, code: "voidReasonTooLong" };
  return { ok: true, reason };
}

export { PLATE_RECORDED_AT_KEY };

/**
 * The desk's own evidence that the title application went to the county: a
 * plate recorded at or after the bill of sale was filed. A plate with no
 * recorded time counts as evidence (fail safe), and so does a filing time
 * nobody can read. A plate typed from stock before filing is not evidence.
 */
export function titleEvidenceAfterFiling(stepData: unknown, rootFiledAt: string | null | undefined): boolean {
  if (!readPlate(stepData)) return false;
  const recorded =
    stepData && typeof stepData === "object"
      ? (stepData as Record<string, unknown>)[PLATE_RECORDED_AT_KEY]
      : undefined;
  if (typeof recorded !== "string" || !recorded.trim()) return true;
  const recordedMs = Date.parse(recorded);
  const filedMs = Date.parse(rootFiledAt ?? "");
  if (!Number.isFinite(recordedMs) || !Number.isFinite(filedMs)) return true;
  return recordedMs >= filedMs;
}

export type VoidPlan = {
  /** The current filed bill of sale being voided. */
  root: AgreementRecord;
  /** Every current filed row voided with it, the root included. */
  voids: AgreementRecord[];
  /** Current filed rows that stay on file (the power of attorney). */
  stays: AgreementRecord[];
};

const isRootType = (type: string | null | undefined): boolean =>
  BILL_OF_SALE_ROOTS.includes(type as (typeof BILL_OF_SALE_ROOTS)[number]);

/**
 * What a void of the current bill of sale takes, as a plan, or the refusal
 * when there is nothing current to void. `rootId` pins the copy the screen
 * showed: a stale or voided one is refused rather than voiding a newer copy
 * nobody looked at.
 */
export function voidPlan(
  rows: readonly AgreementRecord[],
  rootId?: string | null,
): { ok: true; plan: VoidPlan } | { ok: false; code: "voidNothingFiled" | "voidNotCurrent" } {
  const current = rows.filter(isCurrentFiled);
  const roots = current.filter((row) => isRootType(row.document_type));
  if (roots.length === 0) return { ok: false, code: "voidNothingFiled" };
  let root = roots[0];
  if (rootId) {
    const named = roots.find((row) => row.id === rootId);
    if (!named) return { ok: false, code: "voidNotCurrent" };
    root = named;
  } else {
    for (const row of roots) {
      if ((Date.parse(filedAtOf(row) ?? "") || 0) > (Date.parse(filedAtOf(root) ?? "") || 0)) root = row;
    }
  }
  const voidable = new Set<string>(VOIDED_WITH_BILL_OF_SALE);
  const voids = current.filter((row) => voidable.has(row.document_type ?? ""));
  const stays = current.filter((row) => !voidable.has(row.document_type ?? ""));
  return { ok: true, plan: { root, voids, stays } };
}

export type TitleApplicationAnswer = "notYet" | "submitted" | null | undefined;

export type VoidEligibilityInput = {
  role: TeamRole | null | undefined;
  /** The voider's roster row exists: the record must name who voided. */
  hasMember: boolean;
  reason: unknown;
  titleApplication: TitleApplicationAnswer;
  dealStatus: string | null | undefined;
  rows: readonly AgreementRecord[];
  rootId?: string | null;
  stepData: unknown;
};

/**
 * Every rule a void must pass, in the order the refusals are said. The
 * database function checks the same ones again under the deal's lock.
 */
export function voidEligibility(
  input: VoidEligibilityInput,
): { ok: true; reason: string; plan: VoidPlan } | { ok: false; code: VoidRefusalCode } {
  if (!canVoidDocuments(input.role)) return { ok: false, code: "voidNotAllowed" };
  if (!input.hasMember) return { ok: false, code: "voidNeedsTeamRow" };
  const reason = cleanVoidReason(input.reason);
  if (!reason.ok) return { ok: false, code: reason.code };
  if (input.titleApplication === "submitted") return { ok: false, code: "voidTitleSubmitted" };
  if (input.titleApplication !== "notYet") return { ok: false, code: "voidTitleQuestion" };
  if (input.dealStatus !== "in_progress") return { ok: false, code: "voidSaleClosed" };
  const planned = voidPlan(input.rows, input.rootId);
  if (!planned.ok) return { ok: false, code: planned.code };
  if (titleEvidenceAfterFiling(input.stepData, filedAtOf(planned.plan.root))) {
    return { ok: false, code: "voidTitleFiled" };
  }
  return { ok: true, reason: reason.reason, plan: planned.plan };
}

/**
 * Whether a signing session was issued before the deal's latest void, and so
 * belongs to documents that no longer count. Token issue times and void times
 * are both the app's clock. A session whose issue time is unknown is revoked
 * only when the deal has had a void at all.
 */
export function signingSessionRevoked(
  issuedAtMs: number | null | undefined,
  rows: readonly { voided_at?: string | null }[],
): boolean {
  const latest = latestVoidAt(rows);
  if (!latest) return false;
  if (typeof issuedAtMs !== "number" || !Number.isFinite(issuedAtMs)) return true;
  const voidMs = Date.parse(latest);
  if (!Number.isFinite(voidMs)) return true;
  return voidMs >= issuedAtMs;
}

/**
 * When a new signing link is dated: now, or just after the deal's latest void
 * when this server's clock reads earlier than the void's (the void is dated
 * by the database's clock at the moment of voiding, which can run a little
 * ahead). A link minted after a void must never be born revoked.
 */
export function signingIssueTime(
  rows: readonly { voided_at?: string | null }[],
  now: number = Date.now(),
): number {
  const latest = latestVoidAt(rows);
  const voidMs = latest ? Date.parse(latest) : NaN;
  return Number.isFinite(voidMs) && voidMs >= now ? voidMs + 1 : now;
}
