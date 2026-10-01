import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  censusRequest,
  looksLikeAStreet,
  readCensusMatch,
} from "@/lib/admin/address-lookup";

/**
 * The desk types a street and stops.
 *
 * "1605 Scenic Meadow" is what a person says when you ask where they live, and
 * every box under it was staying empty: no city, no ZIP, no county, on the one
 * screen whose answers reach a title application.
 *
 * The suggestion field that already existed reads this dealership's own past
 * paperwork, which is recall. It cannot help a first-time buyer at a new
 * address, and that is most of them.
 *
 * These tests pin the reasoning, not the network. Every fixture below is a real
 * response shape from the Census geocoder, including the one that would have
 * put a Houston buyer in New York.
 */

const match = (over: Record<string, unknown> = {}) => ({
  result: {
    addressMatches: [
      {
        matchedAddress: "1605 SCENIC MEADOW CT, PEARLAND, TX, 77581",
        addressComponents: { city: "PEARLAND", state: "TX", zip: "77581" },
        geographies: { Counties: [{ NAME: "Brazoria County" }] },
        ...over,
      },
    ],
  },
});

describe("it only asks when there is something to ask about", () => {
  it("waits for a whole street name, not a prefix", () => {
    // The geocoder matches a street NAME. Measured against the live service:
    // "8774 Almeda" finds nothing, "8774 Almeda Genoa" finds the lot. Asking
    // on the prefix spends a request per keystroke to be told no.
    expect(looksLikeAStreet("8774 Almeda")).toBe(false);
    expect(looksLikeAStreet("1605 Scenic")).toBe(false);
    expect(looksLikeAStreet("8774 Almeda Genoa")).toBe(true);
    expect(looksLikeAStreet("1605 Scenic Meadow")).toBe(true);
  });

  it("wants a house number, not just a street", () => {
    expect(looksLikeAStreet("Scenic Meadow Court")).toBe(false);
    expect(looksLikeAStreet("1605 Scenic Meadow Ct")).toBe(true);
  });

  it("ignores an empty or stub line", () => {
    for (const stub of ["", "   ", "16", "1605"]) {
      expect(looksLikeAStreet(stub), stub).toBe(false);
    }
  });
});

describe("which door it knocks on", () => {
  it("uses the precise one once a city exists to send", () => {
    const { url, params } = censusRequest("4802 Telephone Rd", "Houston", "TX");
    expect(url).toContain("/geographies/address");
    expect(params).toMatchObject({ street: "4802 Telephone Rd", city: "Houston", state: "TX" });
  });

  it("falls back to the one that answers from a street alone", () => {
    // The structured endpoint refuses without a city, which is the field this
    // whole feature exists to fill.
    const { url, params } = censusRequest("1605 Scenic Meadow", "", "TX");
    expect(url).toContain("/geographies/onelineaddress");
    expect(params.address).toBe("1605 Scenic Meadow");
    expect(params.city).toBeUndefined();
  });

  it("always asks for the geography, because the county is the point", () => {
    for (const city of ["", "Houston"]) {
      const { url, params } = censusRequest("1605 Scenic Meadow", city, "TX");
      expect(url).toContain("/geographies");
      expect(params.vintage).toBeTruthy();
    }
  });
});

describe("what it accepts, and what it refuses", () => {
  it("completes the address the desk half typed", () => {
    expect(readCensusMatch(match(), "TX")).toEqual({
      street: "1605 Scenic Meadow Ct",
      city: "Pearland",
      state: "TX",
      zip: "77581",
      county: "Brazoria",
    });
  });

  it("gets the county right where guessing from the city would not", () => {
    /*
      The whole reason to ask a geocoder rather than a city lookup table.
      1605 Scenic Meadow is Pearland, which most people would call Houston, and
      it is in BRAZORIA county, not Harris. A table keyed on the post town gets
      this wrong, and the 130-U has a box for it.
    */
    const found = readCensusMatch(match(), "TX");
    expect(found?.county).toBe("Brazoria");
    expect(found?.county).not.toContain("County");
  });

  it("throws away a match in the wrong state", () => {
    /*
      Measured against the live service: the one-line door searches the whole
      country, and "4802 Telephone Rd" with no city resolves to Cincinnatus,
      NEW YORK. Filling that into a Texas title application is worse than
      filling nothing, so a state that disagrees with the desk is refused.
    */
    const newYork = match({
      matchedAddress: "4802 TELEPHONE RD EXD, CINCINNATUS, NY, 13040",
      addressComponents: { city: "CINCINNATUS", state: "NY", zip: "13040" },
      geographies: { Counties: [{ NAME: "Cortland County" }] },
    });
    expect(readCensusMatch(newYork, "TX")).toBeNull();
    // And is perfectly good for a dealer who actually selected NY.
    expect(readCensusMatch(newYork, "NY")?.city).toBe("Cincinnatus");
  });

  it("refuses to pick between two streets", () => {
    // An ambiguous street is not something to guess at on a title application.
    const two = {
      result: {
        addressMatches: [
          match().result.addressMatches[0],
          { ...match().result.addressMatches[0], matchedAddress: "1605 SCENIC MEADOW DR, KATY, TX, 77494" },
        ],
      },
    };
    expect(readCensusMatch(two, "TX")).toBeNull();
  });

  it("says nothing when the service says nothing", () => {
    expect(readCensusMatch({ result: { addressMatches: [] } }, "TX")).toBeNull();
    expect(readCensusMatch({}, "TX")).toBeNull();
    expect(readCensusMatch(null, "TX")).toBeNull();
    expect(readCensusMatch({ result: { addressMatches: "nope" } }, "TX")).toBeNull();
  });

  it("refuses a half answer", () => {
    // A match with no city or no ZIP fills the form with a gap and a claim.
    expect(readCensusMatch(match({ addressComponents: { city: "", state: "TX", zip: "77581" } }), "TX")).toBeNull();
    expect(readCensusMatch(match({ addressComponents: { city: "PEARLAND", state: "TX", zip: "" } }), "TX")).toBeNull();
  });

  it("still answers when the geography is missing, minus the county", () => {
    // The address is worth having even if the county lookup came back thin.
    const noCounty = readCensusMatch(match({ geographies: {} }), "TX");
    expect(noCounty?.city).toBe("Pearland");
    expect(noCounty?.county).toBe("");
  });

  it("hands back words a document can print, not shouting", () => {
    // The Census answers in capitals; the paperwork is Title Case.
    const found = readCensusMatch(match(), "TX");
    expect(found?.city).toBe("Pearland");
    expect(found?.street).not.toBe(found?.street?.toUpperCase());
  });
});

describe("the screen it serves", () => {
  const SCREEN = readFileSync("src/components/admin/StartSale.tsx", "utf8");
  const ACTION = readFileSync("src/lib/actions/address-complete.ts", "utf8");

  it("is wired into the sale's own intake, not only the retired forms", () => {
    // AddressAutocomplete was wired into the template document forms and never
    // into Start A Sale, which is the screen a deal actually begins on.
    expect(SCREEN).toContain("completeAddress");
    expect(SCREEN).toContain("looksLikeAStreet");
  });

  it("never overwrites what somebody typed", () => {
    // A dealer who typed a city knows something the reference file does not.
    for (const guard of ["!before.city.trim()", "!before.zip.trim()", "!before.county.trim()"]) {
      expect(SCREEN, guard).toContain(guard);
    }
  });

  it("can be undone in one tap", () => {
    expect(SCREEN).toContain("filledUndo");
    expect(SCREEN).toContain("t.start.addressUndo");
  });

  it("is behind the admin session and fails silent", () => {
    expect(ACTION).toContain("getCurrentAdminAccess");
    expect(ACTION).toMatch(/catch\s*\{\s*return null;/);
    expect(ACTION).toContain("AbortSignal.timeout");
  });

  it("costs nothing and needs no key", () => {
    // The reason this service was chosen over Google Places or Smarty.
    const LOOKUP = readFileSync("src/lib/admin/address-lookup.ts", "utf8");
    expect(LOOKUP).toContain("geocoding.geo.census.gov");
    expect(LOOKUP).not.toMatch(/API_KEY|apiKey|process\.env/);
  });
});
