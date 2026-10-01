import { DEALERSHIP_HOME } from "@/lib/admin/workspace";

/**
 * Where a successful sign in actually goes.
 *
 * The desk is the answer almost always, and it used to be the only answer:
 * the login action sent everybody to `DEALERSHIP_HOME` and let the admin
 * layout bounce anybody who had not filled in their profile on to the
 * onboarding screen. That bounce is a second redirect, evaluated while the
 * browser is still following the first one, and a redirect chained onto a
 * Server Action's redirect leaves the browser on a **completely blank
 * page**. Not slow, not unstyled: an empty body that never fills in, on the
 * very first login of every new person hired. Reloading the same URL
 * renders it perfectly, which is exactly why it survives casual testing.
 *
 * So the decision is made here, once, before the browser is sent anywhere.
 * Every way in (password, emailed code, Google, Apple) asks this one
 * function, so the four cannot disagree about what a new hire sees first.
 * The layout keeps its own guard, because somebody can still type the
 * dashboard URL straight in, but the ordinary path no longer chains.
 *
 * Anything unexpected falls through to the desk. A person who cannot be
 * looked up has still authenticated, and stranding them on a blank screen
 * is the failure this exists to prevent.
 */
export async function destinationAfterSignIn(): Promise<string> {
  try {
    const { getCurrentAdminAccess } = await import("@/lib/admin/current-admin");
    const access = await getCurrentAdminAccess();

    // The other reason the layout bounces, and the same blank page when it
    // does: somebody signed in on a password we issued them.
    if (access.user?.app_metadata?.requires_password_change === true) {
      return "/admin/account/onboarding";
    }

    const member = access.member;
    if (!member || member.status !== "active") return DEALERSHIP_HOME;

    // The column only exists once migration-33 has run. Where it does not,
    // there is no onboarding to do, and treating a missing column as "not
    // onboarded" would send every existing dealership through a screen their
    // database cannot record the answer to.
    const hasField = Object.prototype.hasOwnProperty.call(member, "onboarding_completed_at");
    if (!hasField || member.onboarding_completed_at) return DEALERSHIP_HOME;

    return "/admin/account/onboarding";
  } catch {
    return DEALERSHIP_HOME;
  }
}
