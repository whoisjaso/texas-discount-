import { notFound, redirect } from "next/navigation";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { canVoidDocuments } from "@/lib/sales/void-bill-of-sale";
import { isDocumentDone } from "@/lib/admin/sale-desk";
import FunnelLocaleProvider from "@/components/admin/funnel/FunnelLocaleProvider";
import PaperworkScreen from "@/components/admin/paperwork/PaperworkScreen";
import { getFunnelBundles } from "@/lib/sales/i18n";
import { resolveAdminLanguageWithUser } from "@/lib/admin/server-language";
import { getSaleDetail, vehicleLabel, SALE_DOCUMENTS } from "@/lib/admin/sale-desk";
import {
  asked,
  hasPaperwork,
  nextOpenQuestion,
  paperworkAnswers,
  paperworkDefault,
  paperworkMoney,
  paperworkQuestions,
  questionPosition,
  readPaperwork,
  unansweredSwornFacts,
} from "@/lib/sales/paperwork";
import { readBack, type ReadBackPage } from "@/lib/documents/field-maps/resolve";
import { saleDateFor } from "@/lib/sales/sale-date";
import { poaFieldsFromSale } from "@/lib/documents/poa-fields";
import { oneLineAddress } from "@/lib/sales/corridor-link";
import { businessDateToday } from "@/lib/documents/us-date";
import { readDealAgreements } from "@/lib/sales/filed-documents";
import { createClient } from "@/lib/supabase/server";
import { readMoney } from "@/lib/sales/money";
import { saleContextExtras } from "@/lib/sales/paperwork-filing-context";
import { dealFeeLinesForSale } from "@/lib/dealership-fees";
import { readBuyerId } from "@/lib/sales/buyer-id";
import { resolveCountyByAddress } from "@/lib/documents/resolve";
import { resolveVehicleWeight } from "@/lib/vehicles/empty-weight/ensure";
import {
  carryingCapacityStart,
  emptyWeightContext,
  weightPrompt,
} from "@/lib/vehicles/empty-weight/on-the-sale";
import { dealership } from "@/lib/dealership-config";
import { getStaffSignature } from "@/lib/actions/staff-signature";
import { dealerStroke } from "@/lib/documents/dealer-signer";

export const dynamic = "force-dynamic";
export const metadata = { title: `Paperwork - ${dealership.name}` };

/**
 * One paperwork question, one screen, inside the sale.
 *
 * This is the corridor the guide already established, extended over the part
 * of a sale that used to leave it. A document step used to hand the operator
 * to the templates section: a single page of forty-odd boxes, most of them
 * holding values this software already had, built for printing a blank form
 * rather than for the middle of a deal with a customer at the desk.
 *
 * Here the vehicle, the buyer, the licence and the dealership's own details
 * are already known, so they are not questions. What is left is asked one to a
 * screen and the last screen is the document itself.
 *
 * The route is `/admin/sales/[dealId]/paperwork/[doc]/[q]`, under the sale
 * rather than under documents, which is the point: the paperwork belongs to
 * this deal and is reached through it.
 */

interface Props {
  params: Promise<{ dealId: string; doc: string; q: string }>;
  /** `?change=emptyWeight`: the review's Change link, reopening a skipped question. */
  searchParams?: Promise<{ change?: string | string[] }>;
}

/** The last screen, which is the document rather than a question. */
const REVIEW = "review";

const reviewingKey = (key: string) => key === REVIEW;

export default async function PaperworkQuestionPage({ params, searchParams }: Props) {
  const { dealId, doc, q } = await params;
  const change = (await searchParams)?.change;
  // The review's Change link reopens a question the deal already answers
  // (box 11, the county, the down payment) so it can be answered again.
  const reopen = typeof change === "string" && /^[A-Za-z]+$/.test(change) ? change : undefined;

  const entry = SALE_DOCUMENTS.find((candidate) => candidate.documentType === doc);
  if (!entry?.documentType || !hasPaperwork(entry.documentType)) notFound();

  const sale = await getSaleDetail(dealId);
  if (!sale) notFound();

  const answers = readPaperwork(sale.stepData, entry.documentType);
  // The sale's own fee lines (the copy it started with; dealership-fees.ts).
  const fees = await dealFeeLinesForSale(sale);
  /**
   * What the price meant and whether the registration is paid, off the deal.
   *
   * Answered once on the money step and read by every document, rather than
   * asked again per document. Two forms in the same packet disagreeing about
   * the same deal is the failure this prevents.
   */
  const money = paperworkMoney(
    sale.vehicle?.salePrice,
    // The trade-in is asked on the bill of sale only, so every document reads
    // the money with the bill of sale's answers. Reading this document's own
    // answers taxed the full price on the contract and the 130-U while the
    // bill of sale taxed the price less the trade (SOP "Money": tax after
    // trade-in; "every figure is read off the sale once").
    readPaperwork(sale.stepData, "billOfSale"),
    readMoney(sale.stepData),
    sale.funding.type,
    fees,
  );
  /*
    The county, looked up when the deal cannot answer it.

    The city table covers this metro and says so; a buyer from a smaller town
    fell through it and typed field 19 by hand. This is consulted only when
    nothing on the deal answers, it fails silent, and it never overrules a
    typed answer.

    The empty weight is looked up the same way, and only on its own screen:
    a document figure on the vehicle (a title, an MCO, a weight certificate)
    skips the question and is affixed with its source; otherwise the estimate
    (EPA test weight less 300 lb, cross-checked against Transport Canada and
    the VIN decode) is offered WITH its source for a person to confirm, or the
    figure is typed off a document. Never a silent default, never an
    unsourced figure in the box, and silent on failure: no estimate means the
    question is asked as it always was (empty-weight/on-the-sale.ts).
  */
  const mailing = readBuyerId(sale.stepData).mailing;
  // By the address (typed, else geocoded): the county the city implies is a
  // guess the screen offers and never files (deal-facts.ts).
  const buyerCounty = await resolveCountyByAddress(mailing);
  const vehicleWeight = sale.vehicle?.weightLbs ?? null;
  const key = decodeURIComponent(q);
  const isForm130U = entry.documentType === "form130U";
  const estimate =
    isForm130U && key === "emptyWeight" ? await resolveVehicleWeight(sale.vehicle, { network: true }) : null;
  const emptyWeight = isForm130U ? emptyWeightContext(sale.vehicle, estimate) : null;

  /*
    The date of sale: the current filed bill of sale's, else today. The
    contract is dated with it, so the first payment's taps count from it,
    not from the day the contract happens to be walked.
  */
  let saleDate: string | null = null;
  try {
    const client = await createClient();
    saleDate = await saleDateFor(client, await readDealAgreements(client, dealId));
  } catch {
    saleDate = null;
  }

  const extras = saleContextExtras(sale);
  const context = {
    funding: sale.funding.type,
    bodyStyle: (sale.vehicle?.bodyStyle ?? "").toLowerCase(),
    licenceState: sale.buyer?.idState ?? "",
    // What the money step recorded as crossing the desk, for the financing
    // contract's down payment: the same dollars, asked once.
    paidToday: money.paidToday > 0 ? money.paidToday : null,
    buyerCity: mailing.city ?? "",
    buyerCounty,
    vehicleWeight,
    emptyWeight,
    reopen,
    // For the note: the principal is the whole deal less the down payment,
    // and the rate ceiling depends on how old the car is.
    dealTotal: money.total,
    vehicleYear: sale.vehicle?.year ?? null,
    saleYear: Number((sale.startedAt ?? sale.createdAt).slice(0, 4)) || undefined,
    answers,
    // The intake's county, the ID kind, the email, the contract date and
    // every document's answers: what makes a fact known, or another
    // document's to ask (paperwork-filing-context.ts).
    ...extras,
    contractDate: saleDate ?? extras.contractDate,
  };
  const questions = paperworkQuestions(entry.documentType, context);

  /*
    What this document would actually file: the answers given, plus the
    default for anything nobody has reached. The review screen must show the
    document as it will print, not as the raw answer map happens to stand,
    or the operator signs off on a page they were never shown.

    Navigation still reads `answers`. A defaulted question is a question worth
    showing, and skipping past it would be the corridor deciding it knows the
    deal better than the person selling the car.
  */
  const filedAnswers = paperworkAnswers(entry.documentType, context);

  const stepHref = (key: string) =>
    `/admin/sales/${encodeURIComponent(dealId)}/paperwork/${encodeURIComponent(entry.documentType!)}/${encodeURIComponent(key)}`;
  /** Back to the guide step this document belongs to, not to the deal. */
  const guideHref = `/admin/sales/${encodeURIComponent(dealId)}/guide/${encodeURIComponent(`document:${entry.documentType}`)}`;

  /*
    "after:<key>": the screen that follows a question, decided after its
    answer was written rather than before.

    The next link used to be fixed when the screen rendered, from the
    question list as it stood before the answer. A choice can change which
    questions exist: answering "the payment" on the financing contract makes
    "how much each payment" a question, and the fixed link stepped straight
    past the screen it had just created onto the rate. So the answer screen
    now points here, and this resolves it against the list as it stands now.
  */
  if (key.startsWith("after:")) {
    const at = questionPosition(questions, key.slice("after:".length));
    const following = at >= 0 && at < questions.length - 1 ? questions[at + 1] : null;
    redirect(following ? stepHref(following.key) : stepHref(REVIEW));
  }

  const index = questionPosition(questions, key);

  // An unknown question, usually a stale link after an answer changed which
  // questions exist, lands on whatever is actually outstanding rather than on
  // a 404 that tells the operator nothing.
  if (key !== REVIEW && index === -1) {
    const open = nextOpenQuestion(questions, answers);
    redirect(open ? stepHref(open.key) : stepHref(REVIEW));
  }

  const reviewing = key === REVIEW;
  const position = reviewing ? questions.length : index;
  // The document is the last screen, so it is counted as one.
  const total = questions.length + 1;
  const previous = position > 0 ? (position === questions.length ? questions[questions.length - 1] : questions[position - 1]) : null;
  /*
    Back is on every screen, as on every Handle A Sale step: a Change trip
    goes back to the page it came from, and the first question of a
    document goes back to the document's step in the guide.
  */
  const backHref = reopen && !reviewingKey(key) ? stepHref(REVIEW) : previous ? stepHref(previous.key) : guideHref;
  // Resolved after the answer lands (see "after:" above), never fixed here.
  const nextHref = reviewing ? stepHref(REVIEW) : stepHref(`after:${key}`);

  const question = reviewing ? null : questions[index];

  /*
    The review is the page: every box the document prints, read back with
    its source, and the sworn statements nobody has answered, each with the
    way back to its question. Built from what the review files, so what is
    shown is what the filing checks.
  */
  let pages: ReadBackPage[] = [];
  let sworn: Array<{ key: string; question: string; href: string }> = [];
  if (reviewing) {
    const reviewForm: Record<string, unknown> = {
      ...filedAnswers,
      ...money,
      ...(entry.documentType === "vehicleResponsibility" ? { quotedRegistrationAmount: money.registrationCost } : {}),
    };
    /*
      The dealer line as the filing will print it: the signed-in member's
      onboarding name and their saved stroke, exactly what finalizePaperwork
      passes, so the review never says a box is blank that files filled.
    */
    const viewer = await getStaffSignature().catch(() => null);
    const stroke = viewer ? dealerStroke(viewer) : null;
    pages = readBack(entry.documentType, sale, reviewForm, {
      saleDate,
      dealerSignerName: viewer?.signerName ?? null,
      dealerSignature: stroke,
      dealerSignatureDate: stroke ? businessDateToday() : null,
      docFeeSet: fees.docFeeSet,
      context,
    });
    sworn = unansweredSwornFacts(entry.documentType, context).map((fact) => ({
      key: fact.key,
      question: fact.question,
      href: `/admin/sales/${encodeURIComponent(dealId)}/paperwork/${encodeURIComponent(fact.owner)}/${encodeURIComponent(fact.key)}`,
    }));
  }
  const { lang, userId } = await resolveAdminLanguageWithUser();

  /*
    A truck's carrying capacity starts at TxDMV's minimum for its box 11
    (Registration Manual Table 2-1), on the screen only and labelled as that:
    the minimum the county uses when nobody can supply the figure and the
    door-jamb GVWR cannot be read. Never vPIC's GVWR, which is a class range.
  */
  const capacityStart =
    question?.key === "carryingCapacity" ? carryingCapacityStart(emptyWeight, filedAnswers, answers) : null;

  /**
   * The power of attorney's facts and its instrument decision, off the
   * sale. Everything the VTR-271 needs is already here — that is the whole
   * reason it is a review-only document — and whether the PLAIN form is
   * lawful for this vehicle is the odometer-disclosure age test, decided
   * where the data is and never guessed (round 4, finding 2).
   */
  let poa: { eligible: boolean | null; grantorName: string; grantorAddress: string } | null = null;
  if (entry.documentType === "powerOfAttorney") {
    const { isEligibleForPlainPoa } = await import("@/lib/documents/powerOfAttorneyForm");
    // The grantor as the form prints it: the licence's name and the mailing
    // address, from the same builder the PDF and the filing use.
    const fields = poaFieldsFromSale(sale);
    poa = {
      eligible: isEligibleForPlainPoa(sale.vehicle?.year ?? null, Number(businessDateToday().slice(0, 4))),
      grantorName: fields.printedName,
      grantorAddress: oneLineAddress(fields.grantorAddress ?? "", fields.grantorCity ?? "", fields.grantorState ?? "", fields.grantorZip ?? ""),
    };
  }

  /*
    The filed bill of sale holds every answer it prints, and the down payment
    the contract shares with it (owner's decision 10/02/2026): the screen
    says so before anything is changed; the server refuses a change.
  */
  const freeze = await (async () => {
    const access = await getCurrentAdminAccess().catch(() => null);
    const billFiled = ["billOfSale", "salvageBillOfSale"].some((type) =>
      isDocumentDone(sale.documents[type] ?? "none"),
    );
    const held =
      billFiled &&
      (entry.documentType === "billOfSale" ||
        entry.documentType === "salvageBillOfSale" ||
        (entry.documentType === "financing" && question?.key === "downPayment"));
    return { canVoid: canVoidDocuments(access?.role ?? null), held };
  })();

  return (
    <FunnelLocaleProvider bundles={getFunnelBundles()} initial={lang} userId={userId}>
      <PaperworkScreen
        freeze={freeze}
        dealId={dealId}
        documentType={entry.documentType}
        documentTitle={entry.title}
        guideHref={guideHref}
        previousHref={backHref}
        position={position}
        total={total}
        reviewing={reviewing}
        // Stripped of its `applies` predicate: a function cannot cross into a
        // client component, and React answers that with a server render error
        // whose message is hidden in production.
        question={question ? asked(question, context) : null}
        current={
          question
            ? (answers[question.key] ??
              (capacityStart !== null ? String(capacityStart) : undefined) ??
              paperworkDefault(entry.documentType, question.key, context) ??
              "")
            : ""
        }
        suggestionNote={capacityStart !== null ? "capacityMinimum" : null}
        weightPrompt={question?.key === "emptyWeight" && emptyWeight ? weightPrompt(emptyWeight, answers) : null}
        nextHref={nextHref}
        vehicle={vehicleLabel(sale.vehicle)}
        vin={sale.vehicle?.vin ?? ""}
        buyerName={sale.buyer?.name ?? ""}
        answers={filedAnswers}
        // The money is not asked and is not optional: it is read off the
        // vehicle and the state's own rate, and it is what the buyer is
        // signing for. A bill of sale that files without it is a receipt with
        // no amount on it. Every document gets it: the 130-U's sales and use
        // tax computation (box 38) filed as $0.00 sales price, $0.00 tax,
        // when only the bill of sale and the contract were handed the
        // figures. The preview action spreads the money over every document,
        // so the preview showed a price the filing then did not carry. Each
        // document's link builder reads only the figures it prints.
        money={money}
        // Whether the doc fee is a real figure or a missing one ("Not set").
        docFeeSet={fees.docFeeSet}
        // The one figure the responsibility form turns on: tax, title,
        // registration and the doc fee, computed rather than typed.
        quotedRegistrationAmount={
          entry.documentType === "vehicleResponsibility" ? money.registrationCost : null
        }
        poa={poa}
        pages={pages}
        sworn={sworn}
      />
    </FunnelLocaleProvider>
  );
}
