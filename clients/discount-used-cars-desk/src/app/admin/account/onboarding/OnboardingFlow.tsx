"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import SignaturePad from "@/components/documents/SignaturePad";
import FunnelLanguageToggle from "@/components/admin/funnel/FunnelLanguageToggle";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { logoutAdmin } from "@/lib/actions/auth";
import { saveStaffSignatureAction } from "@/lib/actions/staff-signature";
import {
  completeOnboardingAction,
  saveOnboardingNameAction,
  type OnboardingRefusal,
} from "@/lib/actions/team-onboarding";
import { dealerSignerPrintedName } from "@/lib/dealership-config";
import { tapHaptic } from "@/lib/haptics";
import { fillTemplate } from "@/lib/sales/i18n";
import type { OnboardingStep } from "@/lib/onboarding/staff-name";

/**
 * The onboarding corridor (SOP "First sign-in: onboarding").
 *
 * The sale corridor's shell, one question to a screen: the name, the
 * signature for a member cleared to sign, then done. Sign Out sits where the
 * corridor's Leave is, because this screen is mandatory and that is the only
 * honest way off it.
 *
 * The signature screen saves through `saveStaffSignatureAction`, the action
 * /admin/account/signature uses, so there is one stored signature and every
 * dealer line, the 130-U's seller band included, reads it.
 */
type ShownError =
  | { key: "nameRequired" | "signatureRequired" | "couldNotSave" }
  | { refusal: OnboardingRefusal }
  | { text: string };

export default function OnboardingFlow({
  onRoster,
  steps,
  initialStep,
  initialFirst,
  initialLast,
  initialSignature,
}: {
  onRoster: boolean;
  steps: OnboardingStep[];
  initialStep: OnboardingStep;
  initialFirst: string;
  initialLast: string;
  initialSignature: string | null;
}) {
  const { t } = useFunnel();
  const o = t.onboarding;
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  const [saved, setSaved] = useState({ first: initialFirst, last: initialLast });
  const [savedSignature, setSavedSignature] = useState(initialSignature ?? "");
  const [drawn, setDrawn] = useState(initialSignature ?? "");
  const [signedOn, setSignedOn] = useState("");
  const [pending, setPending] = useState(false);
  // Kept as what went wrong, not as words, so the language toggle swaps the
  // message in place like every other word on the screen.
  const [error, setError] = useState<ShownError | null>(null);
  const locked = useRef(false);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(initialStep);

  // The question takes focus on every screen change, as in the sale corridor,
  // so a screen reader announces the new question rather than nothing. Not on
  // the first screen, where the first box keeps its autofocus.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    questionRef.current?.focus();
  }, [step]);

  const position = Math.max(0, steps.indexOf(step));
  const fullName = saved.first && saved.last ? `${saved.first} ${saved.last}` : "";

  /**
   * A refusal in the screen's own language: the action's code through the
   * catalogue, with the English sentence only for a code the catalogue does
   * not know.
   */
  function refusalText(result: OnboardingRefusal): string {
    const template = (o.errors as Record<string, string | undefined>)[result.code];
    if (!template) return result.error;
    const params = result.params ?? {};
    const label = params.part === "last" ? o.errors.lastNameLabel : o.errors.firstNameLabel;
    return fillTemplate(template, { ...params, label });
  }

  function errorText(shown: ShownError): string {
    if ("refusal" in shown) return refusalText(shown.refusal);
    if ("text" in shown) return shown.text;
    return shown.key === "couldNotSave" ? t.chrome.couldNotSave : o[shown.key];
  }

  function go(next: OnboardingStep) {
    setError(null);
    setStep(next);
  }

  function after(current: OnboardingStep): OnboardingStep {
    return steps[steps.indexOf(current) + 1] ?? "done";
  }

  async function run(work: () => Promise<boolean>) {
    if (locked.current) return;
    locked.current = true;
    setError(null);
    setPending(true);
    tapHaptic();
    try {
      await work();
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!first.trim() || !last.trim()) {
      setError({ key: "nameRequired" });
      return;
    }
    const data = new FormData();
    data.set("firstName", first);
    data.set("lastName", last);
    void run(async () => {
      const result = await saveOnboardingNameAction(data);
      if (!result.ok) {
        setError({ refusal: result });
        return false;
      }
      setFirst(result.first);
      setLast(result.last);
      setSaved({ first: result.first, last: result.last });
      go(after("name"));
      return true;
    });
  }

  function saveSignature() {
    if (!drawn) {
      setError({ key: "signatureRequired" });
      return;
    }
    // Nothing new drawn over the one on file: it is already saved.
    if (drawn === savedSignature) {
      go(after("signature"));
      return;
    }
    void run(async () => {
      const result = await saveStaffSignatureAction(drawn);
      if (!result.ok) {
        setError(result.error ? { text: result.error } : { key: "couldNotSave" });
        return false;
      }
      setSavedSignature(drawn);
      go(after("signature"));
      return true;
    });
  }

  function finish() {
    void run(async () => {
      // On success the action redirects and this never returns.
      const result = await completeOnboardingAction();
      if (result && !result.ok) setError({ refusal: result });
      return false;
    });
  }

  const question = !onRoster
    ? o.notOnRoster
    : step === "name"
      ? o.nameQuestion
      : step === "signature"
        ? o.signatureQuestion
        : o.doneQuestion;

  const previous = position > 0 ? steps[position - 1] : null;

  return (
    <div className="ed-guide" data-onboarding-step={onRoster ? step : "not-on-roster"}>
      <header className="ed-guide-head">
        <form action={logoutAdmin}>
          <button type="submit" className="ed-guide-exit">
            {o.signOut}
          </button>
        </form>
        {onRoster ? (
          <span className="ed-guide-count">
            {fillTemplate(o.stepOf, { current: position + 1, total: steps.length })}
          </span>
        ) : (
          <span />
        )}
        <FunnelLanguageToggle />
      </header>

      <main key={onRoster ? step : "not-on-roster"} className="ed-guide-body">
        <h1
          ref={questionRef}
          tabIndex={-1}
          id="onboarding-question"
          className="ed-guide-question"
          style={{ outline: "none" }}
        >
          {question}
        </h1>

        <div className="ed-guide-answer">
          {!onRoster ? (
            <p className="ed-fine">{o.notOnRosterBody}</p>
          ) : step === "name" ? (
            <form onSubmit={submitName} noValidate>
              <fieldset
                data-tj-stagger
                disabled={pending}
                aria-labelledby="onboarding-question"
                className="ed-start-fields border-0 p-0"
              >
                <label>
                  <span className="ed-field-label">{o.firstName}</span>
                  <input
                    name="firstName"
                    className="ed-input"
                    required
                    autoFocus
                    autoComplete="given-name"
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={60}
                    value={first}
                    onChange={(event) => {
                      setFirst(event.target.value);
                      setError(null);
                    }}
                  />
                </label>
                <label>
                  <span className="ed-field-label">{o.lastName}</span>
                  <input
                    name="lastName"
                    className="ed-input"
                    required
                    autoComplete="family-name"
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={60}
                    value={last}
                    onChange={(event) => {
                      setLast(event.target.value);
                      setError(null);
                    }}
                  />
                </label>
                <p className="ed-fine">{o.nameHelp}</p>
                <button
                  type="submit"
                  className="ed-btn ed-btn-dark"
                  disabled={pending || !first.trim() || !last.trim()}
                >
                  {pending ? t.chrome.saving : t.chrome.next}
                </button>
              </fieldset>
            </form>
          ) : step === "signature" ? (
            <div className="ed-start-fields" data-tj-stagger>
              <p className="ed-fine">{o.signatureHelp}</p>
              <SignaturePad
                label={fullName || o.signatureQuestion}
                value={savedSignature}
                dateValue={signedOn}
                onChange={(value) => {
                  setDrawn(value);
                  setError(null);
                }}
                onDateChange={setSignedOn}
              />
              <button
                type="button"
                className="ed-btn ed-btn-dark"
                disabled={pending || !drawn}
                onClick={saveSignature}
              >
                {pending ? t.chrome.saving : o.saveSignature}
              </button>
            </div>
          ) : (
            <div className="ed-start-fields" data-tj-stagger>
              <p className="ed-fine">
                {savedSignature
                  ? fillTemplate(o.doneSigned, { printed: dealerSignerPrintedName(fullName) })
                  : fillTemplate(o.doneUnsigned, { name: fullName })}
              </p>
              <button type="button" className="ed-btn ed-btn-dark" disabled={pending} onClick={finish}>
                {pending ? t.chrome.saving : o.startWorking}
              </button>
            </div>
          )}

          {error ? (
            <p className="ed-money-error" role="alert">
              {errorText(error)}
            </p>
          ) : null}
        </div>
      </main>

      {onRoster ? (
        <nav className="ed-guide-nav" aria-label={o.nav}>
          {previous ? (
            <button type="button" className="ed-guide-back" disabled={pending} onClick={() => go(previous)}>
              <ArrowLeft size={15} aria-hidden="true" />
              {t.chrome.back}
            </button>
          ) : (
            // Kept so the nav keeps its shape on the first screen.
            <span />
          )}
          <span />
        </nav>
      ) : null}
    </div>
  );
}
