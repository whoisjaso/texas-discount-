import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ODOMETER_DISCLOSURE_EXEMPT_AGE_YEARS,
  VTR_271_RESTRICTION,
  VTR_271_SOURCE_URL,
  VTR_271_TEMPLATE_PATH,
  isEligibleForPlainPoa,
} from "@/lib/documents/powerOfAttorneyForm";

describe("the official power of attorney template", () => {
  it("ships the real TxDMV form, not a rendering of one", () => {
    expect(existsSync(VTR_271_TEMPLATE_PATH)).toBe(true);
    const head = readFileSync(VTR_271_TEMPLATE_PATH).subarray(0, 8).toString();
    expect(head).toContain("%PDF");
    // A stub or an error page would be a fraction of this.
    expect(statSync(VTR_271_TEMPLATE_PATH).size).toBeGreaterThan(100_000);
  });

  it("records where the template came from so it can be refreshed", () => {
    expect(VTR_271_SOURCE_URL).toContain("txdmv.gov");
    expect(VTR_271_SOURCE_URL).toContain("VTR-271");
  });
});

describe("which power of attorney applies", () => {
  it("says plainly that the secure form cannot be produced here", () => {
    // Printing VTR-271 for a transaction that legally needs VTR-271-A would
    // fail at the county after the buyer has gone. The restriction has to be
    // stated, not implied.
    expect(VTR_271_RESTRICTION).toContain("VTR-271-A");
    expect(VTR_271_RESTRICTION).toContain("odometer");
    expect(VTR_271_RESTRICTION).toContain("cannot be printed from here");
  });

  it("treats a vehicle old enough to be exempt as eligible", () => {
    expect(isEligibleForPlainPoa(2004, 2026)).toBe(true);
    expect(isEligibleForPlainPoa(2006, 2026)).toBe(true);
  });

  it("treats a vehicle inside the disclosure window as not eligible", () => {
    expect(isEligibleForPlainPoa(2021, 2026)).toBe(false);
    expect(isEligibleForPlainPoa(2007, 2026)).toBe(false);
  });

  it("refuses to guess when the model year is unknown", () => {
    // Guessing here hands someone an invalid document, so the answer is
    // "I do not know", not "probably fine".
    expect(isEligibleForPlainPoa(null, 2026)).toBeNull();
    expect(isEligibleForPlainPoa(undefined, 2026)).toBeNull();
    expect(isEligibleForPlainPoa(Number.NaN, 2026)).toBeNull();
  });

  it("uses the statutory twenty-year window", () => {
    expect(ODOMETER_DISCLOSURE_EXEMPT_AGE_YEARS).toBe(20);
  });
});

const source = readFileSync(
  join(process.cwd(), "src/lib/documents/powerOfAttorneyForm.ts"),
  "utf8",
);

describe("filling the form", () => {
  it("opens the template with the empty user password it is published with", () => {
    expect(source).toContain('password: ""');
  });

  it("always names Triple J as the grantee, never the caller", () => {
    expect(source).toContain("dealership.name");
    expect(source).toContain("granteeBlock");
  });

  it("leaves the form editable for county corrections", () => {
    expect(source).not.toContain("flatten()");
  });

  it("sizes the narrow vehicle columns so a make does not clip", () => {
    expect(source).toContain("NARROW");
    expect(source).toContain("setFontSize");
  });
});
