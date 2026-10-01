import { describe, expect, it } from "vitest";
import { joinAddress, readAamva, splitAddress } from "@/lib/sales/aamva";
import { readBuyerId, mailingOneLine, MAILING_FIELDS } from "@/lib/sales/buyer-id";

/**
 * The licence hands over four things and we were storing one.
 *
 * A US licence encodes the holder's address as four separate AAMVA elements,
 * DAG through DAK. This software joined them into a single string, put that
 * string in a single text box, and asked the person at the desk to check it.
 * A street, a city, a state and a postal code in one field is a jumble to read
 * and a jumble to correct, and every document downstream then has four boxes
 * waiting for the pieces we threw away.
 *
 * So the pieces survive now. What is tested here is mostly the way back: deals
 * saved before this change hold only the joined line, and the reader that looks
 * at the printed front of a card produces prose rather than elements. Both have
 * to be split, and a wrong split is worse than no split, because a city sitting
 * in the street box of a title application looks exactly like a real address.
 */

describe("the pieces the barcode actually encoded", () => {
  const raw = [
    "@\n\rANSI 636014090002DL00410288ZT03290015DL",
    "DAQI4471903",
    "DCSRIVERA",
    "DACMARISOL",
    "DAG4412 CEDAR ELM DR",
    "DAIHOUSTON",
    "DAJTX",
    "DAK770420000",
    "DCGUSA",
    "\r",
  ].join("\n");

  it("keeps them apart instead of joining and hoping", () => {
    expect(readAamva(raw).addressParts).toEqual({
      street: "4412 Cedar Elm Dr",
      city: "Houston",
      state: "TX",
      postal: "77042",
      county: null,
    });
  });

  it("still offers one line for anywhere that genuinely wants a string", () => {
    expect(readAamva(raw).address).toBe("4412 Cedar Elm Dr, Houston, TX 77042");
  });
});

describe("recovering the pieces from a line that lost them", () => {
  it.each([
    [
      "4412 Cedar Elm Dr, Houston, TX 77042",
      { street: "4412 Cedar Elm Dr", city: "Houston", state: "TX", postal: "77042", county: null },
    ],
    [
      // No commas, which is what a card prints and what the front reader sees.
      "4412 Cedar Elm Dr Houston TX 77042",
      { street: "4412 Cedar Elm Dr Houston", city: null, state: "TX", postal: "77042", county: null },
    ],
    [
      "1 Example St, Houston TX",
      { street: "1 Example St", city: "Houston", state: "TX", postal: null, county: null },
    ],
    [
      "820 W 5th St, Apt 12B, Austin, TX 78703-1180",
      { street: "820 W 5th St, Apt 12B", city: "Austin", state: "TX", postal: "78703-1180", county: null },
    ],
  ])("splits %s", (line, expected) => {
    expect(splitAddress(line)).toEqual(expected);
  });

  it("leaves what it cannot read in the street rather than guessing", () => {
    // The one box a person is certain to look at. An address this cannot parse
    // shows up whole and wrong-looking, which is fixable, instead of quietly
    // scattered into three boxes that each look plausible.
    expect(splitAddress("Rural Route 3 Box 41")).toEqual({
      street: "Rural Route 3 Box 41",
      city: null,
      state: null,
      postal: null,
      county: null,
    });
  });

  it("does not eat the end of a city that happens to be two letters", () => {
    // "Ho" is not a state, so it stays where it was written.
    expect(splitAddress("12 Main St, Rio Ho")).toEqual({
      street: "12 Main St",
      city: "Rio Ho",
      state: null,
      postal: null,
      county: null,
    });
  });

  it("is empty for an empty line", () => {
    expect(splitAddress(null)).toEqual({
      street: null,
      city: null,
      state: null,
      postal: null,
      county: null,
    });
    expect(splitAddress("   ")).toEqual({
      street: null,
      city: null,
      state: null,
      postal: null,
      county: null,
    });
  });

  it("round trips a well formed address", () => {
    const line = "4412 Cedar Elm Dr, Houston, TX 77042";
    expect(joinAddress(splitAddress(line))).toBe(line);
  });
});

describe("deals saved before any of this existed", () => {
  it("splits the old single string rather than calling it a street", () => {
    // The failure this prevents: a whole address in the street box of a title
    // application, with the city and postal code boxes empty.
    const legacy = {
      buyerId: {
        image: "some/path.jpg",
        mailingAddress: "4412 Cedar Elm Dr, Houston, TX 77042",
        mailingConfirmed: true,
      },
    };
    expect(readBuyerId(legacy).mailing).toEqual({
      street: "4412 Cedar Elm Dr",
      city: "Houston",
      state: "TX",
      postal: "77042",
      county: null,
    });
  });

  it("keeps a confirmation somebody already gave", () => {
    // Reshaping how we store an address is not a reason to make a person
    // confirm one they already stood there and confirmed.
    const legacy = {
      buyerId: { mailingAddress: "1 Example St, Houston, TX 77002", mailingConfirmed: true },
    };
    expect(readBuyerId(legacy).mailingConfirmed).toBe(true);
  });

  it("prefers the new shape when a row carries both", () => {
    const both = {
      buyerId: {
        mailing: { street: "9 Other Rd", city: "Austin", state: "tx", postal: "78701", county: null },
        mailingAddress: "1 Old St, Houston, TX 77002",
      },
    };
    const read = readBuyerId(both);
    expect(read.mailing.street).toBe("9 Other Rd");
    // Normalised on the way in, so the box shows what a form expects.
    expect(read.mailing.state).toBe("TX");
    expect(mailingOneLine(read)).toBe("9 Other Rd, Austin, TX 78701");
  });
});

describe("the form sends what the record holds", () => {
  it("has a box for every part and no more", () => {
    expect(MAILING_FIELDS.map((f) => f.key)).toEqual(["street", "city", "state", "postal"]);
  });
});
