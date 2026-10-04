"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmEmptyWeight, type ConfirmWeightResult } from "@/lib/actions/empty-weight";
import type { AskedQuestion } from "@/lib/sales/paperwork";
import type { WeightPrompt } from "@/lib/vehicles/empty-weight/on-the-sale";
import { box11, DOCUMENT_KINDS, parseWeightReading, type DocumentKind } from "@/lib/vehicles/empty-weight/rules";
import {
  estimateCrossChecks,
  estimateMethod,
  estimateSpread,
  lbs,
  weightSourceLabel,
  weightSourceLine,
} from "@/lib/vehicles/empty-weight/copy";
import { tapHaptic } from "@/lib/haptics";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate } from "@/lib/sales/i18n";
import { localizeQuestion } from "@/lib/sales/question-i18n";

/**
 * Box 11, settled with its source.
 *
 * What the screen offers depends on what is known (on-the-sale.ts):
 *
 *   an estimate a person may confirm   the figure box 11 would read, how it
 *                                      was reached, the cross-checks, and
 *                                      Confirm This Weight.
 *   an estimate that needs a document  the reason, and the estimate as a
 *                                      labelled hint. No confirm.
 *   a legacy figure, or nothing        said plainly, never prefilled.
 *
 * And always the way to type the figure off a document, naming the document,
 * with the Texas rounding shown live. The input starts empty: an unsourced
 * figure is never put in the box for somebody to relabel as a title.
 */
export default function EmptyWeightStep({
  dealId,
  documentType,
  question,
  prompt,
  nextHref,
}: {
  dealId: string;
  documentType: string;
  question: AskedQuestion;
  prompt: WeightPrompt;
  nextHref: string;
}) {
  const router = useRouter();
  const { t } = useFunnel();
  const [pending, startTransition] = useTransition();
  const [reading, setReading] = useState("");
  const [source, setSource] = useState<DocumentKind | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"estimate" | "typed" | null>(null);
  const worded = localizeQuestion(t, documentType, question);
  const errors = t.weight.errors as Record<string, string>;

  const estimate = prompt.estimate;
  const canConfirm = Boolean(estimate) && !prompt.gateReason && prompt.reasonRequiredAgainst === null;
  const typed = parseWeightReading(reading);
  const typedBox11 = typed !== null && source ? box11(typed, source, prompt.cls) : null;
  const needsReason =
    typedBox11 !== null && prompt.reasonRequiredAgainst !== null && typedBox11.lbs !== prompt.reasonRequiredAgainst;
  const farFromEstimate = typed !== null && estimate !== null && Math.abs(typed - estimate.curbLbs) > 300;

  function settle(result: ConfirmWeightResult) {
    if (!result.ok) {
      setError((result.code && errors[result.code]) || result.error || t.chrome.couldNotSave);
      setBusy(null);
      return;
    }
    router.push(nextHref);
  }

  function confirmEstimate() {
    if (!estimate) return;
    tapHaptic();
    setError(null);
    setBusy("estimate");
    startTransition(async () => {
      settle(await confirmEmptyWeight(dealId, { mode: "estimate", shownBox11: estimate.box11 }));
    });
  }

  function submitTyped() {
    tapHaptic();
    setError(null);
    if (typed === null) return setError(errors.weightInvalid);
    if (!source) return setError(errors.weightSourceMissing);
    if (needsReason && reason.trim().length < 3) return setError(errors.reasonRequired);
    setBusy("typed");
    startTransition(async () => {
      settle(await confirmEmptyWeight(dealId, { mode: "typed", reading, source, reason }));
    });
  }

  const spread = estimate ? estimateSpread(estimate) : null;

  return (
    <div className="ed-paper-answer ed-weight">
      {/* What is already known, said plainly before anything is offered. */}
      {prompt.answered ? (
        <p className="ed-paper-note ed-weight-known">
          {fillTemplate(t.weight.answered, {
            lbs: lbs(prompt.answered.box11),
            line: weightSourceLine(t, { kind: prompt.answered.source, by: prompt.answered.by, at: prompt.answered.at }),
          })}
        </p>
      ) : prompt.onFile ? (
        <p className="ed-paper-note ed-weight-known">
          {fillTemplate(t.weight.onFile, {
            lbs: lbs(prompt.onFile.box11),
            source: weightSourceLabel(t, prompt.onFile.source),
          })}
        </p>
      ) : null}

      {estimate && canConfirm ? (
        <section className="ed-weight-card" aria-label={t.weight.estimateLabel}>
          <p className="ed-weight-kicker">{t.weight.estimateLabel}</p>
          <p className="ed-weight-figure">{fillTemplate(t.weight.box11, { lbs: lbs(estimate.box11) })}</p>
          <p className="ed-weight-method">{estimateMethod(t, estimate)}</p>
          <p className="ed-weight-method">
            {fillTemplate(t.weight.ruleLine, { rule: (t.weight.rules as Record<string, string>)[estimate.rule] })}
          </p>
          {estimateCrossChecks(t, estimate).map((line) => (
            <p key={line} className="ed-weight-cross">
              {line}
            </p>
          ))}
          {spread !== null ? (
            <p className="ed-weight-cross">{fillTemplate(t.weight.lowConfidence, { spread: lbs(spread) })}</p>
          ) : null}
          <button
            type="button"
            className="ed-btn ed-btn-dark ed-paper-next"
            disabled={pending}
            onClick={confirmEstimate}
          >
            {busy === "estimate" ? t.weight.confirming : t.weight.confirm}
          </button>
        </section>
      ) : null}

      {prompt.gateReason ? (
        <section className="ed-weight-card" aria-label={t.weight.gateLead}>
          <p className="ed-weight-lead">{t.weight.gateLead}</p>
          <p className="ed-weight-method">{(t.weight.gate as Record<string, string>)[prompt.gateReason]}</p>
          {estimate ? (
            <p className="ed-weight-cross">{fillTemplate(t.weight.hint, { lbs: lbs(estimate.curbLbs) })}</p>
          ) : null}
        </section>
      ) : null}

      {/* A figure on the vehicle nobody recorded the source of is said, as
          that, beside whatever else is offered; it is never put in the box. */}
      {!prompt.answered && !prompt.onFile && prompt.legacyLbs !== null ? (
        <p className="ed-paper-note">{fillTemplate(t.weight.legacy, { lbs: lbs(prompt.legacyLbs) })}</p>
      ) : !estimate && !prompt.answered && !prompt.onFile ? (
        <p className="ed-paper-note">{t.weight.none}</p>
      ) : null}

      {/* Typed from a document. Always here, and the only way past a gate. */}
      <form
        className="ed-weight-typed"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) submitTyped();
        }}
      >
        {estimate && canConfirm ? <p className="ed-weight-or">{t.weight.orType}</p> : null}
        <label className="ed-paper-field">
          <span className="ed-weight-label">{t.weight.typeLabel}</span>
          <input
            className="ed-input ed-paper-input"
            value={reading}
            onChange={(event) => setReading(event.target.value)}
            disabled={pending}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="ed-weight-note"
          />
        </label>

        <p className="ed-weight-label">{t.weight.whichDocument}</p>
        <div className="ed-pay-row ed-weight-kinds" role="group" aria-label={t.weight.whichDocument}>
          {DOCUMENT_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="ed-pay-choice"
              data-active={source === kind ? "true" : undefined}
              aria-pressed={source === kind}
              disabled={pending}
              onClick={() => {
                tapHaptic();
                setSource(kind);
              }}
            >
              <span className="ed-pay-choice-label">{(t.weight.sourceButtons as Record<string, string>)[kind]}</span>
            </button>
          ))}
        </div>

        {typedBox11 ? (
          <p className="ed-weight-live" role="status">
            {fillTemplate(t.weight.box11Reads, {
              lbs: lbs(typedBox11.lbs),
              rule: (t.weight.rules as Record<string, string>)[typedBox11.rule],
            })}
          </p>
        ) : null}

        {needsReason ? (
          <label className="ed-paper-field">
            <span className="ed-weight-label">{t.weight.reason}</span>
            <input
              className="ed-input ed-weight-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={pending}
              type="text"
              autoComplete="off"
            />
            <span className="ed-weight-cross">
              {fillTemplate(t.weight.reasonHint, { lbs: lbs(prompt.reasonRequiredAgainst ?? 0) })}
            </span>
          </label>
        ) : null}

        {farFromEstimate && estimate ? (
          <p className="ed-weight-warn">{fillTemplate(t.weight.farFromEstimate, { lbs: lbs(estimate.curbLbs) })}</p>
        ) : null}

        <p id="ed-weight-note" className="ed-paper-note">
          {worded.note}
        </p>

        <button type="submit" className="ed-btn ed-btn-dark ed-paper-next" disabled={pending}>
          {busy === "typed" ? t.chrome.saving : t.chrome.next}
        </button>
      </form>

      {error ? (
        <p className="ed-paper-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
