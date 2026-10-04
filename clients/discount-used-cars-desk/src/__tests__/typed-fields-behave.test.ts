import { describe, expect, it } from "vitest";
import {
  formatPhone,
  isCompletePhone,
  phoneDigits,
  phoneDigitsRemaining,
  phoneToE164,
} from "@/lib/forms/phone";
import {
  ID_DOCUMENT_TYPES,
  PASSPORT_COUNTRIES,
  PASSPORT_SHAPES,
  STATE_LICENCE_SHAPES,
  checkIdNumber,
  form130UIdBox,
  idDocumentType,
  idMaxLength,
  idShapesFor,
  normalizeIdNumber,
  passportIssuerName,
  readIdKind,
} from "@/lib/forms/id-document";
import { US_STATES } from "@/lib/forms/us-states";

/**
 * Fields that already know what they hold.
 *
 * We know how many digits a US phone number has and roughly what a Texas
 * licence number looks like, so the operator should not have to type the
 * punctuation, should not be able to enter an eleventh digit, and should be
 * told at the desk when a number does not match its document rather than at
 * the county window.
 */

describe("a phone number types itself", () => {
  it("brackets the area code as soon as there is one", () => {
    expect(formatPhone("713")).toBe("(713");
    expect(formatPhone("7135")).toBe("(713) 5");
    expect(formatPhone("713555")).toBe("(713) 555");
    expect(formatPhone("7135550101")).toBe("(713) 555-0101");
  });

  it("never shows punctuation around digits that are not there yet", () => {
    // An empty pair of parentheses waiting to be filled reads as a broken box.
    expect(formatPhone("")).toBe("");
    expect(formatPhone("7")).toBe("(7");
  });

  it("refuses an eleventh digit", () => {
    expect(phoneDigits("71355501011234")).toBe("7135550101");
    expect(formatPhone("71355501019")).toBe("(713) 555-0101");
  });

  it("treats a leading 1 as a habit rather than a digit", () => {
    // Somebody typing 1 713 555 0101 means the same number and should not be
    // told they have run out of room.
    expect(phoneDigits("17135550101")).toBe("7135550101");
    expect(formatPhone("1 713 555 0101")).toBe("(713) 555-0101");
  });

  it("survives whatever punctuation somebody pastes in", () => {
    for (const typed of [
      "(713) 555-0101",
      "713.555.0101",
      "713-555-0101",
      "+1 (713) 555 0101",
      " 713 555 0101 ",
    ]) {
      expect(phoneDigits(typed)).toBe("7135550101");
    }
  });

  it("knows when it is finished", () => {
    expect(isCompletePhone("713555010")).toBe(false);
    expect(isCompletePhone("(713) 555-0101")).toBe(true);
    expect(phoneDigitsRemaining("713555")).toBe(4);
    expect(phoneDigitsRemaining("7135550101")).toBe(0);
  });

  it("stores one shape, so a returning buyer is findable", () => {
    expect(phoneToE164("(713) 555-0101")).toBe("+17135550101");
    expect(phoneToE164("713.555.0101")).toBe("+17135550101");
    // An incomplete number has no storable form, and inventing one would make
    // a half-typed number look like a real contact detail.
    expect(phoneToE164("713555")).toBeNull();
  });
});

describe("the kind of ID is asked before the number", () => {
  it("offers the driver licence first, because that is what a lot sees", () => {
    expect(ID_DOCUMENT_TYPES[0].kind).toBe("stateLicence");
    expect(ID_DOCUMENT_TYPES[0].label).toBe("Driver Licence");
  });

  it("knows which kinds belong to a state", () => {
    expect(idDocumentType("stateLicence").needsState).toBe(true);
    expect(idDocumentType("stateIdCard").needsState).toBe(true);
    expect(idDocumentType("passport").needsState).toBe(false);
  });

  it("falls back to Other rather than throwing on an unknown kind", () => {
    expect(idDocumentType("nonsense" as never).kind).toBe("other");
  });
});

describe("a number is checked against its own document", () => {
  it("knows a Texas licence is eight digits, or seven on the oldest cards", () => {
    expect(checkIdNumber("stateLicence", "38291746", "TX").warning).toBeNull();
    expect(checkIdNumber("stateLicence", "3829174", "TX").warning).toBeNull();
    expect(checkIdNumber("stateLicence", "382917", "TX").warning).toContain("7 to 8 characters");
    expect(checkIdNumber("stateLicence", "382917461", "TX").warning).toContain("7 to 8 characters");
  });

  it("names the letter that should have been a digit", () => {
    // Nearly always an O read as a 0, by a person or by the barcode reader.
    const check = checkIdNumber("stateLicence", "3829I746", "TX");
    expect(check.warning).toContain("all digits");
    expect(check.warning).toContain("0");
  });

  it("uses the right rule for a different state", () => {
    // Georgia has issued 7, 8 and 9 digit numbers, so all three lengths are
    // real cards and none of them gets a comment.
    expect(checkIdNumber("stateLicence", "123456789", "GA").warning).toBeNull();
    expect(checkIdNumber("stateLicence", "38291746", "GA").warning).toBeNull();
    expect(checkIdNumber("stateLicence", "123456", "GA").warning).toContain("7 to 9 characters");
  });

  it("knows a passport is nine characters and may carry letters", () => {
    expect(checkIdNumber("passport", "A12345678").warning).toBeNull();
    expect(checkIdNumber("passport", "12345").warning).toContain("9 characters");
  });

  /*
    Every state's real cards pass their own rule.

    One number per published format, for all fifty states and DC, so a
    format the table forgot fails here by state name rather than at a desk.
    The audit widened several states (Illinois and Kentucky's newer lengths,
    New York's older shapes, Virginia's longer numbers, Nevada's twelve
    digit cards, the letter-led numbers in Colorado, Indiana and Ohio) and
    each widening is a card below.
  */
  const REAL_CARDS: Record<string, string[]> = {
    AL: ["1234567", "12345678"], AK: ["1234567", "12"], AZ: ["B12345678", "123456789", "AB123"],
    AR: ["123456789", "1234"], CA: ["A1234567"], CO: ["123456789", "A123456", "AB12345"],
    CT: ["123456789"], DE: ["1234567", "1"], DC: ["1234567", "123456789"], FL: ["A123456789012"],
    GA: ["123456789", "1234567"], HI: ["H12345678", "123456789"], ID: ["AB123456C", "123456789"],
    IL: ["A12345678901", "A123456789012"], IN: ["1234567890", "123456789", "A123456789"],
    IA: ["123456789", "123AB1234"], KS: ["K12345678", "123456789", "A1B2C"],
    KY: ["K12345678", "K123456789", "123456789"], LA: ["001234567", "1234567"],
    ME: ["1234567", "12345678", "1234567A"], MD: ["M123456789012"], MA: ["S12345678", "123456789"],
    MI: ["M1234567890", "M123456789012"], MN: ["M123456789012"], MS: ["123456789"],
    MO: ["M12345", "M123456789", "123456789", "12345678AB", "123456789A"],
    MT: ["M12345678", "123456789", "1234567890123", "12345678901234"], NE: ["A123456", "A12345678"],
    NV: ["123456789", "1234567890", "123456789012", "X12345678"], NH: ["12ABC12345", "ABC12345678"],
    NJ: ["A12345678901234"], NM: ["12345678", "123456789"],
    NY: ["123456789", "12345678", "1234567890123456", "A1234567", "A123456789012345678", "ABCDEFGH"],
    NC: ["123456789012", "1"], ND: ["123456789", "ABC123456"], OH: ["AB123456", "A1234", "A12345678", "12345678"],
    OK: ["123456789", "A123456789"], OR: ["123456789", "1", "A123456", "A1234567"], PA: ["12345678"],
    RI: ["1234567", "V123456"], SC: ["12345", "12345678901"], SD: ["123456", "1234567890", "123456789012"],
    TN: ["1234567", "123456789"], TX: ["12345678", "1234567"], UT: ["1234", "1234567890"],
    VT: ["12345678", "1234567A"], VA: ["A12345678", "A12345678901", "123456789"], WA: ["WDL12345678A", "DOEJO123ABCD"],
    WV: ["1234567", "A12345", "AB123456"], WI: ["S1234567890123"], WY: ["123456789", "1234567890"],
  };

  it("knows every state and DC, so no real card is questioned", () => {
    for (const state of US_STATES) {
      expect(STATE_LICENCE_SHAPES[state.code], `${state.code} has a rule`).toBeTruthy();
      expect(REAL_CARDS[state.code], `${state.code} has a real card to check`).toBeTruthy();
      for (const card of REAL_CARDS[state.code]) {
        expect(checkIdNumber("stateLicence", card, state.code).warning, `${state.code} ${card}`).toBeNull();
        expect(card.length, `${state.code} ${card} fits its own field`).toBeLessThanOrEqual(idMaxLength("stateLicence", state.code));
      }
    }
  });

  it("still catches the digit that was dropped from a Texas card", () => {
    expect(checkIdNumber("stateLicence", "123456", "TX").warning).toContain("7 to 8 characters");
    expect(checkIdNumber("stateLicence", "123456789", "PA").warning).toContain("8 characters");
  });
});

describe("a passport is checked against its own country", () => {
  it("offers the countries a Houston lot actually sees, the United States first", () => {
    expect(PASSPORT_COUNTRIES[0]).toEqual({ code: "US", name: "United States" });
    expect(PASSPORT_COUNTRIES.map((c) => c.code)).toEqual(expect.arrayContaining(["MX", "HN", "SV", "GT", "NG", "IN", "VN"]));
    expect(PASSPORT_COUNTRIES.at(-1)?.code).toBe("OTHER");
    expect(passportIssuerName("MX")).toBe("Mexico");
  });

  /*
    One real number per listed country, in the shape its passport office
    prints. A country the table names with the wrong shape would flag a
    real passport at the desk, which is the one failure this must not
    produce.
  */
  const REAL_PASSPORTS: Record<string, string[]> = {
    US: ["123456789", "A12345678"], MX: ["G12345678"], HN: ["E123456", "E1234567"], SV: ["A1234567", "B12345678"],
    GT: ["123456789", "ABC123456"], NI: ["C1234567"], VE: ["123456789", "012345678"], CO: ["AV123456"],
    CU: ["K123456"], DO: ["RD1234567"], NG: ["A12345678"], IN: ["Z1234567"], VN: ["C1234567"],
    CN: ["E12345678", "EA1234567"], PH: ["P1234567A", "EC1234567"], PK: ["AB1234567"], CA: ["AB123456"],
    GB: ["123456789"], BR: ["FF123456"], PE: ["123456789"], EC: ["A1234567"], AR: ["AAB123456"],
    DE: ["C01X00T47"], FR: ["12AB12345"], KR: ["M12345678"], JP: ["TK1234567"],
  };

  it("passes every listed country's real passport", () => {
    for (const country of PASSPORT_COUNTRIES) {
      if (country.code === "OTHER") continue;
      expect(PASSPORT_SHAPES[country.code], `${country.code} has a shape`).toBeTruthy();
      for (const number of REAL_PASSPORTS[country.code]) {
        expect(checkIdNumber("passport", number, country.code).warning, `${country.code} ${number}`).toBeNull();
      }
    }
  });

  it("names the country when the number is the wrong length for it", () => {
    // A Mexican passport is a letter and eight digits. Seven digits is a
    // dropped one, and the warning says whose rule it is.
    const check = checkIdNumber("passport", "G1234567", "MX");
    expect(check.warning).toContain("Mexico passport");
    expect(check.warning).toContain("9 characters");
  });

  it("holds every passport to the ICAO ceiling, whatever the country", () => {
    // The machine readable zone has nine characters for the number, on
    // every passport on earth. Ten is a typo anywhere.
    expect(checkIdNumber("passport", "A123456789", "OTHER").warning).toContain("at most 9");
    expect(checkIdNumber("passport", "AB123456", "OTHER").warning).toBeNull();
    expect(checkIdNumber("passport", "AB1234", "ZZ").warning).toBeNull();
    expect(idMaxLength("passport", "OTHER")).toBe(9);
    expect(idMaxLength("passport", "MX")).toBe(9);
  });

  it("asks for the country, not a state", () => {
    expect(idDocumentType("passport").needsCountry).toBe(true);
    expect(idDocumentType("stateLicence").needsCountry).toBe(false);
    expect(idDocumentType("militaryId").needsCountry).toBe(false);
  });

  it("opens the number pad only where every real number is digits", () => {
    // The intake screen chooses its keyboard from these shapes.
    expect(idShapesFor("stateLicence", "TX")?.every((s) => s.kind === "digits")).toBe(true);
    expect(idShapesFor("passport", "GB")?.every((s) => s.kind === "digits")).toBe(true);
    expect(idShapesFor("passport", "MX")?.every((s) => s.kind === "digits")).toBe(false);
    expect(idShapesFor("stateIdCard", "TX")).toBeUndefined();
  });

  it("reads an older record with no kind as a licence", () => {
    expect(readIdKind(undefined)).toBe("stateLicence");
    expect(readIdKind("passport")).toBe("passport");
    expect(readIdKind("nonsense")).toBe("stateLicence");
  });

  it("says nothing about a place whose format it does not know", () => {
    // Inventing a rule is how a real customer gets stopped at a desk over a
    // number that is genuinely on their card. Every US state is known now,
    // so the unknown case is a code that is not a state at all.
    expect(checkIdNumber("stateLicence", "XYZ", "ZZ").warning).toBeNull();
    expect(checkIdNumber("other", "anything at all").warning).toBeNull();
  });

  it("says nothing about an empty box", () => {
    // A field somebody has not reached yet is not a mistake.
    expect(checkIdNumber("stateLicence", "", "TX").warning).toBeNull();
  });

  it("warns rather than blocks, always", () => {
    // Every path returns a warning string or null. There is no rejection here
    // on purpose: states reissue formats and grandfather old numbers.
    const check = checkIdNumber("stateLicence", "1", "TX");
    expect(typeof check.warning === "string" || check.warning === null).toBe(true);
    expect(Object.keys(check)).toEqual(["warning"]);
  });
});

describe("what the field will hold", () => {
  it("stops a Texas licence at eight", () => {
    expect(idMaxLength("stateLicence", "TX")).toBe(8);
    expect(idMaxLength("stateLicence", "FL")).toBe(13);
  });

  it("is generous when the format is unknown", () => {
    // Refusing a real number is worse than accepting a long one. AAMVA caps
    // the customer number at 25 characters and leaves the format to each
    // jurisdiction, so the unknown case gets the standard's own ceiling.
    expect(idMaxLength("stateLicence", "ZZ")).toBe(25);
    expect(idMaxLength("other")).toBe(25);
  });

  it("holds the longest format a state has ever issued", () => {
    // Oklahoma issues 9 digits and also 1 letter then 9 digits. The field
    // has to hold the longer one, or the longer real card cannot be typed.
    expect(idMaxLength("stateLicence", "OK")).toBe(10);
    expect(idMaxLength("stateLicence", "WY")).toBe(10);
  });

  it("normalises what somebody pasted", () => {
    expect(normalizeIdNumber("3829-1746")).toBe("38291746");
    expect(normalizeIdNumber(" a12 345 678 ")).toBe("A12345678");
  });
});

describe("the 130-U wants to know which kind was presented", () => {
  it("maps each kind to the box on the official form", () => {
    // The form has no generic identification field. It lists the acceptable
    // kinds and asks which one.
    expect(form130UIdBox("stateLicence")).toBe("U.S. Driver License/ID Card");
    expect(form130UIdBox("stateIdCard")).toBe("U.S. Driver License/ID Card");
    expect(form130UIdBox("passport")).toBe("Passport");
    expect(form130UIdBox("militaryId")).toBe("US Military ID");
  });

  it("ticks nothing for a document the form does not list", () => {
    expect(form130UIdBox("other")).toBeNull();
  });
});
