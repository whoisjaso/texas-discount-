import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_DEVICE_SESSION_COOKIE,
  adminDeviceSessionCookieOptions,
  createAdminDeviceSessionCookie,
} from "@/lib/auth/admin-device-session";
import { destinationAfterSignIn } from "@/lib/auth/destination";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google and Apple send the browser back.
 *
 * The provider hands over a code; Supabase trades it for a session. Then
 * the same question every sign-in path asks: is this person on the team?
 * Somebody with a Google account and no roster row is signed straight
 * back out and shown the request-access door with their address filled
 * in, so a stranger with a Gmail never sees the desk. Somebody who is on
 * the team gets the device cookie every other path mints, and goes where
 * `destinationAfterSignIn` says: the desk, or their onboarding.
 *
 * Exempt from the permission table and the middleware's sign-in gate,
 * because there is no session yet when the browser arrives here.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (!code || providerError) {
    return NextResponse.redirect(new URL("/admin/login?error=oauth", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/admin/login?error=oauth", request.url));
  }

  const access = await getCurrentAdminAccess();
  if (!access.user || !access.role) {
    const email = access.user?.email?.trim().toLowerCase() ?? "";
    await supabase.auth.signOut();
    const to = new URL("/admin/login", request.url);
    to.searchParams.set("error", "not-on-team");
    if (email) to.searchParams.set("email", email);
    return NextResponse.redirect(to);
  }

  const response = NextResponse.redirect(new URL(await destinationAfterSignIn(), request.url));
  response.cookies.set(
    ADMIN_DEVICE_SESSION_COOKIE,
    await createAdminDeviceSessionCookie(),
    adminDeviceSessionCookieOptions,
  );
  return response;
}
