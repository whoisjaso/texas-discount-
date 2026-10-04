import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminRouteVerdict, roleOpensAdminRoute } from "@/lib/admin/route-permissions";
import { getCanonicalWorkspaceRoute, TEAM_SCREEN } from "@/lib/admin/workspace";
import { TEAM_ROLES } from "@/lib/operations/team";

/**
 * The team screen existed only as names: route-permissions.ts opened
 * /admin/team and /admin/dealership/team to team:manage, workspace.ts mapped
 * one to the other, the owner-alert email for an access request linked to
 * /admin/team, the signature page's "Open Team Access" pointed at
 * /admin/dealership/team, and none of those routes had a page. An owner could
 * not approve anyone from the desk, so a new salesperson's onboarding could
 * not start (SOP "First sign-in: onboarding", items 1 and 7).
 */

const sent = vi.hoisted(() => ({ emails: [] as Array<Record<string, unknown>> }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));
vi.mock("@/lib/auth/local-admin", () => ({ isLocalAdminPreviewEnabled: () => false }));
vi.mock("@/lib/auth/code-store", () => ({ issueCode: vi.fn(), verifyCode: async () => ({ ok: true }) }));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async (message: Record<string, unknown>) => {
    sent.emails.push(message);
    return { state: "accepted" };
  },
  recipientFingerprint: () => "fingerprint",
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: "new-member" }, error: null }) }) }),
    }),
  }),
}));

import { requestTeamAccessAction } from "@/lib/actions/team-access";
import TeamAliasPage from "@/app/admin/team/page";
import StaffSignatureClient from "@/app/admin/account/signature/StaffSignatureClient";

/** The file that serves an admin path, if there is one. */
function pageFor(path: string): string {
  return `src/app${path}/page.tsx`;
}

describe("who opens the team screen", () => {
  it.each([TEAM_SCREEN, "/admin/team"])("%s opens for the Owner and the Manager, and for no other role", (path) => {
    expect(getAdminRouteVerdict(path)).toEqual({ kind: "allow", anyOf: ["team:manage"] });
    for (const role of TEAM_ROLES) {
      expect(roleOpensAdminRoute(role, path), role).toBe(role === "owner" || role === "manager");
    }
    expect(roleOpensAdminRoute(null, path)).toBe(false);
  });

  it("is a real page at /admin/dealership/team, and /admin/team is one that sends there", () => {
    expect(TEAM_SCREEN).toBe("/admin/dealership/team");
    expect(existsSync(pageFor(TEAM_SCREEN))).toBe(true);
    expect(existsSync(pageFor("/admin/team"))).toBe(true);
    expect(() => TeamAliasPage()).toThrow(`REDIRECT:${TEAM_SCREEN}`);
    expect(getCanonicalWorkspaceRoute("/admin/team", "dealership")).toBe(TEAM_SCREEN);
  });

  it("checks team:manage on the page itself, not only in the route table", () => {
    const page = readFileSync(pageFor(TEAM_SCREEN), "utf8");
    expect(page).toMatch(/if \(!hasTeamPermission\(access\.role, "team:manage"\)\) redirect\(/);
  });
});

describe("every link to the team lands on it", () => {
  beforeEach(() => {
    sent.emails = [];
    vi.stubEnv("TEAM_ACCESS_NOTIFY_EMAIL", "owner@example.test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://desk.example.test");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("the owner-alert email for an access request links to a page that resolves to the screen", async () => {
    const data = new FormData();
    data.set("full_name", "Diego Ramirez");
    data.set("email", "diego@example.test");
    data.set("requested_role", "sales");
    data.set("verification_code", "123456");
    expect((await requestTeamAccessAction({ ok: false }, data)).ok).toBe(true);

    const alert = sent.emails.find((message) => message.template === "ownerAlert");
    expect(alert).toBeTruthy();
    const body = `${alert!.html ?? ""} ${alert!.text ?? ""}`;
    const link = body.match(/https:\/\/desk\.example\.test(\/admin\/[a-z/-]+)/);
    expect(link?.[1]).toBe("/admin/team");
    const path = link![1];
    expect(existsSync(pageFor(path))).toBe(true);
    expect(roleOpensAdminRoute("owner", path)).toBe(true);
    expect(() => TeamAliasPage()).toThrow(`REDIRECT:${TEAM_SCREEN}`);
  });

  it("the signature page's Open Team Access points at the screen, for a reader the route opens for", () => {
    const html = renderToStaticMarkup(
      createElement(StaffSignatureClient, {
        canSign: false,
        canOpenTeam: true,
        name: "",
        recordedLabel: null,
        signature: null,
      }),
    );
    expect(html).toContain(`href="${TEAM_SCREEN}"`);
    expect(html).toContain("Open Team Access");
    expect(existsSync(pageFor(TEAM_SCREEN))).toBe(true);

    const page = readFileSync("src/app/admin/account/signature/page.tsx", "utf8");
    expect(page).toContain("canOpenTeam={roleOpensAdminRoute(access.role, TEAM_SCREEN)}");
  });

  it("lists Team in the sidebar and the phone's More sheet, beside Your Fees, for the roles the route opens", () => {
    const sidebar = readFileSync("src/components/admin/AdminSidebar.tsx", "utf8");
    const secondary = sidebar.slice(sidebar.indexOf("const SECONDARY"), sidebar.indexOf("const ACCOUNT"));
    expect(secondary).toContain('{ label: "Your Fees", href: "/admin/dealership/fees", icon: Receipt }');
    expect(secondary).toContain('{ label: "Team", href: TEAM_SCREEN, icon: UsersThree }');
    // The same deny-by-default table filters the list (owner and manager).
    expect(sidebar).toContain("const secondary = SECONDARY.filter(allowed);");
    expect(sidebar).toContain("[...primary.slice(4), ...secondary]");
  });

  it("every team action revalidates the screen itself, not only the alias", () => {
    const actions = readFileSync("src/lib/actions/team-access.ts", "utf8");
    const revalidate = actions.slice(actions.indexOf("function revalidateTeam()"));
    expect(revalidate).toMatch(/revalidatePath\("\/admin\/team"\);\s*revalidatePath\("\/admin\/dealership\/team"\);/);
    expect(actions.match(/revalidatePath\("\/admin\/team"\)/g)).toHaveLength(1);
  });
});
