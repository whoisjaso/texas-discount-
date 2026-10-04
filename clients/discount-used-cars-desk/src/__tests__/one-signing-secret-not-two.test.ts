import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { adminSigningSecret, SIGNING_SECRET_NAMES } from "@/lib/auth/signing-secret";

/**
 * Two pieces of the admin disagreed about what the signing secret is called,
 * and a live sale paid for it.
 *
 * The device session that sign-in issues accepted `ADMIN_SESSION_SECRET`,
 * `INTERNAL_RENDER_TOKEN` or `ADMIN_SECRET`. The buyer-id capture link
 * accepted only the first, and threw when it was missing. Its own comment
 * asserted that name was "already required for the admin to work at all",
 * which is exactly the false premise: the admin works on any of the three.
 *
 * On a deployment holding one of the other two, sign-in worked perfectly and
 * the licence step answered "This page couldn't load. A server error
 * occurred." Seen in production, on a phone, mid sale, digest 2093187135.
 *
 * The bug was never in either resolver. It was in there being two.
 */

const NAMES = ["ADMIN_SESSION_SECRET", "INTERNAL_RENDER_TOKEN", "ADMIN_SECRET"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of NAMES) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe("what counts as the signing secret", () => {
  it.each(NAMES)("accepts %s on its own", (name) => {
    process.env[name] = "a-secret";
    expect(adminSigningSecret()).toBe("a-secret");
  });

  it("prefers the explicit name when more than one is set", () => {
    // A deployment that has since set the real name should not keep signing
    // with a legacy one it never cleaned up.
    process.env.ADMIN_SECRET = "legacy";
    process.env.ADMIN_SESSION_SECRET = "explicit";
    expect(adminSigningSecret()).toBe("explicit");
  });

  it("is null when nothing at all is set", () => {
    expect(adminSigningSecret()).toBeNull();
  });

  it("ignores a variable set to blank space", () => {
    process.env.ADMIN_SESSION_SECRET = "   ";
    expect(adminSigningSecret()).toBeNull();
  });
});

describe("the capture link signs with the same secret the admin does", () => {
  async function issue() {
    const mod = await import("@/lib/sales/capture-token");
    return mod.issueCaptureToken("deal-1", 1_000_000);
  }

  it.each(NAMES)("issues a link when only %s is set", async (name) => {
    // This is the whole bug: on production, only one of the legacy names was
    // set, and this threw for two of these three cases.
    process.env[name] = "a-secret";
    await expect(issue()).resolves.toEqual(expect.any(String));
  });

  it("still refuses when nothing is configured", async () => {
    // Refusing is correct. A default secret would make every deployment's
    // links forgeable by anyone who has read the file.
    await expect(issue()).rejects.toThrow(/signing secret is required/i);
  });

  it("names every variable it would have accepted", async () => {
    // The old message named one variable, which is how somebody sets that one
    // and is still stuck. Whatever this list holds, the error says it.
    await expect(issue()).rejects.toThrow(new RegExp(SIGNING_SECRET_NAMES.join(".*")));
  });
});

describe("neither caller keeps its own copy of the list", () => {
  it.each([
    "src/lib/auth/admin-device-session.ts",
    "src/lib/sales/capture-token.ts",
  ])("%s asks the shared resolver", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain("adminSigningSecret");
    // The tell of a second copy growing back.
    expect(source).not.toMatch(/process\.env\.INTERNAL_RENDER_TOKEN/);
    expect(source).not.toMatch(/process\.env\.ADMIN_SESSION_SECRET/);
  });
});

describe("a link that cannot be signed costs the phone, not the screen", () => {
  const page = readFileSync("src/app/admin/sales/[dealId]/guide/[step]/page.tsx", "utf8");
  const step = readFileSync("src/components/admin/guide/BuyerIdStep.tsx", "utf8");

  it("catches the refusal instead of letting it escape the page", () => {
    // What turned a missing variable into a 500 on a sale in progress.
    expect(page).toMatch(/try \{[\s\S]*issueCaptureToken[\s\S]*\} catch \{/);
  });

  it("still renders the photograph when the link cannot be signed", () => {
    // The image and the fields do not depend on the token, so losing the
    // token must not lose them.
    expect(page).toMatch(/imageUrl[\s\S]*try \{[\s\S]*issueCaptureToken/);
  });

  it("falls through to the fields rather than showing a dead QR", () => {
    expect(step).toContain("const handoffReady = captureUrl.length > 0");
    // The third clause is the operator choosing to type instead of wait; the
    // fallthrough for an unsignable link is the second, same as ever.
    expect(step).toContain("if (waiting && handoffReady && !typing)");
  });

  it("says which of the two happened", () => {
    expect(step).toContain("ed-idcap-typeonly");
  });
});
