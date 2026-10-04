import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The upload route, driven end to end against the preview fixture.
 *
 * The browser walk proves the POST is made and answered. It cannot prove the
 * licence reached the record, because in a Next dev server the route handler
 * and the page are separate bundles and do not share the fixture's memory: the
 * walk sees a 200 and then a licence step that shows nothing, and those two
 * facts together say nothing about the product.
 *
 * So the route is called here directly, in one process, and then the deal is
 * read back through the same client the desk reads it with. What survives this
 * is the actual claim: both sides stored, both written onto the deal, and the
 * barcode's values landing as `read` rather than as confirmed answers.
 */

// The token is signed, so the signing secret has to exist before the module
// that reads it is imported.
process.env.ADMIN_SESSION_SECRET ||= "test-secret-for-capture-tokens";
process.env.LOCAL_ADMIN_PREVIEW = "true";

/**
 * `after` needs a request scope Next only provides inside a real server.
 *
 * Stubbed to run the callback rather than skipped, because the callback is the
 * second-pass reader and a test that quietly never ran it would be claiming
 * coverage it does not have. The reader itself gives up on a ten-byte JPEG,
 * which is the same shape as a card it cannot read: the outcome under test is
 * that the licence stays attached either way.
 */
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (fn: () => unknown) => void Promise.resolve().then(fn) };
});

const DEAL = "preview-completed-deal";

function jpeg(name: string): File {
  // A real JPEG header, because the route checks the declared type and the
  // storage layer would reject an empty part.
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  return new File([bytes], name, { type: "image/jpeg" });
}

/** The shape zxing hands back for a Texas licence. */
const FIELDS = {
  name: "JOHN QUINCY SAMPLE",
  licenseNumber: "12345678",
  dateOfBirth: "1988-04-02",
  address: "1234 SAMPLE ST, AUSTIN, TX 78745",
  expires: "2030-04-02",
};

async function post(body: FormData) {
  const { POST } = await import("@/app/api/capture/route");
  const request = new Request("http://localhost/api/capture", { method: "POST", body });
  return POST(request as never);
}

async function readDeal() {
  const { createMockSupabaseClient } = await import("@/lib/supabase/mock");
  const { readBuyerId } = await import("@/lib/sales/buyer-id");
  const supabase = createMockSupabaseClient();
  const { data } = await supabase
    .from("deals")
    .select("step_data")
    .eq("id", DEAL)
    .maybeSingle();
  return readBuyerId((data as { step_data?: unknown } | null)?.step_data ?? {});
}

async function tokenFor(deal: string) {
  const { issueCaptureToken } = await import("@/lib/sales/capture-token");
  return issueCaptureToken(deal);
}

describe("a licence posted from the intake screen", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { resetMockWrites } = await import("@/lib/supabase/mock");
    resetMockWrites();
  });

  it("puts both sides on the deal", async () => {
    const body = new FormData();
    body.set("token", await tokenFor(DEAL));
    body.set("image", jpeg("licence.jpg"));
    body.set("back", jpeg("licence-back.jpg"));
    body.set("fields", JSON.stringify(FIELDS));

    const response = await post(body);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });

    const held = await readDeal();
    // Named by deal, which is what keeps one sale's licence out of another's.
    expect(held.image).toMatch(new RegExp(`^${DEAL}/\\d+\\.jpg$`));
    expect(held.backImage).toMatch(new RegExp(`^${DEAL}/\\d+-back\\.jpg$`));
    expect(held.capturedAt).toBeTruthy();
  });

  it("stores the files themselves, not just their names", async () => {
    const { mockUploads } = await import("@/lib/supabase/mock");
    const body = new FormData();
    body.set("token", await tokenFor(DEAL));
    body.set("image", jpeg("licence.jpg"));
    body.set("back", jpeg("licence-back.jpg"));

    await post(body);

    const stored = mockUploads("buyer-ids");
    expect(stored).toHaveLength(2);
    expect(stored.filter((p) => p.endsWith("-back.jpg"))).toHaveLength(1);
    // A private bucket, and never the public one the lot's photographs use.
    expect(mockUploads("vehicle-photos")).toEqual([]);
  });

  it("lands the barcode as read, never as confirmed", async () => {
    /*
      The safety property of the whole feature. Extraction only ever fills
      `read`; `confirmed` stays empty until somebody at the desk looks at the
      value. Without this a scan could put a wrong licence number straight onto
      a title application.
    */
    const body = new FormData();
    body.set("token", await tokenFor(DEAL));
    body.set("image", jpeg("licence.jpg"));
    body.set("fields", JSON.stringify(FIELDS));

    await post(body);

    const held = await readDeal();
    expect(held.name.read).toBe(FIELDS.name);
    expect(held.licenseNumber.read).toBe(FIELDS.licenseNumber);
    expect(held.name.confirmed).toBeFalsy();
    expect(held.licenseNumber.confirmed).toBeFalsy();
  });

  it("keeps the front when there is no back to keep", async () => {
    // A card whose barcode never read sends no back at all.
    const body = new FormData();
    body.set("token", await tokenFor(DEAL));
    body.set("image", jpeg("licence.jpg"));

    const response = await post(body);
    expect(response.status).toBe(200);

    const held = await readDeal();
    expect(held.image).toBeTruthy();
    expect(held.backImage).toBeFalsy();
  });

  it("refuses a token that was not signed here", async () => {
    const body = new FormData();
    body.set("token", "not-a-real-token");
    body.set("image", jpeg("licence.jpg"));

    const response = await post(body);
    expect(response.status).toBe(401);
    const said = (await response.json()) as { ok?: boolean; error?: string };
    expect(said.ok).toBeFalsy();
    expect(said.error).toBeTruthy();

    // And nothing reached the deal.
    expect((await readDeal()).image).toBeFalsy();
  });

  it("refuses a token that has expired", async () => {
    const { issueCaptureToken } = await import("@/lib/sales/capture-token");
    const { CAPTURE_TTL_MS } = await import("@/lib/sales/capture-token");
    const stale = issueCaptureToken(DEAL, Date.now() - CAPTURE_TTL_MS - 1000);

    const body = new FormData();
    body.set("token", stale);
    body.set("image", jpeg("licence.jpg"));

    const response = await post(body);
    expect(response.status).toBe(410);
    expect((await readDeal()).image).toBeFalsy();
  });

  it("refuses a part that is not a photograph", async () => {
    const body = new FormData();
    body.set("token", await tokenFor(DEAL));
    body.set("image", new File([new Uint8Array([1, 2, 3])], "x.txt", { type: "text/plain" }));

    const response = await post(body);
    expect(response.status).toBe(415);
    expect((await readDeal()).image).toBeFalsy();
  });
});
