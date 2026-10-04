import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaleDetail } from "@/lib/admin/sale-desk";

/**
 * Correct Name changes the name paper filed AFTER it prints, never a copy
 * already filed (SOP "First sign-in: onboarding", items 5 and 6). The 130-U
 * seller line and the VTR-61 print "Legal Name (First Last)"; a filed copy
 * carries the filer's name in its own record (form_data.dealerSignerName, the
 * completed link's dealer half) and re-renders that, whoever opens it and
 * whatever the roster says later. The correction writes the roster row and
 * its record, and nothing else.
 */

const session = vi.hoisted(() => ({ cookie: "owner:owner@example.test" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "tj-local-admin-preview"
        ? { value: session.cookie }
        : name === "tj-local-admin-signed-in"
          ? { value: String(Date.now()) }
          : undefined,
    set: () => {},
    delete: () => {},
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { correctTeamMemberNameAction } from "@/lib/actions/team-access";
import { corridorCompletedLink } from "@/lib/sales/corridor-link";
import { decodeCompletedLinkFromUrl } from "@/lib/documents/customerPortal";
import { linkSignerName, onboardedSignerName, resolveSellerSigner } from "@/lib/documents/dealer-signer";
import { createMockSupabaseClient, resetMockWrites } from "@/lib/supabase/mock";

const sale = {
  id: "d1", status: "active", language: "en", plate: null, plateAsked: false,
  buyer: { id: "c1", name: "Marcus Reed", phone: "7135550142", email: "m@example.com",
           idNumber: "12345678", idState: "TX", address: "4802 Telephone Rd, Houston, TX 77087" },
  vehicle: { id: "v1", year: 2019, make: "BMW", model: "530i", vin: "WBAJA5C50KB123456",
             salePrice: 28500, bodyStyle: "sedan", titleStatus: "clean", mileage: 61000 },
  documents: {}, registration: null,
  funding: { type: "cash", lenderId: null, lenderOther: null },
  stepData: { buyerId: {
    mailing: { street: "4802 Telephone Rd", city: "Houston", state: "TX", postal: "77087", county: "Harris" },
    name: { read: null, confirmed: "Marcus Reed" },
    licenseNumber: { read: null, confirmed: "12345678" },
  } },
} as unknown as SaleDetail;

async function brenda(): Promise<Record<string, unknown>> {
  const { data } = await createMockSupabaseClient().from("team_members").select("*").eq("id", "preview-team-registration").maybeSingle();
  return data as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
  vi.stubEnv("DESK_PREVIEW_MEMBER", "");
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("a name corrected after filing", () => {
  it.each(["form130U", "billOfSale"])("leaves the filed %s printing the name it was filed with", async (documentType) => {
    // Brenda Ortiz files, cleared to sign and onboarded: her name rides in the record.
    const before = await brenda();
    const filedName = onboardedSignerName(before as never);
    expect(filedName).toBe("Brenda Ortiz");
    const filed = decodeCompletedLinkFromUrl(
      corridorCompletedLink(sale, documentType, { salePrice: 28500 }, "https://x.test", {
        dealerSignature: "data:image/png;base64,STROKE",
        dealerSignatureDate: "2026-10-02",
        dealerSignerName: filedName!,
      })!,
    )!;

    // The owner corrects her name afterwards.
    const data = new FormData();
    data.set("member_id", "preview-team-registration");
    data.set("firstName", "Brenda");
    data.set("lastName", "Ortiz de la Cruz");
    expect((await correctTeamMemberNameAction({ ok: false }, data)).ok).toBe(true);
    const after = await brenda();
    const viewer = { dataUrl: "data:image/png;base64,STROKE", canSign: true, hasMember: true, signerName: onboardedSignerName(after as never) };
    expect(viewer.signerName).toBe("Brenda Ortiz de la Cruz");

    // The filed copy, opened by Brenda herself after the change: the record's name.
    const name = linkSignerName(filed.dd as Record<string, unknown>);
    for (const includeSignatures of [true, false]) {
      expect(
        resolveSellerSigner({ filed: true, includeSignatures, linkStroke: includeSignatures ? "data:image/png;base64,STROKE" : null, linkSignerName: name }, viewer).name,
      ).toBe("Brenda Ortiz");
      expect(resolveSellerSigner({ filed: true, includeSignatures, linkStroke: null, linkSignerName: name }, viewer).name).toBe("Brenda Ortiz");
    }
    // A draft (what her next filing prints) carries the corrected name.
    expect(resolveSellerSigner({ filed: false, includeSignatures: true, linkStroke: null, linkSignerName: null }, viewer).name).toBe(
      "Brenda Ortiz de la Cruz",
    );
  });
});

describe("what the correction writes", () => {
  it("is the roster row and its record, and never a document", () => {
    const source = readFileSync("src/lib/actions/team-access.ts", "utf8");
    const body = source.slice(source.indexOf("export async function correctTeamMemberNameAction"));
    const tables = [...body.matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1]);
    const record = source.slice(source.indexOf("async function recordTeamChange"), source.indexOf("export async function reviewTeamAccessAction"));
    expect(new Set(tables)).toEqual(new Set(["team_members"]));
    expect([...record.matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1])).toEqual(["team_activity_events"]);
    expect(body).toContain("recordTeamChange(");
  });
});
