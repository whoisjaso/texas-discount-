import { redirect } from "next/navigation";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";
import { hasTeamPermission } from "@/lib/operations/team";
import { dealership } from "@/lib/dealership-config";

export const metadata = { title: `Admin - ${dealership.shortName} Auto` };
export const dynamic = "force-dynamic";

/**
 * Admin entry.
 *
 * There is one desk now, so there is nothing to choose: signing in goes
 * straight to it. Anyone without a dealership permission falls through to the
 * account area rather than a dead-end picker.
 */
export default async function AdminEntryPage() {
  const access = await getCurrentAdminAccess();

  const canUseDesk =
    hasTeamPermission(access.role, "inventory:read") ||
    hasTeamPermission(access.role, "leads:read") ||
    hasTeamPermission(access.role, "documents:read") ||
    hasTeamPermission(access.role, "payments:read");

  redirect(canUseDesk ? DEALERSHIP_HOME : "/admin/account/signature");
}
