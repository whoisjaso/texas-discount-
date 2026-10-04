import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanVoidReason, signingIssueTime, signingSessionRevoked, VOIDED_WITH_BILL_OF_SALE } from "@/lib/sales/void-bill-of-sale";
import { createLocalAdminUser } from "@/lib/auth/local-admin";
import { createMockSupabaseClient, mockInserted, resetMockWrites } from "@/lib/supabase/mock";

/**
 * Review findings on the void itself, closed:
 *
 *   - the reason was counted in UTF-16 units while the database counts
 *     characters (six emoji passed the desk and failed the database), and ten
 *     zero-width spaces passed as a ten-character reason that reads as
 *     nothing; a bidi override could make the kept reason read backwards;
 *   - the preview mock (like the database) took the cascade from the caller
 *     and did not ask for the title attestation;
 *   - a signing link minted while the void was on its way was dated after
 *     it and survived; the void is now dated no earlier than the moment it
 *     happened, and a link minted after a void is never born revoked.
 */

describe("a void reason says something", () => {
  it("counts characters the way the database does", () => {
    expect(cleanVoidReason("🚗".repeat(10))).toEqual({ ok: true, reason: "🚗".repeat(10) });
    expect(cleanVoidReason("🚗".repeat(6))).toEqual({ ok: false, code: "voidReasonRequired" });
    expect(cleanVoidReason("🚗".repeat(500)).ok).toBe(true);
    expect(cleanVoidReason("🚗".repeat(501))).toEqual({ ok: false, code: "voidReasonTooLong" });
  });

  it("drops invisible format characters, so a blank-looking reason is refused", () => {
    expect(cleanVoidReason("​".repeat(12))).toEqual({ ok: false, code: "voidReasonRequired" });
    expect(cleanVoidReason(`ok${"⁠‍﻿".repeat(5)}`)).toEqual({ ok: false, code: "voidReasonRequired" });
    expect(cleanVoidReason("Price ‮wrong‬ on the deal")).toEqual({ ok: true, reason: "Price wrong on the deal" });
  });

  it("is the rule the dialog uses, so Hold To Void is never offered on a reason the server refuses", () => {
    const dialog = readFileSync("src/components/admin/packet/VoidBillOfSale.tsx", "utf8");
    expect(dialog).toMatch(/const reasonOk = cleanVoidReason\(reason\)\.ok;/);
  });
});

describe("a signing link minted after a void is born alive, one minted before it dies", () => {
  const voidAt = "2026-10-02T16:00:00.000Z";
  const voidMs = Date.parse(voidAt);

  it("dates a new link after the latest void when this clock reads earlier", () => {
    expect(signingIssueTime([{ voided_at: voidAt }], voidMs - 2000)).toBe(voidMs + 1);
    expect(signingIssueTime([{ voided_at: voidAt }], voidMs)).toBe(voidMs + 1);
    expect(signingIssueTime([{ voided_at: voidAt }], voidMs + 5000)).toBe(voidMs + 5000);
    expect(signingIssueTime([], voidMs)).toBe(voidMs);
    expect(signingSessionRevoked(signingIssueTime([{ voided_at: voidAt }], voidMs - 2000), [{ voided_at: voidAt }])).toBe(false);
  });

  it("is minted that way on the packet", () => {
    const page = readFileSync("src/app/admin/sales/[dealId]/packet/page.tsx", "utf8");
    expect(page).toMatch(/issueSigningToken\(\s*sale\.id,\s*signingIssueTime\(documents\.map/);
  });

  it("is dated no earlier than the moment of voiding, in the database", () => {
    const sql = readFileSync("supabase/migrations/20261002000000_void_filed_documents.sql", "utf8");
    expect(sql).toMatch(/v_at := greatest\(p_at, clock_timestamp\(\)\);/);
    expect(sql).toMatch(/set voided_at = v_at,/);
  });
});

describe("the preview's void mirrors the database's rules", () => {
  const DEAL = "mirror-deal";
  const owner = () => createMockSupabaseClient(createLocalAdminUser("owner@example.dev"));
  const call = (types: readonly string[], detail: Record<string, unknown>, at = new Date().toISOString()) =>
    owner().rpc("void_filed_documents", {
      p_deal_id: DEAL,
      p_root_id: "bos",
      p_types: [...types],
      p_reason: "The figures changed on this deal",
      p_at: at,
      p_detail: { memberId: "member-1", memberName: "Maria Lopez", ...detail },
    }) as unknown as Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;

  beforeEach(async () => {
    resetMockWrites();
    const client = createMockSupabaseClient();
    await client.from("deals").insert({ id: DEAL, status: "in_progress", step_data: {} });
    await client.from("document_agreements").insert([
      { id: "bos", deal_id: DEAL, document_type: "billOfSale", status: "finalized", finalized_at: "2026-10-02T14:00:00Z" },
      { id: "fin", deal_id: DEAL, document_type: "financing", status: "finalized", finalized_at: "2026-10-02T14:01:00Z" },
    ]);
  });

  it("voids only its own fixed set", async () => {
    expect((await call(["billOfSale"], { titleApplication: "notYet" })).error?.message).toBe("not_voidable");
    expect((await call([...VOIDED_WITH_BILL_OF_SALE, "powerOfAttorney"], { titleApplication: "notYet" })).error?.message).toBe("not_voidable");
    expect(mockInserted("document_agreements").filter((row) => row.voided_at)).toEqual([]);
  });

  it("needs the 'Not Yet' attestation", async () => {
    expect((await call(VOIDED_WITH_BILL_OF_SALE, {})).error?.message).toBe("title_question");
    expect((await call(VOIDED_WITH_BILL_OF_SALE, { titleApplication: "submitted" })).error?.message).toBe("title_question");
  });

  it("dates the void no earlier than now, even when the caller's clock ran behind", async () => {
    const before = Date.now();
    const result = await call(VOIDED_WITH_BILL_OF_SALE, { titleApplication: "notYet" }, new Date(before - 60_000).toISOString());
    expect(result.error).toBeNull();
    const voided = mockInserted("document_agreements").filter((row) => row.voided_at);
    expect(voided.map((row) => row.id).sort()).toEqual(["bos", "fin"]);
    for (const row of voided) expect(Date.parse(row.voided_at as string)).toBeGreaterThanOrEqual(before);
  });

  it("maps the attestation refusal in the action", () => {
    const action = readFileSync("src/lib/actions/void-bill-of-sale.ts", "utf8");
    expect(action).toMatch(/title_question: "voidTitleQuestion"/);
    // Whether each copy was signed is read off the rows the function voided.
    expect(action).toMatch(/wasSigned: Boolean\(row\.has_buyer_signature\) \|\| Boolean\(row\.signed_at\)/);
  });
});
