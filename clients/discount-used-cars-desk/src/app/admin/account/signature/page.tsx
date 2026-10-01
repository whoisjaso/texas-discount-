import type { Metadata } from "next";
import { redirect } from "next/navigation";
import StaffSignatureClient from "./StaffSignatureClient";
import { AdminPageHeader, AdminShell } from "@/components/admin/ui";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { roleOpensAdminRoute } from "@/lib/admin/route-permissions";
import { getStaffSignature } from "@/lib/actions/staff-signature";
import { dealership } from "@/lib/dealership-config";

export const metadata: Metadata = {
  title: `Your Signature | ${dealership.shortName} Admin`,
  robots: "noindex, nofollow",
};

export const dynamic = "force-dynamic";

/**
 * The date is formatted here rather than in the client component on purpose.
 * `toLocaleDateString` reads the timezone of whatever is running it, so the
 * server and the browser can disagree about which day it is and React reports
 * that as a hydration mismatch. A string decided once travels safely.
 */
function recordedLabel(updatedAt: string | null): string | null {
  if (!updatedAt) return null;
  const when = new Date(updatedAt);
  if (Number.isNaN(when.getTime())) return null;
  return `Recorded ${when.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}.`;
}

export default async function AdminAccountSignaturePage() {
  const access = await getCurrentAdminAccess();
  if (!access.user) redirect("/admin/login");

  // Two reads of the same row, and the second one is worth it: getStaffSignature
  // is the single answer to "what is this person's signature", and whoever draws
  // it onto a document calls the same function. A second spelling of that query
  // here is how the two quietly drift apart.
  const signature = await getStaffSignature();

  return (
    <AdminShell size="narrow">
      <AdminPageHeader
        title="Your Signature"
        subtitle="Draw it once here and the desk reuses it, so a deal never stops to ask you to sign the same name again."
      />
      <StaffSignatureClient
        canSign={access.member?.can_sign_contracts === true}
        canOpenTeam={roleOpensAdminRoute(access.role, "/admin/dealership/team")}
        name={signature.name}
        recordedLabel={recordedLabel(signature.updatedAt)}
        signature={signature.dataUrl}
      />
    </AdminShell>
  );
}
