import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  checkStaffNamePart,
  cleanStaffNamePart,
  firstOpenStep,
  onboardingNameParts,
  onboardingSatisfied,
  onboardingSteps,
  savedOnboardingName,
  staffFullName,
} from "@/lib/onboarding/staff-name";
import {
  SELLER_LINE_MIN_FONT_SIZE,
  SELLER_LINE_USABLE_WIDTH,
  SELLER_NAME_BOX_WIDTH,
  sellerLineWidth,
  signerFitsSellerLine,
} from "@/lib/fill-130u/seller-line-fit";
import { firstUnprintableOnStateForm, printsOnStateForm } from "@/lib/forms/state-form-charset";

/**
 * The name onboarding asks for prints in the parentheses on the 130-U seller
 * line (owner's instruction 10/01/2026), so its rules are pinned here.
 */

const ok = (raw: string, part: "first" | "last" = "first") => {
  const result = cleanStaffNamePart(raw, part);
  return result.ok ? result.value : null;
};

describe("one part of a staff name", () => {
  it("trims and collapses spaces, and changes nothing else", () => {
    expect(ok("  Maria  ")).toBe("Maria");
    expect(ok("McDonald", "last")).toBe("McDonald");
    expect(ok("de la   Cruz", "last")).toBe("de la Cruz");
    expect(ok("O'Brien", "last")).toBe("O'Brien");
    expect(ok("Hernández-Villarreal", "last")).toBe("Hernández-Villarreal");
  });

  it("keeps the casing exactly as typed (SOP 130-U bullet: named exactly as they entered it)", () => {
    expect(ok("maria")).toBe("maria");
    expect(ok("van Dyke", "last")).toBe("van Dyke");
    expect(ok("jean-luc")).toBe("jean-luc");
    expect(ok("ANA")).toBe("ANA");
  });

  it("composes a decomposed accent before judging it", () => {
    expect(ok("María")).toBe("María");
  });

  it.each([
    ["", "Enter your first name."],
    ["   ", "Enter your first name."],
  ])("refuses an empty part (%j)", (raw, error) => {
    expect(cleanStaffNamePart(raw, "first")).toEqual({ ok: false, error });
  });

  it.each(["Maria2", "<script>", "[Not set: signer name]", "a@b.com", "...", "-"])(
    "refuses %j",
    (raw) => {
      expect(cleanStaffNamePart(raw, "last").ok).toBe(false);
    },
  );

  it("refuses more than 60 characters", () => {
    expect(cleanStaffNamePart("A".repeat(61), "first").ok).toBe(false);
    expect(cleanStaffNamePart("A".repeat(60), "first").ok).toBe(true);
  });

  it("refuses a letter the state form cannot print, and names it", () => {
    const result = cleanStaffNamePart("Łukasz", "first");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Ł");
  });

  it("joins the two parts the way they print", () => {
    expect(staffFullName("Maria", "Gonzalez")).toBe("Maria Gonzalez");
  });
});

describe("the characters the state form prints", () => {
  it("agrees with the font the 130-U is filled with", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const sample = "AZaz09 '’.-áéíóúñÑüÜçÇàèìòùâêîôûäëïöÿÀÉÍÓÚŠšŽžŒœŸ€ŁłễĞğ";
    for (const char of sample) {
      let prints = true;
      try {
        font.widthOfTextAtSize(char, 10);
        font.encodeText(char);
      } catch {
        prints = false;
      }
      expect(printsOnStateForm(char), `"${char}"`).toBe(prints);
    }
  });

  it("finds the first character that cannot print", () => {
    expect(firstUnprintableOnStateForm("María Zoë Ñuñez")).toBeNull();
    expect(firstUnprintableOnStateForm("Nguyễn")).toBe("ễ");
  });
});

describe("the parts already saved", () => {
  it("are recovered only from what onboarding wrote", () => {
    expect(onboardingNameParts({ display_name: "Maria", full_name: "Maria de la Cruz" })).toEqual({
      first: "Maria",
      last: "de la Cruz",
    });
  });

  it("never split a signup full name by guessing", () => {
    expect(onboardingNameParts({ display_name: null, full_name: "Maria de la Cruz" })).toEqual({ first: "", last: "" });
    expect(onboardingNameParts({ display_name: "Mari", full_name: "Maria Lopez" })).toEqual({ first: "", last: "" });
    expect(onboardingNameParts({ display_name: "Maria", full_name: "Maria" })).toEqual({ first: "", last: "" });
    expect(onboardingNameParts(null)).toEqual({ first: "", last: "" });
  });
});

describe("the screens a member walks", () => {
  it("shows the signature only to a member cleared to sign, and ends on done", () => {
    expect(onboardingSteps({ canSign: true })).toEqual(["name", "signature", "done"]);
    expect(onboardingSteps({ canSign: false })).toEqual(["name", "done"]);
  });

  it("picks up at the first screen with work left", () => {
    expect(firstOpenStep({ canSign: true, hasName: false, hasSignature: true })).toBe("name");
    expect(firstOpenStep({ canSign: true, hasName: true, hasSignature: false })).toBe("signature");
    expect(firstOpenStep({ canSign: false, hasName: true, hasSignature: false })).toBe("done");
    expect(firstOpenStep({ canSign: true, hasName: true, hasSignature: true })).toBe("done");
  });
});

describe("refusals carry a code the screen translates", () => {
  it.each([
    ["", "first", { code: "empty", part: "first" }],
    ["A".repeat(61), "last", { code: "tooLong", part: "last", max: 60 }],
    ["Maria2", "first", { code: "badChars", part: "first" }],
    ["Łukasz", "first", { code: "unprintable", part: "first", char: "Ł" }],
  ] as const)("%j as the %s name", (raw, part, problem) => {
    expect(checkStaffNamePart(raw, part)).toEqual({ ok: false, ...problem });
  });
});

/** The longest run of a letter whose "(First Last)" still fits, for the boundary. */
const LONG_FIRST = "Wolfeschlegelsteinhausenbergerdorff";
const LONG_LAST = "Montgomery-Featherstonehaugh";

describe("the name must print in full on the 130-U seller line", () => {
  it("measures with the same font and floor the fill uses, against the real box", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const pdf = await PDFDocument.load(await readFile(join(process.cwd(), "public/forms/130-U.pdf")));
    const rect = pdf.getForm().getTextField("Seller  Name").acroField.getWidgets()[0].getRectangle();
    expect(rect.width).toBeCloseTo(SELLER_NAME_BOX_WIDTH, 2);
    expect(SELLER_LINE_MIN_FONT_SIZE).toBe(7.25);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    expect(sellerLineWidth("(Maria Lopez)")).toBeCloseTo(font.widthOfTextAtSize("(Maria Lopez)", 7.25), 6);
  });

  it("accepts an ordinary long name and refuses one the box would clip", () => {
    expect(signerFitsSellerLine("María Guadalupe Hernández-Villarreal de la Fuente")).toBe(true);
    const tooLong = staffFullName(LONG_FIRST, LONG_LAST);
    expect(tooLong.length).toBe(64);
    expect(sellerLineWidth(`(${tooLong})`)).toBeGreaterThan(SELLER_LINE_USABLE_WIDTH);
    expect(signerFitsSellerLine(tooLong)).toBe(false);
    expect(signerFitsSellerLine(staffFullName("A".repeat(60), "B".repeat(60)))).toBe(false);
  });

  it("is part of what makes a saved name usable", () => {
    expect(savedOnboardingName({ display_name: "Maria", full_name: "Maria Lopez" })).toEqual({ first: "Maria", last: "Lopez" });
    expect(savedOnboardingName({ display_name: LONG_FIRST, full_name: `${LONG_FIRST} ${LONG_LAST}` })).toBeNull();
    expect(savedOnboardingName({ display_name: "Associate", full_name: "Associate" })).toBeNull();
    expect(savedOnboardingName({ display_name: null, full_name: "maria@example.com" })).toBeNull();
  });
});

describe("onboarding has nothing left to ask", () => {
  const named = { display_name: "Maria", full_name: "Maria Lopez" };

  it("when the name is usable and, for a member cleared to sign, the signature is saved", () => {
    expect(onboardingSatisfied({ ...named, can_sign_contracts: true, signature_data_url: "data:image/png;base64,AAA" })).toBe(true);
    expect(onboardingSatisfied({ ...named, can_sign_contracts: false, signature_data_url: null })).toBe(true);
  });

  it("not while either is missing", () => {
    expect(onboardingSatisfied({ ...named, can_sign_contracts: true, signature_data_url: null })).toBe(false);
    expect(onboardingSatisfied({ display_name: null, full_name: "Maria Lopez", can_sign_contracts: false })).toBe(false);
    expect(onboardingSatisfied(null)).toBe(false);
  });
});
