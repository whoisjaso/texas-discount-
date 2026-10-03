import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  member: null as null | { id: string; auth_user_id: string; status: string; role: string },
  error: null as null | { code: string },
}));
vi.mock("@/lib/auth/local-admin", () => ({ isLocalAdminPreviewEnabled: () => false }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: {
    id: "staff-1", email: "staff@example.test", app_metadata: { access_status: "active", desk_role: "manager" },
  } } }) } }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: state.member, error: state.error }),
  }) }) }) }),
}));
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAIL", "owner@example.test");
  state.member = { id: "member-1", auth_user_id: "staff-1", status: "active", role: "sales" };
  state.error = null;
});
afterEach(() => vi.unstubAllEnvs());

describe("the staff roster is authoritative", () => {
  it("uses the current roster role rather than older Auth metadata", async () => {
    expect((await getCurrentAdminAccess()).role).toBe("sales");
  });
  it.each(["pending", "inactive"])("denies a %s member despite active Auth metadata", async status => {
    state.member!.status = status;
    expect((await getCurrentAdminAccess()).role).toBeNull();
  });
  it("fails closed when the roster cannot be checked", async () => {
    state.member = null;
    state.error = { code: "08006" };
    expect((await getCurrentAdminAccess()).role).toBeNull();
  });
  it("retains the explicit Auth-only migration fallback when the table is absent", async () => {
    state.member = null;
    state.error = { code: "PGRST205" };
    expect((await getCurrentAdminAccess()).role).toBe("manager");
  });
});
