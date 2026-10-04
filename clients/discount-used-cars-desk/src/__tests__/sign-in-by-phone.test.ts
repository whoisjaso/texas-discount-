import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { looksLikePhone } from "@/lib/auth/username";
import { neutralSentMessage } from "@/lib/auth/sign-in-codes";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (src: string) =>
  src.replace(/^[ \t]*\{?\/\*[\s\S]*?\*\/\}?/gm, "").replace(/^\s*\/\/.*$/gm, "");

const ACTION = read("src/lib/actions/sign-in-code.ts");
const USERNAME = read("src/lib/auth/username.ts");
const LOGIN = read("src/app/admin/login/page.tsx");

/**
 * The owner asked for his number attached to his email so he could sign in
 * with either. The link is `team_members.phone`, so nothing has to be kept in
 * sync: a number resolves to the same person a handle or an address does.
 */
describe("signing in with a phone number", () => {
  it("tells a number apart from a handle", () => {
    expect(looksLikePhone("8328186428")).toBe(true);
    expect(looksLikePhone("(832) 818-6428")).toBe(true);
    expect(looksLikePhone("+1 832 818 6428")).toBe(true);
    expect(looksLikePhone("18328186428")).toBe(true);

    // A handle is not a number, and neither is an address.
    expect(looksLikePhone("jason")).toBe(false);
    expect(looksLikePhone("jason99")).toBe(false);
    expect(looksLikePhone("you@example.com")).toBe(false);
    // Nine digits is not a US number, so it is not treated as one.
    expect(looksLikePhone("832818642")).toBe(false);
  });

  it("checks for a number before a handle, because ten digits is both", () => {
    const src = code(ACTION);
    const phoneAt = src.indexOf("looksLikePhone(typed)");
    const handleAt = src.indexOf("resolveLoginEmail(typed)");
    expect(phoneAt).toBeGreaterThan(-1);
    expect(handleAt).toBeGreaterThan(-1);
    expect(phoneAt).toBeLessThan(handleAt);
  });

  it("sends the code by text when a number was typed", () => {
    expect(code(ACTION)).toMatch(/issueCode\(\s*found\.email,\s*"sign_in",\s*"en",\s*\{\s*channel:\s*"sms"/);
  });

  it("resolves a number only to an active member, via the phone column", () => {
    const src = code(USERNAME);
    expect(src).toMatch(/\.eq\("phone", e164\)/);
    expect(src).toMatch(/\.eq\("status", "active"\)/);
    // Stored E.164, matched E.164. A ten-digit row would never be found.
    expect(src).toMatch(/phoneToE164/);
  });

  it("verifies against the same address the code was issued for", () => {
    // The phone is the route; the address is the identity. Completing has to
    // resolve the number back the same way, or the code would never match.
    expect(code(ACTION)).toMatch(/looksLikePhone\(identifier\)/);
    expect(code(ACTION)).toMatch(/resolveLoginPhone\(identifier\)/);
  });

  it("says how the code travels without saying who exists", () => {
    expect(neutralSentMessage("8328186428")).toContain("by text");
    expect(neutralSentMessage("you@example.com")).toContain("by email");
    // Same sentence either way: the roster is never confirmed or denied.
    expect(neutralSentMessage("8328186428")).toContain("If ");
    expect(neutralSentMessage("0000000000")).toContain("is on the team");
  });

  it("says on the screen that a number is welcome", () => {
    expect(LOGIN).toContain("Email, username, or phone");
    expect(LOGIN).toMatch(/by text if you type a number/);
  });
});
