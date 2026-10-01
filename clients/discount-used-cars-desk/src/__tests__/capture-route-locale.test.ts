import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The phone's capture link must not be locale-routed.
 *
 * Found by measurement, not by reading: /capture/<token> answered 307 to
 * /en/capture/<token>, which is not a route, so the QR code at the desk led to
 * a 404 with a customer standing there holding out their licence. The page
 * lives outside [locale] deliberately (it carries no site chrome), so the intl
 * middleware has to be told to leave it alone, exactly as it already is for the
 * document and signing portals.
 *
 * Asserted against the source rather than by booting the proxy because the
 * failure mode is a missing line in one list, and that is what this reads.
 */
describe("the phone's capture link", () => {
  const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");

  it("is exempt from locale routing, like the other tokenized portals", () => {
    // Checked as "in the same passthrough as /documents" rather than by
    // matching the block's exact punctuation, so reformatting the condition
    // does not fail this.
    const documents = proxy.indexOf('pathname.startsWith("/documents")');
    const capture = proxy.indexOf('pathname.startsWith("/capture")');
    expect(documents).toBeGreaterThan(-1);
    expect(capture).toBeGreaterThan(-1);

    const between = proxy.slice(
      Math.min(documents, capture),
      Math.max(documents, capture),
    );
    expect(between).not.toContain("return intlMiddleware");
  });

  it("returns the response unchanged rather than handing it to intl", () => {
    // The token is signed over the path it was minted for, so any rewrite of
    // that path invalidates the link. Nothing may fall through to the intl
    // middleware ahead of the locale-prefix check.
    const intlIndex = proxy.indexOf("return intlMiddleware(request)");
    const captureIndex = proxy.indexOf('pathname.startsWith("/capture")');
    expect(captureIndex).toBeGreaterThan(-1);
    expect(captureIndex).toBeLessThan(intlIndex);
  });
});
