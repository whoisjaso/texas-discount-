import { describe, expect, it } from "vitest";
import {
  addressLine,
  personName,
  placeName,
  plate,
  stateCode,
  streetAddress,
  vehicleTerm,
  vin,
} from "@/lib/documents/normalize";

/**
 * What typed input turns into on a printed form.
 *
 * The rule the owner set: whatever case somebody types, the document comes out
 * with every word capitalised properly. These are the places where "capitalise
 * every word" is the wrong answer, which is why this file exists.
 */

describe("a name on a legal instrument", () => {
  it("calms down what somebody typed in capitals", () => {
    // The case that prompted this: the dealership's own name printed as a shout
    // on a Power of Attorney.
    expect(personName("TRIPLE J AUTO")).toBe("Triple J Auto");
    expect(personName("triple j auto")).toBe("Triple J Auto");
  });

  it("keeps a single letter as an initial", () => {
    // The J in Triple J is not a word to be lowercased.
    expect(personName("JOHN Q SAMPLE")).toBe("John Q Sample");
    expect(personName("john q. sample")).toBe("John Q. Sample");
  });

  it("writes the names that title case gets wrong", () => {
    expect(personName("MCDONALD")).toBe("McDonald");
    expect(personName("o'brien")).toBe("O'Brien");
    expect(personName("SMITH-JONES")).toBe("Smith-Jones");
    expect(personName("MACARTHUR")).toBe("MacArthur");
  });

  it("does not invent a capital inside every Mac", () => {
    // Machado is not MacHado. The rule has to know when to stop.
    expect(personName("MACHADO")).toBe("Machado");
    expect(personName("MACKENZIE")).toBe("Mackenzie");
  });

  it("writes suffixes the way they are written", () => {
    expect(personName("JOHN SMITH JR")).toBe("John Smith Jr");
    expect(personName("john smith iii")).toBe("John Smith III");
  });

  it("does not turn a leading suffix-looking name into a suffix", () => {
    // "V" is a suffix after a name and a first name in front of one.
    expect(personName("V NGUYEN")).toBe("V Nguyen");
  });

  it("lowercases particles inside a name but not at the front", () => {
    expect(personName("JUAN DE LA CRUZ")).toBe("Juan de la Cruz");
    expect(personName("VAN DYKE")).toBe("Van Dyke");
  });

  it("keeps a company's entity suffix as initials", () => {
    // Caught by an existing test rather than by reading this code: "LLC" was
    // becoming "Llc", which is the registered name of no company anywhere.
    expect(personName("TRIPLE J AUTO INVESTMENT LLC")).toBe(
      "Triple J Auto Investment LLC",
    );
    expect(personName("acme holdings inc")).toBe("Acme Holdings INC");
    // "And" keeps its capital: the owner's rule is a capital on every word,
    // and a company's registered name is not ours to restyle beyond case.
    expect(personName("smith and sons ltd")).toBe("Smith And Sons LTD");
  });

  it("returns nothing for nothing rather than the word undefined", () => {
    expect(personName(null)).toBe("");
    expect(personName(undefined)).toBe("");
    expect(personName("   ")).toBe("");
  });
});

describe("an address that has to reach a mailbox", () => {
  it("keeps directionals as capitals", () => {
    // "123 Ne Main St" reads as a typo on an envelope.
    expect(streetAddress("123 NE MAIN ST")).toBe("123 NE Main St");
    expect(streetAddress("456 sw oak ave")).toBe("456 SW Oak Ave");
  });

  it("writes PO Box properly", () => {
    expect(streetAddress("PO BOX 123")).toBe("PO Box 123");
    expect(streetAddress("po box 123")).toBe("PO Box 123");
  });

  it("keeps a unit letter capital and an ordinal lowercase", () => {
    expect(streetAddress("100 MAIN ST APT 4B")).toBe("100 Main St Apt 4B");
    expect(streetAddress("200 1ST AVE")).toBe("200 1st Ave");
  });

  it("handles the dealership's own address", () => {
    expect(streetAddress("8774 ALMEDA GENOA RD")).toBe("8774 Almeda Genoa Rd");
  });
});

describe("the pieces that are codes, not words", () => {
  it("keeps a VIN in capitals and strips the spaces people type", () => {
    expect(vin("1hgcm82633a004352")).toBe("1HGCM82633A004352");
    expect(vin("1HGCM 82633 A004352")).toBe("1HGCM82633A004352");
  });

  it("never silently corrects a VIN's characters", () => {
    // O is not a legal VIN character, but turning it into a zero on a title
    // application produces a rejected filing nobody can explain.
    expect(vin("1OGCM82633A00435O")).toBe("1OGCM82633A00435O");
  });

  it("keeps a plate in capitals", () => {
    expect(plate("abc1234")).toBe("ABC1234");
    expect(plate(" abc-123 ")).toBe("ABC-123");
  });

  it("writes a state as two capitals and leaves anything else alone", () => {
    expect(stateCode("tx")).toBe("TX");
    expect(stateCode("Tx")).toBe("TX");
    expect(stateCode("Texas")).toBe("Texas");
  });
});

describe("makes and models", () => {
  it("writes an ordinary marque as a word", () => {
    expect(vehicleTerm("FORD")).toBe("Ford");
    expect(vehicleTerm("chevrolet")).toBe("Chevrolet");
    expect(vehicleTerm("MERCEDES BENZ")).toBe("Mercedes Benz");
  });

  it("leaves the marques that are actually initials alone", () => {
    expect(vehicleTerm("BMW")).toBe("BMW");
    expect(vehicleTerm("gmc")).toBe("GMC");
    expect(vehicleTerm("ram")).toBe("RAM");
  });

  it("keeps trim codes as codes", () => {
    expect(vehicleTerm("camry XLE")).toBe("Camry XLE");
    expect(vehicleTerm("civic ex")).toBe("Civic EX");
  });

  it("keeps a letter-number designation in capitals", () => {
    expect(vehicleTerm("f-150")).toBe("F-150");
    expect(vehicleTerm("cx-5")).toBe("CX-5");
  });
});

describe("a whole address line", () => {
  it("gives each comma-separated piece the rule that suits it", () => {
    expect(addressLine("123 MAIN ST, AUSTIN, TX 78701")).toBe(
      "123 Main St, Austin, TX 78701",
    );
  });

  it("keeps a ZIP+4 intact", () => {
    expect(addressLine("123 main st, austin, tx 78701-1234")).toBe(
      "123 Main St, Austin, TX 78701-1234",
    );
  });

  it("treats a single piece as a street", () => {
    expect(addressLine("8774 ALMEDA GENOA RD")).toBe("8774 Almeda Genoa Rd");
  });
});

describe("place names", () => {
  it("title cases a city", () => {
    expect(placeName("HOUSTON")).toBe("Houston");
    expect(placeName("san antonio")).toBe("San Antonio");
  });

  it("keeps a county readable", () => {
    expect(placeName("HARRIS")).toBe("Harris");
  });
});
