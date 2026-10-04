"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  completeRecovery,
  requestPasswordReset,
  type RecoveryState,
  type ResetRequestState,
} from "@/lib/actions/password-reset";
import { useKeepTypedInput } from "@/lib/forms/useKeepTypedInput";
import AuthShell, { AUTH_FIELD, AUTH_LABEL } from "@/components/admin/AuthShell";
import { AdminButton } from "@/components/admin/ui";

/**
 * Both halves of forgetting a password, in both languages at once.
 *
 * The audience is whoever is locked out, possibly on a phone, possibly
 * Spanish-first, definitely not in a mood for jargon. Both languages are on
 * the screen rather than behind a toggle, because a person who cannot sign in
 * cannot be asked to find a language switch first. That decision stands.
 *
 * What changed is how they sit together. They used to share a line through a
 * slash ("Save And Sign In / Guardar Y Entrar", "Sending… / Enviando…"),
 * which reads as neither language and made the longest button on the site.
 * Spanish now sits under English, quieter and smaller, so each reads as
 * itself. Errors moved off copper too: copper marks the live thing on a
 * screen, and a failure is not that.
 */

const RESET_START: ResetRequestState = { done: false };
const RECOVERY_START: RecoveryState = { ok: false };

const FAULT = "rounded-[6px] border border-[#8A3A1C]/45 bg-[#8A3A1C]/[0.05] px-4 py-3 text-sm text-[#8A3A1C]";

/** English over Spanish, never beside it. */
function Bilingual({ en, es }: { en: string; es: string }) {
  return (
    <span className="ed-access-bi">
      {en}
      <span>{es}</span>
    </span>
  );
}

export default function RecoverClient() {
  // The bearer arrives in the fragment, which never reaches a server log.
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const match = window.location.hash.match(/token=([^&]+)/);
      setToken(match ? decodeURIComponent(match[1]) : null);
    };
    read();
    // A link tapped while already on this page changes only the hash,
    // which never remounts a client component.
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const [requested, requestAction, requesting] = useActionState(requestPasswordReset, RESET_START);
  const [recovery, recoverAction, recovering] = useActionState(completeRecovery, RECOVERY_START);
  // A refused save (weak password, expired token) must not also empty what
  // was typed: the house rule for every action-driven form.
  const keepRecoveryInput = useKeepTypedInput(recovery, (result: RecoveryState) => !result.ok);

  const back = (
    <Link href="/admin/login" className="text-[12.5px] text-[color:var(--tj-muted)] underline decoration-[color:var(--tj-line)] underline-offset-[3px] transition-colors hover:text-[color:var(--tj-ink)]">
      Back to sign in
      <span className="ml-1.5 text-[color:var(--tj-muted-light)]">Volver a entrar</span>
    </Link>
  );

  if (token) {
    return (
      <AuthShell
        title="Choose A New Password"
        lede="At least 10 characters."
        ledeEs="Al menos 10 caracteres."
        footer={back}
      >
        <form action={recoverAction} onSubmit={keepRecoveryInput} className="grid gap-5">
          <input type="hidden" name="token" value={token} />
          <div>
            <label htmlFor="password" className={AUTH_LABEL}>
              New password
              <span className="ml-1.5 font-normal text-[color:var(--tj-muted-light)]">Contraseña nueva</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              className={AUTH_FIELD}
            />
          </div>

          {recovery.error === "expired" ? (
            <p role="alert" className={FAULT}>
              That link was already used or has expired. Request a fresh one below.
              <span className="mt-1 block opacity-75">Ese enlace ya se usó o caducó. Pida uno nuevo abajo.</span>
            </p>
          ) : null}
          {recovery.error === "weak" ? (
            <p role="alert" className={FAULT}>
              Use at least 10 characters.
              <span className="mt-1 block opacity-75">Use al menos 10 caracteres.</span>
            </p>
          ) : null}
          {recovery.error === "failed" ? (
            <p role="alert" className={FAULT}>
              That did not save. Try again.
              <span className="mt-1 block opacity-75">No se guardó. Intente otra vez.</span>
            </p>
          ) : null}

          <AdminButton type="submit" disabled={recovering} className="w-full">
            {recovering ? <Bilingual en="Saving" es="Guardando" /> : <Bilingual en="Save And Sign In" es="Guardar y entrar" />}
          </AdminButton>
        </form>

        {recovery.error === "expired" ? (
          <div className="mt-6 border-t border-[color:var(--tj-line)] pt-6">
            <RequestForm requested={requested} requestAction={requestAction} requesting={requesting} />
          </div>
        ) : null}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot Your Password?"
      lede="A reset link goes to your email."
      ledeEs="Le enviamos un enlace por correo."
      footer={back}
    >
      <RequestForm requested={requested} requestAction={requestAction} requesting={requesting} />
    </AuthShell>
  );
}

function RequestForm({
  requested,
  requestAction,
  requesting,
}: {
  requested: ResetRequestState;
  requestAction: (formData: FormData) => void;
  requesting: boolean;
}) {
  const keepRequestInput = useKeepTypedInput(requested, (result: ResetRequestState) => !result.done);

  if (requested.done) {
    return (
      <p role="status" className="rounded-[6px] border border-[color:var(--tj-line)] bg-[color:var(--tj-surface)] px-4 py-3.5 text-sm leading-relaxed">
        If that email belongs to an account here, a reset link is on its way. It works once and expires soon.
        <span className="mt-1.5 block text-[color:var(--tj-muted)]">
          Si ese correo pertenece a una cuenta de aquí, un enlace va en camino. Funciona una sola vez y caduca pronto.
        </span>
      </p>
    );
  }

  return (
    <form action={requestAction} onSubmit={keepRequestInput} className="grid gap-5">
      <div>
        <label htmlFor="recover-email" className={AUTH_LABEL}>
          Email
          <span className="ml-1.5 font-normal text-[color:var(--tj-muted-light)]">Correo electrónico</span>
        </label>
        <input
          id="recover-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          className={AUTH_FIELD}
        />
      </div>
      <AdminButton type="submit" disabled={requesting} className="w-full">
        {requesting ? <Bilingual en="Sending" es="Enviando" /> : <Bilingual en="Email Me A Reset Link" es="Enviarme el enlace" />}
      </AdminButton>
    </form>
  );
}
