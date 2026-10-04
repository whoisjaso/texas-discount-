"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import FunnelLanguageToggle from "@/components/admin/funnel/FunnelLanguageToggle";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { confirmGovernmentFeesAction, type GovernmentFeesResult } from "@/lib/actions/government-fees";
import { STATE_FEES_2026, centsAsDollars } from "@/lib/legal/texas-dealer-fees";
import {
  parseGovernmentFeesInput,
  type GovernmentFees,
  type GovernmentFeesInput,
  type governmentEstimate,
} from "@/lib/sales/government-fees";
import { fillTemplate } from "@/lib/sales/i18n";
import { tapHaptic } from "@/lib/haptics";

/**
 * This sale's government fees, typed from webDEALER's computed fees
 * (government-fees.ts). Four lines: the title fee (a choice between the
 * state's two figures), the registration side (typed), the inspection
 * program replacement fee (its own line) and the license plate fee (exactly
 * $10, or $0 on a vehicle exempt from registration fees). The desk's own
 * estimate sits under each as a check; webDEALER's figure is the one saved.
 * Refused, never trimmed: a figure outside the cited lines says why.
 */
export default function GovernmentFeesForm({
  dealId,
  vehicle,
  buyerName,
  initialCounty,
  recorded,
  estimate,
  weightLbs,
  locked,
  backHref,
  saleHref,
}: {
  dealId: string;
  vehicle: string;
  buyerName: string;
  initialCounty: string;
  recorded: GovernmentFees | null;
  estimate: ReturnType<typeof governmentEstimate>;
  weightLbs: number | null;
  today: string;
  /** Why nothing can be saved here now, or null. */
  locked: "billOfSaleFiled" | "towAway" | "closed" | null;
  backHref: string;
  saleHref: string;
}) {
  const router = useRouter();
  const { t } = useFunnel();
  const g = t.governmentFees;
  const plateCents = STATE_FEES_2026.buyerPlateFee.cents;
  const [input, setInput] = useState<GovernmentFeesInput>(() => ({
    county: recorded?.county ?? initialCounty,
    titleFee: recorded ? String(recorded.titleFee) : "",
    registrationFee: recorded ? recorded.registrationFee.toFixed(2) : "",
    inspectionFee: recorded ? String(recorded.inspectionFee) : "",
    plateFee: recorded ? String(recorded.plateFee) : String(plateCents / 100),
    exemptFromRegistrationFees: recorded?.exemptFromRegistrationFees ?? false,
  }));
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<Extract<GovernmentFeesResult, { ok: false }> | null>(null);

  const parsed = useMemo(() => parseGovernmentFeesInput(input), [input]);
  const firstProblem = parsed.problems[0] ?? null;
  const shownProblem = refusal ?? (touched ? firstProblem : null);
  const errors = g.errors as Record<string, string | undefined>;

  function problemText(problem: { code: string; params?: Record<string, string> }): string {
    const template = errors[problem.code];
    return template ? fillTemplate(template, problem.params ?? {}) : t.chrome.couldNotSave;
  }

  function update(patch: Partial<GovernmentFeesInput>) {
    setRefusal(null);
    setInput((current) => ({ ...current, ...patch }));
  }

  async function save() {
    if (pending || locked) return;
    tapHaptic();
    setTouched(true);
    if (firstProblem) return;
    setPending(true);
    setRefusal(null);
    let result: GovernmentFeesResult;
    try {
      result = await confirmGovernmentFeesAction(dealId, input);
    } catch {
      setPending(false);
      setRefusal({ ok: false, code: "couldNotSave", error: t.chrome.couldNotSave } as Extract<GovernmentFeesResult, { ok: false }>);
      return;
    }
    if (!result.ok) {
      setPending(false);
      setRefusal(result);
      return;
    }
    // Saved: go back, and nothing else. The action's revalidatePath already
    // drops the cached screens of this sale. A second update here (a "saved"
    // line, pending off, router.refresh) raced the navigation's commit: React
    // removed a node the navigation had already taken away ("Failed to execute
    // 'removeChild'"), and the review came up blank. Walked, 2026-10-03.
    router.push(backHref);
  }

  const estimateLine = (figure: number | null) =>
    figure === null ? g.estimateNone : fillTemplate(g.estimate, { figure: centsAsDollars(Math.round(figure * 100)) });
  const lockedText = locked === "billOfSaleFiled" ? g.lockedFiled : locked === "towAway" ? g.lockedTowAway : locked === "closed" ? g.lockedClosed : null;

  return (
    <div className="ed-admin px-5 py-8 md:px-10 md:py-12" data-government-fees="">
      <header className="ed-sale-head">
        <h1 className="ed-admin-title">{g.title}</h1>
        <FunnelLanguageToggle />
      </header>
      <p className="ed-fine mt-2">
        {vehicle}
        {buyerName ? ` · ${buyerName}` : ""}
      </p>
      <p className="ed-fine mt-3 max-w-2xl">{g.lead}</p>
      {recorded ? (
        <p className="ed-fine mt-3" data-government-recorded="">
          {fillTemplate(g.recordedBy, { name: recorded.confirmedByName, date: recorded.confirmedAt.slice(0, 10) })}
        </p>
      ) : null}
      {lockedText ? (
        <p className="ed-money-error mt-4" role="status" data-government-locked={locked ?? ""}>
          {lockedText}
        </p>
      ) : null}

      <section className="ed-admin-panel mt-6 p-6 md:p-7">
        <fieldset className="ed-start-fields border-0 p-0" disabled={Boolean(locked) || pending}>
          <label>
            <span className="ed-field-label">{g.county}</span>
            <input
              className="ed-input"
              name="county"
              autoComplete="off"
              value={input.county}
              onChange={(event) => update({ county: event.target.value })}
            />
          </label>

          <div>
            <span className="ed-field-label">{g.titleFee}</span>
            <div className="ed-pay-row">
              {[STATE_FEES_2026.titleFee.cents.nonattainmentOrAffectedCounty, STATE_FEES_2026.titleFee.cents.otherCounty].map((cents) => (
                <button
                  key={cents}
                  type="button"
                  className="ed-pay-choice"
                  data-active={Number(input.titleFee) * 100 === cents ? "true" : undefined}
                  aria-pressed={Number(input.titleFee) * 100 === cents}
                  onClick={() => update({ titleFee: String(cents / 100) })}
                >
                  <span className="ed-pay-choice-label">{centsAsDollars(cents)}</span>
                </button>
              ))}
            </div>
            <p className="ed-fine">{g.titleHelp}</p>
            <p className="ed-fine ed-fee-citation">{estimateLine(estimate.titleFee)}</p>
          </div>

          <label>
            <span className="ed-field-label">{g.registration}</span>
            <input
              className="ed-input ed-money-input"
              name="registrationFee"
              inputMode="decimal"
              autoComplete="off"
              placeholder="$"
              value={input.registrationFee}
              onChange={(event) => update({ registrationFee: event.target.value })}
            />
          </label>
          <p className="ed-fine">{g.registrationHelp}</p>
          <p className="ed-fine ed-fee-citation">
            {estimate.emissions ? g.estimateEmissions : estimateLine(estimate.registrationFee)}
            {weightLbs === null ? ` ${g.weightUnknown}` : ""}
          </p>

          <div>
            <span className="ed-field-label">{g.inspection}</span>
            <div className="ed-pay-row">
              {[
                { cents: STATE_FEES_2026.inspectionReplacementFee.cents.usedOrAnnual, label: g.inspectionUsed },
                { cents: 0, label: g.inspectionExempt },
              ].map((choice) => (
                <button
                  key={choice.cents}
                  type="button"
                  className="ed-pay-choice"
                  data-active={input.inspectionFee !== "" && Math.round(Number(input.inspectionFee) * 100) === choice.cents ? "true" : undefined}
                  aria-pressed={input.inspectionFee !== "" && Math.round(Number(input.inspectionFee) * 100) === choice.cents}
                  onClick={() => update({ inspectionFee: String(choice.cents / 100) })}
                >
                  <span className="ed-pay-choice-label">{centsAsDollars(choice.cents)}</span>
                  <span className="ed-pay-choice-gloss">{choice.label}</span>
                </button>
              ))}
            </div>
            <p className="ed-fine">{g.inspectionHelp}</p>
          </div>

          <div>
            <span className="ed-field-label">{g.plate}</span>
            <p className="ed-money-figure" data-plate-fee="">
              {centsAsDollars(input.exemptFromRegistrationFees ? 0 : plateCents)}
            </p>
            <p className="ed-fine">{fillTemplate(g.plateHelp, { fee: centsAsDollars(plateCents) })}</p>
            <label className="ed-check-row">
              <input
                type="checkbox"
                name="exemptFromRegistrationFees"
                checked={input.exemptFromRegistrationFees}
                onChange={(event) =>
                  update({
                    exemptFromRegistrationFees: event.target.checked,
                    plateFee: String(event.target.checked ? 0 : plateCents / 100),
                  })
                }
              />
              <span className="ed-fine">{g.exempt}</span>
            </label>
          </div>
        </fieldset>

        <button
          type="button"
          className="ed-btn ed-btn-dark mt-6"
          disabled={Boolean(locked) || pending}
          onClick={save}
          data-government-save=""
        >
          {pending ? t.chrome.saving : g.save}
        </button>
        {shownProblem ? (
          <p className="ed-money-error" role="alert" data-government-refusal={shownProblem.code}>
            {refusal ? problemText(refusal) || refusal.error : problemText(shownProblem)}
          </p>
        ) : null}
      </section>

      <nav className="ed-guide-nav mt-8" aria-label={g.title}>
        <Link href={backHref} className="ed-guide-back">
          <ArrowLeft size={15} aria-hidden="true" />
          {t.chrome.back}
        </Link>
        <Link href={saleHref} className="ed-fine">
          {g.toSale}
        </Link>
      </nav>
    </div>
  );
}
