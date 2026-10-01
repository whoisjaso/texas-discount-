"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_DEVICE_SESSION_COOKIE,
  adminDeviceSessionCookieOptions,
  createAdminDeviceSessionCookie,
} from "@/lib/auth/admin-device-session";
import {
  isLocalAdminPreviewEnabled,
  LOCAL_ADMIN_SESSION_COOKIE,
  localAdminSessionCookieOptions,
} from "@/lib/auth/local-admin";
import { createClient } from "@/lib/supabase/server";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";
import { destinationAfterSignIn } from "@/lib/auth/destination";
import { resolveLoginEmail } from "@/lib/auth/username";

async function resyncConfiguredAdminPassword(
  email: string,
  password: string,
): Promise<boolean> {
  /*
    Provisioning only, and OFF by default. This used to run on every
    failed owner login: typing the env-configured secret rewrote the Auth
    password back to it — which silently REVERSED any password reset the
    owner had just done, and made the env var a permanent backdoor
    (Track D review). Now the self-serve reset at /admin/recover is the
    ordinary recovery path; this resync fires only while
    ADMIN_SECRET_PROVISION=true is deliberately set for first-time
    setup, and the SOP says to unset it after.
  */
  if (process.env.ADMIN_SECRET_PROVISION !== "true") return false;

  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const configuredPassword = process.env.ADMIN_SECRET?.trim();

  if (
    !configuredEmail ||
    !configuredPassword ||
    email !== configuredEmail ||
    password !== configuredPassword
  ) {
    return false;
  }

  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const service = createServiceClient();
    const { data, error } = await service.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (error) return false;

    const adminUser = data.users.find(
      (user) => user.email?.trim().toLowerCase() === configuredEmail,
    );

    if (!adminUser) return false;

    const { error: updateError } = await service.auth.admin.updateUserById(
      adminUser.id,
      { password: configuredPassword },
    );

    return !updateError;
  } catch {
    return false;
  }
}

export type AuthState = {
  success: boolean;
  error?: string;
};

export async function loginAdmin(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const emailInput = formData.get("email");
  const passwordInput = formData.get("password");
  const email =
    typeof emailInput === "string" ? emailInput.trim().toLowerCase() : null;
  const password =
    typeof passwordInput === "string" ? passwordInput : null;

  if (!email) {
    return { success: false, error: "Email is required." };
  }
  if (!password) {
    return { success: false, error: "Password is required." };
  }

  if (isLocalAdminPreviewEnabled()) {
    const cookieStore = await cookies();
    cookieStore.set(LOCAL_ADMIN_SESSION_COOKIE, email, localAdminSessionCookieOptions);
    redirect(DEALERSHIP_HOME);
  }

  /*
    A username is accepted where the email goes, so nobody has to sign in
    with their Gmail every time (owner's ask). The handle resolves to the
    address on the team roster before Supabase sees it; Supabase only ever
    knows emails. An unknown handle fails the same way a wrong password
    does, so the field cannot be used to list who works here.
  */
  const signInEmail = email.includes("@") ? email : await resolveLoginEmail(email);
  if (!signInEmail) {
    return { success: false, error: "Invalid email or password." };
  }

  try {
    const supabase = await createClient();
    const { error: firstError } = await supabase.auth.signInWithPassword({
      email: signInEmail,
      password,
    });
    const error =
      firstError && (await resyncConfiguredAdminPassword(signInEmail, password))
        ? (
            await supabase.auth.signInWithPassword({
              email: signInEmail,
              password,
            })
          ).error
        : firstError;

    if (error) {
      return { success: false, error: "Invalid email or password." };
    }

    const cookieStore = await cookies();
    cookieStore.set(
      ADMIN_DEVICE_SESSION_COOKIE,
      await createAdminDeviceSessionCookie(),
      adminDeviceSessionCookieOptions,
    );
  } catch {
    return { success: false, error: "Auth service unavailable. Try again." };
  }

  redirect(await destinationAfterSignIn());
}

export async function logoutAdmin(): Promise<void> {
  if (!isLocalAdminPreviewEnabled()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  const cookieStore = await cookies();
  cookieStore.delete("admin-session");
  cookieStore.delete(ADMIN_DEVICE_SESSION_COOKIE);
  cookieStore.delete(LOCAL_ADMIN_SESSION_COOKIE);
  redirect("/admin/login");
}
