import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { dealership } from "@/lib/dealership-config";
import { fillVtr61 } from "@/lib/fill-vtr61/fill-pdf";
import { EMPTY_VTR61, readVtr61, vtr61Missing } from "@/lib/vehicles/title-work-evidence";

/**
 * The VTR-61's address row belongs to the rebuilder. When a shop did the
 * work the form printed the shop's name over the dealership's address, and
 * the date the work was finished printed as the record holds it (ISO)
 * rather than the MM/DD/YYYY every other date on the paper reads.
 */

const state = vi.hoisted(() => ({
  vehicle: { id: "v1", vin: "1HGCM82633A004352", year: 2003, make: "Honda", model: "Accord", body_style: "Sedan" } as Record<string, unknown>,
  record: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: async () => null }));
vi.mock("@/lib/actions/staff-signature", () => ({
  getStaffSignature: async () => ({ dataUrl: null, hasMember: true, canSign: true, signerName: "Maria Gonzalez", fullName: "Maria Gonzalez" }),
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

import { GET } from "@/app/api/documents/vtr-61/route";

const ADDRESS = "Address City State Zip";
const DATE = "Date Work Completed";
const SHOP = {
  dateWorkCompleted: "2026-09-14",
  rebuilderName: "Bayou Auto Repair",
  rebuilderAddress: "1200 Telephone Rd, Houston, TX 77023",
  workPerformed: "Replaced the left front fender and the hood.",
  noPartsUsed: true,
  laborStatement: "No component part was replaced; the work was labour on the existing panels.",
  parts: [],
};
const DEALER_ADDRESS = `${dealership.address.street}, ${dealership.address.locality}, ${dealership.address.region} ${dealership.address.postalCode}`;

async function formOf(response: Response) {
  expect(response.status).toBe(200);
  return (await PDFDocument.load(new Uint8Array(await response.arrayBuffer()))).getForm();
}

beforeEach(() => {
  state.record = null;
  vi.stubEnv("DESK_ALLOW_UNSET_FACTS", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("the VTR-61 prints the shop's own address", () => {
  it("prints the shop's address under the shop's name, and the date as MM/DD/YYYY", async () => {
    state.record = SHOP;
    const form = await formOf(await GET(new NextRequest("http://localhost/api/documents/vtr-61?vehicleId=v1")));
    expect(form.getTextField(ADDRESS).getText()).toBe(SHOP.rebuilderAddress);
    expect(form.getTextField(DATE).getText()).toBe("09/14/2026");
  }, 20_000);

  it("prints the dealership's address when the dealership rebuilt it", async () => {
    state.record = { ...SHOP, rebuilderName: "", rebuilderAddress: "" };
    const form = await formOf(await GET(new NextRequest("http://localhost/api/documents/vtr-61?vehicleId=v1")));
    expect(form.getTextField(ADDRESS).getText()).toBe(DEALER_ADDRESS);
  }, 20_000);

  it("never prints the dealership's address under a shop's name", async () => {
    const bytes = await fillVtr61({ vin: "1HGCM82633A004352", rebuilderName: "Bayou Auto Repair", rebuilderAddress: "", dealerSignerName: "Maria Gonzalez" });
    const form = (await PDFDocument.load(bytes)).getForm();
    expect(form.getTextField(ADDRESS).getText() ?? "").not.toContain(dealership.address.street);
  });

  it("asks the title work for the shop's address before the form is ready", () => {
    expect(readVtr61({ ...SHOP }).rebuilderAddress).toBe(SHOP.rebuilderAddress);
    expect(EMPTY_VTR61.rebuilderAddress).toBe("");
    expect(vtr61Missing({ ...readVtr61(SHOP), rebuilderAddress: "" })).toContain("the shop's address");
    expect(vtr61Missing(readVtr61(SHOP))).not.toContain("the shop's address");
    expect(vtr61Missing({ ...readVtr61(SHOP), rebuilderName: "", rebuilderAddress: "" })).not.toContain("the shop's address");
  });

  it("gives the checklist a box for the shop's address", () => {
    const checklist = readFileSync("src/components/admin/TitleWorkChecklist.tsx", "utf8");
    expect(checklist).toContain("rebuilderAddress");
  });
});
