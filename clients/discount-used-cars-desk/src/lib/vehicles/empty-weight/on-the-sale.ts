import {
  box11,
  estimateGate,
  isCargoVanBody,
  minimumCarryingCapacity,
  workVehicleByName,
  isDocumentKind,
  isEstimateKind,
  parseWeightReading,
  vehicleWeightClass,
  type Box11Rule,
  type DocumentKind,
  type EstimateGate,
  type EstimateKind,
  type GateReason,
  type RecordedSourceKind,
  type WeightClass,
} from "./rules";
import {
  estimateCorroborated,
  estimateFitsVehicle,
  isWeightEstimate,
  type WeightEstimate,
  type WeightIdentity,
} from "./types";

/**
 * The 130-U's box 11 on a sale: what is known, where it came from, and what
 * the question screen, the review, the preview, the filing and the webDEALER
 * handoff may each do with it.
 *
 * Pure, and safe on the client. The rules it keeps:
 *
 *   A document figure on the VEHICLE (a title, an MCO, a weight certificate,
 *   KBB / JD Power) is box 11: the question is skipped and the figure is
 *   affixed with its source.
 *
 *   An ESTIMATE (EPA test weight, Transport Canada, the VIN decode) is never
 *   box 11 by itself. It is shown with its source and becomes the answer only
 *   when a person confirms it, and that confirmation is recorded on the deal
 *   (`_emptyWeight*`). It is never a default, because a default is filed
 *   unseen (a-default-is-an-answer-or-it-is-nothing).
 *
 *   A LEGACY weight (on the vehicle, no source) is shown and never defaulted.
 *
 *   Nothing known: the question is asked, as it always was.
 */

/** The `_emptyWeight*` keys that travel with box 11 on the deal and into `form_data`. */
export const EMPTY_WEIGHT_KEYS = [
  "_emptyWeightSource",
  "_emptyWeightFrom",
  "_emptyWeightReading",
  "_emptyWeightRule",
  "_emptyWeightBy",
  "_emptyWeightById",
  "_emptyWeightAt",
  "_emptyWeightReason",
  "_emptyWeightEstimate",
] as const;

/** A document figure recorded on the vehicle row. */
export type WeightOnFile = {
  box11: number;
  source: DocumentKind;
  reading: number | null;
  rule: Box11Rule | null;
  by: string | null;
  at: string | null;
  note: string | null;
};

export type EmptyWeightContext = {
  cls: WeightClass;
  onFile: WeightOnFile | null;
  /** A weight on the vehicle with no recorded source. Shown, never defaulted. */
  legacyLbs: number | null;
  estimate: WeightEstimate | null;
  /** Whether that estimate may be confirmed with one tap. Null without one. */
  gate: EstimateGate | null;
};

/** The vehicle fields this reads; `SaleVehicle` satisfies it. */
export type WeightVehicleFacts = WeightIdentity & {
  bodyStyle?: string | null;
  weightLbs?: number | null;
  weightSource?: string | null;
  weightReadingLbs?: number | null;
  weightRule?: string | null;
  weightConfirmedByName?: string | null;
  weightConfirmedAt?: string | null;
  weightNote?: string | null;
  weightEstimate?: unknown;
};

export function estimateKindOf(estimate: Pick<WeightEstimate, "source">): EstimateKind {
  return estimate.source === "canada" ? "estimate_canada" : estimate.source === "vpic" ? "estimate_vpic" : "estimate_epa";
}

/** Box 11 and its rule for an estimate, on this class of vehicle. */
export function estimateBox11(estimate: WeightEstimate, cls: WeightClass): { lbs: number; rule: Box11Rule } {
  return box11(estimate.curbLbs, estimateKindOf(estimate), cls);
}

/**
 * Everything the sale knows about box 11. `estimate` is passed by a server
 * caller that resolved one (ensure.ts); without it, a stored estimate on the
 * vehicle is used, and the filing and the preview pass none at all.
 */
export function emptyWeightContext(
  vehicle: WeightVehicleFacts | null | undefined,
  estimate: WeightEstimate | null,
): EmptyWeightContext {
  // A stored estimate counts only while it is still about this vehicle row.
  const stored =
    isWeightEstimate(vehicle?.weightEstimate) && estimateFitsVehicle(vehicle!.weightEstimate, vehicle!)
      ? vehicle!.weightEstimate
      : null;
  const held = estimate ?? stored;
  const fromBody = vehicleWeightClass({ bodyStyle: vehicle?.bodyStyle ?? null });
  const byName = workVehicleByName(vehicle?.make ?? held?.vehicle.make, vehicle?.model ?? held?.vehicle.model);
  // The lot's body style says truck or bus: that wins over a decode that
  // could not tell. A pickup by name is a truck whatever else is missing.
  const cls: WeightClass =
    fromBody === "truck" || fromBody === "bus"
      ? fromBody
      : byName === "pickup" && held?.vehicle.cls !== "bus"
        ? "truck"
        : held && held.vehicle.cls !== "unknown"
          ? held.vehicle.cls
          : fromBody;

  const weight = typeof vehicle?.weightLbs === "number" && vehicle.weightLbs > 0 ? Math.round(vehicle.weightLbs) : null;
  const onFile: WeightOnFile | null =
    weight !== null && isDocumentKind(vehicle?.weightSource)
      ? {
          box11: weight,
          source: vehicle!.weightSource as DocumentKind,
          reading: typeof vehicle?.weightReadingLbs === "number" ? vehicle.weightReadingLbs : null,
          rule: vehicle?.weightRule === "roundUp" || vehicle?.weightRule === "plus100RoundUp" ? vehicle.weightRule : null,
          by: vehicle?.weightConfirmedByName ?? null,
          at: vehicle?.weightConfirmedAt ?? null,
          note: vehicle?.weightNote ?? null,
        }
      : null;
  const legacyLbs = weight !== null && !onFile ? weight : null;
  const gate = held
    ? estimateGate({ highLbs: held.highLbs, kind: estimateKindOf(held) }, cls, {
        incomplete: held.vehicle.incomplete,
        heavy: held.vehicle.heavy,
        cargoVan: !!held.vehicle.cargoVan || byName === "van" || isCargoVanBody(vehicle?.bodyStyle),
        lowConfidence: held.confidence === "low" && !estimateCorroborated(held),
      })
    : null;
  return { cls, onFile, legacyLbs, estimate: held, gate };
}

/** A stored answer that is a figure: digits, commas allowed. */
function storedBox11(value: string | undefined): string | null {
  const text = (value ?? "").replace(/,/g, "").trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? String(n) : null;
}

/**
 * Box 11 and the record of where it came from, as the paper should carry it.
 *
 * A stored answer on the deal wins (with its `_emptyWeight*` keys; one typed
 * before sources were recorded is marked `typed_unrecorded`). Otherwise the
 * vehicle's document record. Otherwise null: nothing to affix, the question
 * is asked. A non-numeric or empty stored answer counts as unanswered.
 */
export function affixedEmptyWeight(
  answers: Record<string, string>,
  ctx: EmptyWeightContext | null | undefined,
): Record<string, string> | null {
  const stored = storedBox11(answers.emptyWeight);
  if (stored) {
    const out: Record<string, string> = { emptyWeight: stored };
    for (const key of EMPTY_WEIGHT_KEYS) if (typeof answers[key] === "string") out[key] = answers[key];
    if (!out._emptyWeightSource) out._emptyWeightSource = "typed_unrecorded";
    if (!out._emptyWeightFrom) out._emptyWeightFrom = "deal";
    return out;
  }
  const onFile = ctx?.onFile;
  if (!onFile) return null;
  return {
    emptyWeight: String(onFile.box11),
    _emptyWeightSource: onFile.source,
    _emptyWeightFrom: "vehicle",
    _emptyWeightReading: onFile.reading === null ? "" : String(onFile.reading),
    _emptyWeightRule: onFile.rule ?? "",
    _emptyWeightBy: onFile.by ?? "",
    _emptyWeightAt: onFile.at ?? "",
    ...(onFile.note ? { _emptyWeightReason: onFile.note } : {}),
  };
}

function readForm130U(stepData: unknown): Record<string, string> {
  const bag = (stepData as { paperwork?: { form130U?: unknown } } | null)?.paperwork?.form130U;
  if (!bag || typeof bag !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(bag as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export const EMPTY_WEIGHT_UNSETTLED = "emptyWeightUnsettled" as const;

/**
 * What the filing writes for box 11, from the server's own read, or the
 * refusal. The client's formData is never the source of this: the filing
 * overwrites `emptyWeight` and every `_emptyWeight*` key with what this
 * returns, so `form_data` records which source filed, who and when.
 */
export function emptyWeightForFiling(sale: {
  stepData: unknown;
  vehicle: WeightVehicleFacts | null;
}): { ok: true; fields: Record<string, string> } | { ok: false; code: typeof EMPTY_WEIGHT_UNSETTLED } {
  const fields = affixedEmptyWeight(readForm130U(sale.stepData), emptyWeightContext(sale.vehicle, null));
  if (!fields) return { ok: false, code: EMPTY_WEIGHT_UNSETTLED };
  // Every provenance key is written, blank where unknown, so a client-sent
  // key can never survive the overwrite.
  const full: Record<string, string> = { emptyWeight: fields.emptyWeight };
  for (const key of EMPTY_WEIGHT_KEYS) full[key] = fields[key] ?? "";
  return { ok: true, fields: full };
}

/** The serialisable model the empty-weight screen draws. */
export type WeightPrompt = {
  state: "estimate" | "documentRequired" | "legacy" | "none" | "onFile" | "answered";
  cls: WeightClass;
  estimate: null | {
    box11: number;
    rule: Box11Rule;
    kind: EstimateKind;
    curbLbs: number;
    lowLbs: number;
    highLbs: number;
    confidence: WeightEstimate["confidence"];
    vehicle: { year: number | null; make: string; model: string; displacementL: number | null };
    epa: null | { etwMedian: number; yearUsed: number; models: string[]; curbLbs: number; lowLbs: number; highLbs: number };
    canada: null | { curbLbs: number; lowLbs: number; highLbs: number };
    vpicLbs: number | null;
    tableBuilt: string;
  };
  gateReason: GateReason | null;
  onFile: WeightOnFile | null;
  /** The answer on the deal, when the question was reopened. */
  answered: null | { box11: number; source: RecordedSourceKind; by: string | null; at: string | null; reason: string | null };
  legacyLbs: number | null;
  /** Box 11 of a document figure already on the deal or vehicle: a different figure needs a reason. */
  reasonRequiredAgainst: number | null;
};

export function weightPrompt(ctx: EmptyWeightContext, answers: Record<string, string>): WeightPrompt {
  const stored = storedBox11(answers.emptyWeight);
  const storedSource = answers._emptyWeightSource;
  const answered: WeightPrompt["answered"] = stored
    ? {
        box11: Number(stored),
        source:
          isDocumentKind(storedSource) || isEstimateKind(storedSource) ? storedSource : "typed_unrecorded",
        by: answers._emptyWeightBy || null,
        at: answers._emptyWeightAt || null,
        reason: answers._emptyWeightReason || null,
      }
    : null;
  const documentOnDeal = stored && isDocumentKind(storedSource) ? Number(stored) : null;
  const reasonRequiredAgainst = documentOnDeal ?? ctx.onFile?.box11 ?? null;

  const est = ctx.estimate;
  const estimate: WeightPrompt["estimate"] = est
    ? (() => {
        const b = estimateBox11(est, ctx.cls);
        return {
          box11: b.lbs,
          rule: b.rule,
          kind: estimateKindOf(est),
          curbLbs: est.curbLbs,
          lowLbs: est.lowLbs,
          highLbs: est.highLbs,
          confidence: est.confidence,
          vehicle: {
            year: est.vehicle.year,
            make: est.vehicle.make,
            model: est.vehicle.model,
            displacementL: est.vehicle.displacementL,
          },
          epa: est.epa
            ? {
                etwMedian: est.epa.etwMedian,
                yearUsed: est.epa.yearUsed,
                models: est.epa.models,
                curbLbs: est.epa.curbLbs,
                lowLbs: est.epa.lowLbs,
                highLbs: est.epa.highLbs,
              }
            : null,
          canada: est.canada ? { curbLbs: est.canada.curbLbs, lowLbs: est.canada.lowLbs, highLbs: est.canada.highLbs } : null,
          vpicLbs: est.vpic?.curbLbs ?? null,
          tableBuilt: est.table.built,
        };
      })()
    : null;
  const gateReason = ctx.gate && ctx.gate.ok === "document" ? ctx.gate.reason : null;

  const state: WeightPrompt["state"] = answered
    ? "answered"
    : ctx.onFile
      ? "onFile"
      : estimate && !gateReason
        ? "estimate"
        : estimate
          ? "documentRequired"
          : ctx.legacyLbs !== null
            ? "legacy"
            : "none";

  return {
    state,
    cls: ctx.cls,
    estimate,
    gateReason,
    onFile: ctx.onFile,
    answered,
    legacyLbs: ctx.legacyLbs,
    reasonRequiredAgainst,
  };
}

/**
 * What a person confirming the estimate may do: confirm it, or nothing. A
 * document already on the deal or the vehicle outranks any estimate, so an
 * estimate never replaces one.
 */
export function canConfirmEstimate(prompt: WeightPrompt): boolean {
  if (!prompt.estimate || prompt.gateReason) return false;
  if (prompt.reasonRequiredAgainst !== null) return false;
  return true;
}

/** Validate a typed figure: digits within reason, and a document it was read from. */
export function readTypedWeight(input: { reading: string | number; source: string }):
  | { ok: true; reading: number; source: DocumentKind }
  | { ok: false; code: "weightInvalid" | "weightSourceMissing" } {
  const reading = parseWeightReading(input.reading);
  if (reading === null) return { ok: false, code: "weightInvalid" };
  if (!isDocumentKind(input.source)) return { ok: false, code: "weightSourceMissing" };
  return { ok: true, reading, source: input.source };
}

/**
 * Where a truck's carrying capacity starts: TxDMV's minimum for its box 11
 * (Registration Manual Table 2-1), the figure the county uses when nobody can
 * supply one and the door-jamb GVWR cannot be read. Only for a truck, only
 * once box 11 is settled, and only before anybody has answered. Never from
 * vPIC's GVWR, which is a class range, not this truck's rating.
 */
export function carryingCapacityStart(
  ctx: EmptyWeightContext | null | undefined,
  filed: Record<string, string>,
  stored: Record<string, string>,
): number | null {
  if (!ctx || ctx.cls !== "truck" || stored.carryingCapacity !== undefined) return null;
  const settled = storedBox11(filed.emptyWeight);
  return settled ? minimumCarryingCapacity(Number(settled)) : null;
}
