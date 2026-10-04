import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The preview mock holds a team (src/lib/supabase/mock.ts PREVIEW_TEAM) so the
 * team screen can be walked under `next dev`: three access requests, five
 * members, one with no access. An approval there creates an account the mock
 * holds, and signing in on the preview form with that address signs in as
 * that member, so a walk meets Choose A Password as the person approved
 * (SOP "First sign-in: onboarding", items 8 and 9). None of it reaches
 * production: the service client is the real one whenever preview is off,
 * and preview is always off when NODE_ENV is production.
 */

const session = vi.hoisted(() => ({ cookie: "owner:owner@example.test" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "tj-local-admin-preview"
        ? { value: session.cookie }
        : name === "tj-local-admin-signed-in"
          ? { value: String(Date.now() + 1000) }
          : undefined,
    set: () => {},
    delete: () => {},
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { getTeamRoster } from "@/lib/admin/team-roster";
import { reviewTeamAccessAction } from "@/lib/actions/team-access";
import { destinationAfterSignIn } from "@/lib/auth/destination";
import { isLocalAdminPreviewEnabled } from "@/lib/auth/local-admin";
import { createServiceClient } from "@/lib/supabase/service";
import { mockEndedSessions, resetMockWrites } from "@/lib/supabase/mock";

beforeEach(() => {
  vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
  vi.stubEnv("DESK_PREVIEW_MEMBER", "");
  resetMockWrites();
  session.cookie = "owner:owner@example.test";
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("the preview team", () => {
  it("gives the screen requests, members and people with no access to act on", async () => {
    const roster = await getTeamRoster(await getCurrentAdminAccess());
    expect(roster.ok).toBe(true);
    expect(roster.requests.map((entry) => entry.name)).toEqual(["Diego Ramirez", "Ashley Nguyen", "Kevin Brooks"]);
    expect(roster.members.map((entry) => entry.name)).toEqual(["Brenda Ortiz", "Carlos Mendez", "Jason Price", "Maria Lopez", "Tyler Grant"]);
    expect(roster.removed.map((entry) => entry.name)).toEqual(["Rob Hayes"]);
    expect(roster.activeOwners).toBe(1);
    expect(roster.members.find((entry) => entry.name === "Tyler Grant")!.onboardingFinished).toBe(false);
    for (const entry of [...roster.requests, ...roster.members, ...roster.removed]) {
      expect(entry.email, entry.name).toMatch(/@example\.test$/);
    }
  });

  it("is not the preview session's own roster row, so preview without the flag is what it was", async () => {
    const access = await getCurrentAdminAccess();
    expect(access.user!.id).toBe("local-admin-preview");
    expect(access.member).toBeNull();
    expect(access.role).toBe("owner");
  });
});

describe("signing in as the person an approval let in", () => {
  it("is that member, on their new account, sent to Choose A Password", async () => {
    const data = new FormData();
    data.set("intent", "approve");
    data.set("member_id", "preview-request-1");
    data.set("role", "sales");
    const approved = await reviewTeamAccessAction({ ok: false }, data);
    expect(approved.ok, approved.error).toBe(true);
    expect(approved.temporaryPassword).toMatch(/^VG-/);

    session.cookie = "diego.ramirez@example.test";
    const access = await getCurrentAdminAccess();
    expect(access.user!.id).toMatch(/^preview-auth-/);
    expect(access.role).toBe("sales");
    expect(access.member).toMatchObject({ id: "preview-request-1", status: "active", can_sign_contracts: false });
    expect(access.user!.app_metadata).toMatchObject({ requires_password_change: true, desk_role: "sales" });
    // The approval stamped the reset and ended the account's older sessions.
    expect(typeof access.user!.app_metadata.password_reset_at).toBe("string");
    expect(mockEndedSessions().map((entry) => entry.userId)).toEqual([access.user!.id]);
    expect(await destinationAfterSignIn()).toBe("/admin/account/onboarding");
  });

  it("gives a member whose access was removed no role", async () => {
    session.cookie = "rob.hayes@example.test";
    const access = await getCurrentAdminAccess();
    expect(access.member).toMatchObject({ id: "preview-team-former", status: "inactive" });
    expect(access.role).toBeNull();
  });
});

describe("production", () => {
  it("never has preview on, so the service client is never the mock", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    expect(isLocalAdminPreviewEnabled()).toBe(false);
    const client = createServiceClient() as unknown as Record<string, unknown>;
    // supabase-js's own client, with its REST and realtime halves; the mock has neither.
    expect(client).toHaveProperty("rest");
    expect(client).toHaveProperty("realtime");
  });

  it("reaches the mock from the team code only behind the preview switch", () => {
    const actions = readFileSync("src/lib/actions/team-access.ts", "utf8");
    expect(actions).toContain("if (access.ok || !isLocalAdminPreviewEnabled()) return access;");
    const roster = readFileSync("src/lib/admin/team-roster.ts", "utf8");
    expect(roster).toContain("if (!service && isLocalAdminPreviewEnabled()) service = createServiceClient();");
    const current = readFileSync("src/lib/admin/current-admin.ts", "utf8");
    const preview = current.slice(current.indexOf("if (isLocalAdminPreviewEnabled()) {"));
    expect(preview.indexOf("previewRosterAccount(built)")).toBeGreaterThan(0);
    expect(preview.indexOf("previewRosterAccount(built)")).toBeLessThan(preview.indexOf("const authClient = await createClient();"));
  });
});
