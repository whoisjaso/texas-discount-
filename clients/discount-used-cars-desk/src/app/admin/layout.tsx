import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminChrome from "@/components/admin/AdminChrome";
import AccessDenied from "@/components/admin/AccessDenied";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { roleOpensAdminRoute } from "@/lib/admin/route-permissions";
import { getWorkspaceFromPath } from "@/lib/admin/workspace";
import { brand } from "@/lib/dealership-config";
import "@/styles/admin-refinement.css";

export const metadata: Metadata = {
  title: `Admin | ${brand.full}`,
  robots: "noindex, nofollow",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f5f0",
};

/** The name the auth account carries, for a rail whose member row has none. */
function metadataName(metadata: Record<string, unknown> | undefined): string | null {
  for (const key of ["display_name", "full_name", "name"]) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";
  const isAuthScreen =
    pathname === "/admin/login" ||
    pathname === "/admin/signup" ||
    // The locked-out have no session to gate: the recovery page is an auth
    // screen by definition, and its own token is its gate.
    pathname === "/admin/recover";

  if (isAuthScreen) {
    return (
      <div className="tj-admin min-h-screen bg-[color:var(--tj-warm-white)]">
        {children}
      </div>
    );
  }

  const access = await getCurrentAdminAccess();
  // A device signed in before the account's password reset is signed out,
  // and told why (owner's decision 10/02/2026).
  if (access.signedOut === "passwordReset") {
    redirect("/admin/login?notice=signed-out-reset");
  }
  if (!access.user) {
    redirect("/admin/login");
  }

  const currentRole = access.role;
  const requiresPasswordChange =
    access.user?.app_metadata?.requires_password_change === true;
  const isOnboardingScreen =
    pathname === "/admin/account/onboarding" || pathname === "/admin/account/password";
  const memberHasOnboardingField =
    !!access.member &&
    Object.prototype.hasOwnProperty.call(access.member, "onboarding_completed_at");
  const needsProfileOnboarding =
    !!access.member &&
    access.member.status === "active" &&
    memberHasOnboardingField &&
    !access.member.onboarding_completed_at;

  if ((requiresPasswordChange || needsProfileOnboarding) && !isOnboardingScreen) {
    redirect("/admin/account/onboarding");
  }

  // Deny-by-default, any-of predicates. The per-navigation twin of this
  // check lives in template.tsx — a layout renders once per hard load and
  // never re-runs on client navigation, which is exactly when a role
  // boundary needs re-checking.
  const canViewRoute = roleOpensAdminRoute(currentRole, pathname);
  const workspace = getWorkspaceFromPath(pathname);

  /*
    Which chrome frames the screen is not decided here any more.

    This layout renders once, on a hard load, from an x-pathname header, and
    never again on client navigation. Deciding the frame from that frozen
    pathname is how the bottom tab bar stayed on screen inside the sale
    corridor, sitting on top of the camera. AdminChrome makes the same call
    from the live pathname via usePathname, using isSaleFlowPath from
    "@/lib/admin/sale-flow-path", so it tracks every navigation.

    What is still the server's to decide stays here: auth, onboarding
    redirects, the shell's data, and whether the pathname it actually served is
    allowed for this role.
  */
  return (
    <div className="tj-admin">
      <AdminChrome
        workspace={workspace}
        currentMember={access.member}
        currentRole={currentRole}
        currentUserEmail={access.user.email ?? null}
        currentUserName={metadataName(access.user.user_metadata)}
        denied={canViewRoute ? undefined : <AccessDenied />}
      >
        {children}
      </AdminChrome>
    </div>
  );
}
