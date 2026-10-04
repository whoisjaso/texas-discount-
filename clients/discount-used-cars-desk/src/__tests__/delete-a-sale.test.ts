import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Removing a sale that should not exist, and refusing to remove one that
 * should.
 *
 * The distinction this file is really about: a sale with a signature on it is
 * evidence of a transaction with a real person, and no amount of "I did not
 * mean to make that" turns it back into a draft. A test deal with nothing
 * signed is the opposite, and leaving it on the list as "abandoned" means
 * somebody recognises and ignores the same dead row every day.
 */

const getCurrentAdminAccess = vi.fn();
vi.mock("@/lib/admin/current-admin", () => ({
  getCurrentAdminAccess: () => getCurrentAdminAccess(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const agreementRows = vi.fn();
const deletedFrom: string[] = [];

function serviceClient() {
  return {
    from(table: string) {
      return {
        select: () => ({
          eq: async () => agreementRows(),
        }),
        delete: () => ({
          eq: async () => {
            deletedFrom.push(table);
            return { error: null };
          },
        }),
      };
    },
  };
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => serviceClient(),
}));

async function deleteSale(
  dealId: string,
  options?: { confirmSigned?: boolean },
) {
  const { deleteSaleAction } = await import("@/lib/actions/delete-sale");
  return deleteSaleAction(dealId, options);
}

beforeEach(() => {
  vi.clearAllMocks();
  deletedFrom.length = 0;
  getCurrentAdminAccess.mockResolvedValue({ user: { id: "u1" }, role: "manager" });
  agreementRows.mockResolvedValue({ data: [], error: null });
});

describe("a sale with nothing signed can go", () => {
  it("removes the deal", async () => {
    const result = await deleteSale("d1");
    expect(result.ok).toBe(true);
    expect(deletedFrom).toContain("deals");
  });

  it("takes its unsigned drafts with it", async () => {
    // A draft pointing at a deal that no longer exists is an orphan nothing
    // will ever clean up.
    agreementRows.mockResolvedValue({
      data: [{ id: "a1", status: "draft", completed_at: null, finalized_at: null }],
      error: null,
    });

    await deleteSale("d1");
    expect(deletedFrom).toEqual(["document_agreements", "deals"]);
  });
});

describe("a sale with a signature stays", () => {
  it.each([
    ["the buyer-signature flag", { has_buyer_signature: true, signature_svg: null, signed_at: null }],
    ["a drawn signature", { has_buyer_signature: null, signature_svg: "<svg/>", signed_at: null }],
    ["a signing timestamp", { has_buyer_signature: null, signature_svg: null, signed_at: "2026-08-24" }],
  ])("refuses when a document carries %s", async (_label, agreement) => {
    agreementRows.mockResolvedValue({ data: [{ id: "a1", ...agreement }], error: null });

    const result = await deleteSale("d1");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("signed paperwork");
    // And nothing at all was removed, including the drafts.
    expect(deletedFrom).toEqual([]);
  });

  it("points at the thing that does work instead of just saying no", async () => {
    agreementRows.mockResolvedValue({
      data: [{ id: "a1", has_buyer_signature: true, signature_svg: null, signed_at: null }],
      error: null,
    });
    const result = await deleteSale("d1");
    expect(result.error).toContain("Abandon");
  });

  /**
   * The correction the owner made: a document the DEALERSHIP finished is not
   * a transaction. Only the buyer's own signature makes it one.
   */
  it("does not treat the dealership finalising its own PDF as a signature", async () => {
    agreementRows.mockResolvedValue({
      data: [
        {
          id: "a1",
          status: "finalized",
          completed_at: "2026-08-24",
          finalized_at: "2026-08-24",
          has_buyer_signature: false,
          signature_svg: null,
          signed_at: null,
        },
      ],
      error: null,
    });
    const result = await deleteSale("d1");
    expect(result.ok).toBe(true);
    expect(deletedFrom).toContain("deals");
  });
});

/**
 * The owner's way out.
 *
 * A dealer testing his own product makes signed drafts against fake buyers.
 * Locking him out of them forever is a bug, not a safeguard. So the owner can
 * pass a signature, and only ever on a second, separate confirmation.
 */
describe("the owner can destroy a signed sale, deliberately", () => {
  const signedRow = [
    { id: "a1", has_buyer_signature: true, signature_svg: null, signed_at: null },
  ];

  it("still refuses the owner's FIRST tap, and says what is at stake", async () => {
    getCurrentAdminAccess.mockResolvedValue({ user: { id: "u1" }, role: "owner" });
    agreementRows.mockResolvedValue({ data: signedRow, error: null });

    const result = await deleteSale("d1");
    expect(result.ok).toBe(false);
    expect(result.needsSignedConfirmation).toBe(true);
    expect(result.error).toContain("destroys that record");
    // Nothing removed while it is only asking.
    expect(deletedFrom).toEqual([]);
  });

  it("goes through once the owner confirms the signed path", async () => {
    getCurrentAdminAccess.mockResolvedValue({ user: { id: "u1" }, role: "owner" });
    agreementRows.mockResolvedValue({ data: signedRow, error: null });

    const result = await deleteSale("d1", { confirmSigned: true });
    expect(result.ok).toBe(true);
    expect(deletedFrom).toContain("deals");
  });

  it("never lets a manager through, confirmed or not", async () => {
    getCurrentAdminAccess.mockResolvedValue({ user: { id: "u1" }, role: "manager" });
    agreementRows.mockResolvedValue({ data: signedRow, error: null });

    const result = await deleteSale("d1", { confirmSigned: true });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Abandon");
    expect(result.needsSignedConfirmation).toBeUndefined();
    expect(deletedFrom).toEqual([]);
  });
});

describe("who may do it", () => {
  it("refuses a signed-out caller", async () => {
    getCurrentAdminAccess.mockResolvedValue({ user: null, role: null });
    const result = await deleteSale("d1");
    expect(result.ok).toBe(false);
    expect(deletedFrom).toEqual([]);
  });

  it("refuses a role that cannot manage documents", async () => {
    getCurrentAdminAccess.mockResolvedValue({ user: { id: "u1" }, role: "viewer" });
    const result = await deleteSale("d1");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("cannot remove");
    expect(deletedFrom).toEqual([]);
  });

  it("checks permission before it reads anything", async () => {
    getCurrentAdminAccess.mockResolvedValue({ user: { id: "u1" }, role: "viewer" });
    await deleteSale("d1");
    expect(agreementRows).not.toHaveBeenCalled();
  });
});

describe("bad input", () => {
  it("refuses an empty id rather than deleting by accident", async () => {
    // An empty id reaching a delete is the shape of a very bad afternoon.
    const result = await deleteSale("");
    expect(result.ok).toBe(false);
    expect(deletedFrom).toEqual([]);
  });
});
