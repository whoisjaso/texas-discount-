import { redirect } from "next/navigation";
import { TEAM_SCREEN } from "@/lib/admin/workspace";

export const dynamic = "force-dynamic";

/**
 * /admin/team is where the owner-alert email for an access request points
 * (team-access.ts) and what every team action revalidates; the screen itself
 * is /admin/dealership/team (workspace.ts's alias). Both routes are
 * team:manage (route-permissions.ts), so the redirect opens nothing the
 * screen would not.
 */
export default function TeamAliasPage() {
  redirect(TEAM_SCREEN);
}
