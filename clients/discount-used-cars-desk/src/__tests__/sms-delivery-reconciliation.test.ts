import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSMSDeliveryStatus } from "@/lib/sms/provider";

const reply = (status: string, extras: Record<string, unknown> = {}) => Response.json({ data: {
  id: "message-1", direction: "outbound", to: [{ phone_number: "+17135550123", status }], ...extras,
} });
beforeEach(() => vi.stubEnv("TELNYX_API_KEY", "test-only"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("provider receipt reconciliation is read-only and conservative", () => {
  it("uses a bounded GET for a matching delivered message", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply("delivered")); vi.stubGlobal("fetch", fetcher);
    expect(await getSMSDeliveryStatus("message-1", "+17135550123")).toBe("delivered");
    expect(fetcher).toHaveBeenCalledWith("https://api.telnyx.com/v2/messages/message-1", expect.objectContaining({ method: "GET", cache: "no-store", signal: expect.any(AbortSignal) }));
  });
  it.each(["sending_failed", "delivery_failed", "expired"])("maps documented terminal status %s to failed", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(status)));
    expect(await getSMSDeliveryStatus("message-1", "+17135550123")).toBe("failed");
  });
  it.each(["queued", "sending", "sent", "delivery_unconfirmed", "unexpected"])("leaves nonterminal or unconfirmed %s unchanged", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(status)));
    expect(await getSMSDeliveryStatus("message-1", "+17135550123")).toBeNull();
  });
  it.each([{ id: "other-message" }, { direction: "inbound" }, { to: [{ phone_number: "+17135550456", status: "delivered" }] }])("rejects a mismatched message identity or recipient", async extras => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("delivered", extras)));
    expect(await getSMSDeliveryStatus("message-1", "+17135550123")).toBeNull();
  });
  it("leaves state unchanged on timeout, HTTP error or malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await getSMSDeliveryStatus("message-1", "+17135550123")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    expect(await getSMSDeliveryStatus("message-1", "+17135550123")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json")));
    expect(await getSMSDeliveryStatus("message-1", "+17135550123")).toBeNull();
  });
});
