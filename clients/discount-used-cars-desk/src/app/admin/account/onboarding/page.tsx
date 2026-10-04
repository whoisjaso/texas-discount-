import type { Metadata } from "next";
import { redirect } from "next/navigation";
import FunnelLocaleProvider from "@/components/admin/funnel/FunnelLocaleProvider";
import OnboardingFlow from "./OnboardingFlow";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { resolveAdminLanguageWithUser } from "@/lib/admin/server-language";
import { getStaffSignature } from "@/lib/actions/staff-signature";
import { getFunnelBundles } from "@/lib/sales/i18n";
import { dealership } from "@/lib/dealership-config";
import { roleOpensAdminRoute } from "@/lib/admin/route-permissions";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";
import { hasTeamPermission } from "@/lib/operations/team";
import { getDealerFeeSchedule } from "@/lib/dealership-fees";
import { businessDateToday } from "@/lib/documents/us-date";
import {
  firstOpenStep,
  onboardingNameParts,
  onboardingSatisfied,
  onboardingSteps,
  nameSettled,
  withFeesStep,
  type OnboardingStep,
} from "@/lib/onboarding/staff-name";

export const metadata: Metadata = {
  title: `Welcome | ${dealership.shortName} Admin`,
  robots: "noindex, nofollow",
};

export const dynamic = "force-dynamic";

/**
 * First sign-in (SOP "First sign-in: onboarding"; owner's instructions
 * 10/01/2026).
 *
 * The admin layout already sends every active member who has not finished
 * onboarding here, and every account still on a temporary password, and so
 * does `destinationAfterSignIn`. One question to a screen, in the sale
 * corridor's clothes: a password of their own (only while the account is on
 * a temporary one), the name, the signature (for a member cleared to sign),
 * then done.
 *
 * Everything the screens need is decided here, on the server: which steps
 * this member walks, where they pick up, and what is already on file.
 */
export default async function AdminOnboardingPage() {
  const access = await getCurrentAdminAccess();
  if (!access.user) redirect("/admin/login");

  const member = access.member;

  /*
    Done is done. A member who has finished onboarding, and has everything it
    asks for (a usable name, and a signature when cleared to sign), is sent
    to work rather than shown a screen that could rewrite the legal name on
    every document they file. The screen stays open to a finished member only
    when something it asks for is missing or no longer acceptable, which is
    where the filing refusal points them, or while the account is still on a
    temporary password: the layout sends that account here from every page,
    so leaving before the password is replaced would loop.
  */
  const onTemporaryPassword = access.user.app_metadata?.requires_password_change === true;
  const finished = Boolean(member?.onboarding_completed_at) && onboardingSatisfied(member);
  if (finished && !onTemporaryPassword) {
    redirect(roleOpensAdminRoute(access.role, DEALERSHIP_HOME) ? DEALERSHIP_HOME : "/admin/account/signature");
  }

  const { lang, userId } = await resolveAdminLanguageWithUser();
  const canSign = member?.can_sign_contracts === true;
  const parts = onboardingNameParts(member);
  // The same reader every dealer line uses, so what the pad shows is what
  // the documents print.
  const signature = member ? (await getStaffSignature()).dataUrl : null;
  /*
    Your Fees (rulebook texas-dealer-fees.md section 5.2): the Owner only
    (admin:all; a manager holds team:manage, not this), only while the
    dealership has no owner-saved fee schedule, and never for a member who
    has finished onboarding (a later change is made under Your Fees, never
    by reopening onboarding). A schedule nobody could read skips the step: it
    never blocks onboarding, and the filing refusal still stands.
  */
  const isOwner = hasTeamPermission(access.role, "admin:all");
  const feeSchedule = member && isOwner && !finished ? await getDealerFeeSchedule() : null;
  const setsFees = Boolean(feeSchedule?.ok && feeSchedule.schedule.source !== "owner");
  const open = {
    canSign,
    // A saved name onboarding would now refuse (too long for the seller
    // line, say) reopens the name screen, with what was saved in the boxes.
    hasName: nameSettled(member),
    hasSignature: Boolean(signature),
    needsFees: setsFees,
  };

  /*
    An account the desk lets in by its approved role but with no roster row
    (approved before the roster table existed) has no name or signature to
    keep. It still has a temporary password to replace, so it gets that one
    screen and then goes to work; with no password to replace it gets the
    not-on-the-team screen, as before.
  */
  const passwordOnly = !member && onTemporaryPassword && access.role !== null;

  const steps = passwordOnly
    ? (["password"] as OnboardingStep[])
    : withFeesStep(onboardingSteps({ canSign, requiresPasswordChange: onTemporaryPassword, finished }), setsFees);
  const start = passwordOnly ? "password" : firstOpenStep({ ...open, requiresPasswordChange: onTemporaryPassword });
  // Where the screen goes once the password is saved: the first screen that
  // still has work, or straight to work for an account with nothing else to do.
  const afterPassword = passwordOnly ? null : firstOpenStep(open);
  // The name already on file when it is settled, for Done's sentence on a
  // member who only has the password left (an owner may have set the name,
  // so the two boxes cannot always be recovered from it).
  const nameOnFile = open.hasName ? (member?.full_name ?? "").trim().replace(/\s+/g, " ") : "";

  return (
    <FunnelLocaleProvider bundles={getFunnelBundles()} initial={lang} userId={userId}>
      <OnboardingFlow
        onRoster={Boolean(member) || passwordOnly}
        steps={steps}
        initialStep={start}
        afterPassword={afterPassword}
        nameOnFile={nameOnFile}
        initialFirst={parts.first}
        initialLast={parts.last}
        initialSignature={signature}
        fees={
          setsFees && feeSchedule?.ok
            ? { schedule: feeSchedule.schedule, county: dealership.county ?? null, today: businessDateToday() }
            : null
        }
      />
    </FunnelLocaleProvider>
  );
}
