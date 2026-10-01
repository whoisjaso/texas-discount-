import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeCompletedLink } from "@/lib/documents/customerPortal";

/**
 * A filed 130-U names the member who filed it and never borrows a later
 * viewer's signature or name (owner's instruction 10/01/2026; SOP 130-U
 * bullet: the person is whoever filed it). A draft shows the viewer's own
 * stroke and name, because that is what their filing would print.
 *
 * Mocked the same way as official-130u-delivery.test.ts, which stays as it is.
 */

const state = vi.hoisted(() => ({ row: {} as Record<string, unknown>, fill: vi.fn(), staff: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: table === "document_agreements" ? state.row : null, error: null }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/fill-130u/fill-pdf", () => ({ fill130U: state.fill }));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: state.staff }));

import { render130UPdf } from "@/lib/documents/render130U";

const VIEWER = {
  dataUrl: "data:image/png;base64,VIEWER",
  canSign: true,
  signerName: "Viewer Person",
  hasMember: true,
  fullName: "Viewer Person",
};

function link(dd: Record<string, unknown>, ds?: string) {
  return encodeCompletedLink(
    "form130U",
    { vehicleVin: "1HGCM82633A004352", ...dd },
    { applicantFirstName: "Avery", applicantLastName: "Collins" },
    "https://example.test",
    ds,
    ds ? "2026-10-01" : undefined,
  );
}

beforeEach(() => {
  state.fill.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  state.staff.mockReset().mockResolvedValue(VIEWER);
});

describe("a filed 130-U", () => {
  it("with no stroke on file is left for ink and names the filer, not the viewer", async () => {
    state.row = {
      id: "filed",
      status: "finalized",
      finalized_at: "2026-10-01T16:00:00.000Z",
      completed_link: link({ dealerSignerName: "Maria Gonzalez" }),
    };
    expect((await render130UPdf("filed")).ok).toBe(true);
    expect(state.fill.mock.calls[0][1].staffSignatureDataUrl).toBeNull();
    expect(state.fill.mock.calls[0][0].dealer_signer_name).toBe("Maria Gonzalez");
    expect(state.staff).not.toHaveBeenCalled();
  });

  it("with a stroke keeps the filer's stroke and name", async () => {
    state.row = {
      id: "filed",
      status: "finalized",
      finalized_at: "2026-10-01T16:00:00.000Z",
      completed_link: link({ dealerSignerName: "Maria Gonzalez" }, "data:image/png;base64,FILED"),
    };
    await render130UPdf("filed");
    expect(state.fill.mock.calls[0][1].staffSignatureDataUrl).toBe("data:image/png;base64,FILED");
    expect(state.fill.mock.calls[0][0].dealer_signer_name).toBe("Maria Gonzalez");
    expect(state.staff).not.toHaveBeenCalled();
  });

  it("filed before the name existed prints the marker rather than the viewer's name", async () => {
    state.row = { id: "legacy", status: "completed", completed_link: link({}) };
    await render130UPdf("legacy");
    expect(state.fill.mock.calls[0][0].dealer_signer_name).toBeNull();
    expect(state.fill.mock.calls[0][1].staffSignatureDataUrl).toBeNull();
    expect(state.staff).not.toHaveBeenCalled();
  });
});

describe("a draft 130-U", () => {
  it("shows the viewer's stroke and the viewer's name together", async () => {
    state.row = { id: "draft", status: "pending", completed_link: link({}) };
    await render130UPdf("draft");
    expect(state.fill.mock.calls[0][1].staffSignatureDataUrl).toBe(VIEWER.dataUrl);
    expect(state.fill.mock.calls[0][0].dealer_signer_name).toBe("Viewer Person");
  });

  it("carries no stroke for a viewer whose signing is turned off", async () => {
    state.staff.mockResolvedValue({ ...VIEWER, canSign: false, signerName: null });
    state.row = { id: "draft", status: "pending", completed_link: link({}) };
    await render130UPdf("draft");
    expect(state.fill.mock.calls[0][1].staffSignatureDataUrl).toBeNull();
    expect(state.fill.mock.calls[0][0].dealer_signer_name).toBeNull();
  });
});
