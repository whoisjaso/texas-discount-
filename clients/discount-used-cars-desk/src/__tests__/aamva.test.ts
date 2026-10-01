import { describe, expect, it } from "vitest";
import {
  looksLikeLicence,
  parseDate,
  parseElements,
  readAamva,
} from "@/lib/sales/aamva";

/**
 * The barcode on the back of a licence, and the ways real cards deviate from
 * the standard that describes them.
 *
 * The fixtures are synthetic and contain no real person's details.
 */

const CR = "\r";
const RS = "";

// A Texas-shaped payload: ANSI header, subfile designator, then elements.
const TEXAS = [
  "@",
  "",
  CR + "ANSI 636014090002DL00410278ZT03190008DL",
  "DCAC",
  "DCBNONE",
  "DCDNONE",
  "DBA08312030",
  "DCSSAMPLE",
  "DACJOHN",
  "DADQUINCY",
  "DBD08312022",
  "DBB08311990",
  "DBC1",
  "DAYBRO",
  "DAG123 MAIN ST",
  "DAIAUSTIN",
  "DAJTX",
  "DAK787010000",
  "DAQ12345678",
  "DCGUSA",
].join("\n");

describe("reading the barcode on a licence", () => {
  it("reads the fields a sale needs", () => {
    const read = readAamva(TEXAS);
    expect(read.name).toBe("John Quincy Sample");
    expect(read.licenseNumber).toBe("12345678");
    expect(read.dateOfBirth).toBe("1990-08-31");
    expect(read.expires).toBe("2030-08-31");
    expect(read.address).toBe("123 Main St, Austin, TX 78701");
  });

  it("does not put NONE on a document", () => {
    // A middle name of literally NONE is a real thing licences do. It must not
    // reach a bill of sale.
    const noMiddle = TEXAS.replace("DADQUINCY", "DADNONE");
    expect(readAamva(noMiddle).name).toBe("John Sample");
  });

  it("keeps the case of a licence number but not of a name", () => {
    // Names are stored in block capitals and read better title-cased. A licence
    // number's case can be significant, so it is passed through untouched.
    const read = readAamva(TEXAS.replace("DAQ12345678", "DAQ12a45B78"));
    expect(read.licenseNumber).toBe("12a45B78");
    expect(read.name).toBe("John Quincy Sample");
  });

  it("drops an unused ZIP+4 block rather than printing four zeroes", () => {
    expect(readAamva(TEXAS).address).toContain("78701");
    expect(readAamva(TEXAS).address).not.toContain("0000");

    const plus4 = readAamva(TEXAS.replace("DAK787010000", "DAK787011234"));
    expect(plus4.address).toContain("78701-1234");
  });

  it("joins a second address line when the card carries one", () => {
    const withApt = TEXAS.replace("DAIAUSTIN", "DAHAPT 4B\nDAIAUSTIN");
    expect(readAamva(withApt).address).toBe(
      "123 Main St, Apt 4b, Austin, TX 78701",
    );
  });
});

describe("the two date orders", () => {
  it("reads a US card as month first", () => {
    expect(parseDate("08311990", "USA")).toBe("1990-08-31");
  });

  it("reads a Canadian card as year first", () => {
    expect(parseDate("19900831", "CAN")).toBe("1990-08-31");
  });

  it("trusts the digits over the country when they disagree", () => {
    // A US card issued under the 2000 standard still uses CCYYMMDD. 19 cannot
    // be a month, so the order is decided by the value rather than the claim.
    expect(parseDate("19900831", "USA")).toBe("1990-08-31");
  });

  it("refuses a date that cannot exist rather than inventing one", () => {
    // A misread yielding month 31 must leave the field empty for a person to
    // fill, not produce a plausible wrong date they will skim past.
    expect(parseDate("31081990", "USA")).toBeNull();
    expect(parseDate("08991990", "USA")).toBeNull();
    expect(parseDate("0831199", "USA")).toBeNull();
    expect(parseDate(null, "USA")).toBeNull();
  });
});

describe("deciding whether a barcode is a licence at all", () => {
  it("accepts a licence", () => {
    expect(looksLikeLicence(TEXAS)).toBe(true);
  });

  it("rejects a PDF417 that is not an ID", () => {
    // A camera pointed at a shipping label decodes happily. Filling a sale from
    // one would be worse than reading nothing.
    expect(looksLikeLicence("[)>01SHIPPING LABEL")).toBe(false);
    expect(looksLikeLicence("")).toBe(false);
  });

  it("rejects an AAMVA payload with no licence number", () => {
    expect(looksLikeLicence(TEXAS.replace("DAQ12345678", "DAQ"))).toBe(false);
  });
});

describe("a decoder that escapes control characters", () => {
  /**
   * Found end to end, not by reading the code.
   *
   * zxing's default text mode is "HRI", which renders every non-graphical
   * character as an angle-bracket escape. A licence came back with its record
   * separators as the literal text "<LF>", so the whole payload was one
   * meaningless line, no elements parsed, and the scanner silently rejected
   * every real card as "not a licence". The reader is now asked for plain
   * bytes, and this is the belt to that pair of braces: the parser itself no
   * longer depends on a caller getting the option right.
   */
  const ESCAPED = TEXAS.split("\n").join("<LF>").replace(CR, "<CR>");

  it("still finds the fields", () => {
    expect(looksLikeLicence(ESCAPED)).toBe(true);
    const read = readAamva(ESCAPED);
    expect(read.licenseNumber).toBe("12345678");
    expect(read.name).toBe("John Quincy Sample");
    expect(read.dateOfBirth).toBe("1990-08-31");
  });
});

describe("the element split", () => {
  it("keeps the first value when a card repeats an element", () => {
    // A later copy is likelier to be the truncated one.
    const repeated = "ANSI 6360140900\nDAQFIRST123\nDAQSECOND456";
    expect(parseElements(repeated).get("DAQ")).toBe("FIRST123");
  });

  it("accepts CR, LF and the record separator as separators", () => {
    const mixed = `ANSI 6360140900${CR}DACJOHN${RS}DCSSAMPLE\nDAQ99`;
    const el = parseElements(mixed);
    expect(el.get("DAC")).toBe("JOHN");
    expect(el.get("DCS")).toBe("SAMPLE");
    expect(el.get("DAQ")).toBe("99");
  });
});
