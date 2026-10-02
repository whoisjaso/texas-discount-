import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES_CLEARED_TO_SIGN_BY_DEFAULT, roleSignsByDefault, TEAM_ROLES, type TeamRole } from "@/lib/operations/team";

/**
 * Who is cleared to sign the moment an owner approves them (owner's decision
 * 10/01/2026): Owner, Manager and Registration. Every other role starts not
 * cleared until an owner turns signing on for that person. Only the default
 * changed: a reset never rewrites the person's own clearance.
 */

const state = vi.hoisted(() => ({
  member: null as null | Record<string, unknown>,
  memberWrites: [] as Array<Record<string, unknown>>,
  authWrites: [] as Array<{ id: string; attributes: Record<string, unknown> }>,
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
      insert: async () => ({ error: null }),
    }),
    auth: {
      admin: {
        updateUserById: async (id: string, attributes: Record<string, unknown>) => {
          state.authWrites.push({ id, attributes });
          return { data: { user: { id } }, error: null };
        },
        getUserById: async (id: string) => ({ data: { user: { id, app_metadata: { desk_role: "sales" } } }, error: null }),
        listUsers: async () => ({ data: { users: [] }, error: null }),
        createUser: async () => ({ data: { user: { id: "new-auth" } }, error: null }),
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
}));

import { resetTeamMemberAccessAction, reviewTeamAccessAction } from "@/lib/actions/team-access";

function approve(role: TeamRole) {
  const data = new FormData();
  data.set("intent", "approve");
  data.set("member_id", "member-1");
  data.set("role", role);
  return reviewTeamAccessAction({ ok: false }, data);
}

beforeEach(() => {
  state.memberWrites = [];
  state.authWrites = [];
  state.member = {
    id: "member-1",
    auth_user_id: "auth-1",
    email: "staff@example.test",
    full_name: "Staff Member",
    role: "viewer",
    status: "pending",
    can_sign_contracts: false,
  };
});

describe("the default", () => {
  it("clears Owner, Manager and Registration, and no other role", () => {
    expect([...ROLES_CLEARED_TO_SIGN_BY_DEFAULT].sort()).toEqual(["manager", "owner", "registration"]);
    for (const role of TEAM_ROLES) {
      expect(roleSignsByDefault(role), role).toBe(role === "owner" || role === "manager" || role === "registration");
    }
  });
});

describe("approving a staff member", () => {
  it.each(TEAM_ROLES.map((role) => [role, roleSignsByDefault(role)] as const))(
    "approved as %s starts cleared to sign: %s",
    async (role, cleared) => {
      const result = await approve(role);
      expect(result.ok, result.error).toBe(true);
      const roster = state.memberWrites.find((write) => "can_sign_contracts" in write);
      expect(roster?.can_sign_contracts).toBe(cleared);
      expect(roster?.role).toBe(role);
      const auth = state.authWrites.find((write) => write.id === "auth-1");
      expect((auth?.attributes.app_metadata as Record<string, unknown>).can_sign_contracts).toBe(cleared);
    },
  );
});

describe("the per-person choice", () => {
  it.each([
    ["sales", true],
    ["registration", false],
  ] as const)("survives a reset of a %s member an owner set to %s", async (role, chosen) => {
    state.member = { ...state.member!, role, status: "active", can_sign_contracts: chosen };
    const data = new FormData();
    data.set("member_id", "member-1");
    const result = await resetTeamMemberAccessAction({ ok: false }, data);
    expect(result.ok, result.error).toBe(true);
    // The roster row's own clearance is never rewritten by a reset...
    for (const write of state.memberWrites) expect(write).not.toHaveProperty("can_sign_contracts");
    // ...and the account's mirror of it keeps the person's value, not the role's.
    const auth = state.authWrites.find((write) => write.id === "auth-1");
    expect((auth?.attributes.app_metadata as Record<string, unknown>).can_sign_contracts).toBe(chosen);
  });
});
