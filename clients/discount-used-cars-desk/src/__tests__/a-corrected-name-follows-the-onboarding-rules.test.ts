import { describe, expect, it } from "vitest";
import { checkCorrectedName, correctedNameSentence } from "@/lib/onboarding/team-rules";
import { checkStaffNamePart, staffFullName } from "@/lib/onboarding/staff-name";
import { signerFitsSellerLine } from "@/lib/fill-130u/seller-line-fit";

/**
 * Correct Name on the team screen (SOP "First sign-in: onboarding", item 6)
 * takes the legal name by exactly the rules the onboarding name step uses:
 * a first and a last name, each required, at most 60 characters, letters,
 * spaces, apostrophes, periods and hyphens only, every character printable
 * in the state form's font, and "(First Last)" fitting the 130-U seller box
 * at the 7.25pt floor. Kept as typed: trimmed, spaces collapsed, never
 * re-cased. The sentences speak about someone else's name ("the last name"),
 * because an owner is typing it.
 */

/** The longest run of a letter whose "(First Last)" still fits, for the boundary. */
function longestFitting(): number {
  let n = 1;
  while (signerFitsSellerLine(staffFullName("W".repeat(n + 1), "W"))) n += 1;
  return n;
}

describe("the same refusals as onboarding", () => {
  it.each([
    ["", "Price", { code: "empty", part: "first" }],
    ["Jason", "   ", { code: "empty", part: "last" }],
    ["A".repeat(61), "Price", { code: "tooLong", part: "first", max: 60 }],
    ["Jason", "Price 2", { code: "badChars", part: "last" }],
    ["Jason@", "Price", { code: "badChars", part: "first" }],
    ["[Not set", "Price", { code: "badChars", part: "first" }],
    ["Łukasz", "Price", { code: "unprintable", part: "first", char: "Ł" }],
  ])("refuses %j %j with the onboarding code", (first, last, problem) => {
    const checked = checkCorrectedName(first, last);
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.problem).toEqual(problem);
    // The very code the onboarding step gives the same part.
    const part = problem.part === "first" ? first : last;
    const onboarding = checkStaffNamePart(part, problem.part as "first" | "last");
    expect(onboarding.ok).toBe(false);
    if (!onboarding.ok) expect(onboarding.code).toBe(problem.code);
    expect(checked.error).toBe(correctedNameSentence(checked.problem));
  });

  it("refuses a name whose (First Last) would be cut off on the 130-U seller line", () => {
    const fits = longestFitting();
    expect(checkCorrectedName("W".repeat(fits), "W")).toMatchObject({ ok: true });
    const checked = checkCorrectedName("W".repeat(fits + 1), "W");
    expect(checked).toMatchObject({ ok: false, problem: { code: "tooLongForForm" } });
  });

  it("speaks about the person, not to them", () => {
    expect(correctedNameSentence({ code: "badChars", part: "last" })).toBe(
      "Use only letters, spaces, apostrophes, periods and hyphens in the last name.",
    );
    expect(correctedNameSentence({ code: "tooLong", part: "first", max: 60 })).toBe(
      "The first name is longer than 60 characters. Enter it as it is on their ID.",
    );
    expect(correctedNameSentence({ code: "unprintable", part: "first", char: "Ł" })).toContain('"Ł"');
    expect(correctedNameSentence({ code: "tooLongForForm" })).toContain("seller line");
  });
});

describe("kept as typed", () => {
  it("trims and collapses spaces, and never re-cases", () => {
    expect(checkCorrectedName("  Brenda ", "  Ortiz   de la  Cruz ")).toEqual({
      ok: true,
      first: "Brenda",
      last: "Ortiz de la Cruz",
      fullName: "Brenda Ortiz de la Cruz",
    });
    expect(checkCorrectedName("DeShawn", "McDonald")).toMatchObject({ fullName: "DeShawn McDonald" });
    expect(checkCorrectedName("José", "O'Neil-Peña")).toMatchObject({ ok: true, fullName: "José O'Neil-Peña" });
  });
});
