"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  ADMIN_DEVICE_SESSION_COOKIE,
  adminDeviceSessionCookieOptions,
  createAdminDeviceSessionCookie,
} from "@/lib/auth/admin-device-session";
import { destinationAfterSignIn } from "@/lib/auth/destination";
import {
  isLocalAdminPreviewEnabled,
  LOCAL_ADMIN_SESSION_COOKIE,
  localAdminSessionCookieOptions,
} from "@/lib/auth/local-admin";
import { issueCode, mayReceiveSignInCode, verifyCode } from "@/lib/auth/code-store";
import { neutralSentMessage, normalizeCode } from "@/lib/auth/sign-in-codes";
import { looksLikePhone, resolveLoginEmail, resolveLoginPhone } from "@/lib/auth/username";
import { createClient } from "@/lib/supabase/server";

/**
 * Signing in with a code instead of a password.
 *
 * Two steps on the login screen: an address (or a handle) gets a six-digit
 * code by email from the dealership's own address; the code typed back
 * signs the person in. The code is minted and checked in `code-store`;
 * this file only decides who may ask and what the screen is told.
 *
 * Whatever the address, the person is told the same sentence: if it is on
 * the team, a code is on its way. The roster is not something the sign-in
 * screen confirms or denies.
 */

export type CodeSignInState = {
  ok: boolean;
  stage: "email" | "code";
  email?: string;
  message?: string;
  error?: string;
  /** Preview has no mailbox; the screen says any six digits will do. */
  preview?: boolean;
};

function cleanEmail(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function requestSignInCode(
  _prev: CodeSignInState,
  formData: FormData,
): Promise<CodeSignInState> {
  const typed = cleanEmail(formData.get("email"));
  if (!typed) return { ok: false, stage: "email", error: "Enter your email or username." };

  if (isLocalAdminPreviewEnabled()) {
    return {
      ok: true,
      stage: "code",
      email: typed,
      preview: true,
      message: "Preview: no mail is sent here. Any six digits sign you in.",
    };
  }

  // Resolve and send after the response, so neither the mailbox address,
  // provider errors nor roster lookup timing are disclosed to this form.
  try {
    after(async () => {
      try {
        // A number typed here means the person wants it by text, and the
        // number itself is the identity: `team_members.phone` links it to the
        // same address a handle would have resolved to.
        if (looksLikePhone(typed)) {
          const found = await resolveLoginPhone(typed);
          if (found && await mayReceiveSignInCode(found.email)) {
            await issueCode(found.email, "sign_in", "en", { channel: "sms", phone: found.phone });
          }
          return;
        }
        const email = typed.includes("@") ? typed : await resolveLoginEmail(typed);
        if (email && await mayReceiveSignInCode(email)) await issueCode(email, "sign_in", "en");
      } catch {
        // Provider outcomes are recorded in the outbox, never in this public response.
      }
    });
  } catch {
    // Missing request lifecycle support must not expose whether the person exists.
  }
  return { ok: true, stage: "code", email: typed, message: neutralSentMessage(typed) };
}

export async function completeSignInCode(
  _prev: CodeSignInState,
  formData: FormData,
): Promise<CodeSignInState> {
  const identifier = cleanEmail(formData.get("email"));
  const code = normalizeCode(typeof formData.get("code") === "string" ? (formData.get("code") as string) : "");
  if (!identifier) return { ok: false, stage: "email", error: "Start again with your email or username." };
  if (!code) return { ok: false, stage: "code", email: identifier, error: "Type the six digits from the email." };

  if (isLocalAdminPreviewEnabled()) {
    const cookieStore = await cookies();
    cookieStore.set(LOCAL_ADMIN_SESSION_COOKIE, identifier, localAdminSessionCookieOptions);
    redirect(await destinationAfterSignIn());
  }

  const email = identifier.includes("@")
    ? identifier
    : looksLikePhone(identifier)
      ? (await resolveLoginPhone(identifier))?.email ?? null
      : await resolveLoginEmail(identifier);
  const invalid: CodeSignInState = {
    ok: false, stage: "code", email: identifier,
    error: "That code could not be verified. Check it or request a new one.",
  };
  if (!email) return invalid;
  try {
    const verified = await verifyCode(email, "sign_in", code);
    if (!verified.ok || !await mayReceiveSignInCode(email)) return invalid;
  } catch {
    return invalid;
  }

  /*
    The verified address becomes a session the same way Supabase's own
    magic link would: a link is generated server-side, never mailed, and
    its token is exchanged here. The person never sees a link; they saw a
    code. Supabase issues the session; we add the device cookie every
    other sign-in path adds.
  */
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const service = createServiceClient();
    const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      return {
        ok: false,
        stage: "email",
        email: identifier,
        error: "This address is on the team but has no account yet. Ask the owner to send your welcome link.",
      };
    }
    const supabase = await createClient();
    const { error: sessionError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (sessionError) {
      return { ok: false, stage: "email", email: identifier, error: "The code was right but the session could not start. Try again." };
    }
    const cookieStore = await cookies();
    cookieStore.set(
      ADMIN_DEVICE_SESSION_COOKIE,
      await createAdminDeviceSessionCookie(),
      adminDeviceSessionCookieOptions,
    );
  } catch {
    return { ok: false, stage: "email", email: identifier, error: "Auth service unavailable. Try again." };
  }

  redirect(await destinationAfterSignIn());
}
