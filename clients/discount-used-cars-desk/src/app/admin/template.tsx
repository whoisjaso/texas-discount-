import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { getAdminRouteVerdict, roleOpensAdminRoute } from "@/lib/admin/route-permissions";

/**
 * The permission check that actually runs on every navigation.
 *
 * The layout checks the route once, on a hard load, and never again: a
 * layout does not re-render on client navigation, so a person who landed on
 * a screen their role opens could then walk anywhere the nav took them and
 * the frozen check never looked up. A template re-renders on EVERY
 * navigation — that is the whole reason this file exists.
 *
 * Deny-by-default: a path the route table does not know is refused, not
 * granted the one permission every role holds. The unknown-path redirect
 * goes to /admin/home rather than an error, because the person who typed a
 * stale URL needs a working screen, not a lecture.
 */
export default async function AdminTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";

  // No pathname header (some RSC fetch shapes) leaves the layout's own
  // hard-load check as the guard for that render; refusing here on missing
  // evidence would break legitimate navigations at random.
  if (!pathname.startsWith("/admin")) return <>{children}</>;

  const verdict = getAdminRouteVerdict(pathname);
  if (verdict.kind === "exempt") return <>{children}</>;

  const access = await getCurrentAdminAccess();
  if (!access.user) redirect("/admin/login");

  if (verdict.kind === "deny") redirect("/admin/home");
  if (!roleOpensAdminRoute(access.role, pathname)) redirect("/admin/home");

  return <>{children}</>;
}
