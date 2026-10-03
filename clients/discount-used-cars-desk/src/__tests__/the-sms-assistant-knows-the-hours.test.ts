import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "@/lib/sms/ai-agent";
import { hoursLines } from "@/lib/dealership-config";

/**
 * The text assistant is told the hours and the public website, read from the
 * one config (owner's instruction 10/01/2026). Before this its business
 * context listed a phone and a street only, so a customer asking when the lot
 * opens got whatever the model made up.
 */
describe("the SMS assistant's business context", () => {
  it("carries the owner's hours, built from the config", () => {
    const lines = hoursLines("en");
    expect(SYSTEM_PROMPT).toContain(lines.weekday);
    expect(SYSTEM_PROMPT).toContain(lines.sunday);
    expect(lines.weekday).toBe("Tuesday to Saturday, 10:00 AM to 7:00 PM");
    expect(lines.sunday).toBe("Sunday And Monday: Closed");
  });

  it("names the public website and never the desk host", () => {
    expect(SYSTEM_PROMPT).toContain("www.discountusedcarsandtrucks.com");
    expect(SYSTEM_PROMPT).not.toContain("desk.");
  });

  it("is told not to state hours or a website that are not listed", () => {
    expect(SYSTEM_PROMPT).toMatch(/hours or a website that are not listed here/);
  });
});
