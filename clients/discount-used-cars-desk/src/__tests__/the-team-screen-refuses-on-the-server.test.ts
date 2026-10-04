import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every rule of the team screen is the server's (SOP "First sign-in:
 * onboarding", items 1, 4 and 6; team-rules.ts). The screen hides or disables
 * what a person may not do, and these tests go around it: each action is
 * called as the role would call it, through the real current-admin check and
 * the real rules, against the preview mock's fixture team (Maria Lopez the
 * only active owner, Carlos Mendez a manager, Jason Price in Sales, three
 * requests). Each refusal says why and writes nothing.
 */

const session = vi.hoisted(() => ({ cookie: "owner:owner@example.test" as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === "tj-local-admin-preview" && session.cookie) return { value: session.cookie };
      if (name === "tj-local-admin-signed-in") return { value: String(Date.now()) };
      return undefined;
    },
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

import {
  correctTeamMemberNameAction,
  resetAcceptedTeamAccessAction,
  resetTeamMemberAccessAction,
  reviewTeamAccessAction,
  setTeamMemberSigningAction,
} from "@/lib/actions/team-access";
import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { approvalRoleOptions } from "@/lib/onboarding/team-rules";

const OWNER = "owner:owner@example.test";
const MANAGER = "manager:manager@example.test";
const SALES = "sales:sales@example.test";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const approve = (id: string, role: string) => reviewTeamAccessAction({ ok: false }, form({ intent: "approve", member_id: id, role }));
const deny = (id: string) => reviewTeamAccessAction({ ok: false }, form({ intent: "deny", member_id: id }));
const reset = (id: string) => resetTeamMemberAccessAction({ ok: false }, form({ member_id: id }));
const signing = (id: string, on: boolean) => setTeamMemberSigningAction({ ok: false }, form({ member_id: id, can_sign: String(on) }));
const rename = (id: string, first: string, last: string) =>
  correctTeamMemberNameAction({ ok: false }, form({ member_id: id, firstName: first, lastName: last }));

async function row(id: string): Promise<Record<string, unknown>> {
  const { data } = await createMockSupabaseClient().from("team_members").select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown>;
}

async function account(id: string): Promise<Record<string, unknown>> {
  const { data } = await createMockSupabaseClient().auth.admin.getUserById(id);
  return (data.user?.app_metadata ?? {}) as Record<string, unknown>;
}

const recorded = () => mockInserted("team_activity_events");

beforeEach(() => {
  vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
  vi.stubEnv("DESK_PREVIEW_MEMBER", "");
  resetMockWrites();
  session.cookie = OWNER;
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("a role without team:manage", () => {
  it("is refused every team action, and nothing is written", async () => {
    session.cookie = SALES;
    const refusals = [
      await approve("preview-request-1", "sales"),
      await deny("preview-request-2"),
      await reset("preview-team-sales"),
      await signing("preview-team-sales", true),
      await rename("preview-team-sales", "Jason", "Prize"),
      await resetAcceptedTeamAccessAction({ ok: false }, new FormData()),
    ];
    for (const result of refusals) {
      expect(result).toMatchObject({ ok: false, error: "Owner or authorized manager access required." });
    }
    expect((await row("preview-request-1")).status).toBe("pending");
    expect((await row("preview-request-2")).status).toBe("pending");
    expect((await row("preview-team-sales")).can_sign_contracts).toBe(false);
    expect((await row("preview-team-sales")).full_name).toBe("Jason Price");
    expect(recorded()).toEqual([]);
  });

  it("is refused by a signed-out session too", async () => {
    session.cookie = null;
    expect((await signing("preview-team-sales", true)).ok).toBe(false);
    expect((await row("preview-team-sales")).can_sign_contracts).toBe(false);
  });
});

describe("a manager", () => {
  beforeEach(() => {
    session.cookie = MANAGER;
  });

  it("is never offered Owner, and cannot approve one", async () => {
    expect(approvalRoleOptions("manager").map((option) => option.role)).not.toContain("owner");
    expect(approvalRoleOptions("owner").map((option) => option.role)).toContain("owner");
    expect(await approve("preview-request-3", "owner")).toEqual({ ok: false, error: "Only an owner can approve another owner." });
    expect((await row("preview-request-3")).status).toBe("pending");
  });

  it("approves and denies everyone else", async () => {
    expect((await approve("preview-request-3", "lot")).ok).toBe(true);
    expect((await deny("preview-request-2")).ok).toBe(true);
    expect((await row("preview-request-3")).status).toBe("active");
    expect((await row("preview-request-2")).status).toBe("inactive");
  });

  it("cannot change an owner: not remove, not reset, not approve again", async () => {
    expect(await deny("preview-team-owner")).toMatchObject({ ok: false, code: "ownerChangesOwner" });
    expect(await reset("preview-team-owner")).toMatchObject({ ok: false, code: "ownerNotReset" });
    expect((await row("preview-team-owner")).status).toBe("active");

    // An owner who once had access and lost it: still an owner's row.
    session.cookie = OWNER;
    expect((await approve("preview-request-3", "owner")).ok).toBe(true);
    expect((await deny("preview-request-3")).ok).toBe(true);
    session.cookie = MANAGER;
    expect(await approve("preview-request-3", "sales")).toMatchObject({ ok: false, code: "ownerChangesOwner" });
    expect((await row("preview-request-3")).role).toBe("owner");
  });

  it("cannot change who is cleared to sign", async () => {
    expect(await signing("preview-team-sales", true)).toMatchObject({
      ok: false,
      code: "ownerSetsSigning",
      error: "Only an owner can change who is cleared to sign.",
    });
    expect((await row("preview-team-sales")).can_sign_contracts).toBe(false);
  });

  it("cannot correct a name", async () => {
    expect(await rename("preview-team-sales", "Jason", "Prize")).toMatchObject({
      ok: false,
      code: "ownerCorrectsName",
      error: "Only an owner can correct a team member's name.",
    });
    expect((await row("preview-team-sales")).full_name).toBe("Jason Price");
    expect(recorded()).toEqual([]);
  });
});

describe("the last active owner", () => {
  it("is never removed, by an owner either", async () => {
    expect(await deny("preview-team-owner")).toMatchObject({
      ok: false,
      code: "lastOwner",
      error: "This is the last active owner. Approve another owner first, so the desk is never left without one.",
    });
    expect((await row("preview-team-owner")).status).toBe("active");
  });

  it("can go once another owner is active, and then the other one is the last", async () => {
    expect((await approve("preview-request-3", "owner")).ok).toBe(true);
    expect((await deny("preview-team-owner")).ok).toBe(true);
    expect((await row("preview-team-owner")).status).toBe("inactive");
    // The removed owner's account says so too, so its older metadata cannot stand in.
    expect((await account("preview-auth-owner")).access_status).toBe("inactive");
    expect(await deny("preview-request-3")).toMatchObject({ ok: false, code: "lastOwner" });
  });

  it("cannot be demoted by approving them again with a lesser role", async () => {
    expect(await approve("preview-team-owner", "sales")).toMatchObject({ ok: false, code: "alreadyActive" });
    expect((await row("preview-team-owner")).role).toBe("owner");
  });
});

describe("nobody acts on themselves", () => {
  beforeEach(() => {
    // Carlos Mendez, the fixture manager, signed in as himself.
    session.cookie = "carlos.mendez@example.test";
  });

  it("cannot reset their own access", async () => {
    expect(await reset("preview-team-manager")).toMatchObject({ ok: false, code: "notYourselfReset" });
    expect((await account("preview-auth-manager")).requires_password_change).toBeUndefined();
  });

  it("cannot remove their own access", async () => {
    expect(await deny("preview-team-manager")).toMatchObject({ ok: false, code: "notYourselfRemove" });
    expect((await row("preview-team-manager")).status).toBe("active");
  });

  it("is left out of Reset Everyone, as every owner is", async () => {
    const result = await resetAcceptedTeamAccessAction({ ok: false }, new FormData());
    expect(result.ok).toBe(true);
    expect((await account("preview-auth-manager")).requires_password_change).toBeUndefined();
    expect((await account("preview-auth-owner")).requires_password_change).toBeUndefined();
    expect((await account("preview-auth-sales")).requires_password_change).toBe(true);
    expect((await account("preview-auth-registration")).requires_password_change).toBe(true);
  });
});

describe("an owner", () => {
  it("turns signing on and off for one person, on record from and to", async () => {
    expect((await signing("preview-team-sales", true)).ok).toBe(true);
    expect((await row("preview-team-sales")).can_sign_contracts).toBe(true);
    expect((await account("preview-auth-sales")).can_sign_contracts).toBe(true);
    expect((await signing("preview-team-sales", false)).ok).toBe(true);
    expect((await row("preview-team-sales")).can_sign_contracts).toBe(false);
    const events = recorded().filter((event) => event.event_type === "team_member_signing_changed");
    expect(events.map((event) => event.metadata)).toEqual([
      { member_id: "preview-team-sales", previous_can_sign_contracts: false, can_sign_contracts: true },
      { member_id: "preview-team-sales", previous_can_sign_contracts: true, can_sign_contracts: false },
    ]);
    expect(events[0].body).toBe("owner@example.test turned signing on for Jason Price.");
  });

  it("corrects a name, on record from and to", async () => {
    const result = await rename("preview-team-registration", "Brenda", "Ortiz de la Cruz");
    expect(result.ok).toBe(true);
    expect(await row("preview-team-registration")).toMatchObject({ full_name: "Brenda Ortiz de la Cruz", display_name: "Brenda" });
    const event = recorded().find((entry) => entry.event_type === "team_member_name_corrected")!;
    expect(event.metadata).toMatchObject({
      previous_full_name: "Brenda Ortiz",
      full_name: "Brenda Ortiz de la Cruz",
      applies_to: "documents filed after this change",
    });
  });

  it("cannot change the clearance or name of someone with no access", async () => {
    expect(await signing("preview-request-1", true)).toMatchObject({ ok: false, code: "notActive" });
    expect(await rename("preview-team-former", "Rob", "Hayes")).toMatchObject({ ok: false, code: "notActive" });
  });
});
