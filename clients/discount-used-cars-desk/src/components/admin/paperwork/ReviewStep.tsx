"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finalizePaperwork } from "@/lib/actions/paperwork";
import SignaturePad from "@/components/documents/SignaturePad";
import type { PaperworkMoney } from "@/lib/sales/paperwork";
import { calculatePayment } from "@/lib/documents/finance";
import { tapHaptic } from "@/lib/haptics";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate, funnelDollars, type FunnelStrings } from "@/lib/sales/i18n";
import { localizeDocumentTitle } from "@/lib/sales/question-i18n";
import { DOC_FEE_SET } from "@/lib/documents/billOfSale";
import { notSet } from "@/lib/dealership-config";

/**
 * The last screen: what was answered, and the signature that files it.
 *
 * Read back before it is signed, because everything above this point arrived
 * one question at a time and nobody has seen the whole of it in one place.
 * That is the trade the corridor makes: a page of forty boxes shows you
 * everything and asks you to find the four that matter, and a corridor shows
 * you one at a time and owes you a look at the whole before you commit.
 *
 * Only the answers are listed. The vehicle, the buyer and the dealership are
 * on the document itself and were never in question here, so repeating them
 * would pad the one screen whose job is to be read.
 */

export default function ReviewStep({
  dealId,
  documentType,
  title,
  vehicle,
  vin,
  buyerName,
  answers,
  money,
  quotedRegistrationAmount,
  doneHref,
  poa,
}: {
  dealId: string;
  documentType: string;
  title: string;
  vehicle: string;
  vin: string;
  buyerName: string;
  answers: Record<string, string>;
  /** The amounts, on the document that carries them. Null on the others. */
  money: PaperworkMoney | null;
  /**
   * Tax, title, registration and the doc fee, on the one form that quotes it.
   *
   * Null everywhere else. This is what the buyer owes if they take the filing
   * on themselves and then hand it back, and it is computed rather than typed
   * so it cannot disagree with the bill of sale.
   */
  quotedRegistrationAmount: number | null;
  doneHref: string;
  /** The power of attorney's facts and eligibility; null on other docs. */
  poa: {
    eligible: boolean | null;
    grantorName: string;
    grantorAddress: string;
  } | null;
}) {
  const router = useRouter();
  const { t, lang } = useFunnel();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dollars = (amount: number) => funnelDollars(amount, lang);

  /**
   * The buyer's signature, drawn here or not at all.
   *
   * The documents a buyer puts their own name to offer the pad: the bill of
   * sale, the financing contract, and the 130-U, which is the buyer's own
   * application for title and the reason no power of attorney is needed
   * when they are standing here. The acknowledgments (responsibility,
   * insurance, rebuilt title) are the buyer's too. The pad is optional on
   * purpose: an empty pad files exactly what filed before it existed, and
   * the printed page still has its line for a pen.
   */
  const buyerSignsHere =
    documentType === "billOfSale" ||
    documentType === "financing" ||
    documentType === "form130U" ||
    documentType === "vehicleResponsibility" ||
    documentType === "insuranceAcknowledgment" ||
    documentType === "rebuiltDisclosure" ||
    documentType === "salvageBillOfSale" ||
    documentType === "towAwayAcknowledgment" ||
    documentType === "buyerResponsibilityStatement";
  /*
    A salvage sale registers nothing, so its bill has no registration line
    and its total is the price, the tax, the title fee and the doc fee. The
    money object still carries the registration figure for every other
    sheet; this screen just does not read it back on the one that will not
    print it.
  */
  const noRegistration = documentType === "salvageBillOfSale";
  const shownTotal = money
    ? noRegistration
      ? Math.round((money.total - money.registrationFee) * 100) / 100
      : money.total
    : 0;
  const [signOpen, setSignOpen] = useState(false);
  const [buyerSignature, setBuyerSignature] = useState("");
  const [buyerSignedOn, setBuyerSignedOn] = useState("");

  // A deal answered before the money step existed can still be carrying a
  // typed registration quote. It is computed now, and the computed one is
  // what files, so showing the old one here would show two numbers for one
  // figure and let the operator sign off on the wrong one.
  // Underscored keys are the solver's bookkeeping (whether the note was
  // capped, its ceiling), read below and never listed as answers.
  const entries = Object.entries(answers).filter(
    ([key, value]) => value !== "" && key !== "quotedRegistrationAmount" && !key.startsWith("_"),
  );

  function file() {
    tapHaptic();
    setError(null);
    startTransition(async () => {
      const result = await finalizePaperwork(dealId, documentType, {
        buyerName,
        vehicleDescription: vehicle,
        vehicleVin: vin,
        formData: poa
          ? {
              // The POA has no answers: everything on the VTR-271 came off
              // the sale. What files is the record of what the form held,
              // including WHICH form: the plain VTR-271 on a car old enough
              // to be exempt from odometer disclosure, the county's secure
              // VTR-271-A on anything newer.
              grantorName: poa.grantorName,
              grantorAddress: poa.grantorAddress,
              vehicle,
              vin,
              instrument: poa.eligible === false ? "VTR-271-A" : "VTR-271",
              signedInInk: true,
            }
          : {
              ...answers,
              ...(money ?? {}),
              ...(quotedRegistrationAmount === null ? {} : { quotedRegistrationAmount }),
            },
        // The pad above, when the buyer used it. Null keeps the other path
        // exactly as it was: file unsigned, print, and sign in ink.
        signature: buyerSignature || null,
      });
      if (!result.ok) {
        setError(result.error ?? t.review.couldNotFile);
        return;
      }
      router.push(doneHref);
    });
  }

  /**
   * The power of attorney's whole screen: facts off the sale, the
   * instrument decision, and the ways out. No pad: both forms are signed in
   * ink. The eligibility matrix decides WHICH form. Too new for the plain
   * VTR-271 means the county's secure VTR-271-A, and the screen says so and
   * still files the record once it is signed. It used to say "Nothing files
   * from here", which on a 2019 car was the end of the sale.
   *
   * Only an unknown model year blocks, because then nobody can say which
   * form is lawful, and the fix is one field on the vehicle.
   */
  if (poa) {
    const blocked = poa.eligible === null;
    const secure = poa.eligible === false;
    return (
      <div className="ed-paper-review">
        <p className="ed-paper-note">{t.review.poaNote}</p>
        <dl className="ed-paper-summary">
          <div className="ed-paper-line">
            <dt className="ed-fine">{t.review.poaGrantor}</dt>
            <dd>{poa.grantorName || t.review.notOnFile}</dd>
          </div>
          <div className="ed-paper-line">
            <dt className="ed-fine">{t.review.poaAddress}</dt>
            <dd>{poa.grantorAddress || t.review.notOnFile}</dd>
          </div>
          <div className="ed-paper-line">
            <dt className="ed-fine">{t.review.poaVehicle}</dt>
            <dd>{vehicle}</dd>
          </div>
          <div className="ed-paper-line">
            <dt className="ed-fine">{t.review.poaVin}</dt>
            <dd>{vin || t.review.notOnFile}</dd>
          </div>
        </dl>

        {blocked ? (
          <p className="ed-paper-error" role="alert">
            {t.review.poaYearUnknown}
          </p>
        ) : (
          <>
            {secure ? (
              // An instruction, not an alert: which form to fetch. The
              // plain form's link is withheld because it is the wrong form.
              <p className="ed-paper-note ed-paper-instrument">{t.review.poaIneligible}</p>
            ) : (
              <a
                className="ed-btn ed-btn-outline"
                href={`/api/documents/power-of-attorney?dealId=${encodeURIComponent(dealId)}&disposition=inline`}
                target="_blank"
                rel="noreferrer"
              >
                {t.review.poaPrintOfficial}
              </a>
            )}
            <button
              type="button"
              className="ed-btn ed-btn-dark ed-paper-file"
              disabled={pending}
              onClick={file}
            >
              {pending ? t.review.filing : t.review.poaFile}
            </button>
          </>
        )}

        {error ? (
          <p className="ed-paper-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  /**
   * What an acknowledgment is, in one sentence, on the screen where the pad
   * is offered. These documents ask no questions, so without this the review
   * read "Nothing was asked for this one." above a signature pad, which is
   * exactly the moment somebody at the desk needs to know what the buyer is
   * about to put their name to.
   */
  const acknowledgmentNote =
    (t.review.acknowledgmentNotes as Record<string, string>)[documentType] ?? null;

  return (
    <div className="ed-paper-review">
      {acknowledgmentNote ? <p className="ed-paper-note">{acknowledgmentNote}</p> : null}
      <dl className="ed-paper-summary">
        {entries.map(([key, value]) => (
          <div key={key} className="ed-paper-line">
            <dt className="ed-fine">{label(t, key)}</dt>
            <dd>{display(t, lang, key, value)}</dd>
          </div>
        ))}
        {entries.length === 0 && !money && quotedRegistrationAmount === null && !acknowledgmentNote ? (
          <p className="ed-paper-note">{t.review.nothingAsked}</p>
        ) : null}
      </dl>

      {/* The contract's whole story, computed in front of the person filing
          it. Down payment and rate alone made the review uncheckable: whether
          the buyer owes $500 a month or $3,000 was invisible until paper came
          out of a printer. */}
      {money && documentType === "financing" ? (
        <FinancingFigures t={t} dollars={dollars} money={money} answers={answers} />
      ) : null}

      {money && documentType !== "financing" ? (
        <dl className="ed-paper-summary ed-paper-money">
          <div className="ed-paper-line">
            <dt className="ed-fine">{t.review.money.car}</dt>
            <dd>{dollars(money.salePrice)}</dd>
          </div>
          {money.tradeInAllowance > 0 ? (
            <div className="ed-paper-line">
              <dt className="ed-fine">{t.review.money.lessTradeIn}</dt>
              <dd>{dollars(-money.tradeInAllowance)}</dd>
            </div>
          ) : null}
          {/* Four lines, not two.

              Title, doc and registration were added into one "Fees" figure
              here, because the lot quotes $400 as a single number. That is
              what the buyer is told and not what the desk needs: three of
              these are the state's and one is ours, and this is the screen
              somebody reads back before a document is filed. */}
          <div className="ed-paper-line">
            <dt className="ed-fine">{t.review.money.salesTax}</dt>
            <dd>{dollars(money.tax)}</dd>
          </div>
          <div className="ed-paper-line">
            <dt className="ed-fine">{t.review.money.titleFee}</dt>
            <dd>{dollars(money.titleFee)}</dd>
          </div>
          <div className="ed-paper-line">
            <dt className="ed-fine">{t.review.money.docFee}</dt>
            {/* A missing doc fee is not a zero fee: say so. */}
            <dd>{DOC_FEE_SET ? dollars(money.docFee) : notSet(t.review.money.docFee.toLowerCase())}</dd>
          </div>
          {noRegistration ? null : (
            <div className="ed-paper-line">
              <dt className="ed-fine">{t.review.money.regFee}</dt>
              <dd>{dollars(money.registrationFee)}</dd>
            </div>
          )}
          <div className="ed-paper-line ed-paper-total">
            <dt className="ed-fine">{t.review.money.total}</dt>
            <dd>{dollars(shownTotal)}</dd>
          </div>
          {/* Only when there is one, and never as a zero. A lien line reading
              $0.00 on a paid deal is a customer asking what the lien is. */}
          {money.sellerLienAmount > 0 ? (
            <>
              <div className="ed-paper-line">
                <dt className="ed-fine">{t.review.money.payingToday}</dt>
                <dd>{dollars(money.paidToday)}</dd>
              </div>
              <div className="ed-paper-line ed-paper-lien">
                <dt className="ed-fine">{t.review.money.balanceOwed}</dt>
                <dd>{dollars(money.sellerLienAmount)}</dd>
              </div>
            </>
          ) : null}
        </dl>
      ) : null}

      {quotedRegistrationAmount !== null ? (
        <dl className="ed-paper-summary ed-paper-money">
          <div className="ed-paper-line ed-paper-total">
            <dt className="ed-fine">{t.review.money.taxAndFees}</dt>
            <dd>{dollars(quotedRegistrationAmount)}</dd>
          </div>
        </dl>
      ) : null}

      {buyerSignsHere ? (
        <div className="ed-sign-box">
          {signOpen ? (
            <>
              <h2 className="ed-sign-title">{t.review.buyerSignsHere}</h2>
              <div className="ed-sign-pad">
                <SignaturePad
                  label={buyerName || t.review.buyerFallback}
                  value={buyerSignature}
                  dateValue={buyerSignedOn}
                  onChange={setBuyerSignature}
                  onDateChange={setBuyerSignedOn}
                />
              </div>
              <p className="ed-paper-note mt-3">{t.review.orFileUnsigned}</p>
            </>
          ) : (
            <>
              {/* Collapsed by default so the screen keeps one primary action.
                  Opening the pad is a choice, not a step. */}
              <button
                type="button"
                className="ed-btn ed-btn-outline"
                onClick={() => setSignOpen(true)}
              >
                {t.review.signOnScreen}
              </button>
              <p className="ed-paper-note mt-2">{t.review.orFileUnsigned}</p>
            </>
          )}
        </div>
      ) : null}

      <button type="button" className="ed-btn ed-btn-dark ed-paper-file" disabled={pending} onClick={file}>
        {pending
          ? t.review.filing
          : fillTemplate(t.review.fileThe, {
              title: localizeDocumentTitle(t, documentType, title),
            })}
      </button>

      {error ? (
        <p className="ed-paper-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The stored key, read back as the question it answered.
 *
 * Kept here rather than carried down from the registry because this screen
 * wants a noun and the registry holds a question: "Is That The Real Mileage?"
 * is right above an answer and wrong beside one.
 */
function label(t: FunnelStrings, key: string): string {
  const words = t.review.labels as Record<string, string>;
  return words[key] ?? key;
}

/**
 * What the note comes to, line by line: the price, the down payment, the
 * amount carried, and the payment that carries it. Every figure is computed
 * from answers already on this screen, so the person filing can check the
 * contract against the deal they just made, out loud, before it prints.
 */
function FinancingFigures({
  t,
  dollars,
  money,
  answers,
}: {
  t: FunnelStrings;
  dollars: (amount: number) => string;
  money: PaperworkMoney;
  answers: Record<string, string>;
}) {
  const down = Number(answers.downPayment) || 0;
  const financed = Math.max(0, Math.round((money.total - down) * 100) / 100);
  const count = Number(answers.numberOfPayments) || 0;
  const frequency =
    answers.paymentFrequency === "Weekly" || answers.paymentFrequency === "Bi-weekly"
      ? answers.paymentFrequency
      : ("Monthly" as const);
  // The payment as filed: the desk's own figure when the payment was what
  // was agreed, else the equal one. The last payment is the remainder.
  const payment = Number(answers.paymentAmount) || calculatePayment(financed, Number(answers.apr) || 0, count, frequency);
  const last = Number(answers.lastPaymentAmount) || payment;
  const shorterLast = count > 1 && Math.abs(last - payment) >= 0.01;
  const each =
    frequency === "Weekly"
      ? t.review.financing.aWeek
      : frequency === "Bi-weekly"
        ? t.review.financing.everyTwoWeeks
        : t.review.financing.aMonth;

  return (
    <dl className="ed-paper-summary ed-paper-money">
      <div className="ed-paper-line">
        <dt className="ed-fine">{t.review.financing.wholeDeal}</dt>
        <dd>{dollars(money.total)}</dd>
      </div>
      <div className="ed-paper-line">
        <dt className="ed-fine">{t.review.financing.downPayment}</dt>
        <dd>{dollars(down)}</dd>
      </div>
      <div className="ed-paper-line ed-paper-total">
        <dt className="ed-fine">{t.review.financing.stillOwe}</dt>
        <dd>{dollars(financed)}</dd>
      </div>
      {/* A rate is printed only once the note is solved and held to the ceiling. */}
      {answers._termsSolved === "yes" && answers.apr ? (
        <div className="ed-paper-line">
          <dt className="ed-fine">{t.review.financing.rate}</dt>
          <dd>{Number(answers.apr).toFixed(2)}%</dd>
        </div>
      ) : null}
      {answers._termsCapped === "yes" ? (
        // The agreed figures implied a rate above what Texas lets this car
        // carry. The rate was brought down to the ceiling and the payment
        // recomputed; the person filing sees that it happened.
        <div className="ed-paper-line">
          <dt className="ed-fine">{t.review.financing.heldToCeiling}</dt>
          <dd>{Number(answers._termsCeilingApr).toFixed(2)}%</dd>
        </div>
      ) : null}
      {answers._termsProblem === "payment_never_clears" ? (
        <div className="ed-paper-line">
          <dt className="ed-fine">{t.review.financing.paymentTooSmall}</dt>
          <dd>{dollars(Number(answers._termsMinimumPayment) || 0)}</dd>
        </div>
      ) : null}
      {count > 0 && payment > 0 ? (
        <div className="ed-paper-line">
          <dt className="ed-fine">{t.review.financing.soThatIs}</dt>
          <dd>
            {shorterLast
              ? fillTemplate(t.review.financing.paymentsOfWithLast, {
                  count: count - 1,
                  payment: dollars(payment),
                  each,
                  last: dollars(last),
                })
              : fillTemplate(t.review.financing.paymentsOf, {
                  count,
                  payment: dollars(payment),
                  each,
                })}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Stored values are machine words; this screen is read by a person. */
function display(
  t: FunnelStrings,
  lang: "en" | "es",
  key: string,
  value: string,
): string {
  const words = t.review.values as Record<string, string>;
  if (words[value]) return words[value];
  if (key === "apr" && Number.isFinite(Number(value))) return `${Number(value).toFixed(2)}%`;
  if (/Payment$|Allowance$|Amount$/.test(key)) {
    const amount = Number(value);
    if (Number.isFinite(amount)) {
      return funnelDollars(amount, lang);
    }
  }
  return value;
}
