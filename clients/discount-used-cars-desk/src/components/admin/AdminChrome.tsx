"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AdminDashboardShell from "@/components/admin/AdminDashboardShell";
import { AdminWorkspaceProvider } from "@/components/admin/AdminWorkspaceProvider";
import SaleFlowRail from "@/components/admin/SaleFlowRail";
import { isSaleFlowPath } from "@/lib/admin/sale-flow-path";
import type { AdminWorkspace } from "@/lib/admin/workspace";
import type { TeamRole } from "@/lib/operations/team";
import type { TeamMember } from "@/lib/operations/types";

/**
 * Which chrome frames the screen, decided where navigation actually happens.
 *
 * The layout used to make this call on the server, from an x-pathname header.
 * That is only right on a hard load: App Router layouts do not re-render on
 * client navigation, so walking from the desk into /admin/sales/new kept the
 * dashboard shell, bottom tab bar and all, and the bar sat on top of the
 * camera while somebody tried to photograph a licence. A hard reload fixed it,
 * which is exactly why it kept passing desktop checks.
 *
 * This component reads the live pathname instead, so the corridor loses the
 * furniture the moment the operator steps into it and gets it back the moment
 * they leave. Everything server-derived still arrives from the layout as
 * props. Nothing is fetched here; this component only chooses the frame.
 */
export default function AdminChrome({
  workspace,
  currentMember,
  currentRole,
  currentUserEmail,
  currentUserName,
  denied,
  children,
}: {
  workspace: AdminWorkspace | null;
  currentMember?: TeamMember | null;
  currentRole: TeamRole | null;
  currentUserEmail?: string | null;
  currentUserName?: string | null;
  /**
   * The refusal screen, when the served pathname is not allowed for this
   * role. Rendered by the layout, because the permission verdict belongs to
   * the pathname the server actually answered.
   */
  denied?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  // Standalone paperwork shares the focused question layout, with its own
  // way back to Templates. It never enters the sale corridor or its state.
  if (/^\/admin\/templates\/[^/]+\/?$/.test(pathname)) {
    return <>{denied ?? children}</>;
  }

  // The sale runs one decision to a screen. It drops the rail and the bottom
  // bar on purpose: while a sale is being written there is nothing else to
  // click, so there is nothing else to be distracted by.
  if (isSaleFlowPath(pathname)) {
    return denied ? (
      <>{denied}</>
    ) : (
      <>
        <SaleFlowRail />
        {children}
      </>
    );
  }

  return (
    <AdminWorkspaceProvider routeWorkspace={workspace}>
      <AdminDashboardShell
        currentMember={currentMember}
        currentRole={currentRole}
        currentUserEmail={currentUserEmail}
        currentUserName={currentUserName}
      >
        {denied ?? children}
      </AdminDashboardShell>
    </AdminWorkspaceProvider>
  );
}
