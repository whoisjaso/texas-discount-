"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import { casMergeStepData } from "@/lib/sales/step-data-write";
import {
  applyPlanAnswer,
  isPlanQuestionId,
  isValidAnswer,
  isPlanQuestionAnswered,
  planEditRefusal,
  planQuestions,
  readSalePlan,
  SALE_PLAN_KEY,
  INSPECTION_NOTICE_VERSION,
  type PlanQuestionId,
} from "@/lib/sales/sale-plan";
import { filedBillOfSaleOn } from "@/lib/sales/filed-bill-of-sale";
import { BILL_OF_SALE_TYPES } from "@/lib/sales/down-payment-freeze";
import {
  BILL_OF_SALE_FROZEN_CODE,
  FREEZE_MESSAGES,
  PLAN_FROZEN_CODE,
  planHeldMessage,
  type FreezeField,
} from "@/lib/sales/bill-of-sale-freeze";
import { getFunnelStrings } from "@/lib/sales/i18n";

/**
 * Recording ONE answer about how this sale works.
 *
 * Each prescreen question is its own page, so each writes on its own. The
 * first draft of this action took a whole plan out of a FormData and refused
 * unless every question was answered, which meant the FIRST answer on a new
 * sale could never save: the other fields were absent, absent read as null,
 * and the completeness gate rejected it. Adversarial review caught that
 * before it shipped.
 *
 * The write is deliberately narrow in a second way that matters more. The
 * old version read the current plan inside the CAS callback and then threw
 * that read away, rewriting the entire nested object from the client's copy.
 * On a retry, that copy is stale, and a retried insurance save would erase an
 * inspection answer that had already committed. So the callback now applies
 * only the submitted field to whatever is CURRENTLY stored, and returns only
 * the plan key. That is the whole reason a compare-and-set merge exists, and
 * the previous shape defeated it one layer above.
 */

export type SalePlanState =
  | { ok: true; complete: boolean; next: PlanQuestionId | null }
  | { ok: false; error: string; code?: undefined }
  | { ok: false; error: string; code: typeof BILL_OF_SALE_FROZEN_CODE; field: FreezeField }
  | {
      ok: false;
      error: string;
      code: typeof PLAN_FROZEN_CODE;
      /** The filed documents holding the answer, by type, for the screen to name in its language. */
      blockedBy: string[];
      heldBy: "billOfSale" | "powerOfAttorney";
    };

/**
 * The plan answers the bill of sale prints in its Still To Do, and the field a
 * refusal names for each (owner's decision 10/02/2026). Who signs the title
 * application and whether the price includes registration are not printed on
 * it; the documents that do print them hold them (planEditRefusal).
 */
const PRINTED_PLAN_FIELDS: Partial<Record<PlanQuestionId, FreezeField>> = {
  registrationBy: "registration",
  inspectionBy: "inspection",
  insuranceShown: "insurance",
};

/** The bill of sale's Still To Do, as it prints from a plan. */
function printedStillToDo(plan: ReturnType<typeof readSalePlan>) {
  return {
    registration: plan.registrationBy === "buyer" ? "buyer" : "dealer",
    inspection: plan.inspectionBy ?? "",
    insurance: plan.insuranceShown === null ? "" : String(plan.insuranceShown),
  };
}

/** The wire shape: a question id and its answer, nothing else. */
export type PlanAnswer = {
  questionId: string;
  value: string | boolean;
  inspectionAcknowledged?: boolean;
};

/**
 * Answers arrive from a form as strings. "true"/"false" become booleans for
 * the two yes-or-no questions; the enum questions keep their string. Anything
 * else is refused rather than coerced, because a coerced answer on a document
 * that decides a legal packet is worse than an error message.
 */
function normalize(id: PlanQuestionId, raw: string | boolean): unknown {
  if (id === "priceIncludesRegistration" || id === "insuranceShown") {
    if (typeof raw === "boolean") return raw;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  }
  return raw;
}

export async function saveSalePlanAnswer(
  dealId: string,
  answer: PlanAnswer,
): Promise<SalePlanState> {
  const access = await requireAdminActionPermission("sales:manage");
  if (!access.ok) return { ok: false, error: access.error };
  if (!dealId) return { ok: false, error: "No sale was named." };

  const { questionId } = answer;
  if (!isPlanQuestionId(questionId)) {
    return { ok: false, error: "That is not a question on this sale." };
  }

  const value = normalize(questionId, answer.value);
  if (!isValidAnswer(questionId, value)) {
    return { ok: false, error: "That is not an answer to that question." };
  }
  if (questionId === "inspectionBy" && value === "buyer" && answer.inspectionAcknowledged !== true) {
    return { ok: false, error: "Acknowledge the dealer's inspection responsibility before choosing the customer." };
  }

  try {
    const supabase = await createClient();

    /*
      A plan answer is frozen once a document it decides has been signed.

      Switching registration after a 130-U is finalized would drop it from
      the required list, and switching back would bring it back reading as
      already done, because guide completion is recovered by document type.
      A signed document must not silently reattach to a sale whose terms
      changed underneath it. Reopening is a real feature that does not exist
      yet, so the honest answer is to refuse and name what is holding it.
    */
    const { data: finalized, error: finalizedError } = await supabase
      .from("document_agreements")
      .select("document_type, voided_at")
      .eq("deal_id", dealId)
      .not("finalized_at", "is", null);
    // Fail closed: a plan answer never moves past documents nobody could read.
    if (finalizedError) throw new Error("Filed documents could not be checked.");

    // A voided copy holds nothing (owner's decision 10/02/2026).
    const finalizedTypes = ((finalized ?? []) as Array<{ document_type: string | null; voided_at?: string | null }>)
      .filter((row) => !row.voided_at)
      .map((row) => row.document_type)
      .filter((type): type is string => Boolean(type));

    const frozen = planEditRefusal(finalizedTypes);
    if (frozen) {
      const stored = readSalePlan(
        (await supabase.from("deals").select("step_data").eq("id", dealId).maybeSingle())
          .data?.step_data,
      );
      // Only a CHANGE is refused. Answering a question that has never been
      // answered is still allowed, because it cannot invalidate anything.
      const held = isPlanQuestionAnswered(stored, questionId);
      const wouldChange =
        held &&
        JSON.stringify(applyPlanAnswer(stored, questionId, value as Parameters<typeof applyPlanAnswer>[2])) !==
          JSON.stringify(stored);
      if (wouldChange) {
        /*
          Named, with the way out (owner's decision 10/02/2026): voiding the
          bill of sale voids every one of these but the power of attorney,
          ink on the county's form, which needs a new one instead.
        */
        const byPowerOfAttorney = frozen.blockedBy.includes("powerOfAttorney");
        const titles = getFunnelStrings("en").documents as Record<string, string>;
        return {
          ok: false,
          code: PLAN_FROZEN_CODE,
          blockedBy: [...frozen.blockedBy],
          heldBy: byPowerOfAttorney ? "powerOfAttorney" : "billOfSale",
          error: planHeldMessage(
            frozen.blockedBy.map((type) => titles[type] ?? type),
            byPowerOfAttorney,
          ),
        };
      }
    }

    /*
      A refusal has to be a refusal, not a quiet success.

      `casMergeStepData` treats a null patch as "nothing to change, that is a
      success", which is right for its own purposes and wrong here: a stale
      screen's save would return ok and the corridor would navigate as though
      the answer had landed. So the domain refusal is recorded out here and
      checked after the merge returns.
    */
    let refusal: string | null = null;

    /*
      The filed bill of sale prints the plan's Still To Do: who files the
      title and registration, where the inspection stands and whether proof
      of insurance was shown (owner's decision 10/02/2026). An answer that
      would print differently is refused, an open row included (it printed
      as open). Known from the read above when a bill of sale filed at the
      desk is among it; otherwise looked up, between two passes of the merge,
      only when the printed Still To Do would actually change, which also
      finds one the older e-sign path completed. Fails closed.
    */
    const printedField = PRINTED_PLAN_FIELDS[questionId] ?? null;
    let billFiled: boolean | undefined = finalizedTypes.some((type) =>
      (BILL_OF_SALE_TYPES as readonly string[]).includes(type),
    )
      ? true
      : undefined;
    let needsLookup: boolean = false;
    let frozenField: FreezeField | null = null;
    let merged: Awaited<ReturnType<typeof casMergeStepData>> = { ok: false, error: "write-failed" };

    for (let pass = 0; pass < 2; pass += 1) {
      needsLookup = false;
      frozenField = null;
      merged = await casMergeStepData(supabase, dealId, (current) => {
        // Read fresh on every attempt, including retries.
        const stored = readSalePlan(current);
        const owed = planQuestions(stored);

        /*
          A question this sale no longer asks.

          An operator who walked back and switched registration to the dealer
          may still have the price screen mounted; its save must not land.
        */
        if (!owed.includes(questionId)) {
          refusal = "That question is not part of this sale any more.";
          return null;
        }

        /*
          And a question it has not reached.

          Membership alone is not enough: with registration unanswered the
          chain still contains inspection and insurance, so a hand-built
          request could answer them out of order and leave the branch question
          hanging. Everything before this one must be answered first.
        */
        const position = owed.indexOf(questionId);
        const unansweredBefore = owed
          .slice(0, position)
          .find((id) => !isPlanQuestionAnswered(stored, id));
        if (unansweredBefore) {
          refusal = "Answer the questions in order.";
          return null;
        }

        refusal = null;
        const next = applyPlanAnswer(
          stored,
          questionId,
          value as Parameters<typeof applyPlanAnswer>[2],
        );
        if (questionId === "inspectionBy" && value === "buyer") {
          next.inspectionAcknowledgment = {
            at: new Date().toISOString(),
            by: access.user!.id,
            version: INSPECTION_NOTICE_VERSION,
          };
        }
        if (printedField) {
          const before = printedStillToDo(stored);
          const after = printedStillToDo(next);
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            if (billFiled === undefined) {
              needsLookup = true;
              return null;
            }
            if (billFiled) {
              frozenField = printedField;
              return null;
            }
          }
        }
        // ONLY the plan key. casMergeStepData spreads the patch over current,
        // so returning the whole blob would defeat the narrow-patch contract
        // that keeps a retry from erasing a sibling answer.
        return { [SALE_PLAN_KEY]: next };
      });
      if (!needsLookup) break;
      billFiled = (await filedBillOfSaleOn(dealId)) !== null;
    }

    if (refusal) return { ok: false, error: refusal };
    if (frozenField) {
      const field: FreezeField = frozenField;
      return { ok: false, code: BILL_OF_SALE_FROZEN_CODE, field, error: FREEZE_MESSAGES[field] };
    }
    if (!merged.ok) throw new Error("Could not save that. Try again.");

    /*
      Where to go, from the chain as it stands AFTER the write.

      Not "the first unanswered question anywhere": on a completed buyer plan
      switched back to dealer, the price answer is cleared and the chain
      shortens, and the honest destination is the question that now follows
      this one. Looking forward from this question's position gives that;
      scanning from the start would return null and send a half-answered plan
      to the packet.
    */
    const after = readSalePlan(merged.stepData);
    const owedAfter = planQuestions(after);
    const from = owedAfter.indexOf(questionId);
    const next =
      owedAfter.slice(from + 1).find((id) => !isPlanQuestionAnswered(after, id)) ??
      owedAfter.find((id) => !isPlanQuestionAnswered(after, id));

    revalidatePath(`/admin/sales/${dealId}`);
    return { ok: true, complete: next === undefined, next: next ?? null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not save that. Try again.",
    };
  }
}
