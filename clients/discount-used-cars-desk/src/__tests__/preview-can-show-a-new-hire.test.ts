import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The preview can show a new hire's first sign-in.
 *
 * The SOP ("First sign-in: onboarding") asks for onboarding to be tested with
 * a fresh member in the preview mock: no name, no signature, onboarding not
 * completed. The preview session never had a roster row, so it could not be.
 * DESK_PREVIEW_MEMBER gives it one, in the mock only; unset, preview is
 * exactly what it was.
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
import { getStaffSignature, saveStaffSignatureAction } from "@/lib/actions/staff-signature";
import { completeOnboardingAction, saveOnboardingNameAction } from "@/lib/actions/team-onboarding";
import { onboardingSteps } from "@/lib/onboarding/staff-name";
import { isLocalAdminPreviewEnabled } from "@/lib/auth/local-admin";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function name(first: string, last: string): FormData {
  const data = new FormData();
  data.set("firstName", first);
  data.set("lastName", last);
  return data;
}

beforeEach(() => {
  vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("without the flag", () => {
  it("is today's preview: no member, straight to the desk", async () => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "");
    expect((await getCurrentAdminAccess()).member).toBeNull();
    expect(await destinationAfterSignIn()).toBe(DEALERSHIP_HOME);
  });
});

describe("with a fresh member cleared to sign", () => {
  beforeEach(() => vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh"));

  it("starts with nothing on file and is sent to onboarding", async () => {
    const member = (await getCurrentAdminAccess()).member!;
    expect(member.full_name).toBe("");
    expect(member.display_name).toBeNull();
    expect(member.signature_data_url).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(member, "onboarding_completed_at")).toBe(true);
    expect(member.onboarding_completed_at).toBeNull();
    expect(member.can_sign_contracts).toBe(true);
    expect(await destinationAfterSignIn()).toBe("/admin/account/onboarding");
  });

  it("walks name, signature and done, then lands on the desk", async () => {
    expect(await saveOnboardingNameAction(name("maria", "Lopez"))).toEqual({ ok: true, first: "Maria", last: "Lopez" });
    expect(await saveStaffSignatureAction(PNG)).toEqual({ ok: true });
    await expect(completeOnboardingAction()).rejects.toThrow(`REDIRECT:${DEALERSHIP_HOME}`);

    const member = (await getCurrentAdminAccess()).member!;
    expect(member.full_name).toBe("Maria Lopez");
    expect(member.display_name).toBe("Maria");
    expect(member.onboarding_completed_at).toBeTruthy();
    const held = await getStaffSignature();
    expect(held.dataUrl).toBe(PNG);
    expect(await destinationAfterSignIn()).toBe(DEALERSHIP_HOME);
  });
});

describe("with a fresh member not cleared to sign", () => {
  beforeEach(() => vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh-cannot-sign"));

  it("has no signature screen, and the pad's action refuses", async () => {
    const member = (await getCurrentAdminAccess()).member!;
    expect(member.can_sign_contracts).toBe(false);
    expect(onboardingSteps({ canSign: member.can_sign_contracts })).toEqual(["name", "done"]);
    expect((await saveStaffSignatureAction(PNG)).ok).toBe(false);
  });
});

describe("the flag stays in the mock", () => {
  function sources(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "__tests__") continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) sources(path, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
    }
    return out;
  }

  it("is read in exactly one file", () => {
    const readers = sources("src").filter((file) => readFileSync(file, "utf8").includes("process.env.DESK_PREVIEW_MEMBER"));
    expect(readers).toEqual(["src/lib/supabase/mock.ts"]);
  });

  it("can never reach production, where preview is off", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isLocalAdminPreviewEnabled()).toBe(false);
  });
});
