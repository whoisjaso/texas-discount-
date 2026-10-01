import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminChrome from "@/components/admin/AdminChrome";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { roleOpensAdminRoute } from "@/lib/admin/route-permissions";
import { getWorkspaceFromPath } from "@/lib/admin/workspace";
import { toTitleCaseDisplay } from "@/lib/display/title-case";
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

function AccessDenied() {
  return (
    <section className="px-4 py-8 md:px-8 md:py-10">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[color:var(--tj-line)] bg-[color:var(--tj-surface)] p-5 md:p-8">
        <p className="tj-ui-label text-[11px] font-semibold text-[color:var(--tj-copper)]">
          Permission Needed
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-[color:var(--tj-ink)] md:text-3xl">
          {toTitleCaseDisplay("This screen is not assigned to this role.")}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-[color:var(--tj-muted)]">
          {toTitleCaseDisplay(
            "Ask an owner to approve the account or change the role. The dashboard will only show the tools this person is allowed to use.",
          )}
        </p>
      </div>
    </section>
  );
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
