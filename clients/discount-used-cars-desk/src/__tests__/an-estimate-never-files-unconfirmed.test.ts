import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { paperworkAnswers, paperworkDefault, type PaperworkContext } from "@/lib/sales/paperwork";
import { emptyWeightContext, emptyWeightForFiling } from "@/lib/vehicles/empty-weight/on-the-sale";
import { makeEstimate, makeSale } from "./helpers/empty-weight";

/**
 * An estimate is never box 11 until a person confirms it.
 *
 * A default is filed unseen (a-default-is-an-answer-or-it-is-nothing): the
 * review, the preview and the filing all read `paperworkAnswers`, which fills
 * every unwalked question's default. So an estimate, or a weight on the
 * vehicle nobody recorded the source of, must never be a default, and the
 * filing must refuse a 130-U whose box 11 nobody settled.
 */

const written = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({ ok: true, role: "owner", member: null, user: { id: "u1" } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/sales/step-data-write", () => ({
  casMergeStepData: async () => {
    written.calls += 1;
    return { ok: true, version: 1, stepData: {} };
  },
}));

import { savePaperworkAnswer } from "@/lib/actions/paperwork";

function context(over: Partial<PaperworkContext> = {}): PaperworkContext {
  return {
    funding: "cash",
    bodyStyle: "sedan",
    licenceState: "TX",
    paidToday: null,
    buyerCity: "Houston",
    buyerCounty: "Harris",
    answers: {},
    ...over,
  };
}

describe("no estimate is a default", () => {
  it("never offers an estimate as box 11's starting answer", () => {
    const sale = makeSale();
    const ctx = context({ emptyWeight: emptyWeightContext(sale.vehicle, makeEstimate()) });
    expect(paperworkDefault("form130U", "emptyWeight", ctx)).toBeUndefined();
  });

  it("never offers a weight nobody recorded the source of", () => {
    const sale = makeSale({}, { weightLbs: 3765 });
    const ctx = context({ vehicleWeight: 3765, emptyWeight: emptyWeightContext(sale.vehicle, null) });
    expect(paperworkDefault("form130U", "emptyWeight", ctx)).toBeUndefined();
    // Even without the new context, the old row figure is no longer a default.
    expect(paperworkDefault("form130U", "emptyWeight", context({ vehicleWeight: 3765 }))).toBeUndefined();
  });

  it("leaves box 11 empty on the paper when only an estimate exists", () => {
    const sale = makeSale();
    const ctx = context({ emptyWeight: emptyWeightContext(sale.vehicle, makeEstimate()) });
    const filed = paperworkAnswers("form130U", ctx);
    expect(filed.emptyWeight).toBeUndefined();
    expect(Object.keys(filed).some((key) => key.startsWith("_emptyWeight"))).toBe(false);
  });

  it("leaves it empty with a stored estimate on the vehicle too", () => {
    const sale = makeSale({}, { weightEstimate: makeEstimate() });
    const filed = paperworkAnswers("form130U", context({ emptyWeight: emptyWeightContext(sale.vehicle, null) }));
    expect(filed.emptyWeight).toBeUndefined();
  });
});

describe("the filing settles box 11 from the server's own read", () => {
  it("refuses a sale with no confirmed figure", () => {
    expect(emptyWeightForFiling(makeSale())).toEqual({ ok: false, code: "emptyWeightUnsettled" });
    expect(emptyWeightForFiling(makeSale({}, { weightEstimate: makeEstimate() }))).toMatchObject({ ok: false });
    expect(emptyWeightForFiling(makeSale({}, { weightLbs: 3765 }))).toMatchObject({ ok: false });
    expect(emptyWeightForFiling(makeSale({ emptyWeight: "not confirmed" }))).toMatchObject({ ok: false });
  });

  it("files a confirmed estimate with its record, and writes every provenance key", () => {
    const result = emptyWeightForFiling(
      makeSale({
        emptyWeight: "3500",
        _emptyWeightSource: "estimate_epa",
        _emptyWeightBy: "Jo Smith",
        _emptyWeightAt: "2026-10-02T15:00:00.000Z",
        _emptyWeightRule: "plus100RoundUp",
        _emptyWeightReading: "3325",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields).toMatchObject({
      emptyWeight: "3500",
      _emptyWeightSource: "estimate_epa",
      _emptyWeightBy: "Jo Smith",
      _emptyWeightReason: "",
    });
    expect(Object.keys(result.fields).filter((k) => k.startsWith("_emptyWeight")).length).toBe(9);
  });

  it("is never moved by what the client sends: the server's fields overwrite it", () => {
    const source = readFileSync("src/lib/actions/paperwork.ts", "utf8");
    const gate = source.indexOf("emptyWeightForFiling(sale)");
    expect(gate).toBeGreaterThan(-1);
    // Before anything is written, and before the printable link is built
    // from formData.
    expect(gate).toBeLessThan(source.indexOf('.from("document_agreements")'));
    expect(gate).toBeLessThan(source.indexOf("corridorCompletedLink(sale, documentType, input.formData"));
    // The server's fields are spread AFTER the client's, so they win.
    expect(source).toContain("formData: { ...input.formData, ...weight.fields }");
    expect(source).toMatch(/if \(!weight\.ok\) return \{ ok: false, error: "Settle the empty weight \(box 11\) first/);
  });

  it("ignores a client-sent figure: only the deal's stored answer counts", () => {
    // What a tampered or stale screen might send with the File button.
    const clientSays = { emptyWeight: "2000", _emptyWeightSource: "texas_title", _emptyWeightBy: "Nobody" };
    // Nothing settled on the deal: refused, whatever the client said.
    expect(emptyWeightForFiling(makeSale({})).ok).toBe(false);
    // Settled on the deal: the deal's figure and record replace the client's.
    const result = emptyWeightForFiling(
      makeSale({ emptyWeight: "3500", _emptyWeightSource: "estimate_epa", _emptyWeightBy: "Jo Smith" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const filed = { ...clientSays, ...result.fields };
    expect(filed).toMatchObject({ emptyWeight: "3500", _emptyWeightSource: "estimate_epa", _emptyWeightBy: "Jo Smith" });
  });
});

describe("the ordinary answer action cannot write box 11", () => {
  it.each(["emptyWeight", "_emptyWeightSource", "_emptyWeightBy", "_emptyWeightEstimate"])(
    "refuses %s on the 130-U",
    async (key) => {
      const before = written.calls;
      const result = await savePaperworkAnswer("deal-1", "form130U", key, "3500");
      expect(result).toEqual({ ok: false, error: "Use the empty weight screen." });
      expect(written.calls).toBe(before);
    },
  );

  it("still saves the 130-U's other answers", async () => {
    const result = await savePaperworkAnswer("deal-1", "form130U", "countyOfResidence", "Harris");
    expect(result).toEqual({ ok: true });
  });
});
