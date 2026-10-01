"use client";

import { Suspense, useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GoogleLogo } from "@phosphor-icons/react";
import { useKeepTypedInput } from "@/lib/forms/useKeepTypedInput";
import { loginAdmin, type AuthState } from "@/lib/actions/auth";
import { completeSignInCode, requestSignInCode, type CodeSignInState } from "@/lib/actions/sign-in-code";
import { startOAuthSignIn, type OAuthState } from "@/lib/actions/oauth";
import { AdminButton, AdminLinkButton } from "@/components/admin/ui";
import AuthShell from "@/components/admin/AuthShell";
import CodeBoxes from "@/components/admin/CodeBoxes";
import { brand } from "@/lib/dealership-config";

/**
 * Team Access.
 *
 * Three ways in, one screen, one look. Google first, because a
 * tap is less than a password; then the password (with a username where
 * the email goes, so nobody has to sign in with their Gmail every time);
 * and under it, "Email me a code instead", which turns the same form into
 * a two-step: address, then the six digits from the letter. Every path
 * ends at the same place, decided once on the server.
 *
 * The screen never says whether an address is on the team. A code request
 * for a stranger's address gets the same sentence as one for the owner's.
 */

const initialAuth: AuthState = { success: false };
const initialCode: CodeSignInState = { ok: false, stage: "email" };
const initialOAuth: OAuthState = {};

const FIELD =
  "w-full bg-[color:var(--tj-surface)] border border-[color:var(--tj-line)] rounded-xl px-4 py-3.5 text-[color:var(--tj-ink)] placeholder:text-[color:var(--tj-muted-light)] focus:border-[color:var(--tj-copper)] focus:bg-[color:var(--tj-surface)] focus:outline-none transition-all duration-300 min-h-[48px] text-sm";
const LABEL = "tj-ui-label mb-2 block text-[11px] font-semibold text-[color:var(--tj-muted)]";

function Notice({ tone, children }: { tone: "fault" | "quiet"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "fault" ? "alert" : "status"}
      className={
        tone === "fault"
          ? "bg-[#8A3A1C]/5 border border-[#8A3A1C]/45 rounded-xl px-4 py-3"
          : "bg-[color:var(--tj-surface)] border border-[color:var(--tj-line)] rounded-xl px-4 py-3"
      }
    >
      <p className={tone === "fault" ? "text-[#8A3A1C] text-sm" : "text-[color:var(--tj-ink)] text-sm"}>{children}</p>
    </div>
  );
}

function LoginScreen() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"password" | "code">("password");

  const [state, formAction, isPending] = useActionState(loginAdmin, initialAuth);
  const [requested, requestAction, requesting] = useActionState(requestSignInCode, initialCode);
  const [completed, completeAction, completing] = useActionState(completeSignInCode, initialCode);
  const [oauth, oauthAction, oauthPending] = useActionState(startOAuthSignIn, initialOAuth);

  // Nobody mistypes only the password. React 19 resets an uncontrolled form
  // once its action returns, and a rejected sign-in is a return, so the email
  // went too and every retry was two fields instead of one.
  const keepTypedInput = useKeepTypedInput(state, (result: AuthState) => !result.success);
  const keepTypedEmail = useKeepTypedInput(requested, (result: CodeSignInState) => !result.ok);
  const keepTypedCode = useKeepTypedInput(completed, (result: CodeSignInState) => !result.ok);

  // A wrong code keeps the code stage; an expired or locked one sends the
  // person back to ask for another.
  const [startedOver, setStartedOver] = useState(false);
  // `completed` starts at the email stage before anything was typed; only an
  // answer that carries an error and says "email" sends the person back, and
  // asking for a fresh code puts that answer behind them.
  const [dismissed, setDismissed] = useState<CodeSignInState | null>(null);
  const sentBack = Boolean(completed.error) && completed.stage === "email" && completed !== dismissed;
  const codeStage = mode === "code" && requested.stage === "code" && !startedOver && !sentBack;
  const codeEmail = requested.email ?? "";

  const providerError = params.get("error");
  const notice = params.get("notice");
  const strangerEmail = params.get("email") ?? "";

  return (
    <AuthShell
      title="Team Access"
      showLegal
      footer={
        <AdminLinkButton
          href={strangerEmail ? `/admin/signup?email=${encodeURIComponent(strangerEmail)}` : "/admin/signup"}
          variant="ghost"
          size="sm"
          className="min-h-10 w-full justify-center text-xs"
        >
          Request Access
        </AdminLinkButton>
      }
    >

        {providerError === "not-on-team" ? (
          <div className="mb-6">
            <Notice tone="fault">
              {strangerEmail ? `${strangerEmail} is not on the team yet.` : "That account is not on the team yet."}{" "}
              Request access below and the owner will approve it.
            </Notice>
          </div>
        ) : providerError === "oauth" ? (
          <div className="mb-6">
            <Notice tone="fault">That sign-in did not complete. Try again, or use your password.</Notice>
          </div>
        ) : notice === "oauth-preview" ? (
          <div className="mb-6">
            <Notice tone="quiet">Preview: Google sign-in runs on the live site only.</Notice>
          </div>
        ) : null}

        {/* Google shares the same staff authorization as password and code sign-in. */}
        <form action={oauthAction} className="grid gap-3">
          <AdminButton type="submit" name="provider" value="google" variant="secondary" disabled={oauthPending} className="w-full justify-center gap-2.5">
            <GoogleLogo size={18} weight="regular" aria-hidden="true" />
            Continue With Google
          </AdminButton>
          {oauth.error ? <Notice tone="fault">{oauth.error}</Notice> : null}
        </form>

        <p className="ed-access-or" aria-hidden="true">or</p>

        {mode === "password" ? (
          <form key="password" action={formAction} onSubmit={keepTypedInput} className="space-y-6">
            <div>
              <label htmlFor="email" className={LABEL}>
                Email or username
              </label>
              <input
                type="text"
                id="email"
                name="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                className={FIELD}
                placeholder="you@example.com or your handle"
              />
            </div>

            <div>
              <label htmlFor="password" className={LABEL}>
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                autoComplete="current-password"
                required
                className={FIELD}
                placeholder="Password"
              />
            </div>

            {state.error ? <Notice tone="fault">{state.error}</Notice> : null}

            <AdminButton type="submit" disabled={isPending} className="w-full">
              {isPending ? "Signing In..." : "Sign In"}
            </AdminButton>

            <div className="ed-access-quiet">
              <button type="button" onClick={() => setMode("code")}>
                Email me a code instead
              </button>
              <Link href="/admin/recover">Forgot your password?</Link>
            </div>
          </form>
        ) : codeStage ? (
          <form key="code-verification" action={completeAction} onSubmit={keepTypedCode} className="space-y-6">
            <input type="hidden" name="email" value={codeEmail} />
            <Notice tone="quiet">{requested.message}</Notice>
            <div>
              <label className={LABEL}>Six-digit code</label>
              <CodeBoxes name="code" autoFocus invalid={Boolean(completed.error)} />
            </div>

            {completed.error ? <Notice tone="fault">{completed.error}</Notice> : null}

            <AdminButton type="submit" disabled={completing} className="w-full">
              {completing ? "Checking..." : "Sign In With The Code"}
            </AdminButton>

            <div className="ed-access-quiet">
              <button type="button" onClick={() => setStartedOver(true)}>
                Use a different address
              </button>
              <button type="button" onClick={() => setMode("password")}>
                Use my password
              </button>
            </div>
          </form>
        ) : (
          <form
            key="code-request"
            action={requestAction}
            onSubmit={(event) => {
              setStartedOver(false);
              setDismissed(completed);
              keepTypedEmail(event);
            }}
            className="space-y-6"
          >
            <div>
              <label htmlFor="code-email" className={LABEL}>
                Email, username, or phone
              </label>
              <input
                type="text"
                id="code-email"
                name="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                autoFocus
                className={FIELD}
                placeholder="you@example.com or your handle"
              />
              <p className="mt-2 text-xs text-[color:var(--tj-muted)]">
                A six-digit code arrives from {brand.short}, by text if you type a number. It works for ten minutes.
              </p>
            </div>

            {requested.error || completed.error ? (
              <Notice tone="fault">{requested.error ?? completed.error}</Notice>
            ) : null}

            <AdminButton type="submit" disabled={requesting} className="w-full">
              {requesting ? "Sending..." : "Email Me A Code"}
            </AdminButton>

            <div className="ed-access-quiet">
              <button type="button" onClick={() => setMode("password")}>
                Use my password instead
              </button>
            </div>
          </form>
        )}

    </AuthShell>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
