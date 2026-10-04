import { describe, expect, it } from "vitest";
import {
  applyExtraction,
  applyConfirmation,
  gapsOnly,
  hasUnreadFields,
  type BuyerId,
} from "@/lib/sales/buyer-id";

/**
 * Two readers, one set of fields, and a rule about which one wins.
 *
 * The barcode on the back of a licence is what the issuing authority encoded.
 * The print on the front is what a camera made of ink, and it will confuse 0
 * with O on a card that has been through a wash cycle. Both arrive through the
 * same `applyExtraction`, which overwrites `read` for every key it is handed.
 *
 * So the order they run in is load bearing. Hand the weaker reader a full set
 * of values after a good scan and it silently replaces DMV data with guesses,
 * on a screen where every field still looks answered and nothing looks wrong.
 * `gapsOnly` is what prevents that, and this is the file that says so.
 */

const EMPTY: BuyerId = {
  image: null,
  backImage: null,
  document: null,
  capturedAt: null,
  name: { read: null, confirmed: null },
  licenseNumber: { read: null, confirmed: null },
  dateOfBirth: { read: null, confirmed: null },
  expires: { read: null, confirmed: null },
  address: { read: null, confirmed: null },
  mailing: { street: null, city: null, state: null, postal: null, county: null },
  mailingConfirmed: false,
  nameParts: { first: null, middle: null, last: null, suffix: null },
};

/** What the barcode gave, on a card whose back read cleanly. */
const fromBarcode = applyExtraction(EMPTY, {
  name: "Marisol Andrea Guerrero",
  licenseNumber: "38291746",
  dateOfBirth: "1989-03-14",
  expires: "2031-03-14",
  address: "4412 Aldine Mail Rd, Houston, TX 77039",
});

describe("the weaker reader never overwrites the stronger one", () => {
  it("drops every field the barcode already answered", () => {
    // The front says the licence number is 3829I746, having read the 1 as an I.
    const fromFront = {
      licenseNumber: "3829I746",
      name: "Marisol Andrea Guerrer0",
      dateOfBirth: "1989-03-14",
    };

    expect(gapsOnly(fromBarcode, fromFront)).toEqual({});
  });

  it("leaves the barcode's values in place when the filtered set is applied", () => {
    const merged = applyExtraction(
      fromBarcode,
      gapsOnly(fromBarcode, { licenseNumber: "3829I746" }),
    );
    expect(merged.licenseNumber.read).toBe("38291746");
  });

  it("fills only the fields the barcode could not produce", () => {
    // A card whose barcode gave a number and nothing else, which is what a
    // scratched or partially readable strip actually produces.
    const partial = applyExtraction(EMPTY, { licenseNumber: "38291746" });

    const gaps = gapsOnly(partial, {
      licenseNumber: "3829I746",
      name: "Marisol Andrea Guerrero",
      dateOfBirth: "1989-03-14",
    });

    expect(gaps).toEqual({
      name: "Marisol Andrea Guerrero",
      dateOfBirth: "1989-03-14",
    });
  });

  it("fills everything when no barcode read at all", () => {
    const gaps = gapsOnly(EMPTY, {
      name: "Marisol Andrea Guerrero",
      licenseNumber: "38291746",
    });
    expect(gaps).toEqual({
      name: "Marisol Andrea Guerrero",
      licenseNumber: "38291746",
    });
  });

  it("never proposes a null or an empty string over an empty field", () => {
    // A reader that found nothing must leave the field looking untouched
    // rather than looking answered with nothing.
    expect(gapsOnly(EMPTY, { name: null, licenseNumber: "   " })).toEqual({});
  });
});

describe("a person's decision outranks both readers", () => {
  it("leaves a confirmed field alone even when nothing was ever read", () => {
    // Somebody typed this in by hand after both readers gave up. Rewriting
    // `read` underneath them would make the record disagree with what was on
    // screen when they made the call.
    const typed = applyConfirmation(EMPTY, { fields: { name: "Marisol Andrea Guerrero" } });
    expect(typed.name.confirmed).toBe("Marisol Andrea Guerrero");

    expect(gapsOnly(typed, { name: "Marisol Andrea Guerrer0" })).toEqual({});
  });

  it("cannot reach confirmed through the extraction path at all", () => {
    const confirmed = applyConfirmation(fromBarcode, { fields: { licenseNumber: "38291746" } });
    const after = applyExtraction(confirmed, { licenseNumber: "SOMETHING ELSE" });
    expect(after.licenseNumber.confirmed).toBe("38291746");
  });
});

describe("knowing whether the second reader is worth running", () => {
  it("says yes when nothing has been read", () => {
    expect(hasUnreadFields(EMPTY)).toBe(true);
  });

  it("says no when the barcode answered everything", () => {
    // Running OCR here would cost time for a result gapsOnly would discard.
    expect(hasUnreadFields(fromBarcode)).toBe(false);
  });

  it("says yes when the barcode answered only some of it", () => {
    expect(hasUnreadFields(applyExtraction(EMPTY, { licenseNumber: "38291746" }))).toBe(true);
  });

  it("counts a hand-typed value as answered", () => {
    const typed = applyConfirmation(fromBarcode, { fields: { name: "Marisol Guerrero" } });
    expect(hasUnreadFields(typed)).toBe(false);
  });
});
