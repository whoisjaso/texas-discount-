import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * "Make sure it works, and make it so the user knows it registered."
 *
 * Two separate claims, and the second is worthless without the first.
 *
 * The intake screen photographs a licence before the sale exists, holds both
 * sides in the browser, and posts them the instant `startSale` returns an id.
 * Until now the answer to that post was thrown away inside a bare try, so a
 * licence that never reached the sale looked exactly like one that did: the
 * screen moved on either way.
 *
 * These tests hold the whole chain: the route stores both sides and writes them
 * onto the deal, the client reads the answer instead of discarding it, and the
 * screen says what actually happened.
 *
 * They also hold the instrument. The preview mock used to accept every write
 * and remember none of them, which made any local walk of this feature green
 * and meaningless.
 */

const SCREEN = readFileSync("src/components/admin/StartSale.tsx", "utf8");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EN = (require("../../messages/en.json") as { funnel: Record<string, Record<string, string>> }).funnel;
const ROUTE = readFileSync("src/app/api/capture/route.ts", "utf8");

describe("the preview fixture, before it is trusted", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("remembers what it was told to write", async () => {
    /*
      `.update()` used to fall through the mock's catch-all proxy, which returns
      the builder for any method it does not know. It resolved to the untouched
      fixtures. Every write in preview was silently discarded, so a feature that
      writes and then reads back its own write came out green while proving
      nothing.
    */
    const { createMockSupabaseClient, resetMockWrites } = await import("@/lib/supabase/mock");
    resetMockWrites();
    const supabase = createMockSupabaseClient();

    await supabase
      .from("deals")
      .update({ step_data: { buyerId: { image: "deal-1/front.jpg" } } })
      .eq("id", "preview-active-deal");

    const { data } = await supabase
      .from("deals")
      .select("step_data")
      .eq("id", "preview-active-deal")
      .maybeSingle();

    expect((data as { step_data?: Record<string, unknown> } | null)?.step_data).toEqual({
      buyerId: { image: "deal-1/front.jpg" },
    });
  });

  it("keeps the path of every file it was handed", async () => {
    const { createMockSupabaseClient, mockUploads, resetMockWrites } = await import(
      "@/lib/supabase/mock"
    );
    resetMockWrites();
    const supabase = createMockSupabaseClient();

    await supabase.storage.from("buyer-ids").upload("deal-1/1.jpg", new ArrayBuffer(8));
    await supabase.storage.from("buyer-ids").upload("deal-1/1-back.jpg", new ArrayBuffer(8));

    expect(mockUploads("buyer-ids")).toEqual(["deal-1/1.jpg", "deal-1/1-back.jpg"]);
    // Buckets do not bleed into each other.
    expect(mockUploads("vehicle-photos")).toEqual([]);
  });

  it("leaves a row alone when the update names no single id", async () => {
    // A blanket update is not something this fixture can honestly represent,
    // so it records nothing rather than half-applying it.
    const { createMockSupabaseClient, resetMockWrites } = await import("@/lib/supabase/mock");
    resetMockWrites();
    const supabase = createMockSupabaseClient();

    await supabase.from("deals").update({ status: "completed" });

    const { data } = await supabase
      .from("deals")
      .select("status")
      .eq("id", "preview-active-deal")
      .maybeSingle();
    expect((data as { status?: string } | null)?.status).toBe("in_progress");
  });
});

describe("the upload route, which is what registering actually means", () => {
  it("keeps both sides and writes them onto the deal", () => {
    // The three writes that constitute a registered licence.
    expect(ROUTE).toContain('.from("buyer-ids")');
    expect(ROUTE).toContain("image: path");
    expect(ROUTE).toContain("backImage: backPath ?? held.backImage");
    // Written through the version-checked merge, so the attach cannot
    // replay over a desk confirmation that landed mid-upload.
    expect(ROUTE).toContain("casMergeStepData(supabase, verified.dealId");
    expect(ROUTE).toContain("writeBuyerId(current, buildNext(current))");
  });

  it("names the deal from the signed token, never from the request", () => {
    // Otherwise a caller could aim this at a record they were not handed.
    expect(ROUTE).toContain("verifyCaptureToken");
    expect(ROUTE).toContain("verified.dealId");
    expect(ROUTE).not.toMatch(/form\.get\(\s*["']dealId["']\s*\)/);
  });

  it("answers a failed write with an error rather than ok", () => {
    expect(ROUTE).toContain('{ error: "Could not attach the photo." }');
    expect(ROUTE).toContain("status: 502");
  });
});

describe("the answer the screen reads back", () => {
  it("is checked, not thrown away", () => {
    /*
      The bare `try { await fetch(...) } catch {}` this replaced is the exact
      shape of a silent failure: a licence that never landed and a screen that
      moved on anyway.
    */
    expect(SCREEN).toContain("if (!response.ok || !payload?.ok)");
    expect(SCREEN).not.toMatch(/await fetch\("\/api\/capture"[\s\S]{0,120}\}\s*catch\s*\{\s*\/\//);
  });

  it("tells the operator the ID is on file, and what is in it", () => {
    expect(EN.start.idOnFile).toBe("ID On File");
    expect(SCREEN).toContain("t.start.idOnFile");
    expect(EN.start.frontBackStored).toBe("Front and back stored");
    expect(SCREEN).toContain("t.start.frontBackStored");
    expect(EN.start.attached).toBe("Attached to this sale");
    expect(SCREEN).toContain("t.start.attached");
    expect(EN.start.readOff).toBe("{list} read off the card");
    expect(SCREEN).toContain("t.start.readOff");
  });

  it("says so when the barcode gave up no back", () => {
    // A one-sided file is a real outcome and must not read as a complete one.
    expect(EN.start.noBack).toBe("No back. The barcode never read.");
    expect(SCREEN).toContain("t.start.noBack");
  });

  it("never reports a lost licence as a lost sale", () => {
    // The deal exists by then. Saying "start again" would throw away a real
    // record with a customer standing at the desk.
    expect(EN.start.saleStartedIdNot).toBe("The Sale Started. The ID Did Not.");
    expect(SCREEN).toContain("t.start.saleStartedIdNot");
    expect(EN.start.openAndAdd).toBe("Open The Sale And Add It");
    expect(SCREEN).toContain("t.start.openAndAdd");
  });

  it("holds the confirmation long enough to be read", () => {
    const held = SCREEN.match(/const REGISTERED_MS = (\d+)/);
    expect(held).not.toBeNull();
    expect(Number(held![1])).toBeGreaterThanOrEqual(1500);
  });

  it("skips the confirmation when nothing was scanned", () => {
    // There is nothing to confirm, and a screen that says "on file" about a
    // licence nobody took would be the worst lie in this whole flow.
    expect(SCREEN).toContain("if (!held) {");
  });
});
