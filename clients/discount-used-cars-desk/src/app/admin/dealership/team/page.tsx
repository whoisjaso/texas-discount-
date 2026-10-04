import type { Metadata } from "next";
import { redirect } from "next/navigation";
import TeamClient from "./TeamClient";
import AdminDataNotice from "@/components/admin/AdminDataNotice";
import { AdminPageHeader, AdminShell } from "@/components/admin/ui";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { getTeamRoster } from "@/lib/admin/team-roster";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";
import { dealership } from "@/lib/dealership-config";
import { approvalRoleOptions } from "@/lib/onboarding/team-rules";
import { hasTeamPermission } from "@/lib/operations/team";

export const metadata: Metadata = {
  title: `Team | ${dealership.shortName} Admin`,
  robots: "noindex, nofollow",
};

export const dynamic = "force-dynamic";

/**
 * The team screen (SOP "First sign-in: onboarding", items 1, 4, 6 and 7):
 * the access requests to approve or deny, the team with who has finished
 * onboarding and who is cleared to sign, Reset Access, Correct Name, Remove
 * Access, and every team change on record. /admin/team (the owner-alert
 * email's link) resolves here.
 *
 * The route is team:manage (route-permissions.ts: Owner, Manager); the page
 * checks it again, and every action checks its own rule on the server
 * (team-rules.ts). What only an owner may do is shown to a manager disabled,
 * with the reason, never as a control that seems to work.
 */
export default async function TeamPage() {
  const access = await getCurrentAdminAccess();
  if (!access.user) redirect("/admin/login");
  if (!hasTeamPermission(access.role, "team:manage")) redirect(DEALERSHIP_HOME);

  const roster = await getTeamRoster(access);
  const isOwner = hasTeamPermission(access.role, "admin:all");

  return (
    <AdminShell>
      <AdminPageHeader
        title="Team"
        subtitle="Who works the desk, who signs for the dealer, and whose name prints on the paper."
      />
      {roster.ok ? (
        <TeamClient
          isOwner={isOwner}
          roleOptions={approvalRoleOptions(access.role)}
          requests={roster.requests}
          members={roster.members}
          removed={roster.removed}
          activeOwners={roster.activeOwners}
          history={roster.history}
        />
      ) : (
        <AdminDataNotice
          label="Team"
          title="The team could not be read"
          message="Try again in a moment."
        />
      )}
    </AdminShell>
  );
}
