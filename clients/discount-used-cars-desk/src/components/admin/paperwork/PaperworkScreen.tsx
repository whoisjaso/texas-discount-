"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, FilePdf } from "@phosphor-icons/react";
import { previewPaperworkPdf } from "@/lib/actions/paperwork-preview";
import AnswerStep from "@/components/admin/paperwork/AnswerStep";
import ReviewStep from "@/components/admin/paperwork/ReviewStep";
import FunnelLanguageToggle from "@/components/admin/funnel/FunnelLanguageToggle";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate } from "@/lib/sales/i18n";
import {
  localizeDocumentTitle,
  localizeQuestion,
} from "@/lib/sales/question-i18n";
import type { AskedQuestion, PaperworkMoney } from "@/lib/sales/paperwork";

/**
 * The paperwork corridor's chrome, on the client so the toggle can swap
 * every word in place. The server page still decides which question this
 * is and what the deal holds — see the page for the reasoning that shaped
 * this screen; only the words moved here.
 */
export default function PaperworkScreen({
  dealId,
  documentType,
  documentTitle,
  guideHref,
  previousHref,
  position,
  total,
  reviewing,
  question,
  current,
  nextHref,
  vehicle,
  vin,
  buyerName,
  answers,
  money,
  quotedRegistrationAmount,
  poa,
}: {
  dealId: string;
  documentType: string;
  documentTitle: string;
  guideHref: string;
  previousHref: string | null;
  position: number;
  total: number;
  reviewing: boolean;
  question: AskedQuestion | null;
  current: string;
  nextHref: string;
  vehicle: string;
  vin: string;
  buyerName: string;
  answers: Record<string, string>;
  money: PaperworkMoney | null;
  quotedRegistrationAmount: number | null;
  /** The power of attorney's facts and eligibility; null on every other doc. */
  poa: {
    eligible: boolean | null;
    grantorName: string;
    grantorAddress: string;
  } | null;
}) {
  const { t } = useFunnel();
  const [previewPending, startPreview] = useTransition();
  const [previewError, setPreviewError] = useState<string | null>(null);

  /**
   * Proof on every screen, per the owner's walkthrough: whatever is being
   * typed must be seen landing on the real document before anything signs.
   * The tab opens FIRST — a window opened after an await is a popup the
   * browser blocks — and navigates when the draft answers.
   */
  function openPreview() {
    setPreviewError(null);
    const tab = window.open("about:blank", "_blank");
    startPreview(async () => {
      const result = await previewPaperworkPdf(dealId, documentType);
      if (!result.ok) {
        tab?.close();
        setPreviewError(result.error);
        return;
      }
      if (tab) tab.location.href = result.url;
      else window.location.href = result.url;
    });
  }

  const heading = reviewing
    ? t.review.question
    : question
      ? localizeQuestion(t, documentType, question).question
      : "";

  return (
    <div className="ed-guide">
      <header className="ed-guide-head">
        <Link className="ed-guide-exit" href={guideHref}>
          {t.chrome.leave}
        </Link>
        <span className="ed-guide-count">
          {fillTemplate(t.chrome.countOf, { current: position + 1, total })}
        </span>
        <FunnelLanguageToggle />
      </header>

      <main className="ed-guide-body">
        {/* Which document this is, where the guide puts the car. On this
            corridor the car is not the thing being decided; the document is,
            and there is more than one of them. */}
        <p className="ed-guide-car">
          {localizeDocumentTitle(t, documentType, documentTitle)}
        </p>
        <h1 className="ed-guide-question">{heading}</h1>

        <div className="ed-guide-answer">
          {reviewing ? (
            <ReviewStep
              dealId={dealId}
              documentType={documentType}
              title={documentTitle}
              vehicle={vehicle}
              vin={vin}
              buyerName={buyerName}
              answers={answers}
              money={money}
              quotedRegistrationAmount={quotedRegistrationAmount}
              doneHref={guideHref}
              poa={poa}
            />
          ) : question ? (
            <AnswerStep
              dealId={dealId}
              documentType={documentType}
              question={question}
              current={current}
              nextHref={nextHref}
            />
          ) : null}
        </div>
      </main>

      <nav className="ed-guide-nav" aria-label={t.chrome.paperworkNav}>
        {previousHref ? (
          <Link className="ed-guide-back" href={previousHref}>
            <ArrowLeft size={15} aria-hidden="true" />
            {t.chrome.back}
          </Link>
        ) : (
          // Kept rather than dropped: without it the nav's space-between
          // collapses and the next control slides to the left edge.
          <span />
        )}
        {/* The POA review carries its own Open-the-official-form control,
            gated by the eligibility verdict - a chrome button here would
            offer a form the screen just refused. */}
        {poa ? null : (
        <span className="ed-paper-preview">
          {previewError ? (
            <span role="alert" className="ed-fine text-[color:var(--tj-copper)]">
              {previewError}
            </span>
          ) : null}
          <button
            type="button"
            onClick={openPreview}
            disabled={previewPending}
            className="ed-guide-back"
          >
            <FilePdf size={15} aria-hidden="true" />
            {previewPending ? t.review.previewDrawing : t.review.previewPdf}
          </button>
        </span>
        )}
        {/* No Next. Every screen here advances itself when it is answered. */}
      </nav>
    </div>
  );
}
