import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A voided document stays on record and stops counting (owner's decision
 * 10/02/2026; SOP "The documents", Voiding and filing again).
 *
 * Voiding the bill of sale marks its filed rows voided and keeps them: who,
 * when and why, readable and printable under Voided Copies. Every reader that
 * counts the packet skips a voided copy, so a signature on it stops counting,
 * its guide step opens again, and the packet is never "ready" while anything
 * waits to be filed again.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));

import { isFiledAgreement } from "@/lib/sales/down-payment-freeze";
import {
  currentPacketDocuments,
  isPacketStatusDocument,
  packetProgress,
  packetRefileTypes,
  packetRevision,
  type PacketStatusDocument,
} from "@/lib/sales/packet-status";
import { refileTypes, latestVoidAt } from "@/lib/sales/filed-documents";
import { ceremonyDocuments } from "@/lib/sales/signing-ceremony";
import { createMockSupabaseClient, resetMockWrites } from "@/lib/supabase/mock";
import { getSaleDetail, describeDocumentState, SALE_DOCUMENTS } from "@/lib/admin/sale-desk";
import { getSalePacket } from "@/lib/admin/sale-packet";
import { buildGuideSteps } from "@/lib/sales/guide";
import { selectDeliverable } from "@/lib/paperwork-delivery/manifest";
import type { SupabaseClient } from "@supabase/supabase-js";

const VOIDED_AT = "2026-10-02T15:00:00.000Z";

const doc = (extra: Partial<PacketStatusDocument> = {}): PacketStatusDocument => ({
  id: "bill",
  documentType: "billOfSale",
  title: "Bill Of Sale",
  gloss: "Sale",
  finalized: true,
  printable: true,
  signed: false,
  filedAt: "2026-10-02T14:00:00.000Z",
  ...extra,
});

describe("what counts as filed", () => {
  it("is never a voided row, and every earlier answer is unchanged", () => {
    expect(isFiledAgreement({ document_type: "billOfSale", finalized_at: "2026-10-01T15:00:00Z", voided_at: VOIDED_AT })).toBe(false);
    expect(isFiledAgreement({ document_type: "billOfSale", status: "completed", completed_at: "x", voided_at: VOIDED_AT })).toBe(false);
    expect(isFiledAgreement({ document_type: "billOfSale", finalized_at: "2026-10-01T15:00:00Z" })).toBe(true);
    expect(isFiledAgreement({ document_type: "billOfSale", finalized_at: "2026-10-01T15:00:00Z", voided_at: null })).toBe(true);
    expect(isFiledAgreement({ document_type: "billOfSale", status: "finalized" })).toBe(true);
    expect(isFiledAgreement({ document_type: "billOfSale", status: "pending" })).toBe(false);
  });
});

describe("the packet's count", () => {
  it("skips a voided copy: a voided signed bill of sale and a new unsigned one read 0 of 1", () => {
    const rows = [doc({ id: "new" }), doc({ id: "old", signed: true, voided: true, voidedAt: VOIDED_AT })];
    expect(currentPacketDocuments(rows).map((row) => row.id)).toEqual(["new"]);
    expect(packetProgress(rows)).toMatchObject({ filed: 1, signed: 0, total: 1, complete: false });
  });

  it("reads 0 of 0 on a packet with only a voided copy, and is never complete", () => {
    const rows = [doc({ signed: true, voided: true, voidedAt: VOIDED_AT })];
    expect(packetProgress(rows)).toMatchObject({ filed: 0, signed: 0, total: 0, refile: 1, complete: false });
  });

  it("counts what waits to be filed again, and is not ready while anything does", () => {
    const voidedOnly = [
      doc({ id: "b0", signed: true, voided: true, voidedAt: VOIDED_AT }),
      doc({ id: "t0", documentType: "form130U", signed: true, voided: true, voidedAt: VOIDED_AT }),
      doc({ id: "b1", signed: true, filedAt: "2026-10-02T15:10:00.000Z", finalizedAt: "2026-10-02T15:10:00.000Z" }),
    ];
    expect(packetRefileTypes(voidedOnly)).toEqual(["form130U"]);
    expect(packetProgress(voidedOnly)).toMatchObject({ signed: 1, total: 1, refile: 1, complete: false });
    // A voided type the sale no longer owes is not waited on.
    expect(packetProgress(voidedOnly, false, ["billOfSale"])).toMatchObject({ refile: 0, complete: true });
  });

  it("counts a document printing the bill of sale's figures filed before the current bill of sale", () => {
    const rows = [
      { id: "b0", document_type: "billOfSale", finalized_at: "2026-10-02T14:00:00Z", voided_at: VOIDED_AT },
      { id: "c1", document_type: "financing", finalized_at: "2026-10-02T15:00:30Z" },
      { id: "b1", document_type: "billOfSale", finalized_at: "2026-10-02T15:05:00Z" },
    ];
    expect(refileTypes(rows)).toEqual(["financing"]);
    // Filed after the new bill of sale, it is current.
    rows[1].finalized_at = "2026-10-02T15:06:00Z";
    expect(refileTypes(rows)).toEqual([]);
  });

  it("leaves a deal that never had a void exactly as it was", () => {
    const rows = [
      { id: "c1", document_type: "form130U", finalized_at: "2026-10-02T14:00:00Z" },
      { id: "b1", document_type: "billOfSale", finalized_at: "2026-10-02T15:00:00Z" },
    ];
    expect(refileTypes(rows)).toEqual([]);
    expect(latestVoidAt(rows)).toBeNull();
  });

  it("is still complete on an ordinary signed packet", () => {
    expect(packetProgress([doc({ signed: true })])).toMatchObject({ complete: true, refile: 0 });
  });

  it("changes its revision when a copy is voided", () => {
    expect(packetRevision([doc()])).not.toBe(packetRevision([doc({ voided: true, voidedAt: VOIDED_AT })]));
  });

  it("accepts the optional void facts from the status route and rejects mistyped ones", () => {
    expect(isPacketStatusDocument(doc({ voided: true, voidedAt: VOIDED_AT, voidedByName: "Maria Lopez", voidReason: "A typo in the price", voidGroupId: "g1", replacesId: null, finalizedAt: null }))).toBe(true);
    expect(isPacketStatusDocument(doc())).toBe(true);
    expect(isPacketStatusDocument({ ...doc(), voided: "yes" })).toBe(false);
    expect(isPacketStatusDocument({ ...doc(), voidReason: 12 })).toBe(false);
  });
});

describe("the ceremony", () => {
  it("never offers a voided copy", () => {
    const rows = [
      { id: "old", documentType: "billOfSale", finalized: true, hasCompletedLink: true, signed: true, voided: true },
      { id: "new", documentType: "billOfSale", finalized: true, hasCompletedLink: true, signed: false },
    ];
    expect(ceremonyDocuments(rows).map((row) => row.id)).toEqual(["new"]);
    expect(ceremonyDocuments([rows[0]])).toEqual([]);
  });
});

/* -------------------------------------------------------------------- */
/* The readers, against the preview store                               */
/* -------------------------------------------------------------------- */

const DEAL = "void-reader-deal";

async function seedDeal() {
  const client = createMockSupabaseClient();
  await client.from("deals").insert({
    id: DEAL,
    status: "in_progress",
    language: "en",
    step_data: {
      languageConfirmed: { language: "en", at: "2026-10-02T13:00:00Z", by: "u1" },
      funding: { type: "cash", lenderId: null, lenderOther: null },
      money: { amount: "9000", priceBasis: "outTheDoor", paidTodayAmount: "" },
      salePlan: { registrationBy: "dealer", titleSignedBy: "buyer", insuranceShown: true, inspectionBy: "done" },
    },
    customers: { id: "void-reader-buyer", name: "Andrea Salinas", phone: "7135550188" },
    vehicles: { id: "void-reader-car", year: 2017, make: "Ford", model: "Explorer", vin: "1FM5K8D80HGA00001", title_status: "clean", sale_price: 9000 },
  });
  await client.from("document_agreements").insert([
    {
      id: "void-reader-bos",
      deal_id: DEAL,
      document_type: "billOfSale",
      status: "finalized",
      finalized_at: "2026-10-02T14:00:00Z",
      has_buyer_signature: true,
      signed_at: "2026-10-02T14:05:00Z",
      completed_link: "x",
      voided_at: VOIDED_AT,
      voided_by_name: "Maria Lopez",
      void_reason: "The down payment was typed wrong",
      void_group_id: "group-1",
      language: "en",
    },
    {
      id: "void-reader-130u",
      deal_id: DEAL,
      document_type: "form130U",
      status: "finalized",
      finalized_at: "2026-10-02T14:10:00Z",
      has_buyer_signature: true,
      completed_link: "x",
      language: "en",
    },
  ]);
}

beforeEach(() => resetMockWrites());

describe("the readers skip a voided copy", () => {
  it("getSaleDetail says voided for a type with only voided copies, and its guide step opens again", async () => {
    await seedDeal();
    const sale = await getSaleDetail(DEAL);
    expect(sale?.documents.billOfSale).toBe("voided");
    expect(sale?.documents.form130U).toBe("signed");
    const entry = SALE_DOCUMENTS.find((candidate) => candidate.documentType === "billOfSale")!;
    expect(describeDocumentState(entry, "voided")).toBe("Voided. File it again");
    const step = buildGuideSteps(sale!).find((candidate) => candidate.key === "document:billOfSale");
    expect(step?.done).toBe(false);
  });

  it("getSalePacket keeps the voided copy, with who, when, why and its group", async () => {
    await seedDeal();
    const packet = await getSalePacket(DEAL);
    const voided = packet.find((row) => row.id === "void-reader-bos");
    expect(voided).toMatchObject({
      voided: true,
      voidedAt: VOIDED_AT,
      voidedByName: "Maria Lopez",
      voidReason: "The down payment was typed wrong",
      voidGroupId: "group-1",
      finalized: true,
    });
    expect(currentPacketDocuments(packet).map((row) => row.id)).toEqual(["void-reader-130u"]);
  });

  it("never texts a voided signed copy", async () => {
    await seedDeal();
    const selection = await selectDeliverable(
      createMockSupabaseClient() as unknown as SupabaseClient,
      DEAL,
      "cash",
      "en",
      { registrationBy: "dealer", titleSignedBy: "buyer", priceIncludesRegistration: null, insuranceShown: true, inspectionBy: "done" },
      "clean",
    );
    expect(selection.deliverable.map((entry) => entry.id)).toEqual(["void-reader-130u"]);
    expect(selection.missing).toEqual(["billOfSale"]);
  });

  it("the sales list counts no voided copy", () => {
    const list = readFileSync("src/app/admin/sales/page.tsx", "utf8");
    expect(list).toMatch(/select\("deal_id, document_type, status, completed_at, finalized_at, voided_at"\)/);
    expect(list).toMatch(/if \(agreement\.voided_at\) continue;/);
  });
});

/**
 * Every reader that decides what is filed reads the void. Checked on the
 * code, never on a comment: a select string that names the column, or a
 * call to the one predicate or helper that does.
 */
describe("guard: every reader reads the void", () => {
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const readers: Array<[string, RegExp]> = [
    ["src/lib/sales/down-payment-freeze.ts", /if \(row\.voided_at\) return false;/],
    ["src/lib/sales/filed-bill-of-sale.ts", /\.select\("[^"]*voided_at[^"]*"\)/],
    ["src/lib/admin/sale-desk.ts", /signed_at, voided_at"/],
    ["src/lib/admin/sale-packet.ts", /voided_at, voided_by_name, void_reason, void_group_id, parent_agreement_id"/],
    ["src/lib/sales/packet-status.ts", /!document\.voided/],
    ["src/app/admin/sales/page.tsx", /finalized_at, voided_at"/],
    ["src/lib/paperwork-delivery/manifest.ts", /!row\.voided_at/],
    ["src/lib/actions/sale-plan.ts", /\.select\("document_type, voided_at"\)/],
    ["src/lib/actions/salvage-plan.ts", /\.select\("document_type, voided_at"\)/],
    ["src/lib/actions/delete-sale.ts", /signed_at, voided_at"/],
    ["src/lib/actions/complete-sale.ts", /readDealAgreements\(/],
    ["src/lib/actions/paperwork.ts", /readDealAgreements\(/],
    ["src/app/sign/packet/[token]/page.tsx", /form_data, voided_at"/],
    ["src/app/api/sign/packet/[token]/documents/[agreementId]/route.ts", /form_data, voided_at"/],
    ["src/app/api/sign/[token]/form-130u/[agreementId]/route.ts", /document_type, voided_at"/],
    ["src/lib/actions/packet-signing.ts", /status, voided_at"/],
    ["src/app/api/documents/agreements/[id]/pdf/route.ts", /voided_at, voided_by_name, void_reason, language/],
  ];
  it.each(readers)("%s", (file, pattern) => {
    expect(strip(readFileSync(file, "utf8"))).toMatch(pattern);
  });
});
