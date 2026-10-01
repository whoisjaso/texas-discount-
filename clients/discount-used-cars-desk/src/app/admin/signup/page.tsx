"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useKeepTypedInput } from "@/lib/forms/useKeepTypedInput";
import {
  requestTeamAccessAction,
  type TeamAccessRequestState,
} from "@/lib/actions/team-access";
import { AdminButton, AdminLinkButton } from "@/components/admin/ui";
import AuthShell, { AUTH_FIELD, AUTH_LABEL } from "@/components/admin/AuthShell";
import { formatPhone, isCompletePhone, phoneDigitsRemaining } from "@/lib/forms/phone";
import CodeBoxes from "@/components/admin/CodeBoxes";
import RequestGranted from "@/components/admin/RequestGranted";
import { SMS_CODE_CONSENT_WORDING } from "@/lib/sms/pre-approval-text";

const initialState: TeamAccessRequestState = { ok: false };

const ROLE_OPTIONS = [
  { value: "lot", label: "Lot Helper", hint: "Keys, Photos, Returns" },
  { value: "mechanic", label: "Mechanic", hint: "Vehicle Prep And Proof" },
  { value: "registration", label: "Registration", hint: "Documents, DMV, Inventory" },
  { value: "sales", label: "Sales", hint: "Leads, Customers, Inventory" },
  { value: "social", label: "Social", hint: "Posts And Content Tasks" },
  { value: "viewer", label: "Training", hint: "Read-Only Access" },
];

function SignupScreen() {
  const [state, formAction, isPending] = useActionState(
    requestTeamAccessAction,
    initialState,
  );
  // Somebody bounced here from Google or Apple arrives with their address
  // already known; it is filled in so the only new question is the role.
  const prefilledEmail = useSearchParams().get("email") ?? "";
  // Controlled, so the box cannot hold a wrong shape. See the field below.
  const [phone, setPhone] = useState("");
  // The consent line has to be in the language it will be read in.
  const [language, setLanguage] = useState<"en" | "es">("en");
  // A confirmation code is out: the form stays as typed and asks for it.
  const awaitingCode = state.stage === "code";

  // A refused request used to empty the form. React 19 resets an uncontrolled
  // form once its action returns, and a returned error is a return, so someone
  // asking for access retyped their name, email and reason to read why the
  // first attempt was declined.
  const keepTypedInput = useKeepTypedInput(
    state,
    (result: TeamAccessRequestState) => !result.ok,
  );

  // Done. The form has nothing left to ask, so it stops being on the screen:
  // leaving six filled boxes and a submit button under a success notice is
  // the screen telling somebody it is finished while still looking unfinished.
  if (state.ok) {
    return (
      <AuthShell
        title="Request Received"
        bare
        footer={
          <AdminLinkButton href="/admin/login" variant="ghost" size="sm" className="min-h-10 w-full justify-center text-xs">
            Back To Sign In
          </AdminLinkButton>
        }
      >
        <RequestGranted message={state.message ?? "An owner will approve the role before this account can enter the dashboard."} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Request Access"
      lede="Approved requests get a temporary password."
      footer={
        <AdminLinkButton href="/admin/login" variant="ghost" size="sm" className="min-h-10 w-full justify-center text-xs">
          Back To Sign In
        </AdminLinkButton>
      }
    >
      {/* One column. The old screen split this into a marketing panel beside
          the form, which put the heading off to the left of the thing it
          titled and left the request itself sitting in the right-hand third.
          There is nothing here to sell: the person already decided to ask. */}
      <form action={formAction} onSubmit={keepTypedInput} className="grid gap-5">
        <div>
          <label htmlFor="full_name" className={AUTH_LABEL}>Full name</label>
          <input id="full_name" name="full_name" required autoComplete="name" className={AUTH_FIELD} placeholder="Maria Lopez" />
        </div>

        <div>
          <label htmlFor="email" className={AUTH_LABEL}>Email</label>
          <input
            id="email"
            type="email"
            name="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={prefilledEmail}
            readOnly={awaitingCode}
            className={AUTH_FIELD}
            placeholder="name@email.com"
          />
        </div>

        <div>
          <label htmlFor="phone" className={AUTH_LABEL}>
            Phone <span className="font-normal text-[color:var(--tj-muted-light)]">(optional)</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            aria-describedby={phone && phoneDigitsRemaining(phone) > 0 ? "phone-remaining" : undefined}
            // Deliberately no maxLength. The browser truncates a paste before
            // React sees it, so "+1 (832) 818-6428 ext 9" arrived as
            // "(832) 818-6" with the real number silently cut. Formatting the
            // value here takes the ten digits out of whatever was pasted and
            // drops the rest, which is the same cap without the trap.
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            className={AUTH_FIELD}
            placeholder="(832) 000-0000"
          />
          {phone && phoneDigitsRemaining(phone) > 0 ? (
            <p id="phone-remaining" className="mt-1.5 text-[11.5px] text-[color:var(--tj-muted-light)]">
              {phoneDigitsRemaining(phone)} more
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="requested_role" className={AUTH_LABEL}>Requested role</label>
          <select id="requested_role" name="requested_role" defaultValue="sales" className={`${AUTH_FIELD} appearance-none bg-[image:var(--tj-select-caret)] bg-[length:10px] bg-[position:right_14px_center] bg-no-repeat pr-10`}>
            {ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}: {role.hint}
              </option>
            ))}
          </select>
        </div>

        {/* Ink, not copper. Copper marks the one live thing on a screen, and
            on this screen that is the button that sends the request. */}
        <fieldset className="grid gap-1.5">
          <legend className={AUTH_LABEL}>Language</legend>
          <div className="ed-access-segment">
            <label>
              <input
                type="radio"
                name="language_preference"
                value="en"
                defaultChecked
                className="sr-only"
                onChange={() => setLanguage("en")}
              />
              <span>English</span>
            </label>
            <label>
              <input
                type="radio"
                name="language_preference"
                value="es"
                className="sr-only"
                onChange={() => setLanguage("es")}
              />
              <span>Español</span>
            </label>
          </div>
        </fieldset>

        <div>
          <label htmlFor="note" className={AUTH_LABEL}>Access note</label>
          <textarea id="note" name="note" rows={3} className={`${AUTH_FIELD} resize-none`} placeholder="Your job or the task you need it for" />
        </div>

        {/* Where the code should go. Only offered once a whole number is in
            the box, because a half-typed one is not a route. */}
        {!awaitingCode && isCompletePhone(phone) ? (
          <fieldset className="grid gap-1.5">
            <legend className={AUTH_LABEL}>Send my code by</legend>
            <div className="ed-access-segment">
              <label>
                <input type="radio" name="code_channel" value="email" defaultChecked className="sr-only" />
                <span>Email</span>
              </label>
              <label>
                <input type="radio" name="code_channel" value="sms" className="sr-only" />
                <span>Text</span>
              </label>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[color:var(--tj-muted-light)]">
              {SMS_CODE_CONSENT_WORDING[language]}
            </p>
          </fieldset>
        ) : null}

        {awaitingCode ? (
          <div>
            <label className={AUTH_LABEL} id="code-label">Six-digit code</label>
            <CodeBoxes
              autoFocus
              invalid={Boolean(state.error)}
              aria-label="Six-digit code"
            />
          </div>
        ) : null}

        {state.message || state.error ? (
          <div
            role={state.error ? "alert" : "status"}
            className={`rounded-[6px] border px-4 py-3 text-sm ${
              state.error
                ? "border-[#8A3A1C]/45 bg-[#8A3A1C]/[0.05] text-[#8A3A1C]"
                : "border-[color:var(--tj-line)] bg-[color:var(--tj-surface)] text-[color:var(--tj-ink)]"
            }`}
          >
            {state.error ?? state.message}
          </div>
        ) : null}

        <AdminButton type="submit" disabled={isPending} className="w-full">
          {isPending ? "Sending..." : awaitingCode ? "Confirm And Request Access" : "Request Access"}
        </AdminButton>
      </form>
    </AuthShell>
  );
}

export default function AdminSignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupScreen />
    </Suspense>
  );
}
