import { describe, expect, it } from "vitest";
import { readRulebook } from "./helpers/fees";
import {
  DOC_FEE_NOTICE_CH345_EN,
  DOC_FEE_NOTICE_EN,
  DOC_FEE_NOTICE_ES,
  DOC_FEE_NOTICE_ES_OPTION_1,
  DOC_FEE_NOTICE_VERSION,
} from "@/lib/legal/doc-fee-notice";

/**
 * The documentary fee notice is the statute's, word for word (Tex. Fin. Code
 * §348.006(c)(3)(B); rulebook texas-dealer-fees.md 1.2), and the Spanish one
 * is an OCCC-approved translation (Bulletin B09-3), never a fresh one. Equal,
 * not "contains": a missing comma or a dropped last sentence is a different
 * notice, and the contract printed exactly that until now.
 */

const rulebook = readRulebook();

/** The blockquote that follows a marker line in the rulebook. */
function quoteAfter(marker: string): string {
  const at = rulebook.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const line = rulebook
    .slice(at + marker.length)
    .split("\n")
    .find((entry) => entry.startsWith("> "));
  return (line ?? "").slice(2).trim();
}

/** A rulebook quote line by its own label. */
function quoteLabelled(label: string): string {
  const line = rulebook.split("\n").find((entry) => entry.startsWith(`> ${label}: `));
  return (line ?? "").slice(`> ${label}: `.length).trim();
}

describe("the English notice", () => {
  it("is the statute, comma and last sentence included", () => {
    expect(DOC_FEE_NOTICE_EN).toBe(
      "A DOCUMENTARY FEE IS NOT AN OFFICIAL FEE. A DOCUMENTARY FEE IS NOT REQUIRED BY LAW, BUT MAY BE CHARGED TO BUYERS FOR HANDLING DOCUMENTS RELATING TO THE SALE. A DOCUMENTARY FEE MAY NOT EXCEED A REASONABLE AMOUNT AGREED TO BY THE PARTIES. THIS NOTICE IS REQUIRED BY LAW.",
    );
    expect(DOC_FEE_NOTICE_EN).toBe(quoteAfter("**English (Ch. 348), word for word, comma and last sentence included:**"));
  });
});

describe("the Spanish notice", () => {
  it("is OCCC Bulletin B09-3 Option 2, word for word", () => {
    expect(DOC_FEE_NOTICE_ES).toBe(quoteLabelled("Option 2"));
    expect(DOC_FEE_NOTICE_ES).toBe(
      "UN CARGO DOCUMENTAL NO ES UN CARGO OFICIAL. LA LEY NO EXIGE QUE SE IMPONGA UN CARGO DOCUMENTAL. PERO ÉSTE PODRÍA COBRARSE A LOS COMPRADORES POR EL MANEJO DE LA DOCUMENTACIÓN EN RELACIÓN CON LA VENTA. UN CARGO DOCUMENTAL NO PUEDE EXCEDER UNA CANTIDAD RAZONABLE ACORDADA POR LAS PARTES. ESTA NOTIFICACIÓN SE EXIGE POR LEY.",
    );
  });

  it("keeps Option 1 word for word too, for counsel to switch to", () => {
    expect(DOC_FEE_NOTICE_ES_OPTION_1).toBe(quoteLabelled("Option 1"));
  });
});

describe("the Ch. 345 notice", () => {
  it("is §345.251(c)(2), word for word", () => {
    expect(DOC_FEE_NOTICE_CH345_EN).toBe(quoteAfter("**Ch. 345 vehicles (motorcycles, ATVs and the like) use different wording**"));
    expect(DOC_FEE_NOTICE_CH345_EN).toContain("THAT IS NOT MORE THAN THE MAXIMUM AMOUNT ALLOWED BY THE STATE.");
  });
});

describe("the version stamped on paper", () => {
  it("is 1", () => {
    expect(DOC_FEE_NOTICE_VERSION).toBe(1);
  });
});
