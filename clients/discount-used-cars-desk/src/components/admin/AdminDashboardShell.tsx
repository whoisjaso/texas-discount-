"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminClickSound from "@/components/admin/AdminClickSound";
import { getWorkspaceFromPath } from "@/lib/admin/workspace";
import type { TeamRole } from "@/lib/operations/team";
import type { TeamMember } from "@/lib/operations/types";

export default function AdminDashboardShell({
  children,
  currentMember,
  currentRole,
  currentUserEmail,
  currentUserName,
}: {
  children: ReactNode;
  currentMember?: TeamMember | null;
  currentRole: TeamRole | null;
  currentUserEmail?: string | null;
  currentUserName?: string | null;
}) {
  const pathname = usePathname();

  if (
    pathname === "/admin" ||
    pathname === "/admin/account/password" ||
    pathname === "/admin/account/onboarding"
  ) {
    return (
      <>
        <AdminClickSound />
        {children}
      </>
    );
  }

  const workspace = getWorkspaceFromPath(pathname);

  return (
    <div className="ed-workspace min-h-screen bg-[color:var(--tj-warm-white)] md:min-h-screen max-md:min-h-dvh max-md:pb-24">
      <a className="ed-admin-skip" href="#admin-content">Skip To Content</a>
      <Suspense fallback={null}>
        <AdminSidebar
          currentMember={currentMember}
          currentRole={currentRole}
          currentUserEmail={currentUserEmail}
          currentUserName={currentUserName}
          workspace={workspace}
        />
      </Suspense>
      <AdminClickSound />
      {/* AdminRoutePulse used to render here. Removed: it duplicated every
          page's own header and actions with English-only chrome. */}
      <main id="admin-content" tabIndex={-1} className="ed-workspace-main min-h-screen w-full md:pl-[264px] md:pb-0 max-md:min-h-0">
        {children}
      </main>
    </div>
  );
}
