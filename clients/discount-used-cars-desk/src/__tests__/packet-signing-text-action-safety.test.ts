import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPacketSigningText, sendPacketSigningText } from "@/lib/actions/packet-signing-text";

const fixture = vi.hoisted(() => ({
  access: true, attestedConsent: "no_consent", phoneConsent: "no_consent", phone: "7135550123", rows: [] as Array<Record<string, unknown>>,
  sequence: 0, send: vi.fn(), mirror: vi.fn(), receipt: vi.fn(),
}));
vi.mock("@/lib/admin/current-admin", () => ({ requireCurrentAdminPermission: async () => ({ ok: fixture.access, user: { id: "staff-1" } }) }));
vi.mock("@/lib/admin/sale-desk", () => ({ getSaleDetail: async () => ({ id: "deal-1", language: "en", buyer: { id: "buyer-1", phone: fixture.phone }, stepData: {} }) }));
vi.mock("@/lib/admin/sale-packet", () => ({ getSalePacket: async () => [{ id: "agreement-1", signed: false }] }));
vi.mock("@/lib/sales/signing-ceremony", () => ({ ceremonyCanSign: () => true, ceremonyDocuments: (rows: unknown[]) => rows }));
vi.mock("@/lib/sales/deal-language", () => ({ isLanguageSettled: () => true }));
vi.mock("@/lib/sms/compliance", () => ({ assertSmsConsent: async () => ({ allowed: false, reason: fixture.attestedConsent }) }));
vi.mock("@/lib/sms/consent", () => ({ smsConsentFor: async () => ({ allowed: fixture.phoneConsent === "ok", reason: fixture.phoneConsent }) }));
vi.mock("@/lib/dealership-config", () => ({ dealership: { paperworkTextsEnabled: true, shortName: "Demo Dealer" }, SITE_URL: "https://dealer.example" }));
vi.mock("@/lib/sms/provider", () => ({ normalizePhone: (phone: string) => `+1${phone}`, sendSMS: (...args: unknown[]) => fixture.send(...args), getSMSDeliveryStatus: (...args: unknown[]) => fixture.receipt(...args) }));
vi.mock("@/lib/supabase/queries/payments", () => ({ createSmsMessage: (...args: unknown[]) => fixture.mirror(...args) }));
vi.mock("@/lib/sales/signing-token", () => ({ issueSigningToken: () => "test-token-not-real", signingUrl: (base: string, token: string) => `${base}/sign/packet/${token}`, SIGNING_TTL_MS: 1_200_000 }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: () => {
  const filters: Array<[string, unknown]> = [];
  let update: Record<string, unknown> | null = null;
  let insert: Record<string, unknown> | null = null;
  const execute = () => {
    if (insert) {
      if (fixture.rows.some(row => row.active && row.deal_id === insert!.deal_id)) return { data: null, error: { code: "23505" } };
      const row = { id: `claim-${++fixture.sequence}`, active: true, status: "pending", created_at: new Date().toISOString(), ...insert };
      fixture.rows.push(row);
      return { data: row, error: null };
    }
    const rows = fixture.rows.filter(row => filters.every(([key, value]) => row[key] === value));
    if (update) rows.forEach(row => Object.assign(row, update));
    return { data: rows[0] ?? null, error: null };
  };
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    update: (values: Record<string, unknown>) => { update = values; return query; },
    insert: (values: Record<string, unknown>) => { insert = values; return query; },
    maybeSingle: async () => execute(), single: async () => execute(),
    then: (resolve: (value: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
  };
  return query;
} }) }));

beforeEach(() => {
  fixture.access = true; fixture.attestedConsent = "no_consent"; fixture.phoneConsent = "no_consent"; fixture.phone = "7135550123"; fixture.rows = []; fixture.sequence = 0;
  fixture.send.mockReset().mockResolvedValue({ success: true, messageId: "telnyx-1" });
  fixture.mirror.mockReset().mockResolvedValue(undefined);
  fixture.receipt.mockReset().mockResolvedValue(null);
  vi.stubEnv("TELNYX_API_KEY", "test-only"); vi.stubEnv("TELNYX_PHONE_NUMBER", "+15555550100"); vi.stubEnv("TELNYX_MESSAGING_PROFILE_ID", "test-profile");
});
afterEach(() => vi.unstubAllEnvs());

describe("signing SMS is authorized, claimed once and narrowly scoped", () => {
  it("blocks an unauthorized staff request before sending or creating a claim", async () => {
    fixture.access = false;
    expect(await sendPacketSigningText("deal-1", { attested: true })).toMatchObject({ ok: false, code: "forbidden" });
    expect(fixture.send).not.toHaveBeenCalled(); expect(fixture.rows).toHaveLength(0);
  });
  it("requires the explicit buyer-request attestation", async () => {
    expect(await sendPacketSigningText("deal-1", { attested: false })).toMatchObject({ ok: false, code: "needsAttestation" });
    expect(fixture.send).not.toHaveBeenCalled(); expect(fixture.rows).toHaveLength(0);
  });
  it.each(["revoked", "unavailable", "not_configured"])("honors the phone ledger before a customer-level consent can bypass %s", async (reason) => {
    fixture.phoneConsent = reason;
    expect(await sendPacketSigningText("deal-1", { attested: true })).toMatchObject({ ok: false });
    expect(fixture.send).not.toHaveBeenCalled(); expect(fixture.rows).toHaveLength(0);
  });
  it.each(["revoked", "opted_out", "review_hold", "unknown_customer"])("never overrides %s with a fresh attestation", async (reason) => {
    fixture.attestedConsent = reason;
    expect(await sendPacketSigningText("deal-1", { attested: true })).toMatchObject({ ok: false });
    expect(fixture.send).not.toHaveBeenCalled(); expect(fixture.rows).toHaveLength(0);
  });
  it("elects one provider request across concurrent callers", async () => {
    const results = await Promise.all([sendPacketSigningText("deal-1", { attested: true }), sendPacketSigningText("deal-1", { attested: true })]);
    expect(fixture.send).toHaveBeenCalledTimes(1);
    expect(fixture.rows.filter(row => row.active)).toHaveLength(1);
    expect(results.some(result => result.ok && result.status === "accepted")).toBe(true);
  });
  it("sends only to the saved buyer and stores hashes rather than the bearer URL", async () => {
    await sendPacketSigningText("deal-1", { attested: true });
    expect(fixture.send).toHaveBeenCalledWith("+17135550123", expect.stringContaining("https://dealer.example/sign/packet/test-token-not-real"), { timeoutMs: 15_000 });
    expect(fixture.rows[0]).toMatchObject({ customer_id: "buyer-1", issued_by: "staff-1", status: "accepted" });
    expect(fixture.rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(fixture.rows)).not.toContain("test-token-not-real");
    expect(JSON.stringify(fixture.mirror.mock.calls)).not.toContain("test-token-not-real");
  });
  it("keeps an uncertain provider response from causing an implicit retry", async () => {
    fixture.send.mockResolvedValue({ success: false, uncertain: true });
    expect(await sendPacketSigningText("deal-1", { attested: true })).toMatchObject({ ok: true, status: "unknown" });
    expect(await sendPacketSigningText("deal-1", { attested: true })).toMatchObject({ ok: true, status: "unknown", reused: true });
    expect(fixture.send).toHaveBeenCalledTimes(1);
  });
  it("does not resend an accepted SMS when writing the message mirror fails", async () => {
    fixture.mirror.mockRejectedValue(new Error("mirror failed"));
    expect(await sendPacketSigningText("deal-1", { attested: true })).toMatchObject({ ok: true, status: "accepted" });
    expect(await sendPacketSigningText("deal-1", { attested: true })).toMatchObject({ ok: true, reused: true });
    expect(fixture.send).toHaveBeenCalledTimes(1);
  });
  it("recovers an early delivery receipt with a read, without a new send", async () => {
    await sendPacketSigningText("deal-1", { attested: true });
    fixture.receipt.mockResolvedValue("delivered");
    expect(await readPacketSigningText("deal-1", "claim-1")).toMatchObject({ ok: true, status: "delivered" });
    expect(fixture.receipt).toHaveBeenCalledWith("telnyx-1", "+17135550123", { timeoutMs: 3000 });
    expect(fixture.send).toHaveBeenCalledTimes(1);
  });
  it("does not replace a terminal webhook receipt with a concurrent provider read", async () => {
    await sendPacketSigningText("deal-1", { attested: true });
    fixture.receipt.mockImplementation(async () => { fixture.rows[0].status = "delivered"; return "failed"; });
    await readPacketSigningText("deal-1", "claim-1");
    expect(fixture.rows[0].status).toBe("delivered");
  });
  it("never queries a provider receipt for an uncertain send with no message ID", async () => {
    fixture.send.mockResolvedValue({ success: false, uncertain: true });
    await sendPacketSigningText("deal-1", { attested: true });
    expect(await readPacketSigningText("deal-1", "claim-1")).toMatchObject({ ok: true, status: "unknown" });
    expect(fixture.receipt).not.toHaveBeenCalled();
  });
  it("does not reveal or reconcile another deal's claim", async () => {
    await sendPacketSigningText("deal-1", { attested: true });
    expect(await readPacketSigningText("other-deal", "claim-1")).toMatchObject({ ok: false });
    expect(fixture.receipt).not.toHaveBeenCalled();
  });
});
