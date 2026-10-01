import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  cleanStaffNamePart,
  firstOpenStep,
  onboardingNameParts,
  onboardingSteps,
  staffFullName,
} from "@/lib/onboarding/staff-name";
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
  it("trims, collapses spaces and raises only the first letter", () => {
    expect(ok("  maria  ")).toBe("Maria");
    expect(ok("McDonald", "last")).toBe("McDonald");
    expect(ok("de la   Cruz", "last")).toBe("De la Cruz");
    expect(ok("O'Brien", "last")).toBe("O'Brien");
    expect(ok("Hernández-Villarreal", "last")).toBe("Hernández-Villarreal");
  });

  it("keeps the name as typed apart from the first capital", () => {
    expect(ok("jean-luc")).toBe("Jean-luc");
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
