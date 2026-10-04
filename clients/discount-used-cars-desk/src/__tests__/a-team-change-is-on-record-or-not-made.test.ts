import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who is cleared to sign and the legal name that prints on the dealer line
 * are changed on record or not at all (SOP "First sign-in: onboarding", item
 * 6; the fee screens' rule that a failed log puts the change back). The
 * record is team_activity_events, the desk's audit trail for team changes:
 * who, when, from and to. When it cannot be written the roster row is put
 * back and the owner is told nothing changed. When the put-back fails too
 * (the same outage that refused the record), the owner is told the truth:
 * the change stands, unrecorded, and needs checking; never "not made".
 */

const state = vi.hoisted(() => ({
  row: null as null | Record<string, unknown>,
  writes: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
  logFails: false,
  putBackFails: false,
  authWrites: [] as Array<{ id: string; attributes: Record<string, unknown> }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function service() {
  return {
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({ data: table === "team_members" ? { ...state.row } : null, error: null }),
        };
        return chain;
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          // The first write is the change; any later one is the put-back.
          if (table === "team_members" && state.putBackFails && state.writes.length > 0) {
            return { error: { message: "update refused" } };
          }
          if (table === "team_members") {
            state.writes.push(patch);
            state.row = { ...state.row, ...patch };
          }
          return { error: null };
        },
      }),
      insert: async (event: Record<string, unknown>) => {
        if (table !== "team_activity_events") return { error: null };
        if (state.logFails) return { error: { message: "insert refused" } };
        state.events.push(event);
        return { error: null };
      },
    }),
    auth: {
      admin: {
        updateUserById: async (id: string, attributes: Record<string, unknown>) => {
          state.authWrites.push({ id, attributes });
          return { data: { user: { id } }, error: null };
        },
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

import { correctTeamMemberNameAction, setTeamMemberSigningAction } from "@/lib/actions/team-access";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  state.row = {
    id: "member-1",
    auth_user_id: "auth-1",
    email: "jason@example.test",
    full_name: "Jason Price",
    display_name: "Jason",
    role: "sales",
    status: "active",
    can_sign_contracts: false,
  };
  state.writes = [];
  state.events = [];
  state.logFails = false;
  state.putBackFails = false;
  state.authWrites = [];
});

describe("a clearance change", () => {
  it("is recorded with who, from and to, and the account's copy follows", async () => {
    const result = await setTeamMemberSigningAction({ ok: false }, form({ member_id: "member-1", can_sign: "true" }));
    expect(result.ok, result.error).toBe(true);
    expect(state.row!.can_sign_contracts).toBe(true);
    expect(state.events).toEqual([
      expect.objectContaining({
        actor_id: "owner-member",
        event_type: "team_member_signing_changed",
        entity_type: "team_member",
        entity_id: "member-1",
        body: "Maria Lopez turned signing on for Jason Price.",
        metadata: { member_id: "member-1", previous_can_sign_contracts: false, can_sign_contracts: true },
      }),
    ]);
    expect(state.authWrites).toEqual([{ id: "auth-1", attributes: { app_metadata: { can_sign_contracts: true } } }]);
  });

  it("is put back when its record cannot be written", async () => {
    state.logFails = true;
    const result = await setTeamMemberSigningAction({ ok: false }, form({ member_id: "member-1", can_sign: "true" }));
    expect(result).toEqual({ ok: false, error: "The change could not be recorded, so it was not made. Try again." });
    expect(state.row!.can_sign_contracts).toBe(false);
    expect(state.writes.map((write) => write.can_sign_contracts)).toEqual([true, false]);
    expect(state.authWrites).toEqual([]);
  });

  it("says it stands, unrecorded, when neither the record nor the put-back can be written", async () => {
    state.logFails = true;
    state.putBackFails = true;
    const result = await setTeamMemberSigningAction({ ok: false }, form({ member_id: "member-1", can_sign: "true" }));
    expect(result).toEqual({ ok: false, error: "The change was saved but could not be recorded or undone. Check the member and try again." });
    expect(state.row!.can_sign_contracts).toBe(true);
    expect(state.events).toEqual([]);
  });

  it("writes nothing when it would change nothing", async () => {
    const result = await setTeamMemberSigningAction({ ok: false }, form({ member_id: "member-1", can_sign: "false" }));
    expect(result.ok).toBe(true);
    expect(state.writes).toEqual([]);
    expect(state.events).toEqual([]);
  });

  it("refuses anything but on or off", async () => {
    expect((await setTeamMemberSigningAction({ ok: false }, form({ member_id: "member-1", can_sign: "yes" }))).ok).toBe(false);
    expect(state.writes).toEqual([]);
  });
});

describe("a name correction", () => {
  it("is recorded with the old and the new name", async () => {
    const result = await correctTeamMemberNameAction({ ok: false }, form({ member_id: "member-1", firstName: "Jason", lastName: "Price-Moreno" }));
    expect(result.ok, result.error).toBe(true);
    expect(state.row).toMatchObject({ full_name: "Jason Price-Moreno", display_name: "Jason" });
    expect(state.events[0]).toMatchObject({
      event_type: "team_member_name_corrected",
      body: "Maria Lopez corrected Jason Price's name to Jason Price-Moreno.",
      metadata: {
        member_id: "member-1",
        previous_full_name: "Jason Price",
        previous_display_name: "Jason",
        full_name: "Jason Price-Moreno",
        display_name: "Jason",
      },
    });
  });

  it("is put back when its record cannot be written", async () => {
    state.logFails = true;
    const result = await correctTeamMemberNameAction({ ok: false }, form({ member_id: "member-1", firstName: "Jason", lastName: "Price-Moreno" }));
    expect(result.ok).toBe(false);
    expect(state.row).toMatchObject({ full_name: "Jason Price", display_name: "Jason" });
  });

  it("says it stands, unrecorded, when neither the record nor the put-back can be written", async () => {
    state.logFails = true;
    state.putBackFails = true;
    const result = await correctTeamMemberNameAction({ ok: false }, form({ member_id: "member-1", firstName: "Jason", lastName: "Price-Moreno" }));
    expect(result).toEqual({ ok: false, error: "The change was saved but could not be recorded or undone. Check the member and try again." });
    expect(result.error).not.toMatch(/not made/);
    expect(state.row).toMatchObject({ full_name: "Jason Price-Moreno" });
  });

  it("writes nothing for a name the rules refuse", async () => {
    const result = await correctTeamMemberNameAction({ ok: false }, form({ member_id: "member-1", firstName: "Jason", lastName: "Pr1ce" }));
    expect(result).toMatchObject({ ok: false, code: "badChars" });
    expect(state.writes).toEqual([]);
    expect(state.events).toEqual([]);
  });
});
