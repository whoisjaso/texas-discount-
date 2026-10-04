import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Team History lists every approval, denial, removal and reset with who and
 * when (README "The team screen"), and the screen shows only each line's
 * words (TeamClient.tsx), so the words name the person who acted: a manager
 * can approve and deny, and an owner reading the history must be able to
 * tell which manager let somebody in or turned them away. The row's own note
 * under No Access names them too, never "owner" for a manager's denial. Each
 * line also keeps what the person had before (status and role), and the
 * acting address, since an owner signed in with no roster row has no
 * actor_id. Checked through the real current-admin check and the real
 * actions against the preview mock's fixture team.
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

import { reviewTeamAccessAction } from "@/lib/actions/team-access";
import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";

// Carlos Mendez, the fixture manager, signed in as himself.
const CARLOS = "carlos.mendez@example.test";
const OWNER = "owner:owner@example.test";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const approve = (id: string, role: string) => reviewTeamAccessAction({ ok: false }, form({ intent: "approve", member_id: id, role }));
const deny = (id: string) => reviewTeamAccessAction({ ok: false }, form({ intent: "deny", member_id: id }));

async function row(id: string): Promise<Record<string, unknown>> {
  const { data } = await createMockSupabaseClient().from("team_members").select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown>;
}

const line = (type: string) => mockInserted("team_activity_events").filter((event) => event.event_type === type);

beforeEach(() => {
  vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
  vi.stubEnv("DESK_PREVIEW_MEMBER", "");
  resetMockWrites();
  session.cookie = CARLOS;
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("a manager's approval", () => {
  it("names the manager, and keeps what the person had before", async () => {
    expect((await approve("preview-request-3", "lot")).ok).toBe(true);
    const [approved] = line("team_access_approved");
    expect(approved.body).toBe("Carlos Mendez approved Kevin Brooks as Lot.");
    expect(approved.actor_id).toBe("preview-team-manager");
    expect(approved.metadata).toMatchObject({ previous_status: "pending", previous_role: "lot", role: "lot" });
  });
});

describe("a manager's denial", () => {
  it("names the manager on the history line and on the row's note", async () => {
    expect((await deny("preview-request-2")).ok).toBe(true);
    const [denied] = line("team_access_denied");
    expect(denied.body).toBe("Carlos Mendez denied Ashley Nguyen's access request.");
    expect(denied.metadata).toMatchObject({ previous_status: "pending", previous_role: "registration" });
    expect((await row("preview-request-2")).last_invite_error).toBe("Access request denied by Carlos Mendez.");
  });
});

describe("an owner with no roster row", () => {
  it("is named by the address they signed in with, on the line and in its metadata", async () => {
    session.cookie = OWNER;
    expect((await approve("preview-team-former", "sales")).ok).toBe(true);
    const [approved] = line("team_access_approved");
    expect(approved.actor_id).toBeNull();
    expect(approved.body).toBe("owner@example.test approved Rob Hayes as Sales.");
    expect(approved.metadata).toMatchObject({ actor_email: "owner@example.test", previous_status: "inactive", previous_role: "sales" });
  });
});

describe("a removal", () => {
  it("keeps the role the person had", async () => {
    expect((await deny("preview-team-sales")).ok).toBe(true);
    const [removed] = line("team_access_removed");
    expect(removed.body).toBe("Carlos Mendez removed Jason Price's access.");
    expect(removed.metadata).toMatchObject({ previous_status: "active", previous_role: "sales" });
  });
});
