import { describe, expect, it } from "vitest";
import { looksLikeLicenceFront, readLicenceFront } from "@/lib/sales/licence-front";

/**
 * Reading the printed front of a licence.
 *
 * The fixtures below are not written by hand. They are the literal output of
 * the reader this parser is fed by, captured from a rendered Texas card at
 * 2000px wide after greyscale and contrast normalisation. That matters: a
 * hand-written fixture would say `3 DOB 03/14/1989`, the parser would be built
 * to match it, and the first real card would arrive as `3bp0B` and read nothing.
 *
 * Note what the reader damaged. Every label is wrong in a different way and
 * every value is perfect. That asymmetry is the whole design of the parser.
 */

/** Verbatim reader output, clean render. */
const CLEAN = `TEXAS DRIVER LICENSE

4dDL 38291746

1 GUERRERO

2 MARISOL ANDREA

8 4412 ALDINE MAIL RD PHOTO
HOUSTON, TX 77039

3D0B 03/14/1989 15 Sex F

4b EXP 03/14/2031 16 Hgt 5-04

4alsS 02/02/2024 18 Eyes BRO

9Class C 12 Rest A`;

/** Verbatim reader output, blurred and recompressed to imitate a phone photo. */
const PHOTOGRAPHED = `TEXAS DRIVER LICENSE

4dDL 38291746

1 GUERRERO

2 MARISOL ANDREA

8 4412 ALDINE MAIL RD PHOTO
HOUSTON, TX 77039

3bp0B 03/14/1989 15 Sex F

4bExP 03/14/2031 16 Hgt 5-04

4aisS 02/02/2024 18 Eyes BRO

9Class C 12 Rest A`;

describe("what the reader actually produced", () => {
  for (const [label, fixture] of [
    ["a clean render", CLEAN],
    ["a photographed card", PHOTOGRAPHED],
  ] as const) {
    describe(label, () => {
      const read = readLicenceFront(fixture);

      it("reads the name, given names first", () => {
        expect(read.name).toBe("Marisol Andrea Guerrero");
      });

      it("reads the licence number without touching its case", () => {
        expect(read.licenseNumber).toBe("38291746");
      });

      it("reads the date of birth", () => {
        expect(read.dateOfBirth).toBe("1989-03-14");
      });

      it("reads the expiry, and does not mistake the issue date for it", () => {
        expect(read.expires).toBe("2031-03-14");
      });

      it("reads the address and drops the caption of the portrait box", () => {
        // "PHOTO" is printed beside the street on the card and the reader runs
        // straight across it.
        expect(read.address).toBe("4412 Aldine Mail Rd, Houston, TX 77039");
      });

      it("is recognised as a licence", () => {
        expect(looksLikeLicenceFront(fixture)).toBe(true);
      });
    });
  }
});

describe("the dates, which is where a wrong answer is silent", () => {
  it("uses the label when the label survived", () => {
    const read = readLicenceFront("3 DOB 01/02/1990\n4b EXP 01/02/2030\n4a ISS 01/02/2022");
    expect(read.dateOfBirth).toBe("1990-01-02");
    expect(read.expires).toBe("2030-01-02");
  });

  it("falls back to order when every label is unreadable", () => {
    // Born, then issued, then expires. True of every licence, and it needs no
    // label at all.
    const read = readLicenceFront("### 01/02/1990\n@@@ 01/02/2022\n%%% 01/02/2030");
    expect(read.dateOfBirth).toBe("1990-01-02");
    expect(read.expires).toBe("2030-01-02");
  });

  it("never lets the issue date become the expiry", () => {
    const read = readLicenceFront("3 DOB 05/05/1980\n4a ISS 06/06/2020\n4b EXP 07/07/2028");
    expect(read.expires).toBe("2028-07-07");
  });

  it("proposes nothing when the two dates come out impossible", () => {
    // An expiry before a birth means the reader misassigned them. Proposing
    // either would put a confident wrong date in front of somebody.
    const read = readLicenceFront("3 DOB 01/01/2030\n4b EXP 01/01/1990");
    expect(read.dateOfBirth).toBeNull();
    expect(read.expires).toBeNull();
  });

  it("refuses a date that does not exist", () => {
    expect(readLicenceFront("3 DOB 02/31/1990").dateOfBirth).toBeNull();
    expect(readLicenceFront("3 DOB 13/01/1990").dateOfBirth).toBeNull();
  });

  it("refuses a year no licence holder was born in", () => {
    expect(readLicenceFront("3 DOB 01/01/1704").dateOfBirth).toBeNull();
  });
});

describe("the licence number", () => {
  it("does not mistake a date for one", () => {
    // 03141989 is eight digits, which is exactly the shape of a Texas number.
    const read = readLicenceFront("3 DOB 03/14/1989\n4b EXP 03/14/2031");
    expect(read.licenseNumber).toBeNull();
  });

  it("reads a number carrying letters", () => {
    expect(readLicenceFront("4d DL A1234567").licenseNumber).toBe("A1234567");
  });

  it("finds a bare number when the label is gone", () => {
    expect(readLicenceFront("TEXAS\n38291746\n1 SMITH").licenseNumber).toBe("38291746");
  });
});

describe("the name", () => {
  it("is not confused by the other fields that begin with a 1", () => {
    // 12 Restrictions, 15 Sex, 16 Height, 18 Eyes all start with a 1.
    const read = readLicenceFront("12 Rest A\n15 Sex F\n16 Hgt 5-04\n18 Eyes BRO");
    expect(read.name).toBeNull();
  });

  it("reads a family name alone when the given names did not survive", () => {
    expect(readLicenceFront("1 GUERRERO").name).toBe("Guerrero");
  });

  it("keeps a hyphenated name together", () => {
    expect(readLicenceFront("1 SMITH-JONES\n2 ANA").name).toBe("Ana Smith-Jones");
  });
});

describe("the address", () => {
  it("keeps the town on one line rather than guessing where the street ends", () => {
    // Nothing separates "12 Main St Houston" into its two halves without
    // guessing: a town can be one word or three, and so can the end of a
    // street. The state and postal code are still normalised. A missing comma
    // is a far smaller problem than silently moving somebody to another town.
    expect(readLicenceFront("8 12 MAIN ST HOUSTON, TX 77002").address).toBe(
      "12 Main St Houston, TX 77002",
    );
  });

  it("keeps a nine digit postal code readable", () => {
    expect(readLicenceFront("8 12 MAIN ST\nHOUSTON, TX 770021234").address).toBe(
      "12 Main St, Houston, TX 77002-1234",
    );
  });

  it("keeps a street that happens to be named like card chrome", () => {
    // Only a trailing chrome word is dropped, so Donor Lane survives.
    expect(readLicenceFront("8 900 DONOR LN\nHOUSTON, TX 77002").address).toBe(
      "900 Donor Ln, Houston, TX 77002",
    );
  });
});

describe("refusing things that are not licences", () => {
  it("rejects an empty read", () => {
    expect(looksLikeLicenceFront("")).toBe(false);
  });

  it("rejects a loyalty card", () => {
    expect(looksLikeLicenceFront("COFFEE CLUB\nBUY 9 GET 1 FREE\nMEMBER 12345")).toBe(false);
  });

  it("rejects a page that merely talks about licences", () => {
    // A photograph of a leaflet about driver licences is not a driver licence.
    expect(
      looksLikeLicenceFront("HOW TO RENEW YOUR DRIVER LICENSE\nVisit your county office."),
    ).toBe(false);
  });

  it("accepts a card that names itself and reads one field", () => {
    expect(looksLikeLicenceFront("DRIVER LICENSE\n4d DL 38291746")).toBe(true);
  });

  it("accepts a card whose header was cut off but whose fields read", () => {
    expect(
      looksLikeLicenceFront("4dDL 38291746\n1 GUERRERO\n2 MARISOL\n3 DOB 03/14/1989\n4b EXP 03/14/2031"),
    ).toBe(true);
  });
});

describe("the parser cannot invent", () => {
  it("returns nulls for text that carries nothing", () => {
    expect(readLicenceFront("")).toEqual({
      name: null,
      licenseNumber: null,
      dateOfBirth: null,
      expires: null,
      address: null,
      // Nothing in, four nothings out. The parts are the shape the rest of the
      // product reads an address in, so they are always present and always
      // empty rather than sometimes absent.
      addressParts: { street: null, city: null, state: null, postal: null, county: null },
    });
  });
});
