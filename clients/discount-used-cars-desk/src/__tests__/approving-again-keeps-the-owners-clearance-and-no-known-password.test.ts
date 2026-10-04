import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An approval reaches only a person without access (a request, or No Access),
 * so two things a person may already have are not carried through it
 * (SOP "First sign-in: onboarding", items 1 and 4), checked through the real
 * current-admin check and the real actions against the preview mock's
 * fixture team:
 *
 * - **A password somebody else may know.** An account can exist for the
 *   address before the person asked: one somebody registered for it through
 *   Supabase's public sign-up, or the one an owner removed access over. The
 *   approval replaces its password with a temporary one, shown once, as it
 *   does when it creates the account; it never adopts the old one.
 * - **The clearance an owner set for that person.** Only an owner changes who
 *   is cleared to sign. Remove Access, then Approve Again, by a manager, keeps
 *   the clearance an owner left on the row; an owner's approval, or anyone's
 *   approval of a new request, writes the role's default.
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

import { reviewTeamAccessAction, setTeamMemberSigningAction } from "@/lib/actions/team-access";
import { createMockSupabaseClient, resetMockWrites } from "@/lib/supabase/mock";

const OWNER = "owner:owner@example.test";
const MANAGER = "manager:manager@example.test";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const approve = (id: string, role: string) => reviewTeamAccessAction({ ok: false }, form({ intent: "approve", member_id: id, role }));
const deny = (id: string) => reviewTeamAccessAction({ ok: false }, form({ intent: "deny", member_id: id }));
const signing = (id: string, on: boolean) => setTeamMemberSigningAction({ ok: false }, form({ member_id: id, can_sign: String(on) }));

async function row(id: string): Promise<Record<string, unknown>> {
  const { data } = await createMockSupabaseClient().from("team_members").select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown>;
}

async function account(id: string): Promise<Record<string, unknown>> {
  const { data } = await createMockSupabaseClient().auth.admin.getUserById(id);
  return (data.user?.app_metadata ?? {}) as Record<string, unknown>;
}

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

describe("an account that already exists for the address", () => {
  it("registered before the person asked: the approval takes it with a new temporary password, never the old one", async () => {
    // Somebody signs up with Kevin Brooks's address, with a password of their own choosing.
    const registered = await createMockSupabaseClient().auth.admin.createUser({
      email: "kevin.brooks@example.test",
      app_metadata: {},
    });
    const registeredId = registered.data.user!.id;

    const result = await approve("preview-request-3", "lot");
    expect(result.ok, result.error).toBe(true);
    expect(result.temporaryPassword).toMatch(/^VG-/);
    expect(result.message).toMatch(/old password no longer works/);
    expect(result.message).not.toMatch(/keeps the password/);
    expect((await row("preview-request-3")).auth_user_id).toBe(registeredId);
    expect(await account(registeredId)).toMatchObject({ access_status: "active", requires_password_change: true });
  });

  it("removed once and approved again: a new temporary password, so a known one does not come back with the access", async () => {
    const result = await approve("preview-team-former", "sales");
    expect(result.ok, result.error).toBe(true);
    expect(result.temporaryPassword).toMatch(/^VG-/);
    expect((await row("preview-team-former")).status).toBe("active");
  });

  it("a new request with no account: created with a temporary password, as before", async () => {
    const result = await approve("preview-request-1", "sales");
    expect(result.ok, result.error).toBe(true);
    expect(result.temporaryPassword).toMatch(/^VG-/);
    expect(result.message).not.toMatch(/old password/);
  });
});

describe("Remove Access, then Approve Again, by a manager", () => {
  it("keeps an owner's Turn Signing Off", async () => {
    expect((await signing("preview-team-registration", false)).ok).toBe(true);

    session.cookie = MANAGER;
    expect(await signing("preview-team-registration", true)).toMatchObject({ ok: false, code: "ownerSetsSigning" });
    expect((await deny("preview-team-registration")).ok).toBe(true);
    const again = await approve("preview-team-registration", "registration");
    expect(again.ok, again.error).toBe(true);
    expect(again.message).toMatch(/Signing stays off, as an owner left it/);

    expect(await row("preview-team-registration")).toMatchObject({ status: "active", role: "registration", can_sign_contracts: false });
    expect((await account("preview-auth-registration")).can_sign_contracts).toBe(false);
  });

  it("never clears a person by approving them into a role that signs by default", async () => {
    session.cookie = MANAGER;
    // Jason Price, Sales, not cleared.
    expect((await deny("preview-team-sales")).ok).toBe(true);
    expect((await approve("preview-team-sales", "manager")).ok).toBe(true);
    expect(await row("preview-team-sales")).toMatchObject({ role: "manager", can_sign_contracts: false });
    expect((await account("preview-auth-sales")).can_sign_contracts).toBe(false);
  });

  it("keeps an owner's Turn Signing On too: a manager changes neither way", async () => {
    expect((await signing("preview-team-sales", true)).ok).toBe(true);
    session.cookie = MANAGER;
    expect((await deny("preview-team-sales")).ok).toBe(true);
    expect((await approve("preview-team-sales", "lot")).ok).toBe(true);
    expect(await row("preview-team-sales")).toMatchObject({ role: "lot", can_sign_contracts: true });
  });
});

describe("the role's default clearance", () => {
  it("is written when a manager approves a new request", async () => {
    session.cookie = MANAGER;
    expect((await approve("preview-request-2", "registration")).ok).toBe(true);
    expect((await row("preview-request-2")).can_sign_contracts).toBe(true);
  });

  it("is written when an owner approves somebody again", async () => {
    // Rob Hayes, Sales, not cleared, approved again as Registration by the owner.
    expect((await approve("preview-team-former", "registration")).ok).toBe(true);
    expect((await row("preview-team-former")).can_sign_contracts).toBe(true);
  });
});
