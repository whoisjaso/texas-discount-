import { describe, expect, it } from "vitest";
import {
  EMPTY_BUYER_ID,
  applyConfirmation,
  nameForForms,
  readBuyerId,
  writeBuyerId,
} from "@/lib/sales/buyer-id";
import {
  hasName,
  joinName,
  nameSplitIsUncertain,
  splitPersonName,
} from "@/lib/forms/person-name";
import { fillPowerOfAttorney } from "@/lib/documents/powerOfAttorneyForm";
import { VTR_271_COLUMNS } from "@/lib/forms/vtr-271-columns";
import { columnAt } from "@/lib/forms/box-columns";

/**
 * A name typed into four boxes beats a name taken apart by rule.
 *
 * The state forms print First, Middle, Last and Suffix as four boxes. When a
 * deal stores one string, something has to decide where the surname begins,
 * and for a three-word name that decision cannot be made correctly: "Ana
 * Maria Garcia" and "John Michael Smith" are the same shape and only one of
 * the two splits is right. So the boxes are asked at intake and the split is
 * kept only for the deals that predate them.
 */

describe("what the forms are told", () => {
  it("uses the typed boxes and says so", () => {
    const buyerId = applyConfirmation(EMPTY_BUYER_ID, {
      nameParts: { first: "Ana", middle: null, last: "Maria Garcia", suffix: null },
    });
    const { parts, source } = nameForForms(buyerId);
    expect(source).toBe("typed");
    expect(parts.first).toBe("Ana");
    expect(parts.last).toBe("Maria Garcia");
  });

  it("falls back to splitting for a deal that only has one string", () => {
    const buyerId = applyConfirmation(EMPTY_BUYER_ID, {
      fields: { name: "John Michael Smith" },
    });
    const { parts, source } = nameForForms(buyerId);
    expect(source).toBe("split");
    expect(parts.first).toBe("John");
    expect(parts.middle).toBe("Michael");
    expect(parts.last).toBe("Smith");
  });

  it("reports none rather than inventing a name", () => {
    expect(nameForForms(EMPTY_BUYER_ID).source).toBe("none");
  });

  it("does not silently split when boxes were typed", () => {
    // The whole point: a typed "Maria Garcia" surname must not be re-derived
    // into last: "Garcia" by anything downstream.
    const buyerId = applyConfirmation(EMPTY_BUYER_ID, {
      fields: { name: "Ana Maria Garcia" },
      nameParts: { first: "Ana", last: "Maria Garcia" },
    });
    expect(nameForForms(buyerId).parts.last).toBe("Maria Garcia");
    expect(splitPersonName("Ana Maria Garcia").last).toBe("Garcia");
  });

  it("survives a round trip through step data", () => {
    const buyerId = applyConfirmation(EMPTY_BUYER_ID, {
      nameParts: { first: "Jose", last: "de la Cruz", suffix: "Jr" },
    });
    const back = readBuyerId(writeBuyerId({}, buyerId));
    expect(back.nameParts.last).toBe("de la Cruz");
    expect(back.nameParts.suffix).toBe("Jr");
  });
});

describe("the split, where it is still used", () => {
  it("keeps surname particles together", () => {
    expect(splitPersonName("Jose de la Cruz Jr")).toMatchObject({
      first: "Jose",
      last: "de la Cruz",
      suffix: "Jr",
    });
  });

  it("honours an explicit Last, First ordering", () => {
    expect(splitPersonName("Smith, John Michael")).toMatchObject({
      first: "John",
      middle: "Michael",
      last: "Smith",
    });
  });

  it("admits when a three-word name is a coin toss", () => {
    expect(nameSplitIsUncertain("Ana Maria Garcia")).toBe(true);
    expect(nameSplitIsUncertain("John Smith")).toBe(false);
    // A particle anchors the surname, so this one is not a guess.
    expect(nameSplitIsUncertain("Jose de la Cruz")).toBe(false);
  });
});

describe("joining, which is the safe direction", () => {
  it("writes the boxes out in order", () => {
    expect(
      joinName({ first: "Jose", middle: null, last: "de la Cruz", suffix: "Jr" }),
    ).toBe("Jose de la Cruz Jr");
  });

  it("knows four empties is no name", () => {
    expect(hasName({ first: null, middle: null, last: null, suffix: null })).toBe(false);
    expect(hasName({ first: "Ada", middle: null, last: null, suffix: null })).toBe(true);
  });
});

describe("the power of attorney, given real boxes", () => {
  it("prints a two-word surname under Last Name rather than splitting it", async () => {
    const bytes = await fillPowerOfAttorney({
      vin: "1HGBH41JXMN109186",
      grantorName: "Ana Maria Garcia",
      grantorNameParts: { first: "Ana", last: "Maria Garcia" },
    });

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      password: "",
      useSystemFonts: true,
    }).promise;
    const runs = (await (await doc.getPage(1)).getTextContent()).items as Array<{
      str?: unknown;
      transform?: number[];
    }>;

    const found = runs.find(
      (r) => typeof r.str === "string" && r.str.trim() === "Maria Garcia",
    );
    expect(found, "the typed surname was not printed whole").toBeDefined();
    expect(
      columnAt(VTR_271_COLUMNS.grantorName.columns, found!.transform![4])?.part,
    ).toBe("last");
  });
});
