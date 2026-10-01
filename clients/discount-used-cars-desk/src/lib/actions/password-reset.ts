"use server";

import { createHmac } from "node:crypto";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, recipientFingerprint } from "@/lib/email/send";
import { passwordResetEmail, recoveryUrlFor } from "@/lib/email/templates";
import {
  ADMIN_DEVICE_SESSION_COOKIE,
  adminDeviceSessionCookieOptions,
  createAdminDeviceSessionCookie,
} from "@/lib/auth/admin-device-session";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";

/**
 * Forgot password, done the way the Track D review demanded.
 *
 * The response is IDENTICAL for every input — same body, same timing
 * envelope — because the difference between "we sent it" and "no such
 * account" is a list of who works here, readable by anyone with the login
 * page. The heavy work (limit check, eligibility, link mint, send) runs
 * AFTER the response is on its way, via `after()`, so even the clock
 * cannot tell the cases apart.
 *
 * Eligibility is the configured owner or an ACTIVE team member — a
 * pending or removed account gets the same quiet nothing as a stranger
 * (the source also creates pending Auth users; minting them recovery
 * sessions would be an access grant nobody approved).
 *
 * The limiter is durable: one row per accepted request, counted by
 * HMAC(email) and by IP over the last hour. Over the cap, the request is
 * recorded as skipped and nothing sends.
 */

const EMAIL_CAP_PER_HOUR = 3;
const IP_CAP_PER_HOUR = 10;

export type ResetRequestState = { done: boolean };

function emailHmac(email: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "no-key";
  return createHmac("sha256", key).update(email.trim().toLowerCase()).digest("hex");
}

export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const raw = formData.get("email");
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip") ||
    null;

  if (email && email.includes("@")) {
    try {
      after(() => processResetRequest(email, ip));
    } catch {
      // No request scope (rare). Run inline; the uniform message already
      // went nowhere yet, so timing is the only cost.
      await processResetRequest(email, ip);
    }
  }

  // One answer for every world.
  return { done: true };
}

async function processResetRequest(email: string, ip: string | null): Promise<void> {
  try {
    const service = createServiceClient();
    const hmac = emailHmac(email);
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();

    // Record first, count after: the recording IS the consumption, so two
    // concurrent requests both count each other.
    await service.from("reset_request_limits").insert({ email_hmac: hmac, ip });
    const [{ count: byEmail }, { count: byIp }] = await Promise.all([
      service
        .from("reset_request_limits")
        .select("id", { count: "exact", head: true })
        .eq("email_hmac", hmac)
        .gte("requested_at", hourAgo),
      ip
        ? service
            .from("reset_request_limits")
            .select("id", { count: "exact", head: true })
            .eq("ip", ip)
            .gte("requested_at", hourAgo)
        : Promise.resolve({ count: 0 }),
    ]);
    if ((byEmail ?? 0) > EMAIL_CAP_PER_HOUR || (byIp ?? 0) > IP_CAP_PER_HOUR) return;

    // Eligibility: the configured owner, or an ACTIVE team member.
    const configuredOwner = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    let language: "en" | "es" = "en";
    let eligible = email === configuredOwner;
    if (!eligible) {
      const { data: member } = await service
        .from("team_members")
        .select("status, language_preference")
        .eq("email", email)
        .maybeSingle();
      eligible = member?.status === "active";
      if (member?.language_preference === "es") language = "es";
    }
    if (!eligible) return;

    const { data, error } = await service.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    const hashedToken = data?.properties?.hashed_token;
    if (error || !hashedToken) return;

    // One send per address per ten minutes, by key: a double-tap of the
    // request button reuses the claim instead of double-mailing.
    const bucket = Math.floor(Date.now() / 600_000);
    await sendEmail({
      businessKey: `password-reset/${recipientFingerprint(email)}/${bucket}`,
      template: "passwordReset",
      to: email,
      language,
      from: "support",
      ...passwordResetEmail(language, recoveryUrlFor(hashedToken)),
    });
  } catch (error) {
    console.error("processResetRequest failed:", error);
  }
}

/**
 * The deliberate POST that turns the emailed token into a new password.
 *
 * The bearer rides the URL FRAGMENT to the recover page (a fragment never
 * reaches server logs or the proxy's x-pathname), the page posts it here
 * on a human's click, and this action verifies it into SSR cookies,
 * updates the password in the same breath, and mints the device cookie —
 * the full session bridge the review said was missing.
 */
export type RecoveryState = { ok: boolean; error?: "expired" | "weak" | "failed" };

export async function completeRecovery(
  _prev: RecoveryState,
  formData: FormData,
): Promise<RecoveryState> {
  const tokenHash = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!tokenHash) return { ok: false, error: "expired" };
  // The onboarding screen's own floor, kept identical so the two ways of
  // choosing a password cannot disagree about what a password is.
  if (password.length < 10) return { ok: false, error: "weak" };

  try {
    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (verifyError) return { ok: false, error: "expired" };

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) return { ok: false, error: "failed" };

    const cookieStore = await cookies();
    cookieStore.set(
      ADMIN_DEVICE_SESSION_COOKIE,
      await createAdminDeviceSessionCookie(),
      adminDeviceSessionCookieOptions,
    );
  } catch {
    return { ok: false, error: "failed" };
  }

  redirect(DEALERSHIP_HOME);
}
