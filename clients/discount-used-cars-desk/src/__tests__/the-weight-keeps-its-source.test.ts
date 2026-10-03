import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { DOCUMENT_KINDS, ESTIMATE_KINDS } from "@/lib/vehicles/empty-weight/rules";
import { EMPTY_WEIGHT_KEYS } from "@/lib/vehicles/empty-weight/on-the-sale";
import { sourceLineFromAnswers, weightSourceLine } from "@/lib/vehicles/empty-weight/copy";
import { getFunnelStrings } from "@/lib/sales/i18n";
import { makeEstimate, makeSale } from "./helpers/empty-weight";
import type { SaleDetail } from "@/lib/admin/sale-desk";
import type { WeightEstimate } from "@/lib/vehicles/empty-weight/types";

/**
 * Box 11 carries where it came from, wherever it goes.
 *
 * Confirming writes the figure and its record onto the deal in one write:
 * which source, the reading, the rounding rule, who and when, and for an
 * estimate the estimate as it was shown. The review reads that record back
 * in words, and the filing carries it into form_data.
 */

const state = vi.hoisted(() => ({
  sale: null as SaleDetail | null,
  estimate: null as WeightEstimate | null,
  written: null as Record<string, unknown> | null,
  vehicleUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/current-admin", () => ({
  requireAdminActionPermission: async () => ({
    ok: true,
    role: "owner",
    member: { id: "4f1c2a8e-6b0d-4c55-9e43-0d7a8f6b1c22", full_name: "Jo Smith" },
    user: { id: "u1", email: "jo@example.dev" },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          state.vehicleUpdates.push(patch);
          return { error: null };
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/admin/sale-desk", () => ({ getSaleDetail: async () => state.sale }));
vi.mock("@/lib/actions/staff-signature", () => ({ getStaffSignature: async () => ({ signerName: "Jo Smith" }) }));
vi.mock("@/lib/vehicles/empty-weight/ensure", () => ({ resolveVehicleWeight: async () => state.estimate }));
vi.mock("@/lib/sales/step-data-write", () => ({
  casMergeStepData: async (_c: unknown, _d: string, build: (current: Record<string, unknown>) => Record<string, unknown>) => {
    state.written = build((state.sale?.stepData as Record<string, unknown>) ?? {});
    return { ok: true, version: 1, stepData: state.written };
  },
}));

import { confirmEmptyWeight } from "@/lib/actions/empty-weight";

function form130U(): Record<string, string> {
  return ((state.written as { paperwork?: { form130U?: Record<string, string> } })?.paperwork?.form130U ?? {});
}

beforeEach(() => {
  state.sale = makeSale({ countyOfResidence: "Harris" });
  state.estimate = makeEstimate();
  state.written = null;
  state.vehicleUpdates = [];
});

describe("confirming an estimate", () => {
  it("writes box 11 with its source, reading, rule, who, when and the estimate shown", async () => {
    expect(await confirmEmptyWeight("deal-1", { mode: "estimate", shownBox11: 3500 })).toEqual({ ok: true, box11: 3500 });
    const held = form130U();
    expect(held).toMatchObject({
      countyOfResidence: "Harris",
      emptyWeight: "3500",
      _emptyWeightSource: "estimate_epa",
      _emptyWeightFrom: "deal",
      _emptyWeightReading: "3325",
      _emptyWeightRule: "plus100RoundUp",
      _emptyWeightBy: "Jo Smith",
    });
    expect(Number.isNaN(Date.parse(held._emptyWeightAt))).toBe(false);
    const shown = JSON.parse(held._emptyWeightEstimate);
    expect(shown).toMatchObject({ source: "epa", curbLbs: 3325, lowLbs: 3137, highLbs: 3388, tableBuilt: "2026-10-02" });
    expect(shown.epa.yearUsed).toBe(2019);
  });

  it("never writes an estimate onto the vehicle's weight_lbs", async () => {
    await confirmEmptyWeight("deal-1", { mode: "estimate", shownBox11: 3500 });
    expect(state.vehicleUpdates).toEqual([]);
  });

  it("refuses when the estimate is not the one the screen showed", async () => {
    expect(await confirmEmptyWeight("deal-1", { mode: "estimate", shownBox11: 3400 })).toMatchObject({
      ok: false,
      code: "estimateChanged",
      error: "The estimate changed; look again.",
    });
    expect(state.written).toBeNull();
  });
});

describe("typing it from a document", () => {
  it("applies the Texas rounding on the server and records the document", async () => {
    expect(await confirmEmptyWeight("deal-1", { mode: "typed", reading: "3,252", source: "texas_title" })).toEqual({
      ok: true,
      box11: 3300,
    });
    expect(form130U()).toMatchObject({
      emptyWeight: "3300",
      _emptyWeightSource: "texas_title",
      _emptyWeightReading: "3252",
      _emptyWeightRule: "roundUp",
      _emptyWeightBy: "Jo Smith",
      _emptyWeightEstimate: "",
    });
  });

  it("records the document on the vehicle too, for the next sale of this car", async () => {
    await confirmEmptyWeight("deal-1", { mode: "typed", reading: "3589", source: "mco" });
    expect(state.vehicleUpdates).toHaveLength(1);
    expect(state.vehicleUpdates[0]).toMatchObject({
      weight_lbs: 3700,
      weight_source: "mco",
      weight_reading_lbs: 3589,
      weight_rule: "plus100RoundUp",
      weight_confirmed_by: "4f1c2a8e-6b0d-4c55-9e43-0d7a8f6b1c22",
      weight_confirmed_by_name: "Jo Smith",
    });
  });

  it("replaces every earlier _emptyWeight key rather than leaving a stale one", async () => {
    state.sale = makeSale({ emptyWeight: "3500", _emptyWeightSource: "estimate_epa", _emptyWeightEstimate: "{}" });
    await confirmEmptyWeight("deal-1", { mode: "typed", reading: "3252", source: "texas_title" });
    const held = form130U();
    expect(held._emptyWeightSource).toBe("texas_title");
    expect(held._emptyWeightEstimate).toBe("");
    for (const key of Object.keys(held).filter((k) => k.startsWith("_emptyWeight"))) {
      expect(EMPTY_WEIGHT_KEYS as readonly string[]).toContain(key);
    }
  });
});

describe("the review says where it came from", () => {
  const t = getFunnelStrings("en");

  it("names a typed document and who entered it", () => {
    expect(
      sourceLineFromAnswers(t, {
        emptyWeight: "3300",
        _emptyWeightSource: "texas_title",
        _emptyWeightBy: "Jo Smith",
        _emptyWeightAt: "2026-10-02T15:00:00.000Z",
      }),
    ).toBe("Texas title, entered by Jo Smith on 10/02/2026");
  });

  it("names a confirmed estimate as an estimate", () => {
    expect(
      sourceLineFromAnswers(t, {
        emptyWeight: "3500",
        _emptyWeightSource: "estimate_epa",
        _emptyWeightBy: "Jo Smith",
        _emptyWeightAt: "2026-10-02T15:00:00.000Z",
      }),
    ).toBe("Estimate (EPA test data), confirmed by Jo Smith on 10/02/2026");
  });

  it("says so when a figure was typed before sources were recorded", () => {
    expect(sourceLineFromAnswers(t, { emptyWeight: "3340" })).toBe("Typed on this sale, source not recorded");
  });

  it("reads in Spanish too", () => {
    expect(weightSourceLine(getFunnelStrings("es"), { kind: "texas_title", by: "Jo Smith", at: "2026-10-02" })).toBe(
      "Título de Texas, escrito por Jo Smith el 10/02/2026",
    );
  });

  it("has a label in both languages for every source code", () => {
    for (const code of [...DOCUMENT_KINDS, ...ESTIMATE_KINDS, "typed_unrecorded"]) {
      expect((en.funnel.weight.sources as Record<string, string>)[code], `en ${code}`).toBeTruthy();
      expect((es.funnel.weight.sources as Record<string, string>)[code], `es ${code}`).toBeTruthy();
    }
    for (const code of DOCUMENT_KINDS) {
      expect((en.funnel.weight.sourceButtons as Record<string, string>)[code]).toBeTruthy();
      expect((es.funnel.weight.sourceButtons as Record<string, string>)[code]).toBeTruthy();
    }
  });
});
