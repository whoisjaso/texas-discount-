import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dealerSignerProblem,
  dealerStroke,
  linkSignerName,
  onboardedSignerName,
  resolveSellerSigner,
  type HeldSigner,
} from "@/lib/documents/dealer-signer";
import { dealerSignerPrintedName, dealership } from "@/lib/dealership-config";

/**
 * Who signs for the dealer (owner's instruction 10/01/2026; SOP "Legal
 * content each document must carry", 130-U bullet): the filing member,
 * cleared to sign, named as entered at onboarding. The seller line prints
 * "Legal Name (First Last)", never the entity alone.
 */

afterEach(() => vi.unstubAllEnvs());

const cleared = {
  can_sign_contracts: true,
  full_name: "Maria Gonzalez",
  onboarding_completed_at: "2026-10-01T15:00:00.000Z",
};

describe("the pairing", () => {
  it("is the legal name, then the person in parentheses", () => {
    expect(dealerSignerPrintedName("Maria Gonzalez")).toBe(`${dealership.legalName} (Maria Gonzalez)`);
  });

  it("prints the marker, never the entity alone, when nobody is named", () => {
    for (const person of [null, undefined, "", "   "]) {
      expect(dealerSignerPrintedName(person)).toBe(`${dealership.legalName} ([Not set: signer name])`);
      expect(dealerSignerPrintedName(person)).not.toBe(dealership.legalName);
    }
  });
});

describe("the name that prints in the parentheses", () => {
  it("is the onboarding name, spacing collapsed and casing kept", () => {
    expect(onboardedSignerName({ ...cleared, full_name: "  Maria   Gonzalez " })).toBe("Maria Gonzalez");
    expect(onboardedSignerName({ ...cleared, full_name: "maría de la Cruz" })).toBe("maría de la Cruz");
  });

  it.each([
    ["no member", null],
    ["not cleared to sign", { ...cleared, can_sign_contracts: false }],
    ["onboarding not finished", { ...cleared, onboarding_completed_at: null }],
    ["an email address", { ...cleared, full_name: "jane@x.com" }],
    ["one word", { ...cleared, full_name: "Associate" }],
    ["a letter the state form cannot print", { ...cleared, full_name: "Łukasz Nowak" }],
    ["no name", { ...cleared, full_name: "" }],
  ])("is null for %s", (_label, member) => {
    expect(onboardedSignerName(member)).toBeNull();
  });

  it("does not demand the onboarding column where the row has none", () => {
    expect(onboardedSignerName({ can_sign_contracts: true, full_name: "Maria Gonzalez" })).toBe("Maria Gonzalez");
  });
});

describe("why a member may not file", () => {
  const named: HeldSigner = { dataUrl: null, hasMember: true, canSign: true, signerName: "Maria Gonzalez", fullName: "Maria Gonzalez" };

  it("is nothing for a cleared, named member", () => {
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "");
    expect(dealerSignerProblem(named)).toBeNull();
  });

  it("names a missing team profile", () => {
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "");
    expect(dealerSignerProblem(null)).toMatch(/no team profile/);
    expect(dealerSignerProblem({ dataUrl: null, hasMember: false })).toMatch(/no team profile/);
  });

  it("names a member who is not cleared to sign", () => {
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "");
    expect(dealerSignerProblem({ dataUrl: null, hasMember: true, canSign: false, signerName: null, fullName: "Maria Gonzalez" })).toMatch(
      /Only a member cleared to sign can file/,
    );
  });

  it("names a missing first and last name, and shows the pairing it will print", () => {
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "");
    const problem = dealerSignerProblem({ dataUrl: null, hasMember: true, canSign: true, signerName: null, fullName: "Associate" });
    expect(problem).toMatch(/Add your first and last name before filing/);
    expect(problem).toContain(`${dealership.legalName} (First Last)`);
    expect(problem).toContain("/admin/account/onboarding");
  });

  it("names the character the state form cannot print", () => {
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "");
    const problem = dealerSignerProblem({ dataUrl: null, hasMember: true, canSign: true, signerName: null, fullName: "Łukasz Nowak" });
    expect(problem).toContain("Ł");
  });

  it("is lifted for demos exactly as the other unset facts are, and the marker still prints", () => {
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
    const held: HeldSigner = { dataUrl: null, hasMember: false, signerName: null };
    expect(dealerSignerProblem(held)).toBeNull();
    expect(onboardedSignerName(null)).toBeNull();
    expect(dealerSignerPrintedName(held.signerName)).toContain("[Not set: signer name]");
  });
});

describe("the stroke that may go on paper", () => {
  it("is the saved one, and none once signing is turned off", () => {
    expect(dealerStroke({ dataUrl: "data:image/png;base64,A", canSign: true })).toBe("data:image/png;base64,A");
    expect(dealerStroke({ dataUrl: "data:image/png;base64,A", canSign: false })).toBeNull();
    expect(dealerStroke({ dataUrl: null, canSign: true })).toBeNull();
  });
});

describe("the seller band's stroke and name come from one person", () => {
  const viewer: HeldSigner = { dataUrl: "data:image/png;base64,VIEWER", canSign: true, signerName: "Viewer Person" };

  it("a filed copy with a stroke keeps the filer's stroke and name", () => {
    expect(
      resolveSellerSigner({ filed: true, includeSignatures: true, linkStroke: "data:image/png;base64,FILED", linkSignerName: "Maria Gonzalez" }, viewer),
    ).toEqual({ stroke: "data:image/png;base64,FILED", name: "Maria Gonzalez" });
  });

  it("a filed copy without a stroke is left for ink and never borrows the viewer", () => {
    expect(
      resolveSellerSigner({ filed: true, includeSignatures: true, linkStroke: null, linkSignerName: "Maria Gonzalez" }, viewer),
    ).toEqual({ stroke: null, name: "Maria Gonzalez" });
    expect(
      resolveSellerSigner({ filed: true, includeSignatures: true, linkStroke: null, linkSignerName: null }, viewer),
    ).toEqual({ stroke: null, name: null });
  });

  it("a draft shows the viewer's stroke and name, the stroke only when cleared", () => {
    expect(resolveSellerSigner({ filed: false, includeSignatures: true, linkStroke: null, linkSignerName: null }, viewer)).toEqual({
      stroke: "data:image/png;base64,VIEWER",
      name: "Viewer Person",
    });
    expect(
      resolveSellerSigner({ filed: false, includeSignatures: true, linkStroke: null, linkSignerName: null }, { ...viewer, canSign: false, signerName: null }),
    ).toEqual({ stroke: null, name: null });
  });

  it("signatures left off never consult the viewer", () => {
    expect(resolveSellerSigner({ filed: false, includeSignatures: false, linkStroke: "data:image/png;base64,X", linkSignerName: "Maria Gonzalez" }, viewer)).toEqual({
      stroke: null,
      name: "Maria Gonzalez",
    });
  });

  it("reads the filer's name from the dealer half only", () => {
    expect(linkSignerName({ dealerSignerName: " Maria Gonzalez " })).toBe("Maria Gonzalez");
    expect(linkSignerName({ dealerSignerName: "" })).toBeNull();
    expect(linkSignerName({})).toBeNull();
    expect(linkSignerName(null)).toBeNull();
  });
});
