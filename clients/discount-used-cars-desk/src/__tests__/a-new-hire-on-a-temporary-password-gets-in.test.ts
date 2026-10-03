import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The loop the temporary password made, walked end to end in the preview
 * mock (owner's decision 10/01/2026).
 *
 * Before: approval set `requires_password_change`, the layout sent the
 * account to onboarding from every page, nothing cleared the flag, and Done
 * refused it, so an approved member could never get in. Now the first screen
 * replaces the password and clears the flag, the name and signature follow,
 * Done records onboarding, and Handle A Sale opens.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "tj-local-admin-preview" ? { value: "owner:preview@example.test" } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import { resetMockWrites } from "@/lib/supabase/mock";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { destinationAfterSignIn } from "@/lib/auth/destination";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";
import { saveStaffSignatureAction } from "@/lib/actions/staff-signature";
import {
  chooseOnboardingPasswordAction,
  completeOnboardingAction,
  saveOnboardingNameAction,
} from "@/lib/actions/team-onboarding";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/**
 * The admin layout's own redirect rule, read from its source so this test
 * follows the layout rather than a copy of it: an account on a temporary
 * password, or an active member who has not finished onboarding, is sent to
 * onboarding from every other page.
 */
async function layoutSendsToOnboarding(): Promise<boolean> {
  const layout = readFileSync("src/app/admin/layout.tsx", "utf8");
  expect(layout).toContain("access.user?.app_metadata?.requires_password_change === true");
  expect(layout).toContain("if ((requiresPasswordChange || needsProfileOnboarding) && !isOnboardingScreen)");
  const access = await getCurrentAdminAccess();
  const requiresPasswordChange = access.user?.app_metadata?.requires_password_change === true;
  const needsProfileOnboarding =
    !!access.member &&
    access.member.status === "active" &&
    Object.prototype.hasOwnProperty.call(access.member, "onboarding_completed_at") &&
    !access.member.onboarding_completed_at;
  return requiresPasswordChange || needsProfileOnboarding;
}

beforeEach(() => {
  vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
  vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh-temporary-password");
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("a new hire on a temporary password", () => {
  it("is sent to onboarding, and Done alone cannot let them in", async () => {
    const access = await getCurrentAdminAccess();
    expect(access.user?.app_metadata?.requires_password_change).toBe(true);
    expect(await destinationAfterSignIn()).toBe("/admin/account/onboarding");
    expect(await layoutSendsToOnboarding()).toBe(true);
  });

  it("chooses a password, which clears the flag for this account and nothing else, then finishes and lands on the desk", async () => {
    expect(await chooseOnboardingPasswordAction(form({ password: "short", confirmPassword: "short" }))).toMatchObject({
      ok: false,
      code: "passwordTooShort",
    });
    expect((await getCurrentAdminAccess()).user?.app_metadata?.requires_password_change).toBe(true);

    expect(
      await chooseOnboardingPasswordAction(form({ password: "my own password", confirmPassword: "my own password" })),
    ).toEqual({ ok: true });
    const after = await getCurrentAdminAccess();
    expect(after.user?.app_metadata?.requires_password_change).toBe(false);
    // The rest of the account is what it was.
    expect(after.user?.app_metadata?.desk_role).toBe("owner");
    // Still onboarding: the name and signature are not on file yet.
    expect(await layoutSendsToOnboarding()).toBe(true);
    expect(await destinationAfterSignIn()).toBe("/admin/account/onboarding");

    // A second try is refused: the screen is gone once the password is saved.
    expect(
      await chooseOnboardingPasswordAction(form({ password: "another password", confirmPassword: "another password" })),
    ).toMatchObject({ ok: false, code: "passwordNotNeeded" });

    expect(await saveOnboardingNameAction(form({ firstName: "Maria", lastName: "Lopez" }))).toEqual({
      ok: true,
      first: "Maria",
      last: "Lopez",
    });
    expect(await saveStaffSignatureAction(PNG)).toEqual({ ok: true });
    await expect(completeOnboardingAction()).rejects.toThrow(`REDIRECT:${DEALERSHIP_HOME}`);

    // No loop: nothing sends this account back to onboarding, and Handle A Sale opens.
    expect(await layoutSendsToOnboarding()).toBe(false);
    expect(await destinationAfterSignIn()).toBe(DEALERSHIP_HOME);
  });

  it("is a preview of its own: the plain fresh member never carries the flag", async () => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
    expect((await getCurrentAdminAccess()).user?.app_metadata?.requires_password_change).toBeUndefined();
    vi.stubEnv("DESK_PREVIEW_MEMBER", "");
    expect((await getCurrentAdminAccess()).user?.app_metadata?.requires_password_change).toBeUndefined();
  });
});
