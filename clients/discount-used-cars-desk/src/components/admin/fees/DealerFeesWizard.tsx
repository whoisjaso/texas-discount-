"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { saveDealerFeesAction, type DealerFeesResult } from "@/lib/actions/dealer-fees";
import { dealerFees } from "@/lib/dealership-config";
import { DOC_FEE_NOTICE_EN, DOC_FEE_NOTICE_ES } from "@/lib/legal/doc-fee-notice";
import {
  DEALER_DEPUTY_TITLE_FEE,
  DOC_FEE,
  DOC_FEE_CH345,
  STATE_FEES_2026,
  centsAsDollars,
  isEmissionsCounty,
  localFeeCentsForCounty,
  titleFeeCentsForCounty,
} from "@/lib/legal/texas-dealer-fees";
import {
  dealerChargesLine,
  parseFeeScheduleInput,
  validateFeeSchedule,
  type FeeProblem,
  type FeeSchedule,
  type FeeScheduleInput,
} from "@/lib/sales/fee-schedule";
import { fillTemplate } from "@/lib/sales/i18n";
import { tapHaptic } from "@/lib/haptics";

/**
 * Your Fees (rulebook texas-dealer-fees.md section 5.2): the dealer-set fees,
 * one question to a screen, in the corridor's clothes, in English and
 * Spanish from the catalogue, each limit's citation on one quiet line.
 *
 *   1. Do You Write Finance Contracts?   (and the NMLS and old licence numbers)
 *   2. What Is Your Documentary Fee?     ($225.00, or a recorded OCCC filing)
 *   3. Are You A Dealer Deputy?          ($10.00 at most; recorded for now)
 *   4. Vehicle Inventory Tax             (January 1, the factor; recorded for now)
 *   5. Motorcycles, ATVs, Mopeds Or Towable RVs?  (recorded and reported)
 *   6. Review                            (dealer fees, the state's, Save)
 *
 * The same screens serve first sign-in (the owner's corridor) and the
 * settings page, where "Change" opens one screen. Every refusal comes from
 * the validator the save action and the database run (`fee-schedule.ts`),
 * said before the round trip; nothing is trimmed.
 */

export const FEE_SCREENS = ["finance", "docFee", "deputy", "vit", "ch345", "review"] as const;
export type FeeScreen = (typeof FEE_SCREENS)[number];

/** Which screen a problem belongs to, by the field it names. */
function screenOf(problem: FeeProblem): FeeScreen {
  if (problem.field.startsWith("docFee") || problem.field.startsWith("occcFiling")) return "docFee";
  if (problem.field.startsWith("deputy")) return "deputy";
  if (problem.field.startsWith("vit")) return "vit";
  if (problem.field === "nmlsId" || problem.field === "legacyLicense") return "finance";
  return "review";
}

/** The typed answers a saved schedule starts the boxes with. */
function inputFrom(schedule: FeeSchedule): FeeScheduleInput {
  const doc = schedule.docFeeCents;
  const filing = schedule.occcFiling;
  return {
    docFee: doc !== null && Number.isFinite(doc) ? (doc / 100).toFixed(2) : "",
    occcFiling: filing
      ? {
          max: Number.isFinite(filing.maxCents) ? (filing.maxCents / 100).toFixed(2) : "",
          filedOn: filing.filedOn,
          effectiveOn: filing.effectiveOn,
          licenseOrNmls: filing.licenseOrNmls,
          location: filing.location,
        }
      : null,
    writesFinanceContracts: schedule.writesFinanceContracts,
    nmlsId: schedule.nmlsId ?? "",
    legacyLicense: schedule.legacyLicense ?? "",
    deputy: { isDeputy: schedule.deputy.isDeputy, fee: schedule.deputy.feeCents > 0 ? (schedule.deputy.feeCents / 100).toFixed(2) : "" },
    vit: {
      inBusinessJan1: schedule.vit.inBusinessJan1,
      passesThrough: schedule.vit.passesThrough,
      unitFactor: schedule.vit.unitFactor === null ? "" : String(schedule.vit.unitFactor),
    },
    financesCh345: schedule.financesCh345,
  };
}

const EMPTY_FILING = { max: "", filedOn: "", effectiveOn: "", licenseOrNmls: "", location: "" };

export default function DealerFeesWizard({
  mode,
  initialSchedule,
  county,
  today,
  startAt = "finance",
  onSaved,
  onLater,
  onExit,
}: {
  mode: "onboarding" | "settings";
  /** The schedule as it stands: the owner's saved one, or the config seed. */
  initialSchedule: FeeSchedule;
  /** The dealer's own county, for the state's lines on the review. */
  county: string | null;
  /** The business date, YYYY-MM-DD. */
  today: string;
  startAt?: FeeScreen;
  onSaved: (version: number) => void;
  /** First sign-in only: leave the fees for later (filing stays refused). */
  onLater?: () => void;
  /** Back from the first screen. */
  onExit?: () => void;
}) {
  const { t } = useFunnel();
  const f = t.onboarding.fees;
  const errors = t.onboarding.errors as Record<string, string | undefined>;
  const [input, setInput] = useState<FeeScheduleInput>(() => inputFrom(initialSchedule));
  // Whether the yes/no answers were given; a saved schedule has given them.
  const saved = initialSchedule.source === "owner";
  const [deputyAnswered, setDeputyAnswered] = useState(saved);
  const [screen, setScreen] = useState<FeeScreen>(startAt);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<Extract<DealerFeesResult, { ok: false }> | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const questionRef = useRef<HTMLHeadingElement>(null);
  const shown = useRef(screen);

  useEffect(() => {
    if (shown.current === screen) return;
    shown.current = screen;
    questionRef.current?.focus();
  }, [screen]);

  const position = FEE_SCREENS.indexOf(screen);
  const year = Number(today.slice(0, 4)) || 2026;
  const presumed = centsAsDollars(DOC_FEE.presumedReasonableMaxCents);

  const parsed = useMemo(() => {
    const { fields, problems } = parseFeeScheduleInput(input, today);
    const seen = new Set<string>();
    const all = [...problems, ...validateFeeSchedule(fields, { today })].filter((problem) => {
      const key = `${problem.code}:${problem.field}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { fields, problems: all };
  }, [input, today]);

  const problemsHere = parsed.problems.filter(
    (problem) => screenOf(problem) === screen && !(problem.code === "docFeeRequired" && !touched.docFee),
  );

  function problemText(problem: { code: string; params?: Record<string, string | number> }): string {
    const template = errors[problem.code];
    if (!template) return t.chrome.couldNotSave;
    return fillTemplate(template, problem.params ?? {});
  }

  function update(patch: Partial<FeeScheduleInput>) {
    setRefusal(null);
    setInput((current) => ({ ...current, ...patch }));
  }

  const answered: Record<FeeScreen, boolean> = {
    finance: input.writesFinanceContracts !== null,
    docFee: input.docFee.replace(/[$,\s]/g, "") !== "",
    deputy: deputyAnswered,
    vit: input.vit.inBusinessJan1 === false || (input.vit.inBusinessJan1 === true && input.vit.passesThrough !== null),
    ch345: input.financesCh345 !== null,
    review: true,
  };
  const canGoOn = answered[screen] && parsed.problems.filter((problem) => screenOf(problem) === screen).length === 0;

  function go(next: FeeScreen) {
    setRefusal(null);
    setScreen(next);
  }

  function next() {
    tapHaptic();
    const after = FEE_SCREENS[position + 1];
    if (after) go(after);
  }

  function back() {
    if (position === 0) {
      onExit?.();
      return;
    }
    go(FEE_SCREENS[position - 1]);
  }

  async function save() {
    if (pending) return;
    tapHaptic();
    setPending(true);
    setRefusal(null);
    try {
      const result = await saveDealerFeesAction(input, initialSchedule.source === "owner" ? initialSchedule.version : 0, mode);
      if (!result.ok) {
        setRefusal(result);
        const first = result.problems?.[0];
        if (first) setScreen(screenOf(first));
        return;
      }
      onSaved(result.version);
    } finally {
      setPending(false);
    }
  }

  const question =
    screen === "finance"
      ? f.financeQuestion
      : screen === "docFee"
        ? f.docFeeQuestion
        : screen === "deputy"
          ? f.deputyQuestion
          : screen === "vit"
            ? f.vitQuestion
            : screen === "ch345"
              ? f.ch345Question
              : f.reviewQuestion;

  const filing = input.occcFiling;
  const charges = dealerChargesLine(parsed.fields);
  const titleCents = titleFeeCentsForCounty(county);
  const localCents = localFeeCentsForCounty(county);
  const fees = STATE_FEES_2026;
  const yesNo = (value: boolean | null) => (value === null ? f.notAnswered : value ? f.yes : f.no);

  return (
    <>
      <main key={screen} className="ed-guide-body" data-fees-screen={screen}>
        <p className="ed-cluster-count" aria-live="polite">
          {fillTemplate(f.countOf, { current: position + 1, total: FEE_SCREENS.length })}
        </p>
        <h1 ref={questionRef} tabIndex={-1} id="fees-question" className="ed-guide-question" style={{ outline: "none" }}>
          {question}
        </h1>

        <div className="ed-guide-answer">
          {screen === "finance" ? (
            <div className="ed-start-fields" data-tj-stagger>
              <p className="ed-fine">{f.financeHelp}</p>
              <div className="ed-pay-row">
                <Choice
                  active={input.writesFinanceContracts === true}
                  label={f.yes}
                  gloss={f.financeYesGloss}
                  onClick={() => update({ writesFinanceContracts: true })}
                />
                <Choice
                  active={input.writesFinanceContracts === false}
                  label={f.no}
                  gloss={f.financeNoGloss}
                  onClick={() => update({ writesFinanceContracts: false })}
                />
              </div>
              {input.writesFinanceContracts ? (
                <>
                  <label>
                    <span className="ed-field-label">{f.nmlsId}</span>
                    <input
                      className="ed-input"
                      name="nmlsId"
                      autoComplete="off"
                      maxLength={120}
                      value={input.nmlsId}
                      onChange={(event) => update({ nmlsId: event.target.value })}
                    />
                  </label>
                  <label>
                    <span className="ed-field-label">{f.legacyLicense}</span>
                    <input
                      className="ed-input"
                      name="legacyLicense"
                      autoComplete="off"
                      maxLength={120}
                      value={input.legacyLicense}
                      onChange={(event) => update({ legacyLicense: event.target.value })}
                    />
                  </label>
                  <p className="ed-fine">{f.licenseHelp}</p>
                </>
              ) : null}
            </div>
          ) : null}

          {screen === "docFee" ? (
            <div className="ed-start-fields" data-tj-stagger>
              <p className="ed-fine">{f.docFeeHelp}</p>
              <label>
                <span className="ed-field-label">{f.docFeeLabel}</span>
                <input
                  className="ed-input ed-money-input"
                  name="docFee"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="$"
                  autoFocus
                  value={input.docFee}
                  onChange={(event) => {
                    setTouched((current) => ({ ...current, docFee: true }));
                    update({ docFee: event.target.value });
                  }}
                />
              </label>
              <p className="ed-fine" data-fee-limit="">
                {fillTemplate(f.docFeeLimit, { limit: presumed })}
              </p>
              <p className="ed-fine ed-fee-citation">{f.docFeeCitation}</p>

              <button
                type="button"
                className="ed-money-adjust ed-onboard-reveal"
                aria-pressed={filing !== null}
                onClick={() => update({ occcFiling: filing ? null : { ...EMPTY_FILING } })}
              >
                {f.occcToggle}
              </button>
              {filing ? (
                <fieldset className="ed-start-fields border-0 p-0" aria-label={f.occcToggle}>
                  <p className="ed-fine">{fillTemplate(f.occcHelp, { limit: presumed })}</p>
                  <label>
                    <span className="ed-field-label">{f.occcMax}</span>
                    <input
                      className="ed-input"
                      name="occcMax"
                      inputMode="decimal"
                      placeholder="$"
                      autoComplete="off"
                      value={filing.max}
                      onChange={(event) => update({ occcFiling: { ...filing, max: event.target.value } })}
                    />
                  </label>
                  <label>
                    <span className="ed-field-label">{f.occcFiledOn}</span>
                    <input
                      className="ed-input"
                      type="date"
                      name="occcFiledOn"
                      max={today}
                      value={filing.filedOn}
                      onChange={(event) => update({ occcFiling: { ...filing, filedOn: event.target.value } })}
                    />
                  </label>
                  <label>
                    <span className="ed-field-label">{f.occcEffectiveOn}</span>
                    <input
                      className="ed-input"
                      type="date"
                      name="occcEffectiveOn"
                      min={filing.filedOn || undefined}
                      value={filing.effectiveOn}
                      onChange={(event) => update({ occcFiling: { ...filing, effectiveOn: event.target.value } })}
                    />
                  </label>
                  <label>
                    <span className="ed-field-label">{f.occcLicense}</span>
                    <input
                      className="ed-input"
                      name="occcLicense"
                      autoComplete="off"
                      maxLength={120}
                      value={filing.licenseOrNmls}
                      onChange={(event) => update({ occcFiling: { ...filing, licenseOrNmls: event.target.value } })}
                    />
                  </label>
                  <label>
                    <span className="ed-field-label">{f.occcLocation}</span>
                    <input
                      className="ed-input"
                      name="occcLocation"
                      autoComplete="off"
                      maxLength={120}
                      value={filing.location}
                      onChange={(event) => update({ occcFiling: { ...filing, location: event.target.value } })}
                    />
                  </label>
                  {parsed.fields.occcFiling && Number.isFinite(parsed.fields.occcFiling.maxCents) && parsed.fields.occcFiling.maxCents > DOC_FEE.presumedReasonableMaxCents ? (
                    <p className="ed-fine">{fillTemplate(f.occcCapNow, { limit: centsAsDollars(parsed.fields.occcFiling.maxCents) })}</p>
                  ) : null}
                  <p className="ed-fine">{f.occcChannel}</p>
                </fieldset>
              ) : null}
              <p className="ed-fine">{fillTemplate(f.ownerChange, { limit: presumed })}</p>

              <section className="ed-fee-notice" aria-label={f.noticeHeading} data-notice-preview="">
                <h2 className="ed-field-label">{f.noticeHeading}</h2>
                <p className="ed-fine">{f.noticeLead}</p>
                <p className="ed-fee-notice-text" lang="en">{DOC_FEE_NOTICE_EN}</p>
                <p className="ed-fee-notice-text" lang="es">{DOC_FEE_NOTICE_ES}</p>
              </section>
            </div>
          ) : null}

          {screen === "deputy" ? (
            <div className="ed-start-fields" data-tj-stagger>
              <p className="ed-fine">{f.deputyHelp}</p>
              <div className="ed-pay-row">
                <Choice
                  active={deputyAnswered && input.deputy.isDeputy}
                  label={f.yes}
                  gloss={f.deputyYesGloss}
                  onClick={() => {
                    setDeputyAnswered(true);
                    update({ deputy: { ...input.deputy, isDeputy: true } });
                  }}
                />
                <Choice
                  active={deputyAnswered && !input.deputy.isDeputy}
                  label={f.no}
                  gloss={f.deputyNoGloss}
                  onClick={() => {
                    setDeputyAnswered(true);
                    update({ deputy: { isDeputy: false, fee: "" } });
                  }}
                />
              </div>
              {deputyAnswered && input.deputy.isDeputy ? (
                <>
                  <label>
                    <span className="ed-field-label">{f.deputyFee}</span>
                    <input
                      className="ed-input"
                      name="deputyFee"
                      inputMode="decimal"
                      placeholder="$"
                      autoComplete="off"
                      value={input.deputy.fee}
                      onChange={(event) => update({ deputy: { isDeputy: true, fee: event.target.value } })}
                    />
                  </label>
                  <p className="ed-fine ed-fee-citation">
                    {fillTemplate(f.deputyLimit, { limit: centsAsDollars(DEALER_DEPUTY_TITLE_FEE.maxCents) })}
                  </p>
                  <p className="ed-fine">{f.recordedLater}</p>
                </>
              ) : deputyAnswered ? (
                <p className="ed-fine">{f.deputyNoNote}</p>
              ) : null}
            </div>
          ) : null}

          {screen === "vit" ? (
            <div className="ed-start-fields" data-tj-stagger>
              <p className="ed-fine">{fillTemplate(f.vitJan1, { year })}</p>
              <div className="ed-pay-row">
                <Choice
                  active={input.vit.inBusinessJan1 === true}
                  label={f.yes}
                  gloss={f.vitYesGloss}
                  onClick={() => update({ vit: { ...input.vit, inBusinessJan1: true } })}
                />
                <Choice
                  active={input.vit.inBusinessJan1 === false}
                  label={f.no}
                  gloss={f.vitNoGloss}
                  onClick={() => update({ vit: { inBusinessJan1: false, passesThrough: null, unitFactor: "" } })}
                />
              </div>
              {input.vit.inBusinessJan1 === true ? (
                <>
                  <p className="ed-fine">{f.vitPass}</p>
                  <div className="ed-pay-row">
                    <Choice
                      active={input.vit.passesThrough === true}
                      label={f.yes}
                      gloss={f.vitPassYesGloss}
                      onClick={() => update({ vit: { ...input.vit, passesThrough: true } })}
                    />
                    <Choice
                      active={input.vit.passesThrough === false}
                      label={f.no}
                      gloss={f.vitPassNoGloss}
                      onClick={() => update({ vit: { ...input.vit, passesThrough: false, unitFactor: "" } })}
                    />
                  </div>
                  {input.vit.passesThrough ? (
                    <>
                      <label>
                        <span className="ed-field-label">{f.vitFactor}</span>
                        <input
                          className="ed-input"
                          name="vitFactor"
                          inputMode="decimal"
                          autoComplete="off"
                          value={input.vit.unitFactor}
                          onChange={(event) => update({ vit: { ...input.vit, unitFactor: event.target.value } })}
                        />
                      </label>
                      <p className="ed-fine">{f.vitFactorHelp}</p>
                      <p className="ed-fine">{f.recordedLater}</p>
                    </>
                  ) : null}
                </>
              ) : input.vit.inBusinessJan1 === false ? (
                <p className="ed-fine">{f.vitZero}</p>
              ) : null}
              <p className="ed-fine ed-fee-citation">{f.vitCitation}</p>
            </div>
          ) : null}

          {screen === "ch345" ? (
            <div className="ed-start-fields" data-tj-stagger>
              <p className="ed-fine">
                {fillTemplate(f.ch345Help, {
                  land: centsAsDollars(DOC_FEE_CH345.maxCentsLandOnlyOrWatercraftOnly),
                  both: centsAsDollars(DOC_FEE_CH345.maxCentsLandAndWatercraft),
                })}
              </p>
              <div className="ed-pay-row">
                <Choice
                  active={input.financesCh345 === true}
                  label={f.yes}
                  gloss={f.ch345YesGloss}
                  onClick={() => update({ financesCh345: true })}
                />
                <Choice
                  active={input.financesCh345 === false}
                  label={f.no}
                  gloss={f.ch345NoGloss}
                  onClick={() => update({ financesCh345: false })}
                />
              </div>
              {input.financesCh345 ? (
                <p className="ed-money-error" role="status">
                  {f.ch345Warning}
                </p>
              ) : null}
            </div>
          ) : null}

          {screen === "review" ? (
            <div className="ed-start-fields" data-tj-stagger data-fees-review="">
              <p className="ed-fee-on-top" data-dealer-charges="">
                {fillTemplate(f.onTop, { charged: charges.charged, allowed: charges.allowed })}
              </p>
              <p className="ed-fine">{f.noCombinedCap}</p>

              <h2 className="ed-field-label">{f.reviewDealer}</h2>
              <dl className="ed-money-receipt ed-fee-receipt">
                <FeeLine
                  label={f.docFeeLabel}
                  value={
                    parsed.fields.docFeeCents !== null && Number.isFinite(parsed.fields.docFeeCents)
                      ? centsAsDollars(parsed.fields.docFeeCents)
                      : f.notAnswered
                  }
                  citation={fillTemplate(f.limitLine, { limit: charges.allowed, citation: DOC_FEE.shortCitation })}
                />
                <FeeLine
                  label={f.deputyLine}
                  value={
                    input.deputy.isDeputy
                      ? fillTemplate(f.notChargedYet, { fee: centsAsDollars(parsed.fields.deputy.feeCents) })
                      : f.notDeputy
                  }
                  citation={fillTemplate(f.deputyLimit, { limit: centsAsDollars(DEALER_DEPUTY_TITLE_FEE.maxCents) })}
                />
                <FeeLine
                  label={f.vitLine}
                  value={
                    input.vit.passesThrough && parsed.fields.vit.unitFactor !== null
                      ? fillTemplate(f.vitPassesOn, { factor: String(parsed.fields.vit.unitFactor) })
                      : f.vitNone
                  }
                  citation={f.vitCitation}
                />
                <FeeLine label={f.financeLine} value={yesNo(input.writesFinanceContracts)} />
                <FeeLine label={f.ch345Line} value={yesNo(input.financesCh345)} />
              </dl>

              <h2 className="ed-field-label">{f.reviewState}</h2>
              <p className="ed-fine">
                {fillTemplate(f.reviewStateNote, { county: county ?? "", year: fees.year })}
              </p>
              <dl className="ed-money-receipt ed-fee-receipt" data-state-fees="">
                <FeeLine
                  label={f.stateTitle}
                  value={titleCents === null ? f.stateUnknown : centsAsDollars(titleCents)}
                  citation={fees.titleFee.citation}
                />
                <FeeLine
                  label={f.stateRegistration}
                  value={centsAsDollars(fees.registrationBase.cents.upTo6000lb + fees.texasSureFee.cents)}
                  citation={fees.registrationBase.citation}
                />
                <FeeLine
                  label={f.stateLocal}
                  value={localCents === null ? f.stateUnknown : centsAsDollars(localCents)}
                  citation={fees.localCountyFee.citation}
                />
                <FeeLine
                  label={f.stateProcessing}
                  value={centsAsDollars(fees.processingHandlingFee.cents)}
                  citation={fees.processingHandlingFee.citation}
                />
                <FeeLine
                  label={f.stateInspection}
                  value={centsAsDollars(fees.inspectionReplacementFee.cents.usedOrAnnual)}
                  citation={fees.inspectionReplacementFee.citation}
                />
                <FeeLine
                  label={f.stateEmissions}
                  value={
                    isEmissionsCounty(county, today)
                      ? fillTemplate(f.stateEmissionsValue, {
                          rule: centsAsDollars(fees.emissionsFeeAtRegistration.ruleCentsNonLirap),
                          published: centsAsDollars(fees.emissionsFeeAtRegistration.publishedCents),
                          ruleLirap: centsAsDollars(fees.emissionsFeeAtRegistration.ruleCentsLirapObd),
                        })
                      : f.stateUnknown
                  }
                  citation={fees.emissionsFeeAtRegistration.citation}
                />
                <FeeLine
                  label={f.statePlate}
                  value={centsAsDollars(fees.buyerPlateFee.cents)}
                  citation={fees.buyerPlateFee.citation}
                />
              </dl>
              <p className="ed-fine" data-desk-default="">
                {fillTemplate(f.deskDefault, {
                  title: centsAsDollars(Math.round(dealerFees.titleFee * 100)),
                  registration: centsAsDollars(Math.round(dealerFees.registrationFee * 100)),
                })}
              </p>

              <button
                type="button"
                className="ed-btn ed-btn-dark"
                disabled={pending || parsed.problems.length > 0}
                onClick={() => void save()}
              >
                {pending ? t.chrome.saving : f.save}
              </button>
            </div>
          ) : null}

          {screen !== "review" ? (
            <button
              type="button"
              className="ed-btn ed-btn-dark mt-6"
              disabled={!canGoOn}
              onClick={next}
              data-fees-next=""
            >
              {t.chrome.next}
            </button>
          ) : null}

          {problemsHere.length > 0 && !refusal ? (
            <p className="ed-money-error" role="alert" data-fee-refusal={problemsHere[0].code}>
              {problemText(problemsHere[0])}
            </p>
          ) : null}
          {refusal ? (
            <p className="ed-money-error" role="alert" data-fee-refusal={refusal.code}>
              {problemText(refusal)}
            </p>
          ) : null}

          {mode === "onboarding" && onLater ? (
            <p className="ed-fine mt-6">
              <button type="button" className="ed-money-adjust" onClick={onLater} data-fees-later="">
                {f.setLater}
              </button>
            </p>
          ) : null}
        </div>
      </main>

      <nav className="ed-guide-nav" aria-label={f.nav}>
        {position > 0 || onExit ? (
          <button type="button" className="ed-guide-back" disabled={pending} onClick={back}>
            <ArrowLeft size={15} aria-hidden="true" />
            {t.chrome.back}
          </button>
        ) : (
          <span />
        )}
        <span />
      </nav>
    </>
  );
}

function Choice({ active, label, gloss, onClick }: { active: boolean; label: string; gloss: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="ed-pay-choice"
      data-active={active ? "true" : undefined}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="ed-pay-choice-label">{label}</span>
      <span className="ed-pay-choice-gloss">{gloss}</span>
    </button>
  );
}

function FeeLine({ label, value, citation }: { label: string; value: string; citation?: string }) {
  return (
    <div className="ed-money-line ed-fee-line">
      <dt>
        {label}
        {citation ? <span className="ed-fee-citation">{citation}</span> : null}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}
