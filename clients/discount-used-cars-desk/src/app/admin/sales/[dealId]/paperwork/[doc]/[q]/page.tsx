import { notFound, redirect } from "next/navigation";
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
} from "@/lib/sales/paperwork";
import { readMoney } from "@/lib/sales/money";
import { readBuyerId } from "@/lib/sales/buyer-id";
import { resolveCounty } from "@/lib/documents/resolve";
import { dealership } from "@/lib/dealership-config";

export const dynamic = "force-dynamic";
export const metadata = { title: `Paperwork - ${dealership.shortName} Auto` };

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
}

/** The last screen, which is the document rather than a question. */
const REVIEW = "review";

export default async function PaperworkQuestionPage({ params }: Props) {
  const { dealId, doc, q } = await params;

  const entry = SALE_DOCUMENTS.find((candidate) => candidate.documentType === doc);
  if (!entry?.documentType || !hasPaperwork(entry.documentType)) notFound();

  const sale = await getSaleDetail(dealId);
  if (!sale) notFound();

  const answers = readPaperwork(sale.stepData, entry.documentType);
  /**
   * What the price meant and whether the registration is paid, off the deal.
   *
   * Answered once on the money step and read by every document, rather than
   * asked again per document. Two forms in the same packet disagreeing about
   * the same deal is the failure this prevents.
   */
  const money = paperworkMoney(
    sale.vehicle?.salePrice,
    answers,
    readMoney(sale.stepData),
    sale.funding.type,
  );
  /*
    The county, looked up when the deal cannot answer it.

    The city table covers this metro and says so; a buyer from a smaller town
    fell through it and typed field 19 by hand. This is consulted only when
    nothing on the deal answers, it fails silent, and it never overrules a
    typed answer.

    The empty weight is NOT looked up. It comes off the vehicle row when the
    row holds one and is otherwise asked, because box 11 is read off the door
    jamb or the old title rather than decoded. A version of this file resolved
    it from NHTSA's curb weight, which is a different figure for the model in
    general and not what the dealership files.
  */
  const mailing = readBuyerId(sale.stepData).mailing;
  const buyerCounty = await resolveCounty(mailing);
  const vehicleWeight = sale.vehicle?.weightLbs ?? null;

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
    // For the note: the principal is the whole deal less the down payment,
    // and the rate ceiling depends on how old the car is.
    dealTotal: money.total,
    vehicleYear: sale.vehicle?.year ?? null,
    saleYear: Number((sale.startedAt ?? sale.createdAt).slice(0, 4)) || undefined,
    answers,
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

  const key = decodeURIComponent(q);

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
  // Resolved after the answer lands (see "after:" above), never fixed here.
  const nextHref = reviewing ? stepHref(REVIEW) : stepHref(`after:${key}`);

  const question = reviewing ? null : questions[index];
  const { lang, userId } = await resolveAdminLanguageWithUser();

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
    const held = readBuyerId(sale.stepData);
    const mailing = [held.mailing.street, held.mailing.city, held.mailing.state, held.mailing.postal]
      .filter(Boolean)
      .join(", ");
    poa = {
      eligible: isEligibleForPlainPoa(sale.vehicle?.year ?? null, new Date().getFullYear()),
      grantorName: sale.buyer?.name ?? "",
      grantorAddress: mailing || (sale.buyer?.address ?? ""),
    };
  }

  return (
    <FunnelLocaleProvider bundles={getFunnelBundles()} initial={lang} userId={userId}>
      <PaperworkScreen
        dealId={dealId}
        documentType={entry.documentType}
        documentTitle={entry.title}
        guideHref={guideHref}
        previousHref={previous ? stepHref(previous.key) : null}
        position={position}
        total={total}
        reviewing={reviewing}
        // Stripped of its `applies` predicate: a function cannot cross into a
        // client component, and React answers that with a server render error
        // whose message is hidden in production.
        question={question ? asked(question) : null}
        current={
          question
            ? (answers[question.key] ??
              paperworkDefault(entry.documentType, question.key, context) ??
              "")
            : ""
        }
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
        // The one figure the responsibility form turns on: tax, title,
        // registration and the doc fee, computed rather than typed.
        quotedRegistrationAmount={
          entry.documentType === "vehicleResponsibility" ? money.registrationCost : null
        }
        poa={poa}
      />
    </FunnelLocaleProvider>
  );
}
