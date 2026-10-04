import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSignsByDefault, type TeamRole } from "@/lib/operations/team";

/**
 * Every approval issues a temporary password, shown once on the team screen
 * (SOP "First sign-in: onboarding", item 1). An approval only ever reaches a
 * person without access (a request, or No Access), and an account that
 * already exists for their address may carry a password somebody else knows:
 * one registered for the address before the person asked (Supabase's public
 * sign-up), or the one an owner removed access over. So the approval replaces
 * it, as it creates one for an address with no account. A reset (an active
 * member) never replaces a password: overwriting a working credential is how
 * a failed email once locked a member out; it creates one only for a member
 * with no account. Either way the account is flagged for Choose A Password,
 * stamped with password_reset_at, its older sessions ended, and given the
 * role's default clearance (an owner's approval) or the person's own (a
 * reset). An approval or a reset whose history line cannot be written says
 * so.
 */

const state = vi.hoisted(() => ({
  member: null as null | Record<string, unknown>,
  listed: [] as Array<Record<string, unknown>>,
  memberWrites: [] as Array<Record<string, unknown>>,
  authWrites: [] as Array<{ id: string; attributes: Record<string, unknown> }>,
  created: [] as Array<Record<string, unknown>>,
  ended: [] as Array<Record<string, unknown>>,
  logFails: false,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async () => ({ state: "accepted" }),
  recipientFingerprint: () => "fingerprint",
}));

function service() {
  return {
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          maybeSingle: async () => ({ data: table === "team_members" ? state.member : null, error: null }),
        };
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        if (table === "team_members") state.memberWrites.push(payload);
        return { eq: async () => ({ error: null }) };
      },
      insert: async () => (table === "team_activity_events" && state.logFails ? { error: { message: "insert refused" } } : { error: null }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "end_sessions_before") state.ended.push(args);
      return { data: null, error: null };
    },
    auth: {
      admin: {
        updateUserById: async (id: string, attributes: Record<string, unknown>) => {
          state.authWrites.push({ id, attributes });
          return { data: { user: { id } }, error: null };
        },
        getUserById: async (id: string) => ({
          data: { user: { id, email: "staff@example.test", app_metadata: { desk_role: "sales", access_status: "active" }, user_metadata: {} } },
          error: null,
        }),
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
    member: { id: "owner-member", full_name: "Maria Lopez" },
    service: service(),
  }),
}));

import { resetTeamMemberAccessAction, reviewTeamAccessAction } from "@/lib/actions/team-access";

function approve(role: TeamRole) {
  const data = new FormData();
  data.set("intent", "approve");
  data.set("member_id", "member-1");
  data.set("role", role);
  return reviewTeamAccessAction({ ok: false }, data);
}

function reset() {
  const data = new FormData();
  data.set("member_id", "member-1");
  return resetTeamMemberAccessAction({ ok: false }, data);
}

const metadata = (attributes: Record<string, unknown> | undefined) => (attributes?.app_metadata ?? {}) as Record<string, unknown>;

function recent(value: unknown, since: number): boolean {
  return typeof value === "string" && Date.parse(value) >= since && Date.parse(value) <= Date.now() + 1000;
}

beforeEach(() => {
  state.member = {
    id: "member-1",
    auth_user_id: null,
    email: "staff@example.test",
    full_name: "Diego Ramirez",
    role: "sales",
    status: "pending",
    can_sign_contracts: false,
  };
  state.listed = [];
  state.memberWrites = [];
  state.authWrites = [];
  state.created = [];
  state.ended = [];
  state.logFails = false;
});

describe("approving a request with no account yet", () => {
  it.each(["sales", "registration", "manager", "finance", "owner"] as TeamRole[])(
    "creates the account with a temporary password, shown once, as %s with the role's default clearance",
    async (role) => {
      const since = Date.now() - 1000;
      const result = await approve(role);
      expect(result.ok, result.error).toBe(true);
      expect(state.created).toHaveLength(1);
      const created = state.created[0];
      expect(typeof created.password).toBe("string");
      expect(result.temporaryPassword).toBe(created.password);
      expect(metadata(created)).toMatchObject({
        access_status: "active",
        desk_role: role,
        requires_password_change: true,
        can_sign_contracts: roleSignsByDefault(role),
      });
      expect(recent(metadata(created).password_reset_at, since)).toBe(true);
      const roster = state.memberWrites.find((write) => "can_sign_contracts" in write)!;
      expect(roster).toMatchObject({ auth_user_id: "new-auth", role, status: "active", can_sign_contracts: roleSignsByDefault(role) });
      expect(state.ended).toEqual([{ p_user: "new-auth", p_at: metadata(created).password_reset_at }]);
    },
  );
});

describe("approving a person whose account already exists", () => {
  it.each([
    ["linked on the roster row", () => ({ ...state.member!, auth_user_id: "auth-1", status: "inactive" }), "auth-1"],
    ["found by email", () => ({ ...state.member! }), "auth-by-email"],
  ] as const)("replaces its password with a temporary one, shown once (%s), and flags, stamps and clears by role", async (_how, member, id) => {
    state.member = member();
    state.listed = [{ id: "auth-by-email", email: "staff@example.test" }];
    const since = Date.now() - 1000;
    const result = await approve("registration");
    expect(result.ok, result.error).toBe(true);
    expect(state.created).toEqual([]);
    const write = state.authWrites.find((entry) => entry.id === id)!;
    expect(typeof write.attributes.password).toBe("string");
    expect(result.temporaryPassword).toBe(write.attributes.password);
    expect(metadata(write.attributes)).toMatchObject({ requires_password_change: true, can_sign_contracts: true, desk_role: "registration" });
    expect(recent(metadata(write.attributes).password_reset_at, since)).toBe(true);
    expect(state.ended).toEqual([{ p_user: id, p_at: metadata(write.attributes).password_reset_at }]);
    expect(result.message).toMatch(/old password no longer works/);
    expect(result.message).not.toMatch(/keeps the password/);
  });

  it("never issues the same temporary password twice", async () => {
    state.member = { ...state.member!, auth_user_id: "auth-1", status: "inactive" };
    const first = (await approve("sales")).temporaryPassword;
    const second = (await approve("sales")).temporaryPassword;
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });
});

describe("resetting an active member", () => {
  it.each([true, false])("never changes an existing password, sets the flag, stamps the time and keeps clearance %s", async (cleared) => {
    state.member = { ...state.member!, auth_user_id: "auth-1", status: "active", role: "registration", can_sign_contracts: cleared };
    const since = Date.now() - 1000;
    const result = await reset();
    expect(result.ok, result.error).toBe(true);
    expect(result).not.toHaveProperty("temporaryPassword");
    expect(state.created).toEqual([]);
    const write = state.authWrites.find((entry) => entry.id === "auth-1")!;
    expect(write.attributes).not.toHaveProperty("password");
    expect(metadata(write.attributes)).toMatchObject({ requires_password_change: true, can_sign_contracts: cleared });
    expect(recent(metadata(write.attributes).password_reset_at, since)).toBe(true);
    // The roster row's clearance is not touched by a reset.
    for (const entry of state.memberWrites) expect(entry).not.toHaveProperty("can_sign_contracts");
    expect(state.ended).toEqual([{ p_user: "auth-1", p_at: metadata(write.attributes).password_reset_at }]);
    expect(result.message).toMatch(/password itself is not changed/);
  });

  it("creates the account, with a temporary password shown once, only when there is none", async () => {
    state.member = { ...state.member!, status: "active" };
    const result = await reset();
    expect(result.ok, result.error).toBe(true);
    expect(state.created).toHaveLength(1);
    expect(result.temporaryPassword).toBe(state.created[0].password);
  });
});

describe("an approval or a reset whose history line cannot be written", () => {
  it("is made, and says it could not be recorded", async () => {
    state.logFails = true;
    const approved = await approve("sales");
    expect(approved.ok, approved.error).toBe(true);
    expect(approved.message).toMatch(/The change was made but could not be recorded\.$/);

    state.member = { ...state.member!, auth_user_id: "auth-1", status: "active" };
    const resetDone = await reset();
    expect(resetDone.ok, resetDone.error).toBe(true);
    expect(resetDone.message).toMatch(/The change was made but could not be recorded\.$/);
  });

  it("says nothing of the kind when the line is written", async () => {
    const approved = await approve("sales");
    expect(approved.message).not.toMatch(/could not be recorded/);
  });
});
