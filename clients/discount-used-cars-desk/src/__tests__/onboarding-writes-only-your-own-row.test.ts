import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";

/**
 * Onboarding writes the caller's own team_members row and nothing else.
 *
 * It uses the service client (RLS's WITH CHECK needs team:manage, which a new
 * member does not hold), so the guard RLS would have been is this: the row is
 * the session's, never one the form names, and only the onboarding columns
 * are written, whatever else the form carries. SOP "First sign-in:
 * onboarding"; owner's instruction 10/01/2026.
 */

type Member = Record<string, unknown>;

const state = vi.hoisted(() => ({
  access: null as null | { user: unknown; member: Member | null; role: string | null },
  writes: [] as Array<{ table: string; payload: Record<string, unknown>; eq: Array<[string, unknown]> }>,
}));

vi.mock("@/lib/admin/current-admin", () => ({
  getCurrentAdminAccess: async () => state.access,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => {
        const write = { table, payload, eq: [] as Array<[string, unknown]> };
        state.writes.push(write);
        const chain = {
          eq: (column: string, value: unknown) => {
            write.eq.push([column, value]);
            return Object.assign(Promise.resolve({ error: null }), chain);
          },
        };
        return chain;
      },
    }),
  }),
}));

import { completeOnboardingAction, saveOnboardingNameAction } from "@/lib/actions/team-onboarding";

const USER = { id: "auth-1", email: "maria@example.test", app_metadata: {} };

function member(over: Member = {}): Member {
  return {
    id: "member-1",
    auth_user_id: "auth-1",
    full_name: "",
    display_name: null,
    status: "active",
    role: "sales",
    can_sign_contracts: true,
    signature_data_url: null,
    onboarding_completed_at: null,
    ...over,
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const message = (error as Error).message;
    return message.startsWith("REDIRECT:") ? message.slice("REDIRECT:".length) : Promise.reject(error);
  }
}

beforeEach(() => {
  state.writes = [];
  state.access = { user: USER, member: member(), role: "sales" };
});

describe("the name screen", () => {
  it("writes exactly the name columns, to the session's own row", async () => {
    const result = await saveOnboardingNameAction(
      form({
        firstName: "  Maria ",
        lastName: "Lopez",
        id: "someone-else",
        member_id: "someone-else",
        auth_user_id: "someone-else",
        role: "owner",
        can_sign_contracts: "true",
        status: "active",
        onboarding_completed_at: "2026-01-01T00:00:00Z",
      }),
    );
    expect(result).toEqual({ ok: true, first: "Maria", last: "Lopez" });
    expect(state.writes).toHaveLength(1);
    const [write] = state.writes;
    expect(write.table).toBe("team_members");
    expect(Object.keys(write.payload).sort()).toEqual(["display_name", "full_name", "updated_at"]);
    expect(write.payload.full_name).toBe("Maria Lopez");
    expect(write.payload.display_name).toBe("Maria");
    expect(write.eq).toEqual([["id", "member-1"]]);
  });

  it("keeps a name exactly as typed, casing included", async () => {
    const result = await saveOnboardingNameAction(form({ firstName: "Angus", lastName: "McDonald" }));
    expect(result).toEqual({ ok: true, first: "Angus", last: "McDonald" });
    const lower = await saveOnboardingNameAction(form({ firstName: "maria", lastName: "de la Cruz" }));
    expect(lower).toEqual({ ok: true, first: "maria", last: "de la Cruz" });
    expect(state.writes.at(-1)!.payload.full_name).toBe("maria de la Cruz");
  });

  it("refuses a name the 130-U seller line would cut off, and writes nothing", async () => {
    const result = await saveOnboardingNameAction(
      form({ firstName: "Wolfeschlegelsteinhausenbergerdorff", lastName: "Montgomery-Featherstonehaugh" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("tooLongForForm");
      expect(result.error).toMatch(/too long/);
    }
    expect(state.writes).toEqual([]);
  });

  it("refuses to rewrite a usable name once onboarding is finished, and writes nothing", async () => {
    state.access!.member = member({
      full_name: "Maria Lopez",
      display_name: "Maria",
      onboarding_completed_at: "2026-09-01T12:00:00.000Z",
    });
    const result = await saveOnboardingNameAction(form({ firstName: "Robert", lastName: "Owner" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("alreadyNamed");
    expect(state.writes).toEqual([]);
  });

  it("refuses a finished member whose name already prints on the dealer line, even one an owner set", async () => {
    state.access!.member = member({
      full_name: "Maria Lopez",
      display_name: "Mari",
      onboarding_completed_at: "2026-09-01T12:00:00.000Z",
    });
    const result = await saveOnboardingNameAction(form({ firstName: "Robert", lastName: "Owner" }));
    expect(result).toMatchObject({ ok: false, code: "alreadyNamed" });
    expect(state.writes).toEqual([]);
  });

  it("still lets a finished member replace a name onboarding would refuse", async () => {
    state.access!.member = member({
      full_name: "Associate",
      display_name: "Associate",
      onboarding_completed_at: "2026-09-01T12:00:00.000Z",
    });
    const result = await saveOnboardingNameAction(form({ firstName: "Maria", lastName: "Lopez" }));
    expect(result).toEqual({ ok: true, first: "Maria", last: "Lopez" });
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].eq).toEqual([["id", "member-1"]]);
  });

  it("gives every refusal a code the screen translates", async () => {
    const result = await saveOnboardingNameAction(form({ firstName: "Łukasz", lastName: "Lopez" }));
    expect(result).toMatchObject({ ok: false, code: "unprintable", params: { part: "first", char: "Ł" } });
  });

  it.each([
    ["", "Lopez"],
    ["   ", "Lopez"],
    ["Maria", ""],
    ["", ""],
    ["Maria2", "Lopez"],
    ["<script>", "Lopez"],
    ["[Not set: x]", "Lopez"],
    ["A".repeat(61), "Lopez"],
  ])("refuses %j %j with a sentence and writes nothing", async (firstName, lastName) => {
    const result = await saveOnboardingNameAction(form({ firstName, lastName }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/[A-Z].*\.$/);
    expect(state.writes).toEqual([]);
  });

  it("refuses when signed out, off the roster, or not active, and writes nothing", async () => {
    state.access = { user: null, member: null, role: null };
    expect((await saveOnboardingNameAction(form({ firstName: "Maria", lastName: "Lopez" }))).ok).toBe(false);
    state.access = { user: USER, member: null, role: "owner" };
    expect((await saveOnboardingNameAction(form({ firstName: "Maria", lastName: "Lopez" }))).ok).toBe(false);
    state.access = { user: USER, member: member({ status: "pending" }), role: null };
    expect((await saveOnboardingNameAction(form({ firstName: "Maria", lastName: "Lopez" }))).ok).toBe(false);
    expect(state.writes).toEqual([]);
  });
});

describe("the done screen", () => {
  const named = { full_name: "Maria Lopez", display_name: "Maria" };

  it("refuses before the name is saved", async () => {
    const result = await completeOnboardingAction();
    expect(result.ok).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it.each([
    [{ full_name: "Associate", display_name: "Associate" }],
    [{ full_name: "maria@example.com", display_name: "maria@example.com" }],
    [{ full_name: "Maria Lopez", display_name: null }],
  ])("refuses a name the name screen did not save (%j)", async (name) => {
    state.access!.member = member({ ...name, signature_data_url: "data:image/png;base64,AAA" });
    const result = await completeOnboardingAction();
    expect(result).toMatchObject({ ok: false, code: "nameFirst" });
    expect(state.writes).toEqual([]);
  });

  it("refuses a member cleared to sign who has no signature", async () => {
    state.access!.member = member(named);
    const result = await completeOnboardingAction();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/signature/i);
    expect(state.writes).toEqual([]);
  });

  it("refuses while the account is on a temporary password", async () => {
    state.access = {
      user: { ...USER, app_metadata: { requires_password_change: true } },
      member: member({ ...named, signature_data_url: "data:image/png;base64,AAA" }),
      role: "sales",
    };
    expect((await completeOnboardingAction()).ok).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it("lets a member who is not cleared to sign finish without a signature", async () => {
    state.access!.member = member({ ...named, can_sign_contracts: false });
    expect(await redirectOf(() => completeOnboardingAction())).toBe(DEALERSHIP_HOME);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].eq).toEqual([["id", "member-1"]]);
    expect(Object.keys(state.writes[0].payload).sort()).toEqual(["onboarding_completed_at", "updated_at"]);
  });

  it("never moves a completion that is already recorded", async () => {
    state.access!.member = member({
      ...named,
      signature_data_url: "data:image/png;base64,AAA",
      onboarding_completed_at: "2026-09-30T12:00:00.000Z",
    });
    await redirectOf(() => completeOnboardingAction());
    expect(state.writes[0].payload.onboarding_completed_at).toBe("2026-09-30T12:00:00.000Z");
  });

  it.each(["owner", "manager", "sales", "finance", "registration"])(
    "sends %s to Handle A Sale",
    async (role) => {
      state.access = { user: USER, member: member({ ...named, signature_data_url: "data:image/png;base64,AAA", role }), role };
      expect(await redirectOf(() => completeOnboardingAction())).toBe(DEALERSHIP_HOME);
    },
  );

  it.each(["viewer", "mechanic", "social", "lot"])(
    "sends %s, who cannot open Handle A Sale, to their signature page",
    async (role) => {
      state.access = { user: USER, member: member({ ...named, can_sign_contracts: false, role }), role };
      expect(await redirectOf(() => completeOnboardingAction())).toBe("/admin/account/signature");
    },
  );
});

describe("one stored signature serves both screens", () => {
  it("the onboarding signature screen saves through the signature page's own action", () => {
    const flow = readFileSync("src/app/admin/account/onboarding/OnboardingFlow.tsx", "utf8");
    expect(flow).toMatch(/import \{ saveStaffSignatureAction \} from "@\/lib\/actions\/staff-signature";/);
    expect(flow).toContain("<SignaturePad");
    expect(flow).toMatch(/await saveStaffSignatureAction\(drawn\)/);
  });
});
