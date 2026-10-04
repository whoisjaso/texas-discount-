import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { titleCaseSubject } from "@/lib/email/subject";

/**
 * The owner's rule, in his words: "for the subject of every single email you
 * send through Triple J and from Triple J, every single word must be
 * capitalized regardless of anything."
 *
 * So this pins two things: that the caser does it, and that the one place
 * every email actually leaves through applies it. A template that forgets is
 * not a way for a sentence-case subject to reach an inbox.
 */
describe("every email subject is Title Case", () => {
  it("capitalises the words the templates actually send", () => {
    const cases: [string, string][] = [
      ["Reset your Triple J password", "Reset Your Triple J Password"],
      ["Your Triple J sign-in code", "Your Triple J Sign-In Code"],
      ["Confirm your email for Triple J", "Confirm Your Email For Triple J"],
      ["Your pre-approval with Triple J", "Your Pre-Approval With Triple J"],
      ["You're in: Triple J portal access", "You're In: Triple J Portal Access"],
    ];
    for (const [input, expected] of cases) {
      expect(titleCaseSubject(input), input).toBe(expected);
    }
  });

  it("capitalises Spanish too, because the instruction was every email", () => {
    expect(titleCaseSubject("Su código para entrar a Triple J")).toBe(
      "Su Código Para Entrar A Triple J",
    );
    expect(titleCaseSubject("Confirme su correo para Triple J")).toBe(
      "Confirme Su Correo Para Triple J",
    );
  });

  it("leaves alone the things capitalising would damage", () => {
    // Acronyms as typed.
    expect(titleCaseSubject("your DMV and LLC paperwork")).toBe("Your DMV And LLC Paperwork");
    // A year, a code, a trim badge: any token carrying a digit.
    expect(titleCaseSubject("your 2019 Toyota Camry")).toBe("Your 2019 Toyota Camry");
    expect(titleCaseSubject("code 481920 expires soon")).toBe("Code 481920 Expires Soon");
    // An address stays an address.
    expect(titleCaseSubject("write to info@thetriplejauto.com")).toBe(
      "Write To info@thetriplejauto.com",
    );
    expect(titleCaseSubject("open https://thetriplejauto.com/apply now")).toBe(
      "Open https://thetriplejauto.com/apply Now",
    );
  });

  it("is applied where mail actually leaves, not left to each template", () => {
    // toTitleCaseDisplay would have been the obvious reach and the wrong one:
    // it returns prose untouched, so the longer subjects would have shipped
    // in sentence case. Anchored to code, since this comment names it.
    const send = readFileSync(join(process.cwd(), "src/lib/email/send.ts"), "utf8")
      .replace(/^[ \t]*\{?\/\*[\s\S]*?\*\/\}?/gm, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(send).toMatch(/titleCaseSubject/);
    expect(send).not.toMatch(/toTitleCaseDisplay/);
  });

  it("is idempotent, so a subject already cased is not re-mangled", () => {
    const once = titleCaseSubject("Your Triple J sign-in code");
    expect(titleCaseSubject(once)).toBe(once);
  });
});
