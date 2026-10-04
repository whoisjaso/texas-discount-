import { describe, expect, it } from "vitest";
import { US_STATES } from "@/lib/forms/us-states";
import {
  STATE_LICENCE_SHAPES,
  checkIdNumber,
  idMaxLength,
} from "@/lib/forms/id-document";

/**
 * Every state, every shape, and never a block.
 *
 * A buyer can walk in with a licence from any of the fifty states or DC, so
 * the issuing state list has to hold all of them and the number check has to
 * know what each one looks like. And because states reissue formats and
 * grandfather old numbers, everything the check says stays a warning. A rule
 * that blocked would eventually stop a real customer buying a real car over
 * a number that is genuinely printed on their card.
 */

describe("the state list is complete", () => {
  it("holds the fifty states and DC", () => {
    expect(US_STATES).toHaveLength(51);
    const codes = new Set(US_STATES.map((state) => state.code));
    expect(codes.size).toBe(51);
    expect(codes.has("TX")).toBe(true);
    expect(codes.has("DC")).toBe(true);
  });

  it("uses the two letter postal code, uppercase, for every entry", () => {
    for (const state of US_STATES) {
      expect(state.code).toMatch(/^[A-Z]{2}$/);
      expect(state.name.length).toBeGreaterThan(3);
    }
  });

  it("stays in alphabetical order by name, so a person can hunt in it", () => {
    const names = US_STATES.map((state) => state.name);
    expect(names).toEqual([...names].sort());
  });
});

describe("every state has a licence shape", () => {
  it("knows a shape for all 51, so no card falls through unchecked", () => {
    for (const state of US_STATES) {
      const shapes = STATE_LICENCE_SHAPES[state.code];
      expect(shapes, `${state.code} has no licence shape`).toBeDefined();
      expect(shapes.length).toBeGreaterThan(0);
      for (const shape of shapes) {
        expect(shape.min).toBeGreaterThan(0);
        expect(shape.max).toBeGreaterThanOrEqual(shape.min);
      }
    }
  });

  it("gives every state a real field length", () => {
    for (const state of US_STATES) {
      const max = idMaxLength("stateLicence", state.code);
      expect(max).toBeGreaterThanOrEqual(1);
      expect(max).toBeLessThanOrEqual(20);
    }
  });
});

describe("the shapes match the cards states actually print", () => {
  it("still knows a Texas licence is eight digits, or seven on the oldest cards", () => {
    expect(checkIdNumber("stateLicence", "38291746", "TX").warning).toBeNull();
    expect(checkIdNumber("stateLicence", "3829174", "TX").warning).toBeNull();
    expect(checkIdNumber("stateLicence", "382917", "TX").warning).toContain("7 to 8 characters");
  });

  it("accepts a California letter and seven digits", () => {
    expect(checkIdNumber("stateLicence", "A1234567", "CA").warning).toBeNull();
  });

  it("accepts a Florida letter and twelve digits", () => {
    expect(checkIdNumber("stateLicence", "L120540685550", "FL").warning).toBeNull();
  });

  it("accepts every format a multi-format state has issued", () => {
    // Oklahoma prints 9 digits and also a letter then 9 digits. Both are
    // real cards, so both walk in without a comment.
    expect(checkIdNumber("stateLicence", "123456789", "OK").warning).toBeNull();
    expect(checkIdNumber("stateLicence", "F123456789", "OK").warning).toBeNull();
    // Montana prints 13 digits and also 9 letters and digits.
    expect(checkIdNumber("stateLicence", "1234567890123", "MT").warning).toBeNull();
    expect(checkIdNumber("stateLicence", "0417A53293", "MT").warning).not.toBeNull();
    expect(checkIdNumber("stateLicence", "A12345678", "MT").warning).toBeNull();
    // DC prints 7 digits and also 9 digits, and nothing in between.
    expect(checkIdNumber("stateLicence", "1234567", "DC").warning).toBeNull();
    expect(checkIdNumber("stateLicence", "123456789", "DC").warning).toBeNull();
    expect(checkIdNumber("stateLicence", "12345678", "DC").warning).toContain("7 or 9");
  });

  it("still names the letter that should have been a digit", () => {
    const check = checkIdNumber("stateLicence", "3829I746", "TX");
    expect(check.warning).toContain("all digits");
    expect(check.warning).toContain("0");
  });
});

describe("the check never blocks", () => {
  it("only ever answers with a warning string or nothing", () => {
    // The contract is the shape of the answer: one field, warning, holding a
    // string or null. There is no ok flag, no error, no throw, so no caller
    // can build a block out of it.
    const awkwardNumbers = ["", "1", "0".repeat(20), "A".repeat(20), "3829I746", "A1234567"];
    for (const state of US_STATES) {
      for (const number of awkwardNumbers) {
        const check = checkIdNumber("stateLicence", number, state.code);
        expect(Object.keys(check)).toEqual(["warning"]);
        expect(typeof check.warning === "string" || check.warning === null).toBe(true);
      }
    }
  });
});
