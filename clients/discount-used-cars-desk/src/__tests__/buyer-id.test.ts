import { describe, expect, it } from "vitest";
import {
  EMPTY_BUYER_ID,
  applyConfirmation,
  applyExtraction,
  blockedBecause,
  hasImage,
  isComplete,
  readBuyerId,
  settled,
  mailingOneLine,
  suggestedMailing,
  unconfirmedFields,
  writeBuyerId,
  type BuyerId,
} from "@/lib/sales/buyer-id";

/** A licence photographed and read, with nothing confirmed yet. */
function scanned(overrides: Partial<BuyerId> = {}): BuyerId {
  return {
    ...EMPTY_BUYER_ID,
    image: "deals/d1/licence.jpg",
    capturedAt: "2026-08-24T00:00:00Z",
    name: { read: "ANA RUIZ", confirmed: null },
    licenseNumber: { read: "12345678", confirmed: null },
    dateOfBirth: { read: "1991-04-02", confirmed: null },
    expires: { read: "2029-04-02", confirmed: null },
    address: { read: "1 Example St, Houston TX", confirmed: null },
    ...overrides,
  };
}

describe("what the machine read is never what the paperwork uses", () => {
  /**
   * The whole design in one test. Extraction fills `read`. Only a person fills
   * `confirmed`. `settled` returns the second, so a value nobody looked at
   * cannot reach a document by accident.
   */
  it("does not treat a reader's guess as a settled value", () => {
    const id = scanned();
    expect(id.licenseNumber.read).toBe("12345678");
    expect(settled(id.licenseNumber)).toBeNull();

    const checked = applyConfirmation(id, {
      fields: { licenseNumber: "12345678" },
    });
    expect(settled(checked.licenseNumber)).toBe("12345678");
  });

  it("lets a person correct what the reader got wrong", () => {
    // The failure this exists for: OCR reads a licence number off by one and
    // the filing is rejected weeks later.
    const corrected = applyConfirmation(scanned(), {
      fields: { licenseNumber: "12345679" },
    });
    expect(corrected.licenseNumber.read).toBe("12345678");
    expect(settled(corrected.licenseNumber)).toBe("12345679");
  });

  it("counts only unreviewed guesses as outstanding, not blanks", () => {
    // A field the reader could not find is not outstanding: there is nothing
    // to check. A guess sitting unreviewed is, because it looks finished.
    const partial = scanned({ expires: { read: null, confirmed: null } });
    const open = unconfirmedFields(partial);
    expect(open).toContain("licenseNumber");
    expect(open).not.toContain("expires");
  });

  it("never lets re-reading a better photo undo a person's decision", () => {
    const checked = applyConfirmation(scanned(), {
      fields: { licenseNumber: "12345679" },
      mailing: { street: "1 Example St", city: "Houston", state: "TX", postal: null, county: null },
      mailingConfirmed: true,
    });
    const reread = applyExtraction(checked, { licenseNumber: "87654321" });

    expect(reread.licenseNumber.read).toBe("87654321");
    expect(settled(reread.licenseNumber)).toBe("12345679");
    expect(reread.mailingConfirmed).toBe(true);
  });
});

describe("the mailing address, which is the one that goes silently wrong", () => {
  it("blocks on the confirmation even when the address is filled in", () => {
    const filled = applyConfirmation(scanned(), {
      fields: {
        name: "ANA RUIZ",
        licenseNumber: "12345678",
        dateOfBirth: "1991-04-02",
        expires: "2029-04-02",
        address: "1 Example St, Houston TX",
      },
      mailing: { street: "1 Example St", city: "Houston", state: "TX", postal: null, county: null },
    });

    // Everything is present. It is still not finished, because a filled box is
    // not the same as somebody having read it.
    expect(mailingOneLine(filled)).toBe("1 Example St, Houston, TX");
    expect(isComplete(filled)).toBe(false);
    expect(blockedBecause(filled)).toMatch(/mailing address has not been confirmed/i);

    const confirmed = applyConfirmation(filled, { mailingConfirmed: true });
    expect(isComplete(confirmed)).toBe(true);
  });

  it("drops the confirmation when the address is edited afterwards", () => {
    // Somebody confirmed the old address. Nobody has looked at the new one.
    const confirmed = applyConfirmation(scanned(), {
      mailing: { street: "1 Example St", city: null, state: null, postal: null, county: null },
      mailingConfirmed: true,
    });
    expect(confirmed.mailingConfirmed).toBe(true);

    const moved = applyConfirmation(confirmed, {
      mailing: { street: "9 Other Rd", city: null, state: null, postal: null, county: null },
    });
    expect(moved.mailingConfirmed).toBe(false);
  });

  it("refuses to confirm an address that is not there", () => {
    const empty = applyConfirmation(scanned(), { mailingConfirmed: true });
    expect(empty.mailingConfirmed).toBe(false);
  });

  it("offers the licence address as a starting point, not as an answer", () => {
    const id = scanned();
    // Offered in pieces, because the boxes it fills are pieces. Handing back
    // one line here is what made somebody read a jumble at the desk.
    expect(suggestedMailing(id)).toEqual({
      street: "1 Example St",
      city: "Houston",
      state: "TX",
      postal: null,
      county: null,
    });
    // Offering it does not confirm it.
    expect(id.mailingConfirmed).toBe(false);
    expect(isComplete(id)).toBe(false);
  });
});

describe("what the desk is waiting for", () => {
  it("reports the photograph first, because nothing else can be done without it", () => {
    expect(hasImage(EMPTY_BUYER_ID)).toBe(false);
    expect(blockedBecause(EMPTY_BUYER_ID)).toMatch(/no photograph/i);
  });

  it("moves on to the unchecked values once the photo lands", () => {
    expect(blockedBecause(scanned())).toMatch(/have not been checked/i);
  });
});

describe("storage survives a round trip", () => {
  it("keeps the rest of the blob intact", () => {
    const existing = { "7": { plate_number: "ABC1234" }, funding: { type: "cash" } };
    const merged = writeBuyerId(existing, scanned());

    expect(merged["7"]).toEqual({ plate_number: "ABC1234" });
    expect((merged.funding as { type: string }).type).toBe("cash");
    expect(readBuyerId(merged).licenseNumber.read).toBe("12345678");
  });

  it("reads nothing out of a deal that was never scanned", () => {
    expect(readBuyerId({})).toEqual(EMPTY_BUYER_ID);
    expect(readBuyerId(null)).toEqual(EMPTY_BUYER_ID);
  });

  /**
   * The one that would bite in production. A truthy-but-not-true value in the
   * blob must not read as a confirmation, or a bad write elsewhere silently
   * marks an address as checked by a person who never saw it.
   */
  it("treats anything other than literal true as unconfirmed", () => {
    for (const value of ["true", 1, "yes", {}, []]) {
      const blob = { buyerId: { mailingConfirmed: value } };
      expect(readBuyerId(blob).mailingConfirmed, `for ${JSON.stringify(value)}`)
        .toBe(false);
    }
    expect(readBuyerId({ buyerId: { mailingConfirmed: true } }).mailingConfirmed)
      .toBe(true);
  });

  it("ignores a field stored as something other than an object", () => {
    const blob = { buyerId: { name: "ANA RUIZ", image: "x.jpg" } };
    expect(readBuyerId(blob).name).toEqual({ read: null, confirmed: null });
    expect(readBuyerId(blob).image).toBe("x.jpg");
  });
});
