import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobs: [] as Array<() => Promise<void>>,
  resolve: vi.fn(), resolvePhone: vi.fn(), eligible: vi.fn(), issue: vi.fn(), verify: vi.fn(), generate: vi.fn(),
  cookieSet: vi.fn(), verifyOtp: vi.fn(),
}));
vi.mock("next/server", () => ({ after: (job: () => Promise<void>) => { mocks.jobs.push(job); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookieSet }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/auth/local-admin", () => ({ isLocalAdminPreviewEnabled: () => false }));
// The module gained phone resolution when a number became a way to sign in.
// A mock that omits it makes `looksLikePhone` undefined, and the call throws
// into the catch that hides provider outcomes, so every request silently sent
// nothing. That is exactly what this suite caught.
vi.mock("@/lib/auth/username", () => ({
  resolveLoginEmail: mocks.resolve,
  resolveLoginPhone: mocks.resolvePhone,
  looksLikePhone: (value: string) =>
    !value.includes("@") && !/[a-z]/i.test(value) && value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "").length === 10,
}));
vi.mock("@/lib/auth/destination", () => ({ destinationAfterSignIn: async () => "/admin/dealership/dashboard" }));
vi.mock("@/lib/auth/admin-device-session", () => ({
  ADMIN_DEVICE_SESSION_COOKIE: "test-device", adminDeviceSessionCookieOptions: {},
  createAdminDeviceSessionCookie: async () => "test-session",
}));
vi.mock("@/lib/auth/code-store", () => ({ issueCode: mocks.issue, mayReceiveSignInCode: mocks.eligible, verifyCode: mocks.verify }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ auth: { admin: { generateLink: mocks.generate } } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }) }));
import { completeSignInCode, requestSignInCode, type CodeSignInState } from "@/lib/actions/sign-in-code";

const previous: CodeSignInState = { ok: false, stage: "email" };
function form(identifier: string, code?: string) {
  const data = new FormData(); data.set("email", identifier);
  if (code) data.set("code", code);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.jobs.length = 0;
  mocks.resolve.mockResolvedValue("private-staff-address@example.test");
  mocks.resolvePhone.mockResolvedValue({ email: "private-staff-address@example.test", phone: "+18325551234" });
  mocks.eligible.mockResolvedValue(true);
  mocks.issue.mockResolvedValue({ ok: true, resent: true });
  mocks.verify.mockResolvedValue({ ok: false, reason: "wrong" });
  mocks.generate.mockResolvedValue({ data: { properties: { hashed_token: "test-token" } }, error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
});

describe("private username and email code requests", () => {
  it("returns the typed handle before any roster lookup or mail operation", async () => {
    const result = await requestSignInCode(previous, form(" Staff.Handle "));
    expect(result).toMatchObject({ ok: true, stage: "code", email: "staff.handle" });
    expect(JSON.stringify(result)).not.toContain("private-staff-address");
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
    await mocks.jobs[0]();
    expect(mocks.issue).toHaveBeenCalledWith("private-staff-address@example.test", "sign_in", "en");
  });

  it("keeps a phone number as private as a handle, and texts the code", async () => {
    // A number is an identity now. The screen must still answer without
    // saying whether it belongs to anybody, and must never echo the address
    // it resolved to.
    const result = await requestSignInCode(previous, form("(832) 555-1234"));
    expect(result).toMatchObject({ ok: true, stage: "code", email: "(832) 555-1234" });
    expect(JSON.stringify(result)).not.toContain("private-staff-address");
    expect(mocks.resolvePhone).not.toHaveBeenCalled();

    await mocks.jobs[0]();
    expect(mocks.issue).toHaveBeenCalledWith(
      "private-staff-address@example.test",
      "sign_in",
      "en",
      { channel: "sms", phone: "+18325551234" },
    );
    // A number never goes down the handle path.
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("says nothing different when the number belongs to nobody", async () => {
    const known = await requestSignInCode(previous, form("8325551234"));
    await mocks.jobs.shift()!();
    mocks.resolvePhone.mockResolvedValue(null);
    const unknown = await requestSignInCode(previous, form("8325551234"));
    await mocks.jobs.shift()!();
    expect(unknown).toEqual(known);
  });

  it("answers identically for known, unknown and provider-failed requests", async () => {
    const known = await requestSignInCode(previous, form("staff.handle"));
    await mocks.jobs.shift()!();
    mocks.resolve.mockResolvedValue(null);
    const unknown = await requestSignInCode(previous, form("staff.handle"));
    await mocks.jobs.shift()!();
    mocks.resolve.mockResolvedValue("private-staff-address@example.test");
    mocks.issue.mockRejectedValue(new Error("provider failure"));
    const failed = await requestSignInCode(previous, form("staff.handle"));
    await expect(mocks.jobs.shift()!()).resolves.toBeUndefined();
    expect(known).toEqual(unknown);
    expect(failed).toEqual(known);
  });

  it.each(["none", "wrong", "expired", "locked", "consumed", "unavailable"])("does not disclose the resolved mailbox or %s verification state", async reason => {
    mocks.verify.mockResolvedValue({ ok: false, reason });
    const known = await completeSignInCode(previous, form("staff.handle", "000000"));
    mocks.resolve.mockResolvedValue(null);
    const unknown = await completeSignInCode(previous, form("staff.handle", "000000"));
    expect(known).toEqual(unknown);
    expect(known.email).toBe("staff.handle");
    expect(JSON.stringify(known)).not.toContain("private-staff-address");
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("keeps username-based code completion working without returning its email", async () => {
    mocks.verify.mockResolvedValue({ ok: true });
    await expect(completeSignInCode(previous, form("staff.handle", "123456"))).rejects.toThrow("redirect:/admin/dealership/dashboard");
    expect(mocks.verify).toHaveBeenCalledWith("private-staff-address@example.test", "sign_in", "123456");
    expect(mocks.generate).toHaveBeenCalledWith({ type: "magiclink", email: "private-staff-address@example.test" });
    expect(mocks.cookieSet).toHaveBeenCalledTimes(1);
  });

  it("rechecks active access before turning a correct code into a session", async () => {
    mocks.verify.mockResolvedValue({ ok: true });
    mocks.eligible.mockResolvedValue(false);
    expect((await completeSignInCode(previous, form("staff.handle", "123456"))).ok).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
