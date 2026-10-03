"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import SignaturePad from "@/components/documents/SignaturePad";
import FunnelLanguageToggle from "@/components/admin/funnel/FunnelLanguageToggle";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { logoutAdmin } from "@/lib/actions/auth";
import { saveStaffSignatureAction } from "@/lib/actions/staff-signature";
import {
  chooseOnboardingPasswordAction,
  completeOnboardingAction,
  saveOnboardingNameAction,
  type OnboardingRefusal,
} from "@/lib/actions/team-onboarding";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-rules";
import { dealerSignerPrintedName } from "@/lib/dealership-config";
import { tapHaptic } from "@/lib/haptics";
import { fillTemplate } from "@/lib/sales/i18n";
import type { OnboardingStep } from "@/lib/onboarding/staff-name";
import DealerFeesWizard from "@/components/admin/fees/DealerFeesWizard";
import type { FeeSchedule } from "@/lib/sales/fee-schedule";

/**
 * The onboarding corridor (SOP "First sign-in: onboarding").
 *
 * The sale corridor's shell, one question to a screen: a password of their
 * own (only while the account is on a temporary one), the name, the
 * signature for a member cleared to sign, then done. Sign Out sits where the
 * corridor's Leave is, because this screen is mandatory and that is the only
 * honest way off it.
 *
 * The signature screen saves through `saveStaffSignatureAction`, the action
 * /admin/account/signature uses, so there is one stored signature and every
 * dealer line, the 130-U's seller band included, reads it.
 *
 * Your Fees, for the Owner while the dealership has no saved fees, sits
 * between the signature and Done (rulebook texas-dealer-fees.md section 5.2):
 * the same screens as /admin/dealership/fees, with "Set These Later", so the
 * owner is never locked out; the filing refusal ("Documentary fee") keeps the
 * legal protection until they are set.
 */
type ShownError =
  | { key: "nameRequired" | "signatureRequired" | "couldNotSave" }
  | { refusal: OnboardingRefusal }
  | { text: string };

export default function OnboardingFlow({
  onRoster,
  steps: initialSteps,
  initialStep,
  afterPassword,
  nameOnFile,
  initialFirst,
  initialLast,
  initialSignature,
  fees = null,
}: {
  /**
   * Your Fees: the schedule as it stands (the config seed), the dealer's
   * county and the business date. Null when this visit has no fees step.
   */
  fees?: { schedule: FeeSchedule; county: string | null; today: string } | null;
  onRoster: boolean;
  steps: OnboardingStep[];
  initialStep: OnboardingStep;
  /**
   * The screen after "Choose A Password": the first one that still has work.
   * Null when there is nothing else to ask (an account with no roster row),
   * and the desk opens instead.
   */
  afterPassword: OnboardingStep | null;
  /** The settled name on file ("First Last"), or "" when there is none yet. */
  nameOnFile: string;
  initialFirst: string;
  initialLast: string;
  initialSignature: string | null;
}) {
  const { t } = useFunnel();
  const o = t.onboarding;
  // The screens this visit started with, kept for the whole visit. Saving the
  // password re-renders the page, which (rightly) no longer lists the password
  // screen; the counter must still read "Step 2 Of 4" rather than start over.
  const [steps] = useState(initialSteps);
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  const [saved, setSaved] = useState({ first: initialFirst, last: initialLast });
  const [savedSignature, setSavedSignature] = useState(initialSignature ?? "");
  const [drawn, setDrawn] = useState(initialSignature ?? "");
  const [signedOn, setSignedOn] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  // Kept as what went wrong, not as words, so the language toggle swaps the
  // message in place like every other word on the screen.
  const [error, setError] = useState<ShownError | null>(null);
  // What the fees step ended with: saved, or left for later.
  const [feesOutcome, setFeesOutcome] = useState<"saved" | "later" | null>(null);
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
  const fullName = saved.first && saved.last ? `${saved.first} ${saved.last}` : nameOnFile;

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

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The same two rules the action holds, said before the round trip.
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError({
        refusal: { ok: false, code: "passwordTooShort", error: "", params: { min: PASSWORD_MIN_LENGTH } },
      });
      return;
    }
    if (password !== passwordAgain) {
      setError({ refusal: { ok: false, code: "passwordMismatch", error: "" } });
      return;
    }
    const data = new FormData();
    data.set("password", password);
    data.set("confirmPassword", passwordAgain);
    void run(async () => {
      const result = await chooseOnboardingPasswordAction(data);
      if (!result.ok) {
        setError({ refusal: result });
        return false;
      }
      // Nothing typed is kept once it is saved.
      setPassword("");
      setPasswordAgain("");
      setShowPassword(false);
      if (afterPassword === null) {
        // Nothing else to ask: open the desk on a full load, so the layout
        // reads the account as it now is.
        window.location.assign("/admin");
        return true;
      }
      go(afterPassword);
      return true;
    });
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
    : step === "password"
      ? o.passwordQuestion
      : step === "name"
        ? o.nameQuestion
        : step === "signature"
          ? o.signatureQuestion
          : step === "fees"
            ? o.fees.nav
            : o.doneQuestion;

  // The password screen is left only by saving it, so there is no going back
  // to it: the temporary password it replaced no longer exists.
  const before = position > 0 ? steps[position - 1] : null;
  const previous = before === "password" ? null : before;
  // Saved fees are not walked again from here (a change is made under Your
  // Fees), so Back from Done skips them once they are saved.
  const beforeFees = position > 1 ? steps[position - 2] : null;
  const backStep =
    previous === "fees" && feesOutcome === "saved" ? (beforeFees === "password" ? null : beforeFees) : previous;
  const showsFees = onRoster && step === "fees" && fees !== null;

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

      {showsFees && fees ? (
        <DealerFeesWizard
          mode="onboarding"
          initialSchedule={fees.schedule}
          county={fees.county}
          today={fees.today}
          onSaved={() => {
            setFeesOutcome("saved");
            go(after("fees"));
          }}
          onLater={() => {
            setFeesOutcome("later");
            go(after("fees"));
          }}
          onExit={previous ? () => go(previous) : undefined}
        />
      ) : null}

      {showsFees ? null : (
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
          ) : step === "password" ? (
            <form onSubmit={submitPassword} noValidate>
              <fieldset
                data-tj-stagger
                disabled={pending}
                aria-labelledby="onboarding-question"
                className="ed-start-fields border-0 p-0"
              >
                <p className="ed-fine">
                  {fillTemplate(o.passwordHelp, { min: PASSWORD_MIN_LENGTH })}
                </p>
                <label>
                  <span className="ed-field-label">{o.newPassword}</span>
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    className="ed-input"
                    required
                    autoFocus
                    minLength={PASSWORD_MIN_LENGTH}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError(null);
                    }}
                  />
                </label>
                <label>
                  <span className="ed-field-label">{o.confirmPassword}</span>
                  <input
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    className="ed-input"
                    required
                    minLength={PASSWORD_MIN_LENGTH}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={passwordAgain}
                    onChange={(event) => {
                      setPasswordAgain(event.target.value);
                      setError(null);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="ed-money-adjust ed-onboard-reveal"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((shown) => !shown)}
                >
                  {showPassword ? o.hidePassword : o.showPassword}
                </button>
                <button
                  type="submit"
                  className="ed-btn ed-btn-dark"
                  disabled={pending || !password || !passwordAgain}
                >
                  {pending ? t.chrome.saving : o.savePassword}
                </button>
              </fieldset>
            </form>
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
              {steps.includes("fees") ? (
                <p className="ed-fine" data-done-fees={feesOutcome === "saved" ? "saved" : "later"}>
                  {feesOutcome === "saved" ? o.doneFeesSaved : o.doneFeesLater}
                </p>
              ) : null}
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
      )}

      {onRoster && !showsFees ? (
        <nav className="ed-guide-nav" aria-label={o.nav}>
          {backStep ? (
            <button type="button" className="ed-guide-back" disabled={pending} onClick={() => go(backStep)}>
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
