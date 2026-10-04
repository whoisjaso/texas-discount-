import "server-only";
import { epaEstimate, epaTableInfo, type EpaEstimate, type EpaSpec } from "./epa";
import { cabOf, canadaEstimate, type CanadaEstimate } from "./canada";
import {
  gvwrClassOf,
  isCargoVanBody,
  isHeavyDuty,
  isIncompleteVehicle,
  vehicleWeightClass,
  workVehicleByName,
  type WeightClass,
} from "./rules";
import type { WeightEstimate } from "./types";

/**
 * One estimate of a car's empty weight, with where it came from.
 *
 * The order follows the measurements (1,706 crash-test vehicles with
 * lab-measured curb weights), not the order the sources are usually listed:
 *
 *   1. EPA test weight less 300 lb, bundled   median error 67 lb, p95 346
 *   2. Transport Canada's median trim, live   median error 84 lb, p95 485
 *   3. vPIC's CurbWeightLB from the decode    +139 lb median bias, p95 686;
 *                                             absent before MY2015
 *
 * Each source present beyond the headline is kept as a cross-check, and the
 * confidence says whether they agree. Every figure here is an ESTIMATE: it
 * is shown with its source and becomes box 11 only when a person confirms
 * it on the 130-U (on-the-sale.ts). A document a person types always wins.
 */

/** What the estimator knows about a car, from the decode, the lot row, or both. */
export type WeightSpec = {
  year: number | null;
  make: string;
  /** Model names to try, best first (the decode's Model; the lot's model text). */
  models: string[];
  series?: string | null;
  trim?: string | null;
  displacementL?: number | null;
  /** vPIC's DriveType, or the lot's drivetrain ("AWD", "4WD", "FWD"). */
  driveType?: string | null;
  fuelType?: string | null;
  electrificationLevel?: string | null;
  gvwr?: string | null;
  vehicleType?: string | null;
  bodyClass?: string | null;
  bodyStyle?: string | null;
  /** vPIC's CurbWeightLB, when the decode had one. */
  vpicCurbLbs?: number | null;
  /** A decode is a better spec than the lot's free text; the confidence says which this was. */
  from: "decode" | "row";
};

function epaFor(spec: WeightSpec): EpaEstimate | null {
  if (!spec.year || !spec.make) return null;
  const fuel = (spec.fuelType ?? "").toLowerCase();
  // The lot writes "Hybrid" or "Electric" where vPIC has an electrification level.
  const electrification =
    spec.electrificationLevel ?? (fuel.includes("plug") ? "PHEV" : fuel.includes("hybrid") ? "HEV (Strong Hybrid)" : null);
  const fuelPrimary = fuel.includes("electric") && !fuel.includes("hybrid") ? "Electric" : (spec.fuelType ?? null);
  const tried = new Set<string>();
  for (const model of spec.models) {
    const name = model.trim();
    if (!name || tried.has(name.toUpperCase())) continue;
    tried.add(name.toUpperCase());
    const epaSpec: EpaSpec = {
      ModelYear: String(spec.year),
      Make: spec.make,
      Model: name,
      Series: spec.series ?? "",
      Trim: spec.trim ?? "",
      DisplacementL: spec.displacementL ?? null,
      DriveType: spec.driveType ?? "",
      FuelTypePrimary: fuelPrimary,
      ElectrificationLevel: electrification,
      GVWR: spec.gvwr ?? "",
    };
    const hit = epaEstimate(epaSpec);
    if (hit) return hit;
  }
  return null;
}

function driveOf(driveType: string | null | undefined): 2 | 4 | null {
  const d = (driveType ?? "").toUpperCase();
  if (!d) return null;
  if (/AWD|4WD|4X4|ALL|FOUR/.test(d)) return 4;
  if (/4X2|FWD|RWD|FRONT|REAR|2WD/.test(d)) return 2;
  return null;
}

function confidenceOf(
  spec: WeightSpec,
  epa: EpaEstimate | null,
  canada: CanadaEstimate | null,
  headline: { lowLbs: number; highLbs: number },
): WeightEstimate["confidence"] {
  if (!epa && !canada) return "low"; // vPIC only
  if (epa && canada && Math.abs(epa.curbLbs - canada.curbLbs) > 250) return "low";
  // A range this wide spans different vehicles, not one car's trims.
  if (headline.highLbs - headline.lowLbs > 600) return "low";
  if (epa) {
    // Only longer EPA names matched (BRONCO SPORT for a Bronco): another vehicle's weight.
    if (epa.level.includes("+partial")) return "low";
    // The lot's free text with no engine size: every engine of the model blended.
    if (spec.from === "row" && (spec.displacementL ?? null) === null && !epa.level.includes("+disp")) return "low";
    const sameYear = epa.yearUsed === spec.year;
    const driveMatched = epa.level.includes("+drive") && !epa.level.includes("unmatched");
    if (!sameYear && epa.level.includes("drive-unmatched")) return "low";
    if (sameYear && driveMatched && canada && Math.abs(epa.curbLbs - canada.curbLbs) <= 150) {
      // Matched on the lot's free text rather than a decode: one step down.
      return spec.from === "row" ? "medium" : "high";
    }
  }
  return "medium";
}

/**
 * A pickup or a work van by name, or by what EPA called the model it
 * matched: the class must never come out as a passenger car for want of a
 * body style or a decode.
 */
function workKind(spec: WeightSpec, epa: EpaEstimate | null): "pickup" | "van" | null {
  for (const model of spec.models) {
    const byName = workVehicleByName(spec.make, model);
    if (byName) return byName;
  }
  if (epa && epa.models.some((m) => /\bPICKUP\b|\bCHASSIS\b|\bCAB\b/.test(m))) return "pickup";
  if (epa && epa.models.length > 0 && epa.models.every((m) => /\bVAN\b/.test(m)) && !spec.vehicleType) return "van";
  return null;
}

/**
 * The estimate, or null when no source has anything. With `network` false
 * only the bundled EPA table (and a vPIC figure already in hand) is used.
 */
export async function estimateEmptyWeight(
  spec: WeightSpec,
  opts: { network?: boolean; fetcher?: typeof fetch; now?: Date; budgetMs?: number } = {},
): Promise<WeightEstimate | null> {
  const epa = epaFor(spec);

  let canada: CanadaEstimate | null = null;
  if (opts.network && spec.year && spec.make && spec.models[0]) {
    const budget = opts.budgetMs ?? 6000;
    const started = Date.now();
    for (const model of spec.models.slice(0, 3)) {
      const left = budget - (Date.now() - started);
      if (left < 500) break;
      canada = await canadaEstimate(
        {
          year: spec.year,
          make: spec.make,
          model,
          drive: driveOf(spec.driveType),
          cab: cabOf([spec.series, spec.trim, spec.bodyClass].filter(Boolean).join(" ")),
        },
        { timeoutMs: Math.min(4000, left), fetcher: opts.fetcher },
      );
      if (canada) break;
    }
  }

  const vpicCurb =
    typeof spec.vpicCurbLbs === "number" && Number.isFinite(spec.vpicCurbLbs) && spec.vpicCurbLbs > 500
      ? Math.round(spec.vpicCurbLbs)
      : null;

  let headline: Pick<WeightEstimate, "curbLbs" | "lowLbs" | "highLbs" | "source">;
  if (epa) headline = { curbLbs: epa.curbLbs, lowLbs: epa.lowLbs, highLbs: epa.highLbs, source: "epa" };
  else if (canada) headline = { curbLbs: canada.curbLbs, lowLbs: canada.lowLbs, highLbs: canada.highLbs, source: "canada" };
  // vPIC reads high (p95 +686 lb), so its range runs DOWN from the figure.
  else if (vpicCurb) headline = { curbLbs: vpicCurb, lowLbs: vpicCurb - 700, highLbs: vpicCurb, source: "vpic" };
  else return null;

  const gvwrClass = gvwrClassOf(spec.gvwr);
  const work = workKind(spec, epa);
  const byType: WeightClass = vehicleWeightClass({
    vehicleType: spec.vehicleType,
    bodyClass: spec.bodyClass,
    bodyStyle: spec.bodyStyle,
  });
  // A pickup is a truck whatever else the record says; a bus stays a bus.
  const cls: WeightClass = work === "pickup" && byType !== "bus" ? "truck" : byType;
  const cargoVan = work === "van" || isCargoVanBody(spec.bodyStyle);
  const incomplete = isIncompleteVehicle({ vehicleType: spec.vehicleType, bodyClass: spec.bodyClass });
  const heavy = isHeavyDuty({
    gvwrClass,
    text: [spec.models[0], spec.series, spec.trim].filter(Boolean).join(" "),
    cls,
  });
  const table = epaTableInfo();

  return {
    v: 1,
    ...headline,
    confidence: confidenceOf(spec, epa, canada, headline),
    ...(epa
      ? {
          epa: {
            curbLbs: epa.curbLbs,
            lowLbs: epa.lowLbs,
            highLbs: epa.highLbs,
            etwMedian: epa.etwMedian,
            etwMin: epa.etwMin,
            etwMax: epa.etwMax,
            yearUsed: epa.yearUsed,
            level: epa.level,
            n: epa.n,
            models: epa.models,
            sourceUrls: epa.sourceUrls,
          },
        }
      : {}),
    ...(canada ? { canada } : {}),
    ...(vpicCurb ? { vpic: { curbLbs: vpicCurb } } : {}),
    vehicle: {
      year: spec.year,
      make: spec.make,
      model: spec.models[0] ?? "",
      displacementL: spec.displacementL ?? null,
      vehicleType: spec.vehicleType ?? null,
      bodyClass: spec.bodyClass ?? spec.bodyStyle ?? null,
      gvwrClass,
      cls,
      heavy,
      incomplete,
      cargoVan,
      from: spec.from,
    },
    table: { built: table.built, v: table.v },
    at: (opts.now ?? new Date()).toISOString(),
  };
}

/** The displacement out of the lot's engine text ("2.5L 4-Cylinder"). */
export function displacementFromEngine(engine: string | null | undefined): number | null {
  const match = /(\d+(?:\.\d)?)\s*L\b/i.exec(engine ?? "");
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 && n < 20 ? n : null;
}

/** The spec a lot row supports, for a car nobody has decoded. */
export function specFromRow(vehicle: {
  year: number | null;
  make: string | null;
  model: string | null;
  trim?: string | null;
  bodyStyle?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
}): WeightSpec {
  const model = (vehicle.model ?? "").trim();
  const trim = (vehicle.trim ?? "").trim();
  const tokens = model.split(/\s+/).filter(Boolean);
  const withoutTrim =
    trim && model.toUpperCase().endsWith(` ${trim.toUpperCase()}`) ? model.slice(0, -trim.length - 1).trim() : "";
  return {
    year: vehicle.year ?? null,
    make: (vehicle.make ?? "").trim(),
    models: [model, withoutTrim, tokens[0] ?? "", tokens.slice(0, 2).join(" ")].filter(Boolean),
    trim: trim || null,
    displacementL: displacementFromEngine(vehicle.engine),
    driveType: vehicle.drivetrain ?? null,
    fuelType: vehicle.fuelType ?? null,
    bodyStyle: vehicle.bodyStyle ?? null,
    from: "row",
  };
}

/** The spec a vPIC decode supports, with the lot row's names as fallbacks. */
export function specFromDecode(
  decoded: {
    year: number | null;
    make: string;
    model: string;
    modelName?: string | null;
    series?: string | null;
    trim?: string | null;
    displacementL?: number | null;
    driveType?: string | null;
    fuelType?: string | null;
    electrificationLevel?: string | null;
    gvwr?: string | null;
    vehicleType?: string | null;
    bodyClass?: string | null;
    bodyStyle?: string | null;
    curbWeightLbs?: number | null;
  },
  fallbackModels: string[] = [],
): WeightSpec {
  return {
    year: decoded.year,
    make: decoded.make,
    models: [decoded.modelName ?? "", decoded.model, ...fallbackModels].filter(Boolean),
    series: decoded.series ?? null,
    trim: decoded.trim ?? null,
    displacementL: decoded.displacementL ?? null,
    driveType: decoded.driveType ?? null,
    fuelType: decoded.fuelType ?? null,
    electrificationLevel: decoded.electrificationLevel ?? null,
    gvwr: decoded.gvwr ?? null,
    vehicleType: decoded.vehicleType ?? null,
    bodyClass: decoded.bodyClass ?? null,
    bodyStyle: decoded.bodyStyle ?? null,
    vpicCurbLbs: decoded.curbWeightLbs ?? null,
    from: "decode",
  };
}
