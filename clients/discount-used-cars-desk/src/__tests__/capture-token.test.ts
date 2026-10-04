import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAPTURE_TTL_MS,
  captureUrl,
  issueCaptureToken,
  verifyCaptureToken,
} from "@/lib/sales/capture-token";

const SECRET = "test-secret-not-a-real-one";
let original: string | undefined;

beforeEach(() => {
  original = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = original;
});

const NOW = 1_800_000_000_000;

describe("the capture link", () => {
  it("round trips the deal it was issued for", () => {
    const token = issueCaptureToken("deal-1", NOW);
    const result = verifyCaptureToken(token, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dealId).toBe("deal-1");
      expect(result.expiresAt).toBe(NOW + CAPTURE_TTL_MS);
    }
  });

  it("expires, and is still valid one millisecond before", () => {
    const token = issueCaptureToken("deal-1", NOW);
    expect(verifyCaptureToken(token, NOW + CAPTURE_TTL_MS - 1).ok).toBe(true);
    const dead = verifyCaptureToken(token, NOW + CAPTURE_TTL_MS);
    expect(dead.ok).toBe(false);
    if (!dead.ok) expect(dead.reason).toBe("expired");
  });

  /**
   * The one that matters. Without this, anyone who sees one link can attach a
   * photograph to any deal by editing the id in the URL.
   */
  it("cannot be pointed at a different deal", () => {
    const token = issueCaptureToken("deal-1", NOW);
    const [purpose, , expires, signature] = token.split(".");
    const forged = [purpose, "deal-2", expires, signature].join(".");

    const result = verifyCaptureToken(forged, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-signature");
  });

  it("cannot have its expiry extended", () => {
    const token = issueCaptureToken("deal-1", NOW);
    const [purpose, dealId, , signature] = token.split(".");
    const forged = [purpose, dealId, String(NOW + 10 * CAPTURE_TTL_MS), signature].join(".");

    const result = verifyCaptureToken(forged, NOW);
    expect(result.ok).toBe(false);
    // Reported as forged rather than expired: editing the timestamp teaches
    // an attacker nothing, because the signature is checked first.
    if (!result.ok) expect(result.reason).toBe("bad-signature");
  });

  it("does not accept a token signed with a different secret", () => {
    const token = issueCaptureToken("deal-1", NOW);
    process.env.ADMIN_SESSION_SECRET = "a-different-secret";
    const result = verifyCaptureToken(token, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-signature");
  });

  it("rejects rubbish without throwing", () => {
    for (const bad of ["", "   ", "a.b.c", "a.b.c.d.e", null, undefined, "....."]) {
      const result = verifyCaptureToken(bad as string, NOW);
      expect(result.ok, `for ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it("refuses to issue a link with no secret configured", () => {
    delete process.env.ADMIN_SESSION_SECRET;
    // A default secret would make every deployment forgeable by anyone who has
    // read the source, so refusing is the correct behaviour.
    expect(() => issueCaptureToken("deal-1", NOW)).toThrow(/ADMIN_SESSION_SECRET/);
  });

  it("builds a URL without doubling the slash", () => {
    const token = issueCaptureToken("deal-1", NOW);
    expect(captureUrl("https://example.test/", token)).toBe(
      `https://example.test/capture/${encodeURIComponent(token)}`,
    );
    expect(captureUrl("https://example.test", token)).toBe(
      `https://example.test/capture/${encodeURIComponent(token)}`,
    );
  });
});
