import { describe, expect, it } from "vitest";
import { parseValidDateOfBirth } from "@/lib/customers/dob";

describe("parseValidDateOfBirth", () => {
  it("accepts plausible YYYY-MM-DD dates", () => {
    expect(parseValidDateOfBirth("1993-12-17")).toBe("1993-12-17");
    expect(parseValidDateOfBirth(" 1980-01-01 ")).toBe("1980-01-01");
  });

  it("rejects empty, malformed, and non-string values", () => {
    expect(parseValidDateOfBirth("")).toBeNull();
    expect(parseValidDateOfBirth(undefined)).toBeNull();
    expect(parseValidDateOfBirth(null)).toBeNull();
    expect(parseValidDateOfBirth(19931217)).toBeNull();
    expect(parseValidDateOfBirth("12/17/1993")).toBeNull();
    expect(parseValidDateOfBirth("1993-13-45")).toBeNull();
  });

  it("rejects implausible birth years", () => {
    expect(parseValidDateOfBirth("1850-01-01")).toBeNull();
    const thisYear = new Date().getFullYear();
    expect(parseValidDateOfBirth(`${thisYear}-01-01`)).toBeNull();
    expect(parseValidDateOfBirth(`${thisYear - 10}-01-01`)).toBeNull();
  });
});
