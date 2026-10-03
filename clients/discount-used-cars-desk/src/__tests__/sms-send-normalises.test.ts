import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendSMS } from "@/lib/sms/provider";

/**
 * A real customers row holds "+1 832-273-6126". Telnyx rejected it with
 * "The 'to' address should be a single valid number", the daily run counted
 * a failure, and that customer received no reminders at all while everyone
 * else did. The call sites are many and they forget; the provider is one and
 * it cannot.
 */

function stubTelnyxOk() {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { id: "msg-1" } }),
  })));
}

const sentTo = () => {
  const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
  return JSON.parse(calls[0][1].body).to;
};

describe("sendSMS normalises the recipient", () => {
  beforeEach(() => {
    process.env.TELNYX_API_KEY = "k";
    process.env.TELNYX_PHONE_NUMBER = "+18337771824";
    process.env.TELNYX_MESSAGING_PROFILE_ID = "p";
    stubTelnyxOk();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_PHONE_NUMBER;
    delete process.env.TELNYX_MESSAGING_PROFILE_ID;
  });

  it("sends the exact shape that failed in production", async () => {
    const result = await sendSMS("+1 832-273-6126", "hi");
    expect(result.success).toBe(true);
    expect(sentTo()).toBe("+18322736126");
  });

  it("accepts the other shapes the desk types", async () => {
    for (const [input, expected] of [
      ["(832) 818-6428", "+18328186428"],
      ["832-818-6428", "+18328186428"],
      ["18328186428", "+18328186428"],
      ["+18328186428", "+18328186428"],
    ] as const) {
      vi.unstubAllGlobals();
      stubTelnyxOk();
      await sendSMS(input, "hi");
      expect(sentTo(), `for ${input}`).toBe(expected);
    }
  });

  it("leaves an already-correct number untouched", async () => {
    await sendSMS("+18337771824", "hi");
    expect(sentTo()).toBe("+18337771824");
  });

  it("refuses a number it cannot read, without spending a send", async () => {
    const result = await sendSMS("not a phone", "hi");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not a valid US phone number/);
    // The point: Telnyx is never called, so the failure is ours and local.
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("does not leak the number into the error text", async () => {
    // The daily run already logs which customer failed; the log does not
    // need the digits too.
    const result = await sendSMS("+1 555", "hi");
    expect(result.error).not.toContain("555");
  });
});
