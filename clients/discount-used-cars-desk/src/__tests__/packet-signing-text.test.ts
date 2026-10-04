import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { existingSigningText, signingTextMessage, type SigningTextClaim } from "@/lib/sales/signing-text";
import { sendSMS } from "@/lib/sms/provider";

const now = Date.parse("2026-09-08T12:00:00Z");
const row: SigningTextClaim = { id: "claim", recipient_phone: "+15555550100", status: "accepted", created_at: new Date(now).toISOString(), expires_at: new Date(now + 1_200_000).toISOString() };
describe("signing link retries", () => {
  it("reuses a live accepted message and only explicitly resends it", () => {
    expect(existingSigningText(row, row.recipient_phone, false, now)?.ok).toBe(true);
    expect(existingSigningText(row, row.recipient_phone, true, now)).toBeNull();
  });
  it("never sends again during a concurrent request, even for explicit resend", () => {
    expect(existingSigningText({ ...row, status: "pending" }, row.recipient_phone, true, now)).toMatchObject({ status: "pending" });
  });
  it("does not claim a stalled request was delivered or retry it implicitly", () => {
    expect(existingSigningText({ ...row, status: "pending" }, row.recipient_phone, false, now + 90_000)).toMatchObject({ status: "unknown" });
  });
  it("replaces expired links and links to a corrected phone", () => {
    expect(existingSigningText(row, row.recipient_phone, false, now + 1_200_000)).toBeNull();
    expect(existingSigningText(row, "+15555550200", false, now)).toBeNull();
  });
  it("uses a fixed bilingual message without buyer or vehicle details", () => {
    expect(signingTextMessage("Dealer", "en", "https://example.test/sign")).toContain("20 minutes");
    expect(signingTextMessage("Dealer", "es", "https://example.test/sign")).toContain("20 minutos");
    expect(signingTextMessage("Dealer", "en", "url")).toContain("STOP");
  });
});

describe("Telnyx send certainty", () => {
  beforeEach(() => { vi.stubEnv("TELNYX_API_KEY", "test-only"); vi.stubEnv("TELNYX_PHONE_NUMBER", "+15555550100"); vi.stubEnv("TELNYX_MESSAGING_PROFILE_ID", "profile"); vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  it("accepts only a returned message ID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { id: "message" } })));
    expect(await sendSMS("+15555550200", "test")).toEqual({ success: true, messageId: "message" });
  });
  it("treats timeouts and malformed success as uncertain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await sendSMS("+15555550200", "test", { timeoutMs: 1000 })).toMatchObject({ success: false, uncertain: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: {} })));
    expect(await sendSMS("+15555550200", "test")).toMatchObject({ success: false, uncertain: true });
  });
  it("distinguishes a rejected recipient from ambiguous provider failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 422 })));
    expect(await sendSMS("+15555550200", "test")).toMatchObject({ uncertain: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 503 })));
    expect(await sendSMS("+15555550200", "test")).toMatchObject({ uncertain: true });
  });
});
