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
import {
  firstOpenStep,
  onboardingNameParts,
  onboardingSatisfied,
  onboardingSteps,
  nameSettled,
} from "@/lib/onboarding/staff-name";

export const metadata: Metadata = {
  title: `Welcome | ${dealership.shortName} Admin`,
  robots: "noindex, nofollow",
};

export const dynamic = "force-dynamic";

/**
 * First sign-in (SOP "First sign-in: onboarding"; owner's instruction
 * 10/01/2026).
 *
 * The admin layout already sends every active member who has not finished
 * onboarding here, and so does `destinationAfterSignIn`. This page had never
 * been built, so that redirect landed every new member on a 404: the
 * lock-out the SOP warns about. One question to a screen, in the sale
 * corridor's clothes: the name, the signature (for a member cleared to sign),
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
    where the filing refusal points them. Never while the account is still on
    a temporary password: the layout sends that account here from every
    page, so leaving would loop.
  */
  const onTemporaryPassword = access.user.app_metadata?.requires_password_change === true;
  if (member?.onboarding_completed_at && !onTemporaryPassword && onboardingSatisfied(member)) {
    redirect(roleOpensAdminRoute(access.role, DEALERSHIP_HOME) ? DEALERSHIP_HOME : "/admin/account/signature");
  }

  const { lang, userId } = await resolveAdminLanguageWithUser();
  const canSign = member?.can_sign_contracts === true;
  const parts = onboardingNameParts(member);
  // The same reader every dealer line uses, so what the pad shows is what
  // the documents print.
  const signature = member ? (await getStaffSignature()).dataUrl : null;
  const steps = onboardingSteps({ canSign });
  const start = firstOpenStep({
    canSign,
    // A saved name onboarding would now refuse (too long for the seller
    // line, say) reopens the name screen, with what was saved in the boxes.
    hasName: nameSettled(member),
    hasSignature: Boolean(signature),
  });

  return (
    <FunnelLocaleProvider bundles={getFunnelBundles()} initial={lang} userId={userId}>
      <OnboardingFlow
        onRoster={Boolean(member)}
        steps={steps}
        initialStep={start}
        initialFirst={parts.first}
        initialLast={parts.last}
        initialSignature={signature}
      />
    </FunnelLocaleProvider>
  );
}
