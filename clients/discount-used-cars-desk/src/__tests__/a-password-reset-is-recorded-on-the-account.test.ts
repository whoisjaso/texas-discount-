import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

/**
 * A password reset is recorded on the account (owner's decision 10/02/2026;
 * SOP Security, and "First sign-in: onboarding"), the half of "a reset signs
 * out every device" that writes. Every owner path that resets an account or
 * issues it a temporary password stamps app_metadata.password_reset_at with
 * the moment, and the activity log says so; the cutoff
 * (a-password-reset-signs-out-every-device) refuses any session that signed
 * in before it. Choose A Password accepts only a session signed in after the
 * reset, and signs the member straight back in afterwards, because the auth
 * server's admin password write ends every session, this one included.
 *
 * Kept apart from the cutoff's file because both mock the current-admin
 * module differently: there it runs for real, here it is the caller.
 */

const state = vi.hoisted(() => ({
  member: null as null | Record<string, unknown>,
  memberMissingTable: false,
  authUser: null as null | Record<string, unknown>,
  listed: [] as Array<Record<string, unknown>>,
  authWrites: [] as Array<{ id: string; attributes: Record<string, unknown> }>,
  created: [] as Array<Record<string, unknown>>,
  activity: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  access: null as null | Record<string, unknown>,
  signIns: [] as Array<{ email: string; password: string }>,
  cookiesSet: [] as Array<{ name: string; value: string }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (name: string, value: string) => {
      state.cookiesSet.push({ name, value });
    },
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async () => ({ state: "accepted" }),
  recipientFingerprint: () => "fingerprint",
}));
vi.mock("@/lib/auth/admin-device-session", () => ({
  ADMIN_DEVICE_SESSION_COOKIE: "device",
  adminDeviceSessionCookieOptions: {},
  createAdminDeviceSessionCookie: async () => "fresh-device-cookie",
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async (credentials: { email: string; password: string }) => {
        state.signIns.push(credentials);
        return { data: { user: { id: "auth-1" }, session: {} }, error: null };
      },
    },
  }),
}));

function service() {
  return {
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          maybeSingle: async () =>
            table === "team_members" && state.memberMissingTable
              ? { data: null, error: { code: "PGRST205" } }
              : { data: table === "team_members" ? state.member : null, error: null },
        };
        return chain;
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      insert: async (row: Record<string, unknown>) => {
        state.inserts.push({ table, row });
        if (table === "team_activity_events") state.activity.push(row);
        return { error: null };
      },
    }),
    auth: {
      admin: {
        updateUserById: async (id: string, attributes: Record<string, unknown>) => {
          state.authWrites.push({ id, attributes });
          return { data: { user: { id } }, error: null };
        },
        getUserById: async (id: string) => ({ data: { user: state.authUser ?? { id, app_metadata: { desk_role: "sales" } } }, error: null }),
        listUsers: async () => ({ data: { users: state.listed }, error: null }),
        createUser: async (attributes: Record<string, unknown>) => {
          state.created.push(attributes);
          return { data: { user: { id: "new-auth" } }, error: null };
        },
        generateLink: async () => ({ data: { properties: { hashed_token: "token" } }, error: null }),
      },
    },
  };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => service() }));
vi.mock("@/lib/admin/current-admin", () => ({
  requireCurrentAdminPermission: async () => ({
    ok: true,
    role: "owner",
    user: { id: "owner-auth", email: "owner@example.test" },
    member: { id: "owner-member" },
    service: service(),
  }),
  getCurrentAdminAccess: async () => state.access,
}));

import { resetTeamMemberAccessAction, reviewTeamAccessAction } from "@/lib/actions/team-access";
import { chooseOnboardingPasswordAction } from "@/lib/actions/team-onboarding";

const startedAt = () => Date.now() - 1000;

function recentIso(value: unknown, since: number): boolean {
  if (typeof value !== "string") return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms >= since && ms <= Date.now() + 1000 && new Date(ms).toISOString() === value;
}

const metadataOf = (attributes: Record<string, unknown> | undefined) =>
  (attributes?.app_metadata ?? {}) as Record<string, unknown>;

function approve() {
  const data = new FormData();
  data.set("intent", "approve");
  data.set("member_id", "member-1");
  data.set("role", "sales");
  return reviewTeamAccessAction({ ok: false }, data);
}

beforeEach(() => {
  state.member = {
    id: "member-1",
    auth_user_id: "auth-1",
    email: "staff@example.test",
    full_name: "Staff Member",
    role: "sales",
    status: "pending",
    can_sign_contracts: false,
  };
  state.memberMissingTable = false;
  state.authUser = null;
  state.listed = [];
  state.authWrites = [];
  state.created = [];
  state.activity = [];
  state.inserts = [];
  state.signIns = [];
  state.cookiesSet = [];
  state.access = null;
});

describe("every owner path that resets or re-issues a password records the moment", () => {
  it("approval of a member with an account", async () => {
    const since = startedAt();
    expect((await approve()).ok).toBe(true);
    const write = state.authWrites.find((entry) => entry.id === "auth-1");
    expect(recentIso(metadataOf(write?.attributes).password_reset_at, since)).toBe(true);
    expect(recentIso(state.activity.at(-1)?.metadata && (state.activity.at(-1)!.metadata as Record<string, unknown>).password_reset_at, since)).toBe(true);
  });

  it("approval of a member whose account is found by email", async () => {
    state.member = { ...state.member!, auth_user_id: null };
    state.listed = [{ id: "auth-by-email", email: "staff@example.test" }];
    const since = startedAt();
    expect((await approve()).ok).toBe(true);
    const write = state.authWrites.find((entry) => entry.id === "auth-by-email");
    expect(recentIso(metadataOf(write?.attributes).password_reset_at, since)).toBe(true);
  });

  it("approval of a member with no account yet", async () => {
    state.member = { ...state.member!, auth_user_id: null };
    const since = startedAt();
    expect((await approve()).ok).toBe(true);
    expect(state.created).toHaveLength(1);
    expect(recentIso(metadataOf(state.created[0]).password_reset_at, since)).toBe(true);
  });

  it("approval of an account with no roster table (the auth-only path)", async () => {
    state.memberMissingTable = true;
    state.authUser = { id: "auth-only", email: "staff@example.test", app_metadata: { access_status: "pending" }, user_metadata: { full_name: "Staff Member" } };
    const since = startedAt();
    expect((await approve()).ok).toBe(true);
    const write = state.authWrites.find((entry) => entry.id === "auth-only");
    expect(recentIso(metadataOf(write?.attributes).password_reset_at, since)).toBe(true);
    expect(recentIso((state.activity.at(-1)?.metadata as Record<string, unknown>).password_reset_at, since)).toBe(true);
  });

  it("a reset of an active member with an account", async () => {
    state.member = { ...state.member!, status: "active" };
    state.authUser = { id: "auth-1", email: "staff@example.test", app_metadata: { desk_role: "sales", access_status: "active" }, user_metadata: {} };
    const since = startedAt();
    const data = new FormData();
    data.set("member_id", "member-1");
    expect((await resetTeamMemberAccessAction({ ok: false }, data)).ok).toBe(true);
    const write = state.authWrites.find((entry) => entry.id === "auth-1");
    expect(recentIso(metadataOf(write?.attributes).password_reset_at, since)).toBe(true);
    // Every other key of the account is kept.
    expect(metadataOf(write?.attributes)).toMatchObject({ access_status: "active", desk_role: "sales", requires_password_change: true });
    expect(recentIso((state.activity.at(-1)?.metadata as Record<string, unknown>).password_reset_at, since)).toBe(true);
  });

  it("a reset of an active member with no account yet", async () => {
    state.member = { ...state.member!, status: "active", auth_user_id: null };
    const since = startedAt();
    const data = new FormData();
    data.set("member_id", "member-1");
    expect((await resetTeamMemberAccessAction({ ok: false }, data)).ok).toBe(true);
    expect(state.created).toHaveLength(1);
    expect(recentIso(metadataOf(state.created[0]).password_reset_at, since)).toBe(true);
  });

  it("is never a denial", async () => {
    const data = new FormData();
    data.set("intent", "deny");
    data.set("member_id", "member-1");
    data.set("role", "sales");
    expect((await reviewTeamAccessAction({ ok: false }, data)).ok).toBe(true);
    for (const write of state.authWrites) expect(metadataOf(write.attributes)).not.toHaveProperty("password_reset_at");
  });
});

describe("Choose A Password", () => {
  const TEMPORARY = {
    id: "auth-1",
    email: "maria@example.test",
    app_metadata: { access_status: "active", desk_role: "sales", requires_password_change: true, password_reset_at: new Date().toISOString() },
  };
  const member = { id: "member-1", auth_user_id: "auth-1", full_name: "", status: "active", role: "sales", can_sign_contracts: false };
  const passwords = (password: string) => {
    const data = new FormData();
    data.set("password", password);
    data.set("confirmPassword", password);
    return data;
  };

  it("refuses a device that signed in before the reset, and writes nothing", async () => {
    state.access = { user: null, member: null, role: null, service: null, isConfiguredOwner: false, signedOut: "passwordReset" };
    const result = await chooseOnboardingPasswordAction(passwords("a new one of mine"));
    expect(result).toMatchObject({ ok: false, code: "signedInBeforeReset" });
    expect(state.authWrites).toEqual([]);
    expect(state.signIns).toEqual([]);
    expect(en.funnel.onboarding.errors.signedInBeforeReset).toMatch(/signed in before the password was reset/);
    expect(es.funnel.onboarding.errors.signedInBeforeReset).toBeTruthy();
  });

  it("saves the password exactly as before, then signs the member back in on this device", async () => {
    state.access = { user: TEMPORARY, member, role: "sales" };
    const result = await chooseOnboardingPasswordAction(passwords("a new one of mine"));
    expect(result).toEqual({ ok: true });
    expect(state.authWrites).toEqual([
      { id: "auth-1", attributes: { password: "a new one of mine", app_metadata: { requires_password_change: false } } },
    ]);
    expect(state.inserts).toHaveLength(1);
    expect(state.signIns).toEqual([{ email: "maria@example.test", password: "a new one of mine" }]);
    // A device cookie dated now: after the reset, so the cutoff lets it in.
    expect(state.cookiesSet).toEqual([{ name: "device", value: "fresh-device-cookie" }]);
  });
});
