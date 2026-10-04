import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import en from "../../messages/en.json";
import es from "../../messages/es.json";

/**
 * An old signing link dies with the void (owner's decision 10/02/2026).
 *
 * The signing token is stateless and its format is unchanged. What changed is
 * that every reader compares the token's issue time (its expiry less the
 * fixed lifetime) with the deal's latest void: a link minted at or before the
 * void signs nothing, opens nothing and downloads nothing, the new copies
 * included. A voided copy is refused on its own as well. The desk mints a new
 * link for the new copies.
 */

const fixture = vi.hoisted(() => ({ pdf: vi.fn(), render130: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: (name: string) => (name === "user-agent" ? "test-browser" : null) }),
}));
vi.mock("@/lib/documents/pdf-generator", () => ({ generatePdf: (...args: unknown[]) => fixture.pdf(...args) }));
vi.mock("@/lib/documents/render130U", () => ({ render130UPdf: (...args: unknown[]) => fixture.render130(...args) }));

import { SIGNING_TTL_MS, issueSigningToken, verifySigningToken } from "@/lib/sales/signing-token";
import { signingSessionRevoked } from "@/lib/sales/void-bill-of-sale";
import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";
import { encodeCompletedLink } from "@/lib/documents/customerPortal";
import { signPacketDocument } from "@/lib/actions/packet-signing";
import { GET as buyerCopy } from "@/app/api/sign/packet/[token]/documents/[agreementId]/route";
import { GET as form130U } from "@/app/api/sign/[token]/form-130u/[agreementId]/route";

const DEAL = "signing-void-deal";
const STROKE = `data:image/png;base64,${"A".repeat(400)}`;
const link = encodeCompletedLink("billOfSale", { buyerName: "Andrea Salinas" }, {}, "https://desk.example");

beforeEach(() => {
  resetMockWrites();
  vi.stubEnv("ADMIN_SESSION_SECRET", "unit-test-signing-secret");
  fixture.pdf.mockReset().mockResolvedValue(Buffer.from("%PDF-test"));
  fixture.render130.mockReset().mockResolvedValue({ ok: true, bytes: new Uint8Array([37, 80, 68, 70]), filename: "130-U.pdf" });
});

describe("the token", () => {
  it("is still four parts and now says when it was minted", () => {
    const minted = Date.parse("2026-10-02T15:00:00.000Z");
    const token = issueSigningToken("deal-1", minted);
    expect(token.split(".")).toHaveLength(4);
    const verified = verifySigningToken(token, minted + 1000);
    expect(verified).toEqual({ ok: true, dealId: "deal-1", expiresAt: minted + SIGNING_TTL_MS, issuedAt: minted });
  });
});

describe("whether a session outlived its documents", () => {
  const voidAt = "2026-10-02T15:00:00.000Z";
  const rows = [{ voided_at: null }, { voided_at: voidAt }];
  it("is revoked when it was minted at or before the deal's latest void", () => {
    expect(signingSessionRevoked(Date.parse(voidAt) - 60_000, rows)).toBe(true);
    expect(signingSessionRevoked(Date.parse(voidAt), rows)).toBe(true);
  });
  it("is valid when minted after it, or when nothing was ever voided", () => {
    expect(signingSessionRevoked(Date.parse(voidAt) + 1, rows)).toBe(false);
    expect(signingSessionRevoked(0, [{ voided_at: null }])).toBe(false);
    expect(signingSessionRevoked(null, [])).toBe(false);
  });
  it("is revoked with no known issue time only when the deal had a void", () => {
    expect(signingSessionRevoked(null, rows)).toBe(true);
    expect(signingSessionRevoked(undefined, [{ voided_at: null }])).toBe(false);
  });
  it("reads the latest of several voids", () => {
    const later = "2026-10-02T17:00:00.000Z";
    expect(signingSessionRevoked(Date.parse("2026-10-02T16:00:00.000Z"), [{ voided_at: voidAt }, { voided_at: later }])).toBe(true);
  });
});

/** A deal whose bill of sale was voided at `voidAt` and filed again after it. */
async function seed(voidAt: string) {
  const client = createMockSupabaseClient();
  await client.from("deals").insert({
    id: DEAL,
    status: "in_progress",
    language: "en",
    step_data: { salePlan: { registrationBy: "dealer", titleSignedBy: "buyer" } },
    customers: { id: "signing-void-buyer", name: "Andrea Salinas" },
    vehicles: { id: "signing-void-car", year: 2017, make: "Ford", model: "Explorer" },
  });
  const base = { deal_id: DEAL, status: "finalized", finalized_at: "2026-10-02T14:00:00.000Z", completed_link: link, language: "en", form_data: {} };
  await client.from("document_agreements").insert([
    { ...base, id: "old-bos", document_type: "billOfSale", has_buyer_signature: true, signed_at: "2026-10-02T14:05:00.000Z", voided_at: voidAt, void_reason: "The figures changed", void_group_id: "g1" },
    { ...base, id: "old-130u", document_type: "form130U", has_buyer_signature: true, signed_at: "2026-10-02T14:06:00.000Z", voided_at: voidAt, void_reason: "The figures changed", void_group_id: "g1" },
    { ...base, id: "new-bos", document_type: "billOfSale", finalized_at: voidAt, has_buyer_signature: false },
    { ...base, id: "new-130u", document_type: "form130U", finalized_at: voidAt, has_buyer_signature: true, signed_at: voidAt },
  ]);
}

const reading = { scrolledToEnd: true };

describe("signing after a void", () => {
  it("refuses a voided copy, whatever the link", async () => {
    const voidAt = new Date(Date.now() - 60_000).toISOString();
    await seed(voidAt);
    const fresh = issueSigningToken(DEAL);
    expect(await signPacketDocument(fresh, "old-bos", STROKE, reading)).toEqual({ ok: false, error: "voided" });
  });

  it("refuses everything to a link minted before the void, the new copies included", async () => {
    const voidAt = new Date(Date.now() - 60_000).toISOString();
    await seed(voidAt);
    const old = issueSigningToken(DEAL, Date.now() - 5 * 60_000);
    expect(await signPacketDocument(old, "new-bos", STROKE, reading)).toEqual({ ok: false, error: "replaced" });
    expect(mockInserted("document_agreements").find((row) => row.id === "new-bos")?.has_buyer_signature).toBe(false);
  });

  it("signs the copy filed again with a link minted after the void", async () => {
    const voidAt = new Date(Date.now() - 60_000).toISOString();
    await seed(voidAt);
    const fresh = issueSigningToken(DEAL);
    expect(await signPacketDocument(fresh, "new-bos", STROKE, reading)).toMatchObject({ ok: true });
    expect(mockInserted("document_agreements").find((row) => row.id === "new-bos")).toMatchObject({ has_buyer_signature: true });
  });
});

describe("the buyer's copies after a void", () => {
  const get = (token: string, agreementId: string) =>
    buyerCopy(new NextRequest(`https://desk.example/api/sign/packet/${token}/documents/${agreementId}`), { params: Promise.resolve({ token, agreementId }) });

  it("answers 410 to a link minted before the void", async () => {
    await seed(new Date(Date.now() - 60_000).toISOString());
    const response = await get(issueSigningToken(DEAL, Date.now() - 5 * 60_000), "new-130u");
    expect(response.status).toBe(410);
    expect(fixture.pdf).not.toHaveBeenCalled();
  });

  it("answers 404 for a voided copy, and the new signed copy downloads", async () => {
    await seed(new Date(Date.now() - 60_000).toISOString());
    const token = issueSigningToken(DEAL);
    expect((await get(token, "old-130u")).status).toBe(404);
    expect((await get(token, "new-130u")).status).toBe(200);
  });

  it("refuses the state 130-U form for a voided copy and for a link minted before the void", async () => {
    await seed(new Date(Date.now() - 60_000).toISOString());
    const fetch130 = (token: string, agreementId: string) =>
      form130U(new Request("https://desk.example/x"), { params: Promise.resolve({ token: encodeURIComponent(token), agreementId }) });
    expect((await fetch130(issueSigningToken(DEAL), "old-130u")).status).toBe(404);
    expect((await fetch130(issueSigningToken(DEAL, Date.now() - 5 * 60_000), "new-130u")).status).toBe(410);
    expect((await fetch130(issueSigningToken(DEAL), "new-130u")).status).toBe(200);
  });
});

describe("what the buyer reads", () => {
  it("is a replaced-link page in both languages", () => {
    const page = readFileSync("src/app/sign/packet/[token]/page.tsx", "utf8");
    expect(page).toMatch(/if \(signingSessionRevoked\(verified\.issuedAt, rows\)\)/);
    expect(page).toMatch(/en\.replacedTitle\} · \$\{es\.replacedTitle/);
    expect(page).toMatch(/en\.replacedNote\} · \$\{es\.replacedNote/);
  });

  it("says so in the catalogue, in both languages", () => {
    for (const bundle of [en, es]) {
      const ceremony = bundle.funnel.ceremony;
      expect(ceremony.replacedTitle).toBeTruthy();
      expect(ceremony.replacedNote).toBeTruthy();
      expect(ceremony.errors.voided).toBeTruthy();
      expect(ceremony.errors.replaced).toBeTruthy();
    }
    expect(en.funnel.ceremony.errors.replaced).toBe("This signing link was replaced. Ask the desk for the new link.");
  });
});
