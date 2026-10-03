import "server-only";

import { filingFees, getDealerFeeSchedule } from "@/lib/dealership-fees";
import { DOC_FEE_NOTICE_VERSION, printsDocFeeNotice } from "@/lib/legal/doc-fee-notice";
import {
  FEE_OVER_FILED_MAX_MESSAGE,
  dealFeesFromSchedule,
  overLimitKind,
  postedDealerChargesProblem,
  type DealFees,
  type FeeSchedule,
} from "@/lib/sales/fee-schedule";
import { FILING_GATE_MESSAGES } from "@/lib/sales/refile-gates";

/**
 * The dealer-charges gate for the older document routes
 * (`/api/documents/agreements` and its `/complete`), which take a finished
 * document as an encoded link or a pending one as portal data the customer
 * completes from. Checked as the sale's own filing checks it (fee-schedule.ts;
 * rulebook texas-dealer-fees.md 5.4): against the deal's own fees when the
 * document names its deal, else the current schedule. Refused, never
 * trimmed; a schedule nobody could read refuses.
 */

/** The documents that print the dealer's fees. */
export const FEE_DOCUMENTS = new Set(["billOfSale", "salvageBillOfSale", "financing"]);

export const LINK_UNREADABLE =
  "This document's link could not be read, so its fees could not be checked. Nothing was filed.";

export const NOTICE_MISSING =
  "This document carries a documentary fee without the notice Texas requires beside it (Tex. Fin. Code §348.006(c)(3)). Prepare it again from the sale's paperwork.";

export type FeeDocumentRefusal = { status: 422 | 503; error: string; code: string };

/**
 * The first refusal among the payloads a fee document will print from, or
 * null when every one is within the limits.
 */
export async function feeDocumentRefusal(
  dealId: string | null,
  payloads: Array<Record<string, unknown>>,
): Promise<FeeDocumentRefusal | null> {
  if (payloads.length === 0) return null;
  let fees: DealFees;
  let schedule: FeeSchedule;
  if (dealId) {
    const context = await filingFees(dealId);
    if (!context.ok) return { status: 503, error: FILING_GATE_MESSAGES.feeSettingsUnreadable, code: "feeSettingsUnreadable" };
    fees = context.resolved.fees;
    schedule = context.schedule;
  } else {
    const read = await getDealerFeeSchedule();
    if (!read.ok) return { status: 503, error: FILING_GATE_MESSAGES.feeSettingsUnreadable, code: "feeSettingsUnreadable" };
    fees = dealFeesFromSchedule(read.schedule);
    schedule = read.schedule;
  }
  for (const payload of payloads) {
    const problem = postedDealerChargesProblem(payload, fees, schedule);
    if (!problem) continue;
    const filedMax = problem === "feeOverLimit" && overLimitKind(payload, fees, schedule) === "filedMax";
    return { status: 422, error: filedMax ? FEE_OVER_FILED_MAX_MESSAGE : FILING_GATE_MESSAGES[problem], code: problem };
  }
  return null;
}

/** The documentary fee notice's stamp (corridor-link.ts stamps the same at the sale's own filing). */
export function noticeStamp(language: unknown): Record<string, unknown> {
  return { docFeeNotice: DOC_FEE_NOTICE_VERSION, docFeeNoticeSpanish: language === "es" };
}

/** Whether dealer data states a documentary fee above $0 but carries no notice stamp. */
export function carriesUnstampedDocFee(dealerData: Record<string, unknown>): boolean {
  const raw = dealerData.docFee;
  if (raw === null || raw === undefined || raw === "") return false;
  const fee = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,\s]/g, ""));
  if (Number.isFinite(fee) && fee === 0) return false;
  return !printsDocFeeNotice(dealerData);
}
