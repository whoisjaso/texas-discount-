import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendSMS, normalizePhone } from "@/lib/sms/provider";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELNYX_API_KEY = "KEY_test_123";
  process.env.TELNYX_PHONE_NUMBER = "+18337771824";
  process.env.TELNYX_MESSAGING_PROFILE_ID = "profile-uuid-123";
});

afterEach(() => {
  delete process.env.TELNYX_API_KEY;
  delete process.env.TELNYX_PHONE_NUMBER;
  delete process.env.TELNYX_MESSAGING_PROFILE_ID;
});

describe("sendSMS", () => {
  it("normalizes formatted customer phone numbers before calling Telnyx", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: "msg-formatted" } }) });
    const result = await sendSMS("+1 832-555-1234", "Payment reminder");
    expect(result.success).toBe(true);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).to).toBe("+18325551234");
  });

  it("returns error when env vars are missing", async () => {
    delete process.env.TELNYX_API_KEY;
    const result = await sendSMS("+18325551234", "Hello");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends SMS via Telnyx API on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: "telnyx-msg-abc123" } }),
    });

    const result = await sendSMS("+18325551234", "Your payment is due");
    expect(result.success).toBe(true);
    expect(result.messageId).toBe("telnyx-msg-abc123");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.telnyx.com/v2/messages",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer KEY_test_123",
          "Content-Type": "application/json",
        },
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.from).toBe("+18337771824");
    expect(body.to).toBe("+18325551234");
    expect(body.text).toBe("Your payment is due");
    expect(body.messaging_profile_id).toBe("profile-uuid-123");
  });

  it("returns error on Telnyx API failure (400)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ errors: [{ detail: "Blocked by carrier" }] }),
    });

    // A number Telnyx accepts as well-formed and then refuses for its own
    // reasons. The recipient has to be valid, because an unreadable one no
    // longer reaches Telnyx at all: see the case below.
    const result = await sendSMS("+18325551234", "Hello");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Blocked by carrier");
  });

  it("refuses an unreadable recipient without spending a send", async () => {
    // Was asserted here as a Telnyx 400 carrying "Invalid phone number".
    // sendSMS normalises first now, because `customers.phone` holds whatever
    // the desk typed and one real row ("+1 832-273-6126") was being refused
    // by Telnyx while the daily run counted a failure and moved on.
    //
    // The queued mock that used to sit here is gone on purpose: this call
    // never reaches fetch, so a queued response would have leaked into the
    // next test rather than being consumed. It did.
    const result = await sendSMS("+1invalid", "Hello");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not a valid US phone number");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await sendSMS("+18325551234", "Hello");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Network timeout");
  });

  it("includes messaging_profile_id in request body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: "msg-123" } }),
    });

    await sendSMS("+18325551234", "Test");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messaging_profile_id).toBe("profile-uuid-123");
  });

  it("handles Telnyx error response without errors array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const result = await sendSMS("+18325551234", "Hello");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Telnyx API error: 500");
  });
});

describe("normalizePhone", () => {
  it("normalizes 10-digit number to E.164", () => {
    expect(normalizePhone("8325551234")).toBe("+18325551234");
  });

  it("normalizes formatted US number to E.164", () => {
    expect(normalizePhone("(832) 555-1234")).toBe("+18325551234");
  });

  it("normalizes 11-digit number starting with 1", () => {
    expect(normalizePhone("18325551234")).toBe("+18325551234");
  });

  it("passes through already E.164 number", () => {
    expect(normalizePhone("+18325551234")).toBe("+18325551234");
  });

  it("throws on invalid phone number", () => {
    expect(() => normalizePhone("12345")).toThrow("Invalid US phone number");
  });

  it("strips dashes and dots", () => {
    expect(normalizePhone("832-555-1234")).toBe("+18325551234");
    expect(normalizePhone("832.555.1234")).toBe("+18325551234");
  });
});
