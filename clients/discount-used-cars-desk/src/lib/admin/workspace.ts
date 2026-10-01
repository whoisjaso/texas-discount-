/**
 * Admin workspace model.
 *
 * Triple J no longer rents vehicles, so there is exactly one workspace. The
 * type is kept (rather than deleted outright) so the surrounding shell, cookie,
 * and permission plumbing stay intact and a second workspace could return
 * without another refactor — but nothing in the UI asks the operator to choose
 * one any more. Signing in lands straight on the dealership desk.
 */

export type AdminWorkspace = "dealership";

/**
 * The only workspace there is.
 *
 * Named so the shell can fall back to it instead of asking. A browser with no
 * stored workspace has not "failed to choose": there is nothing to choose, so
 * the answer is this one.
 */
export const SOLE_ADMIN_WORKSPACE: AdminWorkspace = "dealership";

export const ADMIN_WORKSPACE_STORAGE_KEY = "vegas.admin.workspace";
export const ADMIN_WORKSPACE_COOKIE = "vegas-admin-workspace";

export const DEALERSHIP_HOME = "/admin/sales";

export const WORKSPACE_DASHBOARDS: Record<AdminWorkspace, string> = {
  dealership: DEALERSHIP_HOME,
};

export const WORKSPACE_LABELS: Record<AdminWorkspace, string> = {
  dealership: "Dealership",
};

const DEALERSHIP_PREFIXES = [
  "/admin/auction-intake",
  "/admin/dealership",
  "/admin/documents",
  "/admin/leads",
  "/admin/marketplace",
  "/admin/inventory",
  "/admin/fleet-census",
  "/admin/paperwork",
  "/admin/pipeline",
  "/admin/sales",
  "/admin/templates",
];

export function isAdminWorkspace(value: unknown): value is AdminWorkspace {
  return value === "dealership";
}

export function resolveAdminLandingWorkspace(
  allowedWorkspaces: AdminWorkspace[],
  preferredWorkspace: unknown,
): AdminWorkspace | null {
  if (allowedWorkspaces.length === 0) return null;
  if (
    isAdminWorkspace(preferredWorkspace) &&
    allowedWorkspaces.includes(preferredWorkspace)
  ) {
    return preferredWorkspace;
  }
  // Only one workspace exists, so there is never a choice to present.
  return allowedWorkspaces[0];
}

export function cleanAdminPath(pathname: string): string {
  return pathname.split("?")[0] || "/admin";
}

export function getWorkspaceFromPath(pathname: string): AdminWorkspace | null {
  const cleanPath = cleanAdminPath(pathname);
  if (cleanPath === "/admin") return null;
  if (
    DEALERSHIP_PREFIXES.some(
      (prefix) => cleanPath === prefix || cleanPath.startsWith(`${prefix}/`),
    )
  ) {
    return "dealership";
  }
  return null;
}

/**
 * Short admin aliases resolve to their dealership route.
 */
export function getCanonicalWorkspaceRoute(
  pathname: string,
  workspace: AdminWorkspace,
): string | null {
  const cleanPath = cleanAdminPath(pathname);
  const aliases: Record<string, Record<AdminWorkspace, string>> = {
    "/admin/payments": { dealership: "/admin/dealership/payments" },
    "/admin/payments/stripe": {
      dealership: "/admin/dealership/payments/stripe",
    },
    "/admin/documents": { dealership: "/admin/dealership/documents" },
    "/admin/documents/archive": {
      dealership: "/admin/dealership/documents/archive",
    },
    "/admin/agreements": { dealership: "/admin/dealership/agreements" },
    "/admin/analytics": { dealership: "/admin/dealership/analytics" },
    "/admin/automation": { dealership: "/admin/dealership/automation" },
    "/admin/team": { dealership: "/admin/dealership/team" },
    "/admin/customers": { dealership: "/admin/dealership/customers" },
    "/admin/fleet-census": { dealership: "/admin/dealership/fleet-census" },
  };

  return aliases[cleanPath]?.[workspace] ?? null;
}
