import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issueCode: vi.fn(), verifyCode: vi.fn(), upsert: vi.fn(), updateUser: vi.fn(),
  createService: vi.fn(), sendEmail: vi.fn(), insertResult: vi.fn(), existing: vi.fn(),
  authStatus: "active" as string | undefined,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/local-admin", () => ({ isLocalAdminPreviewEnabled: () => false }));
vi.mock("@/lib/auth/code-store", () => ({ issueCode: mocks.issueCode, verifyCode: mocks.verifyCode }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createService }));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail, recipientFingerprint: () => "test-fingerprint" }));
import { requestTeamAccessAction } from "@/lib/actions/team-access";

function form(code?: string) {
  const data = new FormData();
  data.set("full_name", "Test Staff");
  data.set("email", "staff@example.test");
  data.set("requested_role", "sales");
  if (code) data.set("verification_code", code);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_EMAIL", "owner@example.test");
  vi.stubEnv("TEAM_ACCESS_NOTIFY_EMAIL", "");
  mocks.issueCode.mockResolvedValue({ ok: false, reason: "not_configured" });
  mocks.verifyCode.mockResolvedValue({ ok: true });
  mocks.authStatus = "active";
  mocks.sendEmail.mockResolvedValue({ state: "accepted", providerId: "test-email" });
  mocks.insertResult.mockResolvedValue({ data: { id: "new-member" }, error: null });
  mocks.existing.mockResolvedValue({ data: null, error: null });
  mocks.upsert.mockReturnValue({ select: () => ({ maybeSingle: mocks.insertResult }) });
  mocks.createService.mockReturnValue({
    from: () => ({ upsert: mocks.upsert, select: () => ({ eq: () => ({ maybeSingle: mocks.existing }) }) }),
    auth: { admin: {
      listUsers: async () => ({ data: { users: [{ id: "staff-1", email: "staff@example.test", app_metadata: { access_status: mocks.authStatus, desk_role: "manager" } }] }, error: null }),
      updateUserById: mocks.updateUser,
    } },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("public team access requests", () => {
  it("does not record an unverified request when the email transport is missing", async () => {
    const result = await requestTeamAccessAction({ ok: false }, form());
    expect(result.ok).toBe(false);
    expect(result.error).toContain("verification is unavailable");
    expect(mocks.createService).not.toHaveBeenCalled();
  });

  it("does not modify the roster after an invalid verification code", async () => {
    mocks.verifyCode.mockResolvedValue({ ok: false, reason: "wrong" });
    const result = await requestTeamAccessAction({ ok: false }, form("000000"));
    expect(result.ok).toBe(false);
    expect(mocks.createService).not.toHaveBeenCalled();
  });

  it("inserts a verified request without replacing an existing roster record", async () => {
    vi.stubEnv("TEAM_ACCESS_NOTIFY_EMAIL", "owner@example.test");
    const result = await requestTeamAccessAction({ ok: false }, form("123456"));
    expect(result.ok).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ email: "staff@example.test", status: "pending" }),
      { onConflict: "email", ignoreDuplicates: true },
    );
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.existing).not.toHaveBeenCalled();
  });

  it("does not downgrade approved Auth-only staff to pending during migration fallback", async () => {
    mocks.insertResult.mockResolvedValue({ data: null, error: { code: "PGRST205" } });
    const result = await requestTeamAccessAction({ ok: false }, form("123456"));
    expect(result.ok).toBe(true);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["active", true, "Existing approved team access is unchanged"],
    ["pending", true, "already awaiting owner review"],
    ["inactive", false, "Ask the owner to invite you"],
  ] as const)("honestly handles a duplicate %s roster request without sending a new-request alert", async (status, ok, copy) => {
    vi.stubEnv("TEAM_ACCESS_NOTIFY_EMAIL", "owner@example.test");
    mocks.insertResult.mockResolvedValue({ data: null, error: null });
    mocks.existing.mockResolvedValue({ data: { status }, error: null });
    const result = await requestTeamAccessAction({ ok: false }, form("123456"));
    expect(result.ok).toBe(ok);
    expect(result.message ?? result.error).toContain(copy);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it.each(["pending", "inactive"])("preserves an Auth-only %s owner decision without reopening or alerting", async status => {
    vi.stubEnv("TEAM_ACCESS_NOTIFY_EMAIL", "owner@example.test");
    mocks.authStatus = status;
    mocks.insertResult.mockResolvedValue({ data: null, error: { code: "PGRST205" } });
    const result = await requestTeamAccessAction({ ok: false }, form("123456"));
    expect(result.ok).toBe(status === "pending");
    expect(result.message ?? result.error).toContain(status === "pending" ? "already awaiting owner review" : "Ask the owner to invite you");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it.each([null, { code: "08006" }])("does not claim a new request when the duplicate row cannot be read", async error => {
    vi.stubEnv("TEAM_ACCESS_NOTIFY_EMAIL", "owner@example.test");
    mocks.insertResult.mockResolvedValue({ data: null, error: null });
    mocks.existing.mockResolvedValue({ data: null, error });
    const result = await requestTeamAccessAction({ ok: false }, form("123456"));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("could not be checked");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
