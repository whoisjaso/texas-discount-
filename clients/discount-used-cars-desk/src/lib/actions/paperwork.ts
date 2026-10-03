"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import {
  paperworkAnswers,
  paperworkMoney,
  questionFact,
  readPaperwork,
  unansweredSwornFacts,
  withDownPayment,
  writePaperwork,
} from "@/lib/sales/paperwork";
import { paperworkFilingContext } from "@/lib/sales/paperwork-filing-context";
import { readMoney } from "@/lib/sales/money";
import { currentCopy, readDealAgreements, readPrintedData } from "@/lib/sales/filed-documents";
import {
  AGREES_WITH_BILL_OF_SALE,
  FILING_GATE_MESSAGES,
  answersDiffer,
  figuresDisagreeWithBillOfSale,
  filingGate,
  replacedCopyId,
  rootFor,
  withServerAnswers,
  type PageGateCode,
} from "@/lib/sales/refile-gates";
import { missingPrintedFields } from "@/lib/documents/field-maps/resolve";
import { poaFieldsFromSale, poaProbe } from "@/lib/documents/poa-fields";
import { isEligibleForPlainPoa } from "@/lib/documents/power-of-attorney-eligibility";
import { saleDateFor } from "@/lib/sales/sale-date";
import { casMergeStepData } from "@/lib/sales/step-data-write";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { getStaffSignature } from "@/lib/actions/staff-signature";
import { SITE_URL } from "@/lib/dealership-config";
import { isLanguageSettled } from "@/lib/sales/deal-language";
import { titleHoldsDocuments, titleRefusesDocuments, TITLE_STATUS_LABELS } from "@/lib/vehicles/title-status";
import { readSalvagePlan } from "@/lib/sales/salvage-plan";
import { readFunding, requiredDocumentTypes } from "@/lib/sales/deal-type";
import { hasTeamPermission } from "@/lib/operations/team";
import { settledPlan } from "@/lib/sales/sale-plan";
import { spanishEsignBlocked } from "@/lib/legal/spanish-esign";
import { businessDateToday } from "@/lib/documents/us-date";
import { documentFilingBlockedReason, filingBlockedReason } from "@/lib/dealership-config";
import { dealerSignerProblem, dealerStroke } from "@/lib/documents/dealer-signer";
import {
  DOWN_PAYMENT_FROZEN_CODE,
  DOWN_PAYMENT_FROZEN_MESSAGE,
  PAID_TODAY_INVALID_CODE,
  PAID_TODAY_INVALID_MESSAGE,
  canonicalPaidToday,
  downPaymentChanges,
} from "@/lib/sales/down-payment-freeze";
import { filedBillOfSaleOn } from "@/lib/sales/filed-bill-of-sale";
import {
  BILL_OF_SALE_FROZEN_CODE,
  FREEZE_MESSAGES,
  billOfSaleStatement,
  frozenFieldsChanged,
  type FreezeField,
} from "@/lib/sales/bill-of-sale-freeze";
import { BILL_OF_SALE_TYPES } from "@/lib/sales/down-payment-freeze";
import { emptyWeightForFiling } from "@/lib/vehicles/empty-weight/on-the-sale";
import { dealerChargesBlockedReason, filingFees, registersNothing, saleFeeLines } from "@/lib/dealership-fees";
import { governmentFeesFilingProblem, type GovernmentFeesFilingProblem } from "@/lib/sales/government-fees";
import { DOC_FEE_DOCUMENTS, isChapter345Vehicle } from "@/lib/legal/chapter-345";
import { FEE_OVER_FILED_MAX_MESSAGE, overLimitKind, type DealerChargesProblem } from "@/lib/sales/fee-schedule";

/**
 * The paperwork answers, and the document they end up as.
 *
 * Two writes with different weights, and they are kept apart on purpose.
 *
 *   an answer     goes on the deal, in `step_data`, and can be changed by
 *                 walking back to the question. Nothing has been signed.
 *   a document    goes in `document_agreements` as a finalized row, which is
 *                 what the packet counts and what an auditor would be shown.
 *
 * The second is the one that matters, and it is written the way the two
 * existing per-page documents write theirs: a single insert carrying
 * `status: "finalized"`, both timestamps, and the whole answered form in
 * `form_data`. Not through the customer-portal chain, which exists to send a
 * document to somebody's email and get it signed remotely, and which cannot
 * express a document signed at the desk in front of you.
 */

export type PaperworkState = {
  ok: boolean;
  error?: string;
  code?:
    | typeof DOWN_PAYMENT_FROZEN_CODE
    | typeof PAID_TODAY_INVALID_CODE
    | typeof BILL_OF_SALE_FROZEN_CODE
    | "billOfSaleAlreadyFiled"
    | "billOfSaleFirst"
    | "figuresChanged"
    | DealerChargesProblem
    | "feeSettingsUnreadable"
    | GovernmentFeesFilingProblem
    | "chapter345Vehicle"
    | PageGateCode;
  /** On a fieldMissing or mustAnswer refusal: the boxes or questions, by name. */
  missing?: string[];
  /** On a billOfSaleFrozen refusal: what the filed bill of sale states that this would change. */
  field?: FreezeField | "generic";
  /** On a feeOverLimit refusal over a filed OCCC maximum (rather than $225.00 with no filing). */
  limit?: "filedMax";
};

/**
 * The deal id is never taken from the client for the document write.
 *
 * It is taken from the URL by the page and passed here, and every read and
 * write below is scoped to it under the operator's own session, so row level
 * security is what actually bounds this rather than a check written by hand.
 */
/** One answer to one question. */
export async function savePaperworkAnswer(
  dealId: string,
  documentType: string,
  key: string,
  typedValue: string,
): Promise<PaperworkState> {
  // The document corridor belongs to two roles: sales under its own
  // scope, registration under its title-work scope (round 4, finding 3).
  const access = await requireAdminActionPermission(["sales:manage", "paperwork:manage"]);
  if (!access.ok) return { ok: false, error: access.error };
  if (!key.trim()) return { ok: false, error: "Nothing to save." };
  // Box 11 arrives with its source or not at all: only the empty-weight
  // screen's own action (actions/empty-weight.ts) writes it.
  if (documentType === "form130U" && (key === "emptyWeight" || key.startsWith("_emptyWeight"))) {
    return { ok: false, error: "Use the empty weight screen." };
  }

  /*
    Who may move the money step from here. The down payment is one fact with
    two homes, but the money step's "down today" belongs to sales
    (sale-money.ts requires sales:manage), and this action also serves the
    registration role, which holds paperwork:manage and not sales:manage
    ("neither may borrow the other's unrelated authority", round 4, finding
    3). So the contract's answer reaches money.paidTodayAmount only for a
    caller with sales:manage, and only on a buy here pay here deal, the one
    packet a financing contract belongs to. Anywhere else the answer stays
    the contract's own, exactly as before, and a cash deal's balance and lien
    can never be moved through a document that is not in its packet.
  */
  /*
    The fact this question is, and the document it is stored with: its own
    owner, so a fact another document prints and borrows here (the 130-U's
    box 10 is the bill of sale's mileage statement) is still one answer in
    one place. An empty answer is refused unless "not applicable" is a real
    answer to the question: a date box submitted empty used to save as
    answered and print as a blank on a signed contract.
  */
  const fact = questionFact(documentType, key);
  const storeDoc = fact && fact.owner !== documentType && !fact.owner.startsWith("guide:") ? fact.owner : documentType;
  if (fact && !fact.optional && typedValue.trim() === "") {
    return { ok: false, error: "Answer this before going on." };
  }

  const movesMoney = hasTeamPermission(access.role, "sales:manage");
  const isDownPayment = documentType === "financing" && key === "downPayment";

  // The down payment is stored as one plain figure, or refused when it is
  // not a dollar amount of zero or more, exactly as the money step stores
  // it (down-payment-freeze.ts, canonicalPaidToday): the note's payment, the
  // contract's itemisation and the bill of sale's balance read the same text.
  const value = isDownPayment ? canonicalPaidToday(typedValue) : typedValue;
  if (value === null) return { ok: false, error: PAID_TODAY_INVALID_MESSAGE, code: PAID_TODAY_INVALID_CODE };

  try {
    const supabase = await createClient();
    /*
      The down payment is frozen once the bill of sale is filed (owner's
      decision 10/01/2026; SOP Freeze): the contract's answer may not state a
      down payment other than the one the filed bill of sale states, whoever
      types it and whether or not it writes back to the money step.
    */
    /*
      And every answer the bill of sale itself prints (owner's decision
      10/02/2026): the mileage statement, how the money was paid, the
      trade-in, the warranty and the licence state on the bill of sale, and
      how a salvage car leaves on the salvage bill of sale. Looked up only
      for those two documents' answers.
    */
    const billAnswer = (BILL_OF_SALE_TYPES as readonly string[]).includes(storeDoc);
    const frozen = isDownPayment || billAnswer ? await filedBillOfSaleOn(dealId) : null;
    let refused: boolean = false;
    let frozenField: FreezeField | null = null;
    // Version-checked merge: the patch is rebuilt from the blob as it
    // stands at each attempt, so an answer typed in a second tab a moment
    // earlier survives this one instead of being silently replayed over.
    const merged = await casMergeStepData(supabase, dealId, (current) => {
      // Only a change to the figure is refused: the same down payment, or
      // the prefilled one the money step already holds, goes through.
      refused =
        isDownPayment &&
        frozen !== null &&
        downPaymentChanges({ advertised: frozen.advertised, stepData: current, to: value });
      if (refused) return null;
      // The down payment is one fact with two homes: written to both in the
      // same transform, so the bill of sale's balance and the contract's
      // amount financed can never disagree (SOP "Money"; financing: "never
      // asked twice"), within the bounds above.
      if (
        isDownPayment &&
        movesMoney &&
        readFunding(current).type === "inHouse"
      ) {
        return withDownPayment(current, value);
      }
      const answers = { ...readPaperwork(current, storeDoc), [key]: value };
      const written = writePaperwork(current, storeDoc, answers);
      frozenField = null;
      if (billAnswer && frozen !== null) {
        const context = { advertised: frozen.advertised, rootType: frozen.type, fees: frozen.printed?.fees ?? null };
        const [field] = frozenFieldsChanged(billOfSaleStatement(current, context), billOfSaleStatement(written, context));
        if (field) {
          frozenField = field;
          return null;
        }
      }
      return written;
    });
    if (refused) return { ok: false, error: DOWN_PAYMENT_FROZEN_MESSAGE, code: DOWN_PAYMENT_FROZEN_CODE };
    if (frozenField) {
      const field: FreezeField = frozenField;
      return { ok: false, code: BILL_OF_SALE_FROZEN_CODE, field, error: FREEZE_MESSAGES[field] };
    }
    if (!merged.ok) throw new Error(merged.error);
  } catch {
    return { ok: false, error: "Could not save that. Try again." };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { ok: true };
}

/**
 * The document itself, signed and filed.
 *
 * `form_data` carries everything the document was built from, not just the
 * answers: the vehicle, the buyer, the dealership's own details as they stood
 * at the moment of signing. A document is a record of what was agreed on a
 * day, and rebuilding it later from live rows would quietly rewrite it every
 * time a phone number changed.
 */
export async function finalizePaperwork(
  dealId: string,
  documentType: string,
  input: {
    buyerName: string;
    vehicleDescription: string;
    vehicleVin: string;
    formData: Record<string, unknown>;
    /** A PNG data URL from the pad, or null for a document signed in ink. */
    signature: string | null;
  },
): Promise<PaperworkState & { agreementId?: string }> {
  const access = await requireAdminActionPermission(["sales:manage", "paperwork:manage"]);
  if (!access.ok) return { ok: false, error: access.error };

  /*
    The fees this filing is checked against (dealership-fees.ts): the
    owner's saved schedule and the sale's own copy resolved against it. Read
    first, because once an owner has saved a schedule (or the sale holds its
    own copy) whether the documentary fee is set is theirs to say, not the
    config's. A read that fails files nothing.
  */
  const feeContext = await filingFees(dealId);
  if (!feeContext.ok) {
    return { ok: false, code: "feeSettingsUnreadable", error: FILING_GATE_MESSAGES.feeSettingsUnreadable };
  }

  // Never file a legal record over a dealer fact nobody has supplied. With
  // no saved schedule and no copy on the sale, the config's facts decide,
  // exactly as they always have.
  const blocked = feeContext.fromSaved ? filingBlockedReason(feeContext.resolved.fees) : filingBlockedReason();
  if (blocked) return { ok: false, error: blocked };
  // A fact only this document prints (the Vehicle Responsibility late fee),
  // refused for this document alone (SOP "Legal content each document must
  // carry"; never invent a dealer fact).
  const docBlocked = documentFilingBlockedReason(documentType);
  if (docBlocked) return { ok: false, error: docBlocked };

  /*
    The person on the dealer line, before anything is read or written.

    The 130-U's seller line prints "Legal Name (First Last)" and the filer's
    saved stroke beside it (owner's instruction 10/01/2026; SOP "Legal
    content each document must carry", 130-U bullet), and every dealer
    signature line prints the same pairing. So the filer must be cleared to
    sign and named at onboarding. This is the old "Authorised signer"
    refusal, now satisfied by the person who actually signs.
  */
  const held = await getStaffSignature().catch(() => null);
  const signerProblem = dealerSignerProblem(held);
  if (signerProblem) return { ok: false, error: signerProblem };

  const now = new Date().toISOString();
  try {
    const supabase = await createClient();

    /**
     * The printable payload, assembled at the moment of filing.
     *
     * `form_data` is the faithful record; `completed_link` is the document.
     * Every print path in the product renders from the link, and corridor
     * rows never carried one, so the packet's Open button answered the
     * funnel's own bill of sale with a raw 500. The walkthrough personas hit
     * it on a phone at the last step of the flow.
     *
     * The dealer's preset signature rides along when the filer has one: they
     * pressed File on a document that shows their name, which is the explicit
     * act the signature is adopted by.
     */
    const sale = await getSaleDetail(dealId);

    /**
     * Two gates, both on stored facts, both before anything is written.
     *
     * The language gate: a document may not be created against a deal whose
     * conducted language nobody has answered — the packet's Spanish-first
     * duty (FTC 455.5; §348.006) is decided by that answer, and a schema
     * default is not an answer. Legacy deals answer it as the guide's first
     * step; nothing already signed is re-questioned.
     *
     * The Spanish e-sign gate: the shared guard both signing paths call.
     * COMPLIANCE_REVIEW.md §10.1 blocks live Spanish e-sign until counsel
     * reviews the Spanish legal copy; filing unsigned for ink stays open,
     * which is how these sales are lawfully conducted today.
     */
    if (sale && !isLanguageSettled(sale.stepData)) {
      return {
        ok: false,
        error:
          "Answer what language the sale is in first. It is the first step of the guide.",
      };
    }
    /**
     * The title gate at the filing, not only at the start.
     *
     * A sale may begin on a salvage title and hold; what it may not do is
     * file a document that assigns a car nobody can assign yet. The guide
     * does not offer the documents while the title holds them, so this is
     * the belt to that brace.
     */
    const salvagePath = sale ? readSalvagePlan(sale.stepData).path : null;
    if (sale && titleHoldsDocuments(sale.vehicle?.titleStatus, salvagePath)) {
      return {
        ok: false,
        error:
          salvagePath === "rebuild"
            ? "The title is still salvage. Rebuild it in our name first; the guide's next step is the title work."
            : "The title is salvage and the sale has not said what happens with it. Answer that first; it is the guide's first step.",
      };
    }
    /*
      A title no document may ever be filed on: unknown, nonrepairable,
      export only. The desk refuses these at the car, so this is reached
      only by a caller that skipped the question, and it is refused with
      the reason rather than filing a bill of sale on a car that cannot be
      sold for the road by anyone.
    */
    const refused = sale ? titleRefusesDocuments(sale.vehicle?.titleStatus) : null;
    if (sale && refused) {
      return {
        ok: false,
        error:
          refused === "unverified"
            ? "Say what the title is first. Nothing files on a title nobody has looked at."
            : `This vehicle cannot be sold: ${TITLE_STATUS_LABELS[sale.vehicle?.titleStatus === "export_only" ? "export_only" : "nonrepairable"]}. No document files on it.`,
      };
    }
    /*
      Only a document this sale owes may be filed on it.

      The corridor never offers the wrong one, but a URL typed by hand can
      reach any document's review screen. On a tow-away sale that is how a
      130-U, a promise of plates on paper, could be filed against a car
      that cannot be registered; on an ordinary sale it is how a salvage
      bill of sale could be filed on a clean car. The packet is the rule,
      and the filing checks it.
    */
    if (sale) {
      const owed = requiredDocumentTypes(
        sale.funding.type,
        settledPlan(sale.stepData),
        sale.vehicle?.titleStatus ?? null,
        salvagePath,
      );
      if (!owed.includes(documentType)) {
        return {
          ok: false,
          error: "This sale does not owe that document. The guide lists the ones it does.",
        };
      }
    }
    if (sale && spanishEsignBlocked(sale.language, input.signature)) {
      return {
        ok: false,
        error:
          "Spanish e-signing is off until the Spanish legal wording is reviewed. File it unsigned and print for ink.",
      };
    }

    /*
      Filing again goes through the same gates, and three more (owner's
      decision 10/02/2026): one current bill of sale per sale (a second is
      filed only after the first is voided), the documents printing its
      figures wait for it, and the figures posted by the review screen must
      be the server's own, recomputed now, so a screen opened before a change
      files nothing. Read through the helper, failing closed: a read that
      errors refuses the filing.
    */
    let replaces: string | null = null;
    // The sale's own fee lines: no registration fee on a tow-away sale.
    const feeLines = sale ? saleFeeLines(feeContext.resolved, sale) : undefined;
    if (sale) {
      const rows = await readDealAgreements(supabase, dealId);
      const owed = requiredDocumentTypes(
        sale.funding.type,
        settledPlan(sale.stepData),
        sale.vehicle?.titleStatus ?? null,
        salvagePath,
      );
      const money = paperworkMoney(
        sale.vehicle?.salePrice,
        readPaperwork(sale.stepData, "billOfSale"),
        readMoney(sale.stepData),
        sale.funding.type,
        feeLines,
      );
      const storedDown = (readPaperwork(sale.stepData, "financing").downPayment ?? "").trim();
      const downPayment = storedDown !== ""
        ? Number(storedDown.replace(/[$,\s]/g, "")) || 0
        : money.paidToday > 0
          ? money.paidToday
          : 0;
      const gate = filingGate({
        documentType,
        rows,
        owed,
        formData: input.formData,
        expected: { money, downPayment },
      });
      if (gate) return { ok: false, code: gate, error: FILING_GATE_MESSAGES[gate] };

      /*
        The answers are the sale's own too, not only the money. The bill of
        sale prints its mileage statement, trade-in, payment method, warranty
        and how a salvage car leaves from the posted answers, and the contract
        its rate, count and payments: a review tab opened before an answer
        changed, or a hand-made request, is refused rather than filing words
        the sale no longer holds. Resolved the way the review screen resolves
        them; the county, the one looked-up input, is the posted one.
      */
      if (documentType !== "powerOfAttorney") {
        const { context } = paperworkFilingContext(
          sale,
          documentType,
          typeof input.formData.countyOfResidence === "string" ? input.formData.countyOfResidence : "",
          feeLines,
        );
        const serverAnswers = paperworkAnswers(documentType, context);
        const moneyKeys = Object.keys(money);
        if (answersDiffer(input.formData, serverAnswers, moneyKeys)) {
          return { ok: false, code: "figuresChanged", error: FILING_GATE_MESSAGES.figuresChanged };
        }
        input = { ...input, formData: withServerAnswers(input.formData, serverAnswers, moneyKeys) };
      }

      /*
        And a document printing the bill of sale's figures states the figures
        the current bill of sale printed, read off that copy itself.
      */
      const root = currentCopy(rows, rootFor(owed));
      if (root?.id && (AGREES_WITH_BILL_OF_SALE as readonly string[]).includes(documentType)) {
        const printed = await readPrintedData(supabase, root.id);
        if (figuresDisagreeWithBillOfSale(documentType, input.formData, printed)) {
          return { ok: false, code: "figuresChanged", error: FILING_GATE_MESSAGES.figuresChanged };
        }
      }
      replaces = replacedCopyId(rows, documentType);
    }

    /*
      Box 11 from the server's own read, never the client's: a 130-U without
      a confirmed empty weight does not file (webDEALER requires it and the
      county returns the application without it), and form_data records
      which source filed it, who confirmed it and when. Without the sale
      there is no server read to take it from, so a 130-U does not file:
      the client's box 11 is never written as it came.

      After the gates above, so both sets of refusals apply: box 11 and its
      record are among the server-derived answers (paperworkFilingContext
      carries the empty-weight context), so a review screen that posted a
      box 11 the sale no longer holds is refused as figuresChanged; then the
      full provenance record overwrites every `_emptyWeight*` key, blank
      where unknown, so a client-sent key can never survive.
    */
    if (documentType === "form130U") {
      if (!sale) return { ok: false, error: "That sale could not be found. Open it again from Sales." };
      const weight = emptyWeightForFiling(sale);
      if (!weight.ok) return { ok: false, error: "Settle the empty weight (box 11) first: confirm it, or type it from the title." };
      input = { ...input, formData: { ...input.formData, ...weight.fields } };
    }

    /*
      The dealer charges, after every existing refusal (rulebook section 5.4):
      the sale's fee copy is the one the desk wrote; its documentary fee is
      within the Texas limit under the law and the OCCC record as they stand
      now ($225.00, 7 TAC §84.205(b)(1), or a complete filing still recorded
      under Your Fees); and the paper carries no other dealer fee, the sale's
      own doc fee and the state's title fee. Refused, never trimmed, and
      DESK_ALLOW_UNSET_FACTS never lifts it.
    */
    const charges = await dealerChargesBlockedReason(feeContext, input.formData);
    if (charges) {
      // Over which limit, said plainly: $225.00 with no filing in force, or a filed maximum.
      const filedMax =
        charges === "feeOverLimit" &&
        overLimitKind(input.formData, feeContext.resolved.fees, feeContext.schedule) === "filedMax";
      return {
        ok: false,
        code: charges,
        error: filedMax ? FEE_OVER_FILED_MAX_MESSAGE : FILING_GATE_MESSAGES[charges],
        ...(filedMax ? { limit: "filedMax" as const } : {}),
      };
    }

    /*
      A ch. 345 vehicle (a motorcycle, moped, ATV, towable RV or boat) has a
      documentary fee capped at $200.00 that no filing raises and its own
      notice (Fin. Code §345.251; 7 TAC §86.201): not this desk's ch. 348
      paperwork, so no document printing the fee files on it.
    */
    if (
      sale &&
      (DOC_FEE_DOCUMENTS as readonly string[]).includes(documentType) &&
      isChapter345Vehicle(sale.vehicle?.bodyStyle)
    ) {
      return { ok: false, code: "chapter345Vehicle", error: FILING_GATE_MESSAGES.chapter345Vehicle };
    }

    /*
      The government lines must be the amounts paid to the state (Tex. Fin.
      Code §348.005): a document printing them files only once this sale's
      government fees are recorded from webDEALER (government-fees.ts). The
      unrecorded case alone is lifted for demos by DESK_ALLOW_UNSET_FACTS.
    */
    if (sale) {
      const government = governmentFeesFilingProblem({
        documentType,
        stepData: sale.stepData,
        registersNothing: registersNothing(sale),
        postedCounty: input.formData.countyOfResidence,
        allowUnset: process.env.DESK_ALLOW_UNSET_FACTS?.trim() === "true",
      });
      if (government) return { ok: false, code: government, error: FILING_GATE_MESSAGES[government] };
    }

    /*
      The document's own pages, after every refusal above (SOP "Document
      templates, page by page"). Each only refuses; none is lifted by
      DESK_ALLOW_UNSET_FACTS.

        mustAnswer              a sworn statement or a signed date files only
                                from an answer: the mileage statement, how a
                                salvage car leaves, the first payment date
        termsUnsolved           a contract with no worked-out note
        rebuiltDisclosureFirst  a rebuilt car's bill of sale waits for its
                                disclosure, the order Texas wants
        poaInstrument           the power of attorney's form is the server's
                                own decision from the model year
        fieldMissing            a box the sale should fill would print blank
    */
    let saleDate: string | null = null;
    if (sale) {
      const rows = await readDealAgreements(supabase, dealId);
      saleDate = await saleDateFor(supabase, rows);
      if (documentType !== "powerOfAttorney") {
        const { context } = paperworkFilingContext(
          sale,
          documentType,
          typeof input.formData.countyOfResidence === "string" ? input.formData.countyOfResidence : "",
          feeLines,
        );
        const unanswered = unansweredSwornFacts(documentType, context);
        if (unanswered.length > 0) {
          const names = unanswered.map((fact) => fact.question);
          return { ok: false, code: "mustAnswer", missing: names, error: `${FILING_GATE_MESSAGES.mustAnswer} ${names.join(" ")}` };
        }
        if (documentType === "financing" && paperworkAnswers(documentType, context)._termsSolved !== "yes") {
          return { ok: false, code: "termsUnsolved", error: FILING_GATE_MESSAGES.termsUnsolved };
        }
      }
      const owedNow = requiredDocumentTypes(sale.funding.type, settledPlan(sale.stepData), sale.vehicle?.titleStatus ?? null, salvagePath);
      if (documentType === "billOfSale" && owedNow.includes("rebuiltDisclosure") && !currentCopy(rows, "rebuiltDisclosure")) {
        return { ok: false, code: "rebuiltDisclosureFirst", error: FILING_GATE_MESSAGES.rebuiltDisclosureFirst };
      }
      if (documentType === "powerOfAttorney") {
        /*
          The instrument and the grantor are the server's, from the sale:
          a posted "VTR-271" on a car too new for it, or on a car with no
          model year, is refused rather than recorded.
        */
        const year = sale.vehicle?.year ?? null;
        const eligible = isEligibleForPlainPoa(year, Number(businessDateToday().slice(0, 4)));
        const instrument = eligible === null ? null : eligible ? "VTR-271" : "VTR-271-A";
        if (!instrument || (typeof input.formData.instrument === "string" && input.formData.instrument !== instrument)) {
          return { ok: false, code: "poaInstrument", error: FILING_GATE_MESSAGES.poaInstrument };
        }
        const fields = poaFieldsFromSale(sale);
        input = {
          ...input,
          formData: {
            ...input.formData,
            instrument,
            grantorName: fields.printedName,
            // Every box the form printed, so a reprint states what was signed.
            printed: poaProbe(fields),
          },
        };
      }
      const missing = missingPrintedFields(documentType, sale, input.formData, { saleDate });
      if (missing.length > 0) {
        return { ok: false, code: "fieldMissing", missing, error: `${FILING_GATE_MESSAGES.fieldMissing} ${missing.join(", ")}.` };
      }
    }

    // The filer's own stroke, and none once their signing is turned off.
    const staffSignature = held ? dealerStroke(held) : null;
    const dealerSignerName = held?.signerName ?? null;
    /*
      The signature is dated the business day it was drawn, at the desk.

      `now` is the instant, kept for the row's timestamps. The date beside
      a signature on the paper is a calendar date in the dealership's own
      time zone: an instant formatted by a UTC server dated an evening
      signature tomorrow, one day after the dealer's line on the same block.
    */
    const signedOn = businessDateToday();
    const completedLink = sale
      ? corridorCompletedLink(sale, documentType, input.formData, SITE_URL, {
          buyerSignature: input.signature,
          buyerSignatureDate: input.signature ? signedOn : null,
          dealerSignature: staffSignature,
          dealerSignatureDate: staffSignature ? signedOn : null,
          // The name printed beside that stroke, on every dealer line.
          dealerSignerName,
        }, { saleDate })
      : null;

    const { data, error } = await supabase
      .from("document_agreements")
      .insert({
        document_type: documentType,
        // Finalized outright. There is no customer to email and no link to
        // wait on: the buyer is standing at the desk and has just signed.
        status: "finalized",
        buyer_name: input.buyerName,
        vehicle_description: input.vehicleDescription,
        vehicle_vin: input.vehicleVin,
        // Without this the row exists and the sale cannot see it, because the
        // packet reads documents by deal.
        deal_id: dealId,
        // The conducted language, stored as this row's own fact at the
        // moment of filing. Without it the column's schema default said
        // "en" for every corridor document on a Spanish deal, and both the
        // e-sign guard and the texted-packet language gate read this value.
        ...(sale ? { language: sale.language === "es" ? "es" : "en" } : {}),
        form_data: {
          ...input.formData,
          signature: input.signature,
          signedAt: now,
          // Who signed for the dealer, kept on the record beside the buyer's
          // evidence (SOP 130-U bullet).
          dealerSignerName,
          dealerSignerMemberId: access.member?.id ?? null,
        },
        ...(completedLink ? { completed_link: completedLink } : {}),
        has_buyer_signature: Boolean(input.signature),
        finalized_at: now,
        completed_at: now,
        // A copy filed again after a void names the voided copy it replaces.
        ...(replaces ? { parent_agreement_id: replaces } : {}),
      })
      .select("id")
      .single();

    // The database's own backstop for a filing that crossed a void.
    if (error && /bill_of_sale_first/.test(String((error as { message?: unknown }).message ?? ""))) {
      return { ok: false, code: "billOfSaleFirst", error: FILING_GATE_MESSAGES.billOfSaleFirst };
    }
    if (error) throw error;
    revalidatePath(`/admin/sales/${dealId}`);
    return { ok: true, agreementId: (data as { id: string }).id };
  } catch {
    return { ok: false, error: "Could not file that. Try again." };
  }
}
