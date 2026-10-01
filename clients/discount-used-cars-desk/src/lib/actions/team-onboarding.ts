"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { roleOpensAdminRoute } from "@/lib/admin/route-permissions";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";
import { createServiceClient } from "@/lib/supabase/service";
import {
  checkStaffNamePart,
  namePartProblemSentence,
  savedOnboardingName,
  staffFullName,
  type NamePartProblem,
} from "@/lib/onboarding/staff-name";
import { signerFitsSellerLine } from "@/lib/fill-130u/seller-line-fit";
import type { TeamMember } from "@/lib/operations/types";

/**
 * First sign-in: the member's own name, then done (SOP "First sign-in:
 * onboarding"; owner's instruction 10/01/2026).
 *
 * The admin layout already sends every active member whose
 * `onboarding_completed_at` is empty to /admin/account/onboarding. These are
 * the writes that screen makes. The signature screen in between has no action
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

function refuse(code: OnboardingErrorCode, error: string, params?: Record<string, string | number>): OnboardingRefusal {
  return params ? { ok: false, error, code, params } : { ok: false, error, code };
}

function refusePart(problem: NamePartProblem): OnboardingRefusal {
  const { code, ...params } = problem;
  return refuse(code, namePartProblemSentence(problem), params);
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

  if (who.member.onboarding_completed_at && savedOnboardingName(who.member)) {
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
 * while the account is still on a temporary password, because the layout
 * would send it straight back here: a redirect chained onto this one leaves
 * the browser on a blank page.
 */
export async function completeOnboardingAction(): Promise<OnboardingCompleteResult> {
  const who = await currentOnboardee();
  if (!who.ok) return who;
  const { member } = who;

  if (who.requiresPasswordChange) {
    return refuse(
      "temporaryPassword",
      "This account is still on the temporary password it was issued, and the desk cannot replace it yet. Ask an owner.",
    );
  }
  // The name the name screen saves, not merely a non-empty one: a signup
  // name ("Associate", an email address) would otherwise finish onboarding
  // with nothing that can print on the dealer line.
  if (!savedOnboardingName(member)) {
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
