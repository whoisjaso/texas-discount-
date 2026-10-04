"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { createClient } from "@/lib/supabase/server";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { buildGuideSteps } from "@/lib/sales/guide";
import { readDealAgreements, type AgreementRecord } from "@/lib/sales/filed-documents";
import {
  VOIDED_WITH_BILL_OF_SALE,
  VOID_MESSAGES,
  canVoidDocuments,
  voidEligibility,
  type TitleApplicationAnswer,
  type VoidRefusalCode,
} from "@/lib/sales/void-bill-of-sale";

/**
 * Void the filed bill of sale, and every document its figures or its buyer
 * reached (owner's decision 10/02/2026; SOP "The documents", Voiding and
 * filing again).
 *
 * An Owner or a Manager only, with a typed reason, after answering whether
 * the title application has gone to the county ("Not Yet" is the only answer
 * that lets it go ahead; the answer is recorded). Nothing is deleted: the
 * database function marks the filed rows voided with who, when and why, in
 * one transaction with the audit event, switches off the texted signing link
 * and revokes any texted copy. The sale's money and plan are free again, and
 * the corridor files the documents again through its normal steps.
 *
 * Who voided is the session's own roster row, so an owner signed in through
 * ADMIN_EMAIL with no row is refused: the record must name a person.
 */

export type VoidBillOfSaleResult =
  | {
      ok: true;
      voided: Array<{ id: string; documentType: string; wasSigned: boolean }>;
      /** Where to go next: the screen the void was asked from, or the summary. */
      next: string;
    }
  | { ok: false; code: VoidRefusalCode | "signedOut"; error: string };

function refuse(code: VoidRefusalCode, error?: string): VoidBillOfSaleResult {
  return { ok: false, code, error: error ?? VOID_MESSAGES[code] };
}

/** The database function's named refusals, said the way the desk hears them. */
const RPC_REFUSALS: Record<string, VoidRefusalCode> = {
  forbidden: "voidNotAllowed",
  reason_required: "voidReasonRequired",
  sale_closed: "voidSaleClosed",
  title_filed: "voidTitleFiled",
  title_question: "voidTitleQuestion",
  not_current: "voidNotCurrent",
};

export async function voidBillOfSaleAction(
  dealId: string,
  input: {
    rootId: string;
    reason: string;
    titleApplication: TitleApplicationAnswer;
    /** The guide step the void was asked from, to land back on. */
    returnTo?: string | null;
  },
): Promise<VoidBillOfSaleResult> {
  const access = await requireAdminActionPermission("documents:manage");
  if (!access.ok) {
    return access.code === "role"
      ? refuse("voidNotAllowed")
      : { ok: false, code: "signedOut", error: access.error };
  }
  if (!dealId) return refuse("voidNothingFiled");

  // The pure rules once before anything is read: who, the reason, the title.
  const early = voidEligibility({
    role: access.role,
    hasMember: Boolean(access.member),
    reason: input.reason,
    titleApplication: input.titleApplication,
    dealStatus: "in_progress",
    rows: [],
    stepData: null,
  });
  if (!early.ok && early.code !== "voidNothingFiled" && early.code !== "voidNotCurrent") {
    return refuse(early.code);
  }
  if (!canVoidDocuments(access.role) || !access.member) return refuse("voidNotAllowed");

  // The deal and its documents, read fail closed.
  let rows: AgreementRecord[];
  let deal: { id: string; status: string | null; step_data: unknown } | null;
  try {
    const data = await createAdminDataClient();
    const read = await data.from("deals").select("id, status, step_data").eq("id", dealId).maybeSingle();
    if (read.error) throw read.error;
    deal = (read.data as typeof deal) ?? null;
    rows = await readDealAgreements(data, dealId);
  } catch {
    return refuse("voidCouldNotCheck");
  }
  if (!deal) return refuse("voidNothingFiled");

  const verdict = voidEligibility({
    role: access.role,
    hasMember: true,
    reason: input.reason,
    titleApplication: input.titleApplication,
    dealStatus: deal.status,
    rows,
    rootId: input.rootId || null,
    stepData: deal.step_data,
  });
  if (!verdict.ok) return refuse(verdict.code);

  const member = access.member;
  const memberName =
    member.full_name?.trim() || member.display_name?.trim() || access.user?.email || "A team member";
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("void_filed_documents", {
      p_deal_id: dealId,
      p_root_id: verdict.plan.root.id,
      p_types: [...VOIDED_WITH_BILL_OF_SALE],
      p_reason: verdict.reason,
      p_at: new Date().toISOString(),
      // Kept in the audit event's metadata only; the database derives who
      // voided from the session itself.
      p_detail: {
        titleApplication: "notYet",
        memberId: member.id,
        memberName,
        dealStatus: deal.status,
      },
    });
    if (error) {
      const message = typeof error.message === "string" ? error.message : "";
      return refuse(RPC_REFUSALS[message] ?? "voidFailed");
    }
    // Whether each was signed, read off the rows the function voided (locked
    // as it voided them), not off the read made before it ran.
    const voided = (
      (data ?? []) as Array<{
        id: string;
        document_type: string | null;
        has_buyer_signature?: boolean | null;
        signed_at?: string | null;
      }>
    ).map((row) => ({
      id: row.id,
      documentType: row.document_type ?? "",
      wasSigned: Boolean(row.has_buyer_signature) || Boolean(row.signed_at),
    }));

    const base = `/admin/sales/${encodeURIComponent(dealId)}`;
    for (const path of [base, `${base}/packet`, `${base}/summary`, `${base}/guide`, "/admin/sales"]) {
      revalidatePath(path);
    }

    /*
      Back to the screen the void was asked from, when it is a step of this
      sale, so the change that needed the void is one tap away; otherwise the
      summary, which says what was voided. Never a URL the caller made up.
    */
    let next = `${base}/summary?voided=1`;
    const returnTo = input.returnTo?.trim();
    if (returnTo) {
      const sale = await getSaleDetail(dealId).catch(() => null);
      if (sale && buildGuideSteps(sale).some((step) => step.key === returnTo)) {
        next = `${base}/guide/${encodeURIComponent(returnTo)}?from=summary`;
      }
    }
    return { ok: true, voided, next };
  } catch {
    return refuse("voidFailed");
  }
}
