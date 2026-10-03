import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  PDFDocument,
  PDFRawStream,
  PDFRef,
  StandardFonts,
  decodePDFRawStream,
  type PDFTextField,
} from "pdf-lib";
import { dealership, dealerSignerPrintedName } from "@/lib/dealership-config";
import { fillVtr61, vtr61DealerParties } from "@/lib/fill-vtr61/fill-pdf";
import { dealerPrintedNameProblem, type HeldSigner } from "@/lib/documents/dealer-signer";

/**
 * The VTR-61 prints the dealer the way the 130-U seller line does (owner's
 * decision 10/01/2026).
 *
 * Wherever the dealership is the owner or the rebuilder, its "Printed Name
 * (Same as Signature)" is "Discount Used Cars And Trucks, LLC (First Last)",
 * the person being the cleared, onboarded member who prints it: the same
 * name source, the same fit rules (9.5pt down to the 7.25pt floor, never
 * clipped) and the same two-line layout. A member who is not cleared or not
 * named is refused rather than handed a form with the marker in it.
 */

const state = vi.hoisted(() => ({
  held: null as null | Record<string, unknown>,
  vehicle: { id: "v1", vin: "1HGCM82633A004352", year: 2003, make: "Honda", model: "Accord", body_style: "Sedan" } as Record<string, unknown>,
  record: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: async () => null }));
vi.mock("@/lib/actions/staff-signature", () => ({
  getStaffSignature: async () => state.held,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: table === "vehicles" ? state.vehicle : state.record ? { data: state.record } : null,
          error: null,
        }),
      };
      return chain;
    },
  }),
}));

import { GET, POST } from "@/app/api/documents/vtr-61/route";

const REBUILDER_BOX = "Printed Name (Same as Signature)";
const OWNER_BOX = "Printed Name (Same as Signature)_2";
const OWNER_ENTITY = "First Name or Entity Name Middle Name Last Name Suffix if any";
const REBUILDER_ENTITY = "First Name or Entity Name Middle Name Last Name Suffix if any_2";

const car = { vin: "1HGCM82633A004352", year: "2003", make: "Honda", model: "Accord", bodyStyle: "Sedan" };

const cleared: HeldSigner = { dataUrl: null, hasMember: true, canSign: true, signerName: "Maria Gonzalez", fullName: "Maria Gonzalez" };

/** The lines drawn into a field's own appearance stream, with where they sit. */
async function drawnLines(pdf: PDFDocument, field: PDFTextField): Promise<Array<{ text: string; y: number }>> {
  const ap = field.acroField.getWidgets()[0].getNormalAppearance();
  const stream = ap instanceof PDFRef ? pdf.context.lookup(ap) : ap;
  const content = Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("latin1");
  return [...content.matchAll(/1 0 0 1 [0-9.]+ ([0-9.]+) Tm\s*<([0-9A-Fa-f]*)>\s*Tj/g)].map((match) => ({
    y: Number(match[1]),
    text: Buffer.from(match[2], "hex").toString("latin1"),
  }));
}

function sizeOf(field: PDFTextField): number {
  return Number((field.acroField.getDefaultAppearance() ?? "").match(/ ([0-9.]+) Tf/)?.[1]);
}

/*
  Where each box's printed-name rule and the text above it sit, measured on
  public/forms/VTR-61.pdf, in points above the box's bottom edge. Helvetica
  reaches 0.733em above a baseline (the parentheses) and 0.207em below it.
*/
const MEASURED = {
  [REBUILDER_BOX]: { ruleTop: 224.9 - 221.55, textAbove: 245.3 - 221.55 },
  [OWNER_BOX]: { ruleTop: 144.1 - 141.52, textAbove: 164.4 - 141.52 },
} as const;

beforeEach(() => {
  state.held = { ...cleared };
  state.record = null;
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("which party is the dealership", () => {
  it("is both on the dealership's own car rebuilt in house", () => {
    expect(vtr61DealerParties({})).toEqual({ owner: true, rebuilder: true });
    expect(vtr61DealerParties({ rebuilderName: "" })).toEqual({ owner: true, rebuilder: true });
  });

  it("is only the owner when a shop did the work", () => {
    expect(vtr61DealerParties({ rebuilderName: "Bayou Auto Repair" })).toEqual({ owner: true, rebuilder: false });
  });

  it("recognises the legal name typed as a party, whatever its spacing or case", () => {
    const typed = `  ${dealership.legalName!.toUpperCase()} `;
    expect(vtr61DealerParties({ ownerName: "Avery Collins", rebuilderName: typed })).toEqual({ owner: false, rebuilder: true });
  });

  it("is neither for a private owner who rebuilt it themselves", () => {
    expect(vtr61DealerParties({ ownerName: "Avery Collins", rebuilderName: "Avery Collins" })).toEqual({ owner: false, rebuilder: false });
  });
});

describe("the filled form", () => {
  it("prints the pairing in both dealer boxes and keeps the entity rows the entity", async () => {
    const pdf = await PDFDocument.load(await fillVtr61({ ...car, dealerSignerName: "Maria Gonzalez" }));
    const form = pdf.getForm();
    const expected = `${dealership.legalName} (Maria Gonzalez)`;
    expect(expected).toBe(dealerSignerPrintedName("Maria Gonzalez"));
    expect(form.getTextField(REBUILDER_BOX).getText()).toBe(expected);
    expect(form.getTextField(OWNER_BOX).getText()).toBe(expected);
    expect(form.getTextField(OWNER_ENTITY).getText()).toBe(dealership.legalName);
    expect(form.getTextField(REBUILDER_ENTITY).getText()).toBe(dealership.legalName);
  });

  it("sizes one line by the seller line's rules and keeps it inside the box", async () => {
    const pdf = await PDFDocument.load(await fillVtr61({ ...car, dealerSignerName: "Maria Gonzalez" }));
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const name of [REBUILDER_BOX, OWNER_BOX] as const) {
      const field = pdf.getForm().getTextField(name);
      const rect = field.acroField.getWidgets()[0].getRectangle();
      const size = sizeOf(field);
      expect(size).toBeGreaterThanOrEqual(7.25);
      expect(size).toBeLessThanOrEqual(9.5);
      const lines = await drawnLines(pdf, field);
      expect(lines.map((line) => line.text)).toEqual([field.getText()]);
      expect(font.widthOfTextAtSize(field.getText()!, size)).toBeLessThanOrEqual(rect.width - 4 + 1e-6);
      // Above the printed-name rule, descenders included.
      expect(lines[0].y - 0.207 * size).toBeGreaterThan(MEASURED[name].ruleTop);
    }
  }, 20_000);

  it("draws a pairing too long for one line on two at the floor, between the rule and the text above", async () => {
    const person = "María Guadalupe Hernández-Villarreal de la Fuente";
    const pdf = await PDFDocument.load(await fillVtr61({ ...car, dealerSignerName: person }));
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const name of [REBUILDER_BOX, OWNER_BOX] as const) {
      const field = pdf.getForm().getTextField(name);
      const rect = field.acroField.getWidgets()[0].getRectangle();
      // The stored value is still the whole one-line pairing.
      expect(field.getText()).toBe(`${dealership.legalName} (${person})`);
      expect(sizeOf(field)).toBe(7.25);
      const lines = await drawnLines(pdf, field);
      expect(lines.map((line) => line.text)).toEqual([dealership.legalName, `(${person})`]);
      for (const line of lines) expect(font.widthOfTextAtSize(line.text, 7.25)).toBeLessThanOrEqual(rect.width - 4);
      const [upper, lower] = lines;
      expect(lower.y - 0.207 * 7.25).toBeGreaterThan(MEASURED[name].ruleTop);
      expect(upper.y + 0.733 * 7.25).toBeLessThan(Math.min(rect.height, MEASURED[name].textAbove));
      expect(upper.y - 0.207 * 7.25).toBeGreaterThan(lower.y + 0.733 * 7.25 - 1);
    }
  }, 20_000);

  it("prints the marker in the parentheses, never the entity alone, when nobody is named", async () => {
    const pdf = await PDFDocument.load(await fillVtr61({ ...car }));
    for (const name of [REBUILDER_BOX, OWNER_BOX]) {
      const value = pdf.getForm().getTextField(name).getText();
      expect(value).toBe(`${dealership.legalName} ([Not set: signer name])`);
      expect(value).not.toBe(dealership.legalName);
    }
  });

  it("refuses a name the form cannot print or the box would clip, rather than a blank or cut-off box", async () => {
    await expect(fillVtr61({ ...car, dealerSignerName: "Nguyễn Văn An" })).rejects.toThrow(/cannot print/);
    await expect(fillVtr61({ ...car, dealerSignerName: `${"A".repeat(60)} ${"B".repeat(60)}` })).rejects.toThrow(/does not fit/);
  });

  it("leaves a shop's own printed name as typed and pairs only the dealership's", async () => {
    const pdf = await PDFDocument.load(
      await fillVtr61({ ...car, rebuilderName: "Bayou Auto Repair", dealerSignerName: "Maria Gonzalez" }),
    );
    expect(pdf.getForm().getTextField(REBUILDER_BOX).getText()).toBe("Bayou Auto Repair");
    expect(pdf.getForm().getTextField(OWNER_BOX).getText()).toBe(`${dealership.legalName} (Maria Gonzalez)`);
  });

  it("names nobody from the dealership when neither party is the dealership", async () => {
    const pdf = await PDFDocument.load(
      await fillVtr61({ ...car, ownerName: "Avery Collins", rebuilderName: "Bayou Auto Repair", dealerSignerName: "Maria Gonzalez" }),
    );
    expect(pdf.getForm().getTextField(OWNER_BOX).getText()).toBe("Avery Collins");
    expect(pdf.getForm().getTextField(REBUILDER_BOX).getText()).toBe("Bayou Auto Repair");
  });
});

describe("who may print it", () => {
  it("is a cleared member named at onboarding", () => {
    expect(dealerPrintedNameProblem(cleared, "VTR-61")).toBeNull();
  });

  it("refuses a missing profile, a member not cleared, and a member not named, with the reason", () => {
    expect(dealerPrintedNameProblem(null, "VTR-61")).toMatch(/no team profile/);
    expect(dealerPrintedNameProblem({ dataUrl: null, hasMember: true, canSign: false, signerName: null, fullName: "Maria Gonzalez" }, "VTR-61")).toMatch(
      /Only a member cleared to sign can print the VTR-61/,
    );
    const unnamed = dealerPrintedNameProblem({ dataUrl: null, hasMember: true, canSign: true, signerName: null, fullName: "Associate" }, "VTR-61");
    expect(unnamed).toMatch(/Add your first and last name before printing the VTR-61/);
    expect(unnamed).toContain(`${dealership.legalName} (First Last)`);
    expect(unnamed).not.toContain("/admin/");
  });

  it("is lifted for a demo exactly as filing is, and the marker then prints", () => {
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
    expect(dealerPrintedNameProblem({ dataUrl: null, hasMember: true, canSign: false, signerName: null }, "VTR-61")).toBeNull();
  });
});

describe("the VTR-61 routes", () => {
  const get = () => GET(new NextRequest("http://localhost/api/documents/vtr-61?vehicleId=v1"));

  it("prints the dealership's car with the printing member's name beside the dealer's", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const pdf = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
    expect(pdf.getForm().getTextField(OWNER_BOX).getText()).toBe(`${dealership.legalName} (Maria Gonzalez)`);
    expect(pdf.getForm().getTextField(REBUILDER_BOX).getText()).toBe(`${dealership.legalName} (Maria Gonzalez)`);
  }, 20_000);

  it.each([
    ["no team profile", null, /no team profile/],
    ["not cleared to sign", { dataUrl: null, hasMember: true, canSign: false, signerName: null, fullName: "Maria Gonzalez" }, /cleared to sign/],
    ["not named", { dataUrl: null, hasMember: true, canSign: true, signerName: null, fullName: "" }, /first and last name/],
  ])("refuses a member with %s, and prints nothing", async (_label, held, reason) => {
    state.held = held as Record<string, unknown> | null;
    const response = await get();
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toMatch(/json/);
    expect((await response.json()).error).toMatch(reason);
  });

  it("prints the marker only when unset facts are allowed for a demo", async () => {
    vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "true");
    state.held = { dataUrl: null, hasMember: true, canSign: false, signerName: null, fullName: "" };
    const response = await get();
    expect(response.status).toBe(200);
    const pdf = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
    expect(pdf.getForm().getTextField(OWNER_BOX).getText()).toBe(`${dealership.legalName} ([Not set: signer name])`);
  }, 20_000);

  it("asks for no dealer signer on a standalone form for someone else's car", async () => {
    state.held = null;
    const values = {
      vehicleVin: "1HGCM82633A004352", vehicleYear: "2003", vehicleMake: "Honda", vehicleModel: "Accord", vehicleBodyStyle: "Sedan",
      ownerName: "Avery Collins", rebuilderIsOwner: "no", rebuilderName: "Bayou Auto Repair",
      rebuilderStreet: "1200 Repair Lane", rebuilderCity: "Houston", rebuilderState: "TX", rebuilderZip: "77002",
      workPerformed: "Replaced the hood.", dateWorkCompleted: "2026-09-01", partsUsed: "no",
    };
    const response = await POST(new NextRequest("http://localhost/api/documents/vtr-61", { method: "POST", body: JSON.stringify(values) }));
    expect(response.status).toBe(200);
  }, 20_000);

  it("refuses a standalone form that names the dealership when the member is not cleared", async () => {
    state.held = { dataUrl: null, hasMember: true, canSign: false, signerName: null, fullName: "Maria Gonzalez" };
    const values = {
      vehicleVin: "1HGCM82633A004352", vehicleYear: "2003", vehicleMake: "Honda", vehicleModel: "Accord", vehicleBodyStyle: "Sedan",
      ownerName: dealership.legalName!, rebuilderIsOwner: "yes",
      rebuilderStreet: "1200 Repair Lane", rebuilderCity: "Houston", rebuilderState: "TX", rebuilderZip: "77002",
      workPerformed: "Replaced the hood.", dateWorkCompleted: "2026-09-01", partsUsed: "no",
    };
    const response = await POST(new NextRequest("http://localhost/api/documents/vtr-61", { method: "POST", body: JSON.stringify(values) }));
    expect(response.status).toBe(403);
  });
});

/*
  Review round 10/02/2026. The standalone form takes the owner and the
  rebuilder as free text, so the dealership is recognised however its name
  was typed. A spelling the old exact match missed was read as a stranger:
  the form printed the entity alone beside the dealer's signature and asked
  for no cleared, onboarded signer at all.
*/
describe("the dealership typed another way", () => {
  // The variants are spelled from the default legal name the desk ships with.
  const VARIANTS = [
    "Discount Used Cars And Trucks LLC",
    "Discount Used Cars & Trucks, LLC",
    "Discount Used Cars And Trucks",
    "Discount Used Cars And Trucks, L.L.C.",
    "discount used cars and trucks,llc.",
    "Discount Used Cars and Trucks",
  ];

  it("ships with the legal name the variants are spelled from", () => {
    expect(dealership.legalName).toBe("Discount Used Cars And Trucks, LLC");
  });

  it.each(VARIANTS)("recognises %j as the dealership, as owner or as rebuilder", (typed) => {
    expect(vtr61DealerParties({ ownerName: typed })).toEqual({ owner: true, rebuilder: true });
    expect(vtr61DealerParties({ ownerName: "Avery Collins", rebuilderName: typed })).toEqual({ owner: false, rebuilder: true });
  });

  it.each(["Discount Used Cars And Trucks of Dallas, LLC", "Discount Auto Repair", "Bayou Auto Repair"])(
    "keeps %j a party of its own",
    (typed) => {
      expect(vtr61DealerParties({ ownerName: "Avery Collins", rebuilderName: typed })).toEqual({ owner: false, rebuilder: false });
    },
  );

  it("prints the legal name in the entity rows and the pairing beside the signature", async () => {
    const pdf = await PDFDocument.load(
      await fillVtr61({ ...car, ownerName: "Discount Used Cars & Trucks LLC", dealerSignerName: "Maria Gonzalez" }),
    );
    const form = pdf.getForm();
    expect(form.getTextField(OWNER_ENTITY).getText()).toBe(dealership.legalName);
    expect(form.getTextField(REBUILDER_ENTITY).getText()).toBe(dealership.legalName);
    expect(form.getTextField(OWNER_BOX).getText()).toBe(`${dealership.legalName} (Maria Gonzalez)`);
    expect(form.getTextField(REBUILDER_BOX).getText()).toBe(`${dealership.legalName} (Maria Gonzalez)`);
  });

  it.each(VARIANTS)("refuses a standalone form naming %j when the member is not cleared", async (typed) => {
    state.held = { dataUrl: null, hasMember: true, canSign: false, signerName: null, fullName: "Maria Gonzalez" };
    const values = {
      vehicleVin: "1HGCM82633A004352", vehicleYear: "2003", vehicleMake: "Honda", vehicleModel: "Accord", vehicleBodyStyle: "Sedan",
      ownerName: typed, rebuilderIsOwner: "yes",
      rebuilderStreet: "1200 Repair Lane", rebuilderCity: "Houston", rebuilderState: "TX", rebuilderZip: "77002",
      workPerformed: "Replaced the hood.", dateWorkCompleted: "2026-09-01", partsUsed: "no",
    };
    const response = await POST(new NextRequest("http://localhost/api/documents/vtr-61", { method: "POST", body: JSON.stringify(values) }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/cleared to sign/);
  });

  it("refuses the title-work form when the rebuilder is the dealership typed another way and the member is not cleared", async () => {
    state.held = { dataUrl: null, hasMember: true, canSign: false, signerName: null, fullName: "Maria Gonzalez" };
    const response = await GET(
      new NextRequest(`http://localhost/api/documents/vtr-61?vehicleId=v1&rebuilder=${encodeURIComponent("Discount Used Cars & Trucks LLC")}`),
    );
    expect(response.status).toBe(403);
  });
});

describe("the title-work screen", () => {
  it("says before the link, not in a bare tab, why this member cannot print the VTR-61", () => {
    const page = readFileSync("src/app/admin/inventory/[id]/title-work/page.tsx", "utf8");
    expect(page).toContain('dealerPrintedNameProblem(held, "VTR-61")');
    expect(page).toMatch(/\{printProblem \? \([\s\S]*?<AdminDataNotice[\s\S]*?message=\{printProblem\}[\s\S]*?<TitleWorkChecklist/);
    expect(page).toContain("dealerSignerFixIsOnboarding(held) ? { href: ONBOARDING_PATH");
  });
});
