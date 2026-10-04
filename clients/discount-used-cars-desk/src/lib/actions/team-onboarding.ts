"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { roleOpensAdminRoute } from "@/lib/admin/route-permissions";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";
import { createServiceClient } from "@/lib/supabase/service";
import {
  checkStaffNamePart,
  nameSettled,
  namePartProblemSentence,
  staffFullName,
  type NamePartProblem,
} from "@/lib/onboarding/staff-name";
import { signerFitsSellerLine } from "@/lib/fill-130u/seller-line-fit";
import {
  newPasswordProblem,
  newPasswordProblemSentence,
  type NewPasswordProblem,
} from "@/lib/auth/password-rules";
import type { TeamMember } from "@/lib/operations/types";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  ADMIN_DEVICE_SESSION_COOKIE,
  adminDeviceSessionCookieOptions,
  createAdminDeviceSessionCookie,
} from "@/lib/auth/admin-device-session";

/**
 * First sign-in: a password of their own when the account is still on a
 * temporary one, the member's own name, then done (SOP "First sign-in:
 * onboarding"; owner's instructions 10/01/2026).
 *
 * The admin layout already sends every active member whose
 * `onboarding_completed_at` is empty, and every account still flagged
 * `requires_password_change`, to /admin/account/onboarding. These are the
 * writes that screen makes. The signature screen in between has no action
 * of its own: it saves through `saveStaffSignatureAction`, the same one
 * /admin/account/signature uses, so one stored signature serves both.
 *
 * The service client is deliberate, for the reason staff-signature.ts gives:
 * RLS on team_members lets a member read their own row, but its WITH CHECK
 * requires 'team:manage', so a member writing their own name is refused by
 * the policy meant to protect it. What replaces the policy is the rule below:
 * the row written is always the caller's own, resolved from their session.
 * No action here accepts a member id, and nothing but the named columns is
 * ever written, whatever the form carries.
 */

const ONBOARDING_PAGE = "/admin/account/onboarding";

/**
 * Every refusal carries a code the onboarding screen translates
 * (funnel.onboarding.errors in messages/en.json and es.json), so the Spanish
 * corridor never shows an English sentence. `error` stays the English
 * sentence, for anything that reads it without a catalogue.
 */
export type OnboardingErrorCode =
  | NamePartProblem["code"]
  | NewPasswordProblem["code"]
  | "passwordNotNeeded"
  | "passwordSaveFailed"
  | "signedInBeforeReset"
  | "signInAgain"
  | "notOnRoster"
  | "notActive"
  | "saveFailed"
  | "alreadyNamed"
  | "tooLongForForm"
  | "temporaryPassword"
  | "nameFirst"
  | "signatureFirst";

export type OnboardingRefusal = {
  ok: false;
  error: string;
  code: OnboardingErrorCode;
  params?: Record<string, string | number>;
};

export type OnboardingNameResult = { ok: true; first: string; last: string } | OnboardingRefusal;

export type OnboardingCompleteResult = OnboardingRefusal;

export type OnboardingPasswordResult = { ok: true } | OnboardingRefusal;

function refuse(code: OnboardingErrorCode, error: string, params?: Record<string, string | number>): OnboardingRefusal {
  return params ? { ok: false, error, code, params } : { ok: false, error, code };
}

function refusePart(problem: NamePartProblem): OnboardingRefusal {
  const { code, ...params } = problem;
  return refuse(code, namePartProblemSentence(problem), params);
}

function refusePassword(problem: NewPasswordProblem): OnboardingRefusal {
  const { code, ...params } = problem;
  return refuse(code, newPasswordProblemSentence(problem), Object.keys(params).length ? params : undefined);
}

type Onboardee =
  | { ok: true; member: TeamMember; role: Awaited<ReturnType<typeof getCurrentAdminAccess>>["role"]; requiresPasswordChange: boolean }
  | OnboardingRefusal;

/** The signed-in, active roster member, or why there is none. */
async function currentOnboardee(): Promise<Onboardee> {
  const access = await getCurrentAdminAccess();
  if (!access.user) return refuse("signInAgain", "Sign in again first.");
  if (!access.member) {
    return refuse(
      "notOnRoster",
      "This account is not on the team roster yet, so there is no profile to hold a name. Ask an owner to add you.",
    );
  }
  if (access.member.status !== "active") {
    return refuse("notActive", "This account is not active yet. Ask an owner to approve it.");
  }
  return {
    ok: true,
    member: access.member,
    role: access.role,
    requiresPasswordChange: access.user.app_metadata?.requires_password_change === true,
  };
}

/**
 * "Choose A Password." The first screen, and only for an account still on the
 * temporary password an approval or a reset issued it (owner's decision
 * 10/01/2026). The rule is account recovery's (password-rules.ts: at least
 * 10 characters), typed twice.
 *
 * One write, to the signed-in account only, resolved from the session and
 * never named by the form: the new password and the cleared
 * `requires_password_change` flag go together, so there is no moment where
 * the password is new and the flag still sends the account back here (or
 * the other way round). Only that key is sent: every other app_metadata key
 * is kept as the auth server holds it at write time.
 * Once it is cleared the layout stops sending the account to onboarding for
 * the password, and onboarding carries on to the name.
 *
 * Refused for an account without the flag (nobody else ever sees this
 * screen) and for a roster row that is not active: a new password never lets
 * in someone an owner has not approved.
 */
export async function chooseOnboardingPasswordAction(formData: FormData): Promise<OnboardingPasswordResult> {
  const access = await getCurrentAdminAccess();
  /*
    Only a session that signed in after the reset chooses the password
    (owner's decision 10/02/2026): a device that was already signed in when an
    owner reset the account is signed out, never handed the new password.
  */
  if (access.signedOut === "passwordReset") {
    return refuse(
      "signedInBeforeReset",
      "This device signed in before the password was reset. Sign in again first.",
    );
  }
  if (!access.user) return refuse("signInAgain", "Sign in again first.");
  if (access.user.app_metadata?.requires_password_change !== true) {
    return refuse(
      "passwordNotNeeded",
      "This account already has its own password. To change it, use Forgot Your Password on the sign-in screen.",
    );
  }
  // An active roster member, or an account the desk already lets in by its
  // approved role (one approved before the roster table existed).
  if (access.member ? access.member.status !== "active" : !access.role) {
    return refuse("notActive", "This account is not active yet. Ask an owner to approve it.");
  }

  const password = formData.get("password");
  const problem = newPasswordProblem(password, formData.get("confirmPassword"));
  if (problem) return refusePassword(problem);

  try {
    // Only the one key. The auth server merges app_metadata key by key, so
    // every other key stays as it is at write time; spreading the copy read
    // at the top of this action would write back a stale access_status or
    // desk_role if an owner changed the account in between.
    const { error } = await createServiceClient().auth.admin.updateUserById(access.user.id, {
      password: password as string,
      app_metadata: { requires_password_change: false },
    });
    if (error) throw error;
  } catch {
    return refuse("passwordSaveFailed", "That password could not be saved. Try again, or choose a different one.");
  }

  if (access.member) await logPasswordChosen(access.member.id, access.member.full_name ?? null);
  await signBackIn(access.user.email ?? null, password as string);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * The admin password write ends every session of the account, this one
 * included, so the member is signed straight back in with the password they
 * just chose, on the server, and this device gets a new device cookie dated
 * now (after the reset). Best effort: if it fails, the next page sends them
 * to sign in, which is where they would be anyway.
 */
async function signBackIn(email: string | null, password: string) {
  if (!email) return;
  try {
    const { data, error } = await (await createClient()).auth.signInWithPassword({ email, password });
    if (error) return;
    (await cookies()).set(
      ADMIN_DEVICE_SESSION_COOKIE,
      // Bound to the account that signed in (admin-device-session.ts).
      await createAdminDeviceSessionCookie(data?.user?.id ?? null),
      adminDeviceSessionCookieOptions,
    );
  } catch {
    // The password is saved; signing back in is the convenience.
  }
}

/**
 * The record that the temporary password was replaced (team_activity_events,
 * as approvals and resets are recorded). Never the password. Best effort.
 */
async function logPasswordChosen(memberId: string, name: string | null) {
  try {
    await createServiceClient().from("team_activity_events").insert({
      actor_id: memberId,
      event_type: "team_member_password_chosen",
      entity_type: "team_member",
      entity_id: memberId,
      body: `${name && name.trim() ? name.trim() : "A team member"} replaced their temporary password at onboarding.`,
      metadata: { member_id: memberId },
    });
  } catch {
    // The password is saved; the log is the extra.
  }
}

/**
 * "What Is Your Name?" Two required parts, saved as `full_name` ("First
 * Last", what prints in the parentheses on the 130-U) and `display_name` (the
 * first name). Reads only `firstName` and `lastName` from the form.
 *
 * Onboarding's to ask once. After a member has finished onboarding with a
 * usable name, the name that prints on every document they file is changed
 * only by an owner (team:manage), never quietly by the member themself. The
 * screen stays writable for a finished member only while the saved name is
 * one onboarding would refuse (a signup name, or one too long for the seller
 * line), which is where the filing refusal sends them. Every write is logged.
 */
export async function saveOnboardingNameAction(formData: FormData): Promise<OnboardingNameResult> {
  const who = await currentOnboardee();
  if (!who.ok) return who;

  if (who.member.onboarding_completed_at && nameSettled(who.member)) {
    return refuse(
      "alreadyNamed",
      "Your name is already on file and prints on the documents you file. Ask an owner to change it.",
    );
  }

  const first = checkStaffNamePart(formData.get("firstName"), "first");
  if (!first.ok) return refusePart(first);
  const last = checkStaffNamePart(formData.get("lastName"), "last");
  if (!last.ok) return refusePart(last);

  const fullName = staffFullName(first.value, last.value);
  // Clipped by the 130-U's seller box at its smallest size: refused here,
  // before it can be filed (seller-line-fit.ts).
  if (!signerFitsSellerLine(fullName)) {
    return refuse(
      "tooLongForForm",
      "Your full name is too long to print in full on the state form's seller line. Enter it as it is printed on your ID; if it already is, ask an owner.",
    );
  }

  const service = createServiceClient();
  const previous = who.member.full_name ?? null;
  const { error } = await service
    .from("team_members")
    .update({
      full_name: fullName,
      display_name: first.value,
      updated_at: new Date().toISOString(),
    })
    .eq("id", who.member.id);

  if (error) return refuse("saveFailed", "Your name could not be saved. Try again.");

  await logNameWrite(who.member.id, previous, fullName);
  revalidatePath(ONBOARDING_PAGE);
  return { ok: true, first: first.value, last: last.value };
}

/**
 * The record of a member writing their own legal name (team_activity_events,
 * as the team screen records approvals). Best effort: a log that cannot be
 * written never undoes the name.
 */
async function logNameWrite(memberId: string, previous: string | null, next: string) {
  try {
    await createServiceClient().from("team_activity_events").insert({
      actor_id: memberId,
      event_type: "team_member_onboarding_name",
      entity_type: "team_member",
      entity_id: memberId,
      body: previous && previous.trim() && previous !== next
        ? `${next} saved their name at onboarding (was ${previous}).`
        : `${next} saved their name at onboarding.`,
      metadata: { member_id: memberId, full_name: next, previous_full_name: previous },
    });
  } catch {
    // The name is saved; the log is the extra.
  }
}

/**
 * "You Are All Set." Records `onboarding_completed_at` and goes to work:
 * Handle A Sale for a role that opens it, the member's own signature page
 * for one that does not (a role without sales access sent to the desk would
 * be bounced to a page that does not exist).
 *
 * Refused, with the reason, while anything onboarding asks for is missing:
 * the name, and the signature for a member cleared to sign. Also refused
 * while the account is still on a temporary password (the first screen
 * replaces it), because the layout would send it straight back here: a
 * redirect chained onto this one leaves the browser on a blank page.
 */
export async function completeOnboardingAction(): Promise<OnboardingCompleteResult> {
  const who = await currentOnboardee();
  if (!who.ok) return who;
  const { member } = who;

  if (who.requiresPasswordChange) {
    return refuse(
      "temporaryPassword",
      "Choose your own password first. It replaces the temporary one you were given.",
    );
  }
  // The name the name screen saves, not merely a non-empty one: a signup
  // name ("Associate", an email address) would otherwise finish onboarding
  // with nothing that can print on the dealer line.
  if (!nameSettled(member)) {
    return refuse("nameFirst", "Add your first and last name first.");
  }
  if (member.can_sign_contracts === true && !member.signature_data_url) {
    return refuse("signatureFirst", "Draw and save your signature first. It is what goes on the dealer line.");
  }

  const service = createServiceClient();
  const { error } = await service
    .from("team_members")
    .update({
      // Never moved once set: the first completion is the record.
      onboarding_completed_at: member.onboarding_completed_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", member.id);

  if (error) return refuse("saveFailed", "That could not be saved. Try again.");

  revalidatePath("/admin", "layout");
  if (roleOpensAdminRoute(who.role, DEALERSHIP_HOME)) redirect(DEALERSHIP_HOME);
  redirect("/admin/account/signature");
}
