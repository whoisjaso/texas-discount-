import { redirect } from "next/navigation";
import FunnelLocaleProvider from "@/components/admin/funnel/FunnelLocaleProvider";
import AdminDataNotice from "@/components/admin/AdminDataNotice";
import FeesSettingsClient from "./FeesSettingsClient";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { resolveAdminLanguageWithUser } from "@/lib/admin/server-language";
import { getDealerFeeChanges, getDealerFeeSchedule } from "@/lib/dealership-fees";
import { dealership } from "@/lib/dealership-config";
import { businessDateToday } from "@/lib/documents/us-date";
import { getFunnelBundles } from "@/lib/sales/i18n";
import { hasTeamPermission } from "@/lib/operations/team";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";

export const metadata = { title: `Your Fees - ${dealership.name}` };
export const dynamic = "force-dynamic";

/**
 * Your Fees (owner only): the dealer-set fees as they stand, each with its
 * Texas limit and citation, who saved them and when, a Change link on each
 * line that opens the same screens as first sign-in, and every change on
 * record (rulebook texas-dealer-fees.md section 5.2; SOP "Fees").
 *
 * The route is admin:all (route-permissions.ts); the page checks it again.
 */
export default async function DealerFeesPage() {
  const access = await getCurrentAdminAccess();
  if (!access.user) redirect("/admin/login");
  if (!hasTeamPermission(access.role, "admin:all")) redirect(DEALERSHIP_HOME);

  const { lang, userId } = await resolveAdminLanguageWithUser();
  const schedule = await getDealerFeeSchedule();
  const changes = await getDealerFeeChanges(50);

  if (!schedule.ok) {
    return (
      <div className="ed-admin px-5 py-8 md:px-10 md:py-12">
        <h1 className="ed-admin-title">Your Fees</h1>
        <div className="mt-6">
          <AdminDataNotice message="The fee settings could not be read. Try again in a moment." />
        </div>
      </div>
    );
  }

  return (
    <FunnelLocaleProvider bundles={getFunnelBundles()} initial={lang} userId={userId}>
      <FeesSettingsClient
        schedule={schedule.schedule}
        changes={changes.ok ? changes.changes : []}
        historyUnreadable={!changes.ok}
        county={dealership.county ?? null}
        today={businessDateToday()}
      />
    </FunnelLocaleProvider>
  );
}
