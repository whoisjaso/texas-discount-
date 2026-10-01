"use client";

import { type CSSProperties, useEffect, useLayoutEffect, useRef } from "react";
import TitleWorkChecklist from "@/components/admin/TitleWorkChecklist";
import SalvagePathStep from "@/components/admin/guide/SalvagePathStep";
import DealBadge from "@/components/admin/DealBadge";
import type { TitleWorkRow } from "@/lib/vehicles/title-path";
import type { SalvagePath } from "@/lib/sales/salvage-plan";
import type { DealBadgeKey } from "@/lib/sales/deal-badge";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";
import BuyerIdStep from "@/components/admin/guide/BuyerIdStep";
import LanguageStep from "@/components/admin/guide/LanguageStep";
import FundingStep from "@/components/admin/guide/FundingStep";
import PlanQuestionStep, { type PlanChoice } from "@/components/admin/guide/PlanQuestionStep";
import { planQuestionForStep, type PlanQuestionId, type SalePlan } from "@/lib/sales/sale-plan";
import LenderStep from "@/components/admin/guide/LenderStep";
import MoneyStep from "@/components/admin/guide/MoneyStep";
import WebDealerHandoff from "@/components/admin/WebDealerHandoff";
import PlateStep from "@/components/admin/guide/PlateStep";
import FunnelLanguageToggle from "@/components/admin/funnel/FunnelLanguageToggle";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate } from "@/lib/sales/i18n";
import type { BuyerId } from "@/lib/sales/buyer-id";
import type { MoneyAnswers } from "@/lib/sales/money";
import type { DealType } from "@/lib/sales/deal-type";
import type { Lender } from "@/lib/sales/lenders";
import type { HandoffField } from "@/lib/sales/webdealer";

/**
 * The corridor screen, on the client, so the language toggle can swap every
 * word in place without a navigation. The server page still decides which
 * step this is, what the deal holds, and every href — this component only
 * renders, and it renders whichever bundle the provider currently holds.
 *
 * `questionKey`/`questionTitle` instead of prebaked question text: the text
 * has to change when the toggle is pressed, so the client must own the last
 * step of composing it.
 */

export type GuideScreenStep = {
  key: string;
  /**
   * How this step is left.
   *
   * `self` means the step advances on its own when answered and must NOT get
   * a global Next: on a plan question that Next is a skip link past a
   * mandatory answer, which is exactly what the prescreen exists to prevent.
   * `next` means the step is read rather than answered and needs a way
   * forward. Derived from the kind so a new self-advancing step cannot be
   * added without declaring it, which a growing list of key exclusions
   * silently allowed.
   */
  advanceMode?: "self" | "next";
  /**
   * The step's own wording, when its kind cannot name it.
   *
   * Four plan questions share one questionKind, so the kind is not enough to
   * label them; the guide sets this from PLAN_STEP_QUESTION and the shell
   * uses it as the heading.
   */
  question?: string;
  /** The catalogue key this step's question lives under. */
  questionKind:
    | "language"
    | "buyer"
    | "buyerIdCapture"
    | "buyerIdReview"
    | "funding"
    | "planQuestion"
    | "plate"
    | "lender"
    | "paid"
    | "price"
    | "signDocument"
    | "titleWork"
    | "salvagePath"
    | "title"
    | "packet";
  /**
   * Whether the buyer actually signed it, or we merely filed it.
   *
   * The corridor said "Signed" for anything finalized, and a document can be
   * finalized with no signature at all. Saying which is which is the point
   * of a packet.
   */
  documentState?: "signed" | "filed";
  /** For signDocument: the document type (catalogue title key) + EN title. */
  documentType?: string;
  documentTitle?: string;
  done: boolean;
};

export default function GuideStepScreen({
  dealId,
  vehicle,
  buyerName,
  steps,
  currentKey,
  documentHref,
  capture,
  moneyInitial,
  buyerIdInitial,
  tradeInAllowance,
  funding,
  advertised,
  lenders,
  currentLenderId,
  handoffFields,
  webDealerUrl,
  plate,
  salePlan,
  titleWork = null,
  salvagePath = null,
  badge = null,
  nextHref,
  returnHref = null,
}: {
  dealId: string;
  vehicle: string;
  buyerName: string;
  steps: GuideScreenStep[];
  currentKey: string;
  /** Where the current document step opens, when it is one. */
  documentHref: string | null;
  capture: {
    url: string;
    token: string;
    qr: string;
    imageUrl: string | null;
    backUrl: string | null;
    documentUrl: string | null;
  };
  moneyInitial: MoneyAnswers;
  buyerIdInitial: BuyerId;
  tradeInAllowance: number;
  funding: DealType | null;
  advertised: number;
  lenders: Lender[];
  currentLenderId: string | null;
  handoffFields: HandoffField[];
  webDealerUrl: string;
  plate: string | null;
  salePlan: SalePlan;
  /** The salvage car's title work, on the step that holds the documents. */
  titleWork?: { vehicleId: string; rows: TitleWorkRow[] } | null;
  /** The salvage answer on this sale, for the step that asks it. */
  salvagePath?: SalvagePath | null;
  /** What the title lets this sale be, under the car's name on every step. */
  badge?: { key: DealBadgeKey; tone: "ok" | "hold" | "stop" } | null;
  nextHref: string;
  /**
   * Where this screen sends the operator when it was opened from the summary.
   *
   * Null on an ordinary walk, and then the corridor behaves exactly as it
   * always has. Set on a Change trip, and every way out of this screen leads
   * back to the summary instead of onward: the answer saves, the reader
   * returns to the line they tapped, and the fast lane stays fast. Without
   * this half, Check Answers costs the reader their place on every edit and
   * is slower than the corridor it was meant to shortcut.
   */
  returnHref?: string | null;
}) {
  const { t } = useFunnel();

  const shellRef = useRef<HTMLDivElement>(null);

  /**
   * Direction is recorded before navigation, without delaying it.
   *
   * A route change can cut the exit short, which is intentional: the screen
   * moves when the data is ready, never when an animation says it may. The
   * next route reads the direction before paint so Back enters from the side
   * the previous screen left through.
   */
  const beginNavigation = (direction: "forward" | "back") => {
    const shell = shellRef.current;
    if (shell) {
      shell.dataset.direction = direction;
      shell.dataset.leaving = direction;
    }
    try {
      window.sessionStorage.setItem("tj-corridor-direction", direction);
    } catch {
      // Direction is polish. Storage refusal must never become a dead end.
    }
  };

  useLayoutEffect(() => {
    let direction: "forward" | "back" = "forward";
    try {
      const stored = window.sessionStorage.getItem("tj-corridor-direction");
      if (stored === "back" || stored === "forward") direction = stored;
      window.sessionStorage.removeItem("tj-corridor-direction");
    } catch {
      // The default keeps direct links complete when storage is unavailable.
    }

    const shell = shellRef.current;
    if (!shell) return;
    shell.dataset.direction = direction;
    delete shell.dataset.leaving;
  }, [currentKey]);

  const questionRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    questionRef.current?.focus();
  }, [currentKey]);

  const index = steps.findIndex((step) => step.key === currentKey);
  const current = steps[index];
  const previous = index > 0 ? steps[index - 1] : null;
  const following = index >= 0 && index < steps.length - 1 ? steps[index + 1] : null;

  if (!current) return null;

  /*
    Whether this step carries a global Next.

    It used to be a list of key exclusions, which meant every new
    self-advancing step had to remember to add itself or it silently grew a
    skip button. The plan questions did exactly that, and a Next beside a
    mandatory question is a way past it.
  */
  const advanceMode: "self" | "next" =
    current.advanceMode ??
    // The title work is self too: the county's title is what moves it on.
    (current.questionKind === "funding" ||
    current.questionKind === "titleWork" ||
    current.questionKind === "salvagePath" ||
    current.questionKind === "lender" ||
    current.questionKind === "plate" ||
    current.questionKind === "paid" ||
    current.questionKind === "price" ||
    current.questionKind === "planQuestion"
      ? "self"
      : "next");

  const stepHref = (key: string) =>
    `/admin/sales/${encodeURIComponent(dealId)}/guide/${encodeURIComponent(key)}`;
  const saleHref = `/admin/sales/${encodeURIComponent(dealId)}`;

  /**
   * A prescreen question's words, in the reader's own language.
   *
   * These four questions used to be the last English left in the corridor.
   * They sat in a `Record` of literals rather than in JSX, which is why the
   * no-literal sweep never saw them: a Spanish sale reached the prescreen and
   * four questions and nine answer buttons switched back to English, in the
   * middle of the part that decides who files the title.
   *
   * The shape below carries catalogue key SUFFIXES rather than words, so a
   * new question cannot be added without giving it entries in both bundles,
   * and the words themselves live where every other corridor string lives.
   */
  const planWords = t.plan as Record<string, string>;
  const planHelp = (id: PlanQuestionId): string | undefined => {
    const help = planWords[`${id}Help`];
    return help ? help : undefined;
  };
  const planChoices = (id: PlanQuestionId): PlanChoice[] =>
    PLAN_QUESTION_VALUES[id].map((entry) => ({
      value: entry.value,
      label: planWords[`${id}${entry.label}`] ?? "",
      ...(entry.gloss ? { gloss: planWords[`${id}${entry.gloss}`] } : {}),
    }));

  const question = (() => {
    if (current.questionKind === "signDocument") {
      const title =
        (current.documentType &&
          (t.documents as Record<string, string>)[current.documentType]) ||
        current.documentTitle ||
        "";
      return fillTemplate(t.guide.signDocument, { title });
    }
    /*
      A prescreen question names itself by id.

      Every other step reads one catalogue string for its kind, but there are
      four plan questions sharing one kind, so the kind cannot name them. The
      id can, and it reads the same catalogue as everything else. The step's
      own English question (PLAN_STEP_QUESTION, which the packet list and the
      progress rail still use) is the fallback, never the first choice.
    */
    if (current.questionKind === "planQuestion") {
      const id = planQuestionForStep(current.key);
      return (id && planWords[`${id}Question`]) || current.question || "";
    }
    return t.guide[current.questionKind as keyof typeof t.guide];
  })();

  return (
    <div ref={shellRef} className="ed-guide" data-direction="forward">
      <header className="ed-guide-head">
        <Link className="ed-guide-exit" href={saleHref}>
          {t.chrome.leave}
        </Link>
        <div
          className="ed-guide-progress"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
          aria-valuetext={fillTemplate(t.chrome.countOf, {
            current: index + 1,
            total: steps.length,
          })}
        >
          <span
            className="ed-step-track"
            aria-hidden="true"
            style={
              {
                "--step-progress": `${((index + 1) / steps.length) * 100}%`,
              } as CSSProperties
            }
          />
          <span className="sr-only">
            {fillTemplate(t.chrome.countOf, {
              current: index + 1,
              total: steps.length,
            })}
          </span>
        </div>
        <FunnelLanguageToggle />
      </header>

      <main key={currentKey} className="ed-guide-body">
        <p className="ed-guide-car">{vehicle}</p>
        {/* The title's verdict, on every step, so nobody has to remember
            it: a salvage car that cannot get plates says so above the
            question about how the buyer is paying. Compact on ordinary
            sales, where it only confirms; with its gloss when it holds. */}
        {badge ? (
          <DealBadge
            badge={badge}
            label={(t.badges as Record<string, string>)[badge.key] ?? ""}
            gloss={(t.badges as Record<string, string>)[`${badge.key}Gloss`]}
            compact={badge.tone === "ok"}
          />
        ) : null}
        {/* Focusable and re-keyed per step. The corridor moves on its own
            when a question is answered, so focus has to follow it: without
            this a keyboard or screen reader user is left on a page that
            changed underneath them, with focus on a button that is gone. */}
        <h1
          key={currentKey}
          ref={questionRef}
          tabIndex={-1}
          className="ed-guide-question"
          style={{ outline: "none" }}
        >
          {question}
        </h1>

        <div className="ed-guide-answer">
          {current.key === "language" ? (
            <LanguageStep dealId={dealId} nextHref={nextHref} onNavigate={() => beginNavigation("forward")} />
          ) : null}

          {current.key === "buyer" ? (
            <div className="ed-guide-plain">
              <p className="ed-guide-value">{buyerName || t.chrome.nobodyYet}</p>
              <Link className="ed-btn ed-btn-outline" href={saleHref}>
                {t.chrome.change}
              </Link>
            </div>
          ) : null}

          {current.key === "buyerId" ? (
            <BuyerIdStep
              dealId={dealId}
              captureUrl={capture.url}
              captureToken={capture.token}
              documentUrl={capture.documentUrl}
              qrDataUrl={capture.qr}
              initial={buyerIdInitial}
              imageUrl={capture.imageUrl}
              backUrl={capture.backUrl}
              nextHref={nextHref}
              onNavigate={() => beginNavigation("forward")}
            />
          ) : null}

          {current.key === "funding" ? (
            <FundingStep
              dealId={dealId}
              current={funding}
              nextHref={nextHref}
              onNavigate={() => beginNavigation("forward")}
            />
          ) : null}

          {planQuestionForStep(current.key) ? (
            <PlanQuestionStep
              dealId={dealId}
              questionId={planQuestionForStep(current.key) as PlanQuestionId}
              help={planHelp(planQuestionForStep(current.key) as PlanQuestionId)}
              choices={planChoices(planQuestionForStep(current.key) as PlanQuestionId)}
              current={planAnswerFor(salePlan, planQuestionForStep(current.key) as PlanQuestionId)}
              stepBase={`/admin/sales/${dealId}/guide/`}
              /*
                The guide's own front door, which lands on the first open step.

                This pointed at the packet, so the last prescreen answer put
                the operator on "Print Or Save The Paperwork" with nothing
                signed: the four document steps the answers had just created
                were skipped in one tap. Measured on the preview deal. The
                documents do not exist until the plan is complete, so no
                screen can know their keys before the write lands; the entry
                route reads the deal after it and sends the operator to
                whatever is genuinely next.
              */
              packetHref={`/admin/sales/${dealId}/guide`}
              returnHref={returnHref}
              savingLabel={t.chrome.saving}
              onNavigate={() => beginNavigation("forward")}
            />
          ) : null}

          {current.key === "plate" ? (
            <PlateStep
              dealId={dealId}
              current={plate}
              nextHref={nextHref}
              onNavigate={() => beginNavigation("forward")}
            />
          ) : null}

          {current.key === "paid" || current.key === "price" ? (
            <MoneyStep
              dealId={dealId}
              part={current.key}
              advertised={advertised}
              tradeInAllowance={tradeInAllowance}
              funding={funding}
              initial={moneyInitial}
              nextHref={nextHref}
              onNavigate={() => beginNavigation("forward")}
            />
          ) : null}

          {current.key === "lender" ? (
            <LenderStep
              dealId={dealId}
              lenders={lenders}
              currentLenderId={currentLenderId}
              nextHref={nextHref}
              onNavigate={() => beginNavigation("forward")}
            />
          ) : null}

          {current.questionKind === "signDocument" && documentHref ? (
            <div className="ed-guide-plain">
              <Link className="ed-btn ed-btn-dark" href={documentHref}>
                {current.done ? t.chrome.openAgain : t.chrome.open}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              {current.done ? (
                <p className="ed-guide-signed">
                  <Check size={15} aria-hidden="true" />{" "}
                  {current.documentState === "signed"
                    ? t.chrome.signed
                    : t.chrome.filed}
                </p>
              ) : null}
            </div>
          ) : null}

          {current.questionKind === "salvagePath" ? (
            <SalvagePathStep
              dealId={dealId}
              current={salvagePath}
              words={planWords}
              guideHref={`/admin/sales/${dealId}/guide`}
              returnHref={returnHref}
              savingLabel={t.chrome.saving}
              onNavigate={() => beginNavigation("forward")}
            />
          ) : null}

          {current.key === "titleWork" && titleWork ? (
            <div className="ed-guide-plain ed-guide-titlework">
              <p className="ed-guide-note">{t.start.titleHoldNote}</p>
              <TitleWorkChecklist vehicleId={titleWork.vehicleId} rows={titleWork.rows} />
            </div>
          ) : null}

          {current.key === "title" ? (
            <WebDealerHandoff
              dealId={dealId}
              fields={handoffFields}
              webDealerUrl={webDealerUrl}
              plate={plate}
              heading={false}
            />
          ) : null}
        </div>
      </main>

      <nav className="ed-guide-nav" aria-label={t.chrome.walkthroughNav}>
        {/*
          On a Change trip the corridor has one exit, and it is the way back.

          Stepping to the neighbouring question would be answering something
          nobody asked about, and a Next that walks on abandons the line the
          reader tapped. So the whole nav collapses to a single return, which
          is also what the self advancing steps navigate to once they save.
        */}
        {returnHref ? (
          <>
            <span />
            <Link
              className="ed-btn ed-btn-dark"
              href={returnHref}
              onClick={() => beginNavigation("back")}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              {t.summary.backToSummary}
            </Link>
          </>
        ) : (
          <>
            {previous ? (
              <Link
                className="ed-guide-back"
                href={stepHref(previous.key)}
                onClick={() => beginNavigation("back")}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                {t.chrome.back}
              </Link>
            ) : (
              <span />
            )}

            {/* The funding and lender steps move on when you answer them, and
                the money steps carry their own Next, which is the same
                reasoning as before this component existed and is documented
                on the server page. */}
            {following && advanceMode !== "self" ? (
              <Link
                className="ed-btn ed-btn-dark"
                href={stepHref(following.key)}
                onClick={() => beginNavigation("forward")}
              >
                {t.chrome.next}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ) : null}

            {!following ? (
              <Link
                className="ed-btn ed-btn-dark"
                href={saleHref}
                onClick={() => beginNavigation("forward")}
              >
                {t.chrome.finish}
              </Link>
            ) : null}
          </>
        )}
      </nav>

      {/*
        The fast lane, offered and never imposed.

        NN/g's rule for an accelerator is that it be readily available and
        easy to ignore, and that finding it must never be necessary to use
        the thing. So it sits under the walk as a quiet line: the dealer on
        their third deal of the day finds it, and the one covering the desk
        for an afternoon never has to.
      */}
      {returnHref ? null : (
        <p className="ed-guide-aside">
          <Link className="ed-sum-guided" href={`${saleHref}/summary`}>
            {t.summary.seeWholeSale}
          </Link>
        </p>
      )}
    </div>
  );
}

/**
 * The answers each prescreen question offers, as catalogue keys.
 *
 * This used to hold the English words themselves, which is how four questions
 * and nine buttons stayed English on a Spanish sale: they were object values
 * rather than JSX, so the no-literal sweep could not see them. What is left
 * here is the SHAPE, which is genuinely structural: which values exist, in
 * what order, and which of them carry a second line. The words are read from
 * `funnel.plan` at render time, so the language toggle reprints them like
 * everything else.
 *
 * `label` and `gloss` are key suffixes appended to the question id, so
 * `registrationBy` + `Dealer` resolves `funnel.plan.registrationByDealer`.
 * Typed against PlanQuestionId, so a new question cannot be added without
 * answers, and the catalogue guard then refuses it without both languages.
 */
const PLAN_QUESTION_VALUES: Record<
  PlanQuestionId,
  Array<{ value: string | boolean; label: string; gloss?: string }>
> = {
  registrationBy: [
    { value: "dealer", label: "Dealer", gloss: "DealerGloss" },
    { value: "buyer", label: "Buyer", gloss: "BuyerGloss" },
  ],
  titleSignedBy: [
    { value: "buyer", label: "Buyer", gloss: "BuyerGloss" },
    { value: "dealer", label: "Dealer", gloss: "DealerGloss" },
  ],
  priceIncludesRegistration: [
    { value: true, label: "Yes" },
    { value: false, label: "No" },
  ],
  inspectionBy: [
    { value: "done", label: "Done" },
    { value: "dealer", label: "Dealer" },
    { value: "buyer", label: "Buyer" },
  ],
  insuranceShown: [
    { value: true, label: "Yes" },
    { value: false, label: "No" },
  ],
};

function planAnswerFor(
  plan: SalePlan,
  id: PlanQuestionId,
): string | boolean | null {
  switch (id) {
    case "registrationBy":
      return plan.registrationBy;
    case "titleSignedBy":
      return plan.titleSignedBy;
    case "priceIncludesRegistration":
      return plan.priceIncludesRegistration;
    case "inspectionBy":
      return plan.inspectionBy;
    case "insuranceShown":
      return plan.insuranceShown;
  }
}
