import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The phone sends a photograph and the desk moves. That is the whole feature,
 * and the order of two writes is what decides whether it works.
 *
 * Measured before this was fixed: the upload took **32 seconds** and the
 * photograph never reached the sale at all. The route read the card before it
 * attached it, the reader could not start, and everything downstream of it,
 * including the one write the desk is subscribed to, never ran. The operator
 * watched a spinning phone and a screen that never changed.
 *
 * So this file asserts two things that are easy to undo by accident:
 *
 *   1. the deal is written **before** anything is read from the image
 *   2. a reader that fails, hangs or explodes cannot cost the photograph
 *
 * The customer is standing at the desk. The picture is the part that cannot be
 * retaken later; the fields can always be typed.
 */

/** Everything the route did to the database, in order. */
const calls: string[] = [];
let dealRow: { step_data: unknown } | null = { step_data: {} };
let uploadError: unknown = null;
let readerBehaviour: "finds" | "returns-null" | "throws" | "hangs" = "finds";

const readLicenceImage = vi.fn(async (_image?: Buffer) => {
  calls.push("read-the-card");
  if (readerBehaviour === "throws") throw new Error("worker would not start");
  if (readerBehaviour === "hangs") await new Promise(() => {});
  if (readerBehaviour === "returns-null") return null;
  return { name: "MARISOL VEGA", licenseNumber: "12345678" };
});

vi.mock("@/lib/sales/licence-ocr", () => ({
  readLicenceImage: (image: Buffer) => readLicenceImage(image),
}));

vi.mock("@/lib/sales/capture-token", () => ({
  verifyCaptureToken: () => ({ ok: true, dealId: "deal-1" }),
}));

/** `after` callbacks are collected so a test can run them deliberately. */
const afterQueue: Array<() => unknown> = [];
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (fn: () => unknown) => afterQueue.push(fn) };
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    storage: {
      from: () => ({
        upload: async () => {
          calls.push("upload-the-image");
          return { error: uploadError };
        },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            calls.push("read-the-deal");
            return { data: dealRow, error: null };
          },
        }),
      }),
      update: (patch: { step_data: unknown }) => ({
        eq: async () => {
          const held = (patch.step_data as Record<string, unknown>)?.buyerId as
            | { image?: string | null; name?: { read?: string | null } }
            | undefined;
          calls.push(
            `write-the-deal(image=${held?.image ? "yes" : "no"},name=${held?.name?.read ?? "none"})`,
          );
          dealRow = { step_data: patch.step_data };
          return { error: null };
        },
      }),
    }),
  }),
}));

async function post() {
  const { POST } = await import("@/app/api/capture/route");
  const form = new FormData();
  form.set("token", "signed");
  form.set("image", new File([new Uint8Array([1, 2, 3])], "licence.jpg", { type: "image/jpeg" }));
  return POST({ formData: async () => form } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  afterQueue.length = 0;
  dealRow = { step_data: {} };
  uploadError = null;
  readerBehaviour = "finds";
});

describe("the order the work happens in", () => {
  it("attaches the photograph before reading a thing off it", async () => {
    const response = await post();
    expect(response.status).toBe(200);

    const wrote = calls.findIndex((call) => call.startsWith("write-the-deal"));
    const read = calls.indexOf("read-the-card");
    expect(wrote).toBeGreaterThan(-1);
    // The reader has not even been called yet when the response is returned.
    expect(read).toBe(-1);
    expect(calls[wrote]).toContain("image=yes");
  });

  it("answers the phone without waiting for the reader", async () => {
    // The reader never finishes. The phone must still stop saying "sending".
    readerBehaviour = "hangs";
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("reads the card afterwards and writes what it found", async () => {
    await post();
    expect(afterQueue).toHaveLength(1);
    await afterQueue[0]();

    expect(calls.filter((c) => c.startsWith("write-the-deal"))).toHaveLength(2);
    expect(calls.at(-1)).toContain("name=MARISOL VEGA");
  });

  it("re-reads the deal before the second write", async () => {
    // Somebody at the desk may have confirmed a field while the reader worked,
    // so the fields are merged onto the current row, not onto a stale copy.
    await post();
    calls.length = 0;
    await afterQueue[0]();
    expect(calls.indexOf("read-the-deal")).toBeLessThan(
      calls.findIndex((c) => c.startsWith("write-the-deal")),
    );
  });
});

describe("a reader that fails cannot cost the photograph", () => {
  it.each(["throws", "returns-null"] as const)("survives a reader that %s", async (behaviour) => {
    readerBehaviour = behaviour;
    const response = await post();
    expect(response.status).toBe(200);

    await afterQueue[0]?.();

    // The photograph is attached either way. That is the whole point.
    const writes = calls.filter((c) => c.startsWith("write-the-deal"));
    expect(writes[0]).toContain("image=yes");
    if (behaviour === "returns-null") expect(writes).toHaveLength(1);
  });
});

describe("the desk keeps listening after the picture arrives", () => {
  // The other half of the same handoff. The upload writes the deal twice, and
  // the step used to unsubscribe the moment the first write landed, so the
  // reader's fields never reached the screen and the operator typed a licence
  // number the software already had. Read from source because the thing being
  // protected is the shape of the effect, not a value it produces.
  const step = readFileSync("src/components/admin/guide/BuyerIdStep.tsx", "utf8");

  it("does not tear the subscription down once the photograph is in", () => {
    expect(step).not.toMatch(/useEffect\(\(\) => \{\s*if \(!waiting\) return;/);
  });

  it("is not keyed on whether it is still waiting", () => {
    const deps = step.match(/\}, \[dealId[^\]]*\]\);/);
    expect(deps).not.toBeNull();
    expect(deps?.[0]).not.toContain("waiting");
  });

  it("fills empty fields and leaves typed ones alone", () => {
    // A reader's answer landing mid-word is worse than no reader at all.
    expect(step).toMatch(/if \(\(merged\[key\] \?\? ""\)\.trim\(\)\.length > 0\) continue;/);
  });

  it("asks the server for a new signed URL only when the photograph changes", () => {
    expect(step).toContain("lastImage.current !== next.image");
  });
});

describe("what still counts as a failure", () => {
  it("says so when the image itself did not save", async () => {
    uploadError = { message: "storage down" };
    const response = await post();
    expect(response.status).toBe(502);
    expect(calls.some((c) => c.startsWith("write-the-deal"))).toBe(false);
  });
});
