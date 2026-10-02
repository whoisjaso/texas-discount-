import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { newPasswordProblem, PASSWORD_MIN_LENGTH } from "@/lib/auth/password-rules";
import { firstOpenStep, onboardingSteps } from "@/lib/onboarding/staff-name";

/**
 * "Choose A Password" (owner's decision 10/01/2026).
 *
 * Approving or resetting a member issues a temporary password and sets
 * `requires_password_change`, and the admin layout sends that account to
 * onboarding from every page. Onboarding now starts with "Choose A Password"
 * for that account, and only that account: account recovery's rules (at
 * least 10 characters), typed twice, with show and hide. Saving it replaces
 * the password and clears the flag on the signed-in account alone, and
 * onboarding carries on to the name. Choosing a password through the emailed
 * recovery link clears it too.
 */

const state = vi.hoisted(() => ({
  access: null as null | { user: unknown; member: Record<string, unknown> | null; role: string | null },
  authWrites: [] as Array<{ id: string; attributes: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  authError: null as null | { message: string },
  verifiedUser: null as null | Record<string, unknown>,
  passwordSet: [] as string[],
}));

vi.mock("@/lib/admin/current-admin", () => ({ getCurrentAdminAccess: async () => state.access }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => {}, get: () => undefined }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/auth/admin-device-session", () => ({
  ADMIN_DEVICE_SESSION_COOKIE: "device",
  adminDeviceSessionCookieOptions: {},
  createAdminDeviceSessionCookie: async () => "cookie",
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      verifyOtp: async () => ({ data: { user: state.verifiedUser, session: null }, error: null }),
      updateUser: async ({ password }: { password: string }) => {
        state.passwordSet.push(password);
        return { error: null };
      },
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    auth: {
      admin: {
        updateUserById: async (id: string, attributes: Record<string, unknown>) => {
          state.authWrites.push({ id, attributes });
          return { data: { user: { id } }, error: state.authError };
        },
      },
    },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        state.inserts.push({ table, row });
        return { error: null };
      },
      update: (payload: Record<string, unknown>) => {
        state.updates.push({ table, payload });
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

import { chooseOnboardingPasswordAction, completeOnboardingAction } from "@/lib/actions/team-onboarding";
import { completeRecovery } from "@/lib/actions/password-reset";

const TEMPORARY = {
  id: "auth-1",
  email: "maria@example.test",
  app_metadata: { access_status: "active", desk_role: "sales", requires_password_change: true, can_sign_contracts: false },
};

function member(over: Record<string, unknown> = {}) {
  return {
    id: "member-1",
    auth_user_id: "auth-1",
    full_name: "",
    display_name: null,
    status: "active",
    role: "sales",
    can_sign_contracts: false,
    signature_data_url: null,
    onboarding_completed_at: null,
    ...over,
  };
}

function passwords(password: string, confirmPassword = password, extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("password", password);
  data.set("confirmPassword", confirmPassword);
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
}

beforeEach(() => {
  state.access = { user: TEMPORARY, member: member(), role: "sales" };
  state.authWrites = [];
  state.inserts = [];
  state.updates = [];
  state.authError = null;
  state.verifiedUser = null;
  state.passwordSet = [];
});

describe("the rule", () => {
  it("is account recovery's floor, typed twice", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(newPasswordProblem("123456789", "123456789")).toEqual({ code: "passwordTooShort", min: 10 });
    expect(newPasswordProblem("", "")).toEqual({ code: "passwordTooShort", min: 10 });
    expect(newPasswordProblem(null, null)).toEqual({ code: "passwordTooShort", min: 10 });
    expect(newPasswordProblem("correct horse", "correct hors")).toEqual({ code: "passwordMismatch" });
    expect(newPasswordProblem("1234567890", "1234567890")).toBeNull();
    // Nothing is trimmed: a space is a character the person typed.
    expect(newPasswordProblem(" 12345678 ", " 12345678 ")).toBeNull();
  });

  it("is the one floor recovery reads too", () => {
    const recovery = readFileSync("src/lib/actions/password-reset.ts", "utf8");
    expect(recovery).toMatch(/import \{ PASSWORD_MIN_LENGTH \} from "@\/lib\/auth\/password-rules";/);
    expect(recovery).toContain("password.length < PASSWORD_MIN_LENGTH");
    expect(recovery).not.toMatch(/password\.length < \d/);
  });
});

describe("the steps", () => {
  it("start with the password only for an account on a temporary one", () => {
    expect(onboardingSteps({ canSign: true, requiresPasswordChange: true })).toEqual(["password", "name", "signature", "done"]);
    expect(onboardingSteps({ canSign: false, requiresPasswordChange: true })).toEqual(["password", "name", "done"]);
    expect(onboardingSteps({ canSign: true, requiresPasswordChange: false })).toEqual(["name", "signature", "done"]);
    expect(onboardingSteps({ canSign: true })).toEqual(["name", "signature", "done"]);
  });

  it("ask a member who already finished onboarding for the password and nothing else", () => {
    expect(onboardingSteps({ canSign: true, requiresPasswordChange: true, finished: true })).toEqual(["password", "done"]);
  });

  it("pick up at the password while the account is on a temporary one, whatever else is on file", () => {
    expect(firstOpenStep({ canSign: true, hasName: true, hasSignature: true, requiresPasswordChange: true })).toBe("password");
    expect(firstOpenStep({ canSign: true, hasName: false, hasSignature: false, requiresPasswordChange: true })).toBe("password");
    expect(firstOpenStep({ canSign: true, hasName: false, hasSignature: false, requiresPasswordChange: false })).toBe("name");
  });

  it("are counted from the page's own list, so the counter reads Step 1 Of 4", () => {
    const page = readFileSync("src/app/admin/account/onboarding/page.tsx", "utf8");
    expect(page).toMatch(/onboardingSteps\(\{ canSign, requiresPasswordChange: onTemporaryPassword, finished \}\)/);
    expect(page).toMatch(/firstOpenStep\(\{ \.\.\.open, requiresPasswordChange: onTemporaryPassword \}\)/);
    expect(en.funnel.onboarding.stepOf).toBe("Step {current} Of {total}");
  });
});

describe("Choose A Password", () => {
  it("replaces the password and clears the flag on the signed-in account only, keeping every other key", async () => {
    const result = await chooseOnboardingPasswordAction(
      passwords("a new one of mine", "a new one of mine", { id: "someone-else", user_id: "someone-else", member_id: "x" }),
    );
    expect(result).toEqual({ ok: true });
    expect(state.authWrites).toEqual([
      {
        id: "auth-1",
        attributes: {
          password: "a new one of mine",
          app_metadata: { access_status: "active", desk_role: "sales", requires_password_change: false, can_sign_contracts: false },
        },
      },
    ]);
    // The roster row is not touched; the replacement is logged, never the password.
    expect(state.updates).toEqual([]);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].table).toBe("team_activity_events");
    expect(JSON.stringify(state.inserts[0].row)).not.toContain("a new one of mine");
  });

  it.each([
    ["too short", "123456789", "123456789", "passwordTooShort"],
    ["not matching", "correct horse", "correct horsE", "passwordMismatch"],
  ])("refuses a password %s, and writes nothing", async (_label, password, again, code) => {
    const result = await chooseOnboardingPasswordAction(passwords(password, again));
    expect(result).toMatchObject({ ok: false, code });
    expect(state.authWrites).toEqual([]);
  });

  it("is never shown or saved for an account that is not on a temporary password", async () => {
    state.access = { user: { ...TEMPORARY, app_metadata: { desk_role: "sales" } }, member: member(), role: "sales" };
    expect(await chooseOnboardingPasswordAction(passwords("a new one of mine"))).toMatchObject({ ok: false, code: "passwordNotNeeded" });
    state.access = { user: { ...TEMPORARY, app_metadata: { requires_password_change: false } }, member: member(), role: "sales" };
    expect(await chooseOnboardingPasswordAction(passwords("a new one of mine"))).toMatchObject({ ok: false, code: "passwordNotNeeded" });
    expect(state.authWrites).toEqual([]);
  });

  it("refuses when signed out, or for a roster row that is not active", async () => {
    state.access = { user: null, member: null, role: null };
    expect(await chooseOnboardingPasswordAction(passwords("a new one of mine"))).toMatchObject({ ok: false, code: "signInAgain" });
    state.access = { user: TEMPORARY, member: member({ status: "pending" }), role: null };
    expect(await chooseOnboardingPasswordAction(passwords("a new one of mine"))).toMatchObject({ ok: false, code: "notActive" });
    state.access = { user: TEMPORARY, member: null, role: null };
    expect(await chooseOnboardingPasswordAction(passwords("a new one of mine"))).toMatchObject({ ok: false, code: "notActive" });
    expect(state.authWrites).toEqual([]);
  });

  it("lets in an account the desk already admits by role, with no roster row", async () => {
    state.access = { user: TEMPORARY, member: null, role: "sales" };
    expect(await chooseOnboardingPasswordAction(passwords("a new one of mine"))).toEqual({ ok: true });
    expect(state.authWrites.map((write) => write.id)).toEqual(["auth-1"]);
    expect(state.inserts).toEqual([]);
  });

  it("says so when the password could not be saved", async () => {
    state.authError = { message: "Password should be different from the old password." };
    expect(await chooseOnboardingPasswordAction(passwords("a new one of mine"))).toMatchObject({ ok: false, code: "passwordSaveFailed" });
  });

  it("must come before Done, which still refuses while the flag is set", async () => {
    state.access = {
      user: TEMPORARY,
      member: member({ full_name: "Maria Lopez", display_name: "Maria" }),
      role: "sales",
    };
    expect(await completeOnboardingAction()).toMatchObject({ ok: false, code: "temporaryPassword" });
    expect(state.updates).toEqual([]);
  });
});

describe("the screen", () => {
  const flow = readFileSync("src/app/admin/account/onboarding/OnboardingFlow.tsx", "utf8");

  it("asks twice, with show and hide, and saves through the action", () => {
    expect(flow).toContain('name="password"');
    expect(flow).toContain('name="confirmPassword"');
    expect(flow.match(/type=\{showPassword \? "text" : "password"\}/g)).toHaveLength(2);
    expect(flow.match(/autoComplete="new-password"/g)).toHaveLength(2);
    expect(flow.match(/minLength=\{PASSWORD_MIN_LENGTH\}/g)).toHaveLength(2);
    expect(flow).toContain("aria-pressed={showPassword}");
    expect(flow).toContain("await chooseOnboardingPasswordAction(data)");
  });

  it("goes on to the name once the password is saved, and never back to it", () => {
    expect(flow).toContain("go(afterPassword)");
    expect(flow).toMatch(/const previous = before === "password" \? null : before;/);
  });

  it("names a finished member's settled name on Done when the password is all that was left", () => {
    // An owner may have set the name, so the two boxes cannot always be
    // recovered from it; Done falls back to the name on file, never to nothing.
    const page = readFileSync("src/app/admin/account/onboarding/page.tsx", "utf8");
    expect(page).toContain("nameOnFile={nameOnFile}");
    expect(flow).toContain("const fullName = saved.first && saved.last ? `${saved.first} ${saved.last}` : nameOnFile;");
  });

  it("keeps counting the screens the visit started with (Step 2 Of 4 after the password)", () => {
    // Saving the password re-renders the page without the password screen;
    // the counter must not start over at Step 1 Of 3.
    expect(flow).toContain("steps: initialSteps,");
    expect(flow).toContain("const [steps] = useState(initialSteps);");
  });

  it("speaks both languages", () => {
    for (const key of ["passwordQuestion", "passwordHelp", "newPassword", "confirmPassword", "showPassword", "hidePassword", "savePassword"] as const) {
      expect(en.funnel.onboarding[key], key).toBeTruthy();
      expect(es.funnel.onboarding[key], key).toBeTruthy();
    }
    expect(en.funnel.onboarding.passwordQuestion).toBe("Choose A Password");
    for (const key of ["passwordTooShort", "passwordMismatch", "passwordNotNeeded", "passwordSaveFailed"] as const) {
      expect(en.funnel.onboarding.errors[key], key).toBeTruthy();
      expect(es.funnel.onboarding.errors[key], key).toBeTruthy();
    }
    expect(en.funnel.onboarding.passwordHelp).toContain("{min}");
    expect(es.funnel.onboarding.passwordHelp).toContain("{min}");
  });
});

describe("the emailed recovery link", () => {
  function recovery(password: string) {
    const data = new FormData();
    data.set("token", "hashed-token");
    data.set("password", password);
    return completeRecovery({ ok: false }, data);
  }

  it("clears the flag on the account it verified, keeping every other key", async () => {
    state.verifiedUser = { id: "auth-7", app_metadata: { desk_role: "registration", requires_password_change: true } };
    await expect(recovery("my own password")).rejects.toThrow("REDIRECT:");
    expect(state.passwordSet).toEqual(["my own password"]);
    expect(state.authWrites).toEqual([
      { id: "auth-7", attributes: { app_metadata: { desk_role: "registration", requires_password_change: false } } },
    ]);
  });

  it("writes nothing more for an account that was not on a temporary password", async () => {
    state.verifiedUser = { id: "auth-7", app_metadata: { desk_role: "registration" } };
    await expect(recovery("my own password")).rejects.toThrow("REDIRECT:");
    expect(state.authWrites).toEqual([]);
  });

  it("keeps its 10-character floor", async () => {
    expect(await recovery("123456789")).toEqual({ ok: false, error: "weak" });
    expect(state.passwordSet).toEqual([]);
  });
});
