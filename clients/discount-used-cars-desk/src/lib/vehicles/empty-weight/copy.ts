import { fillTemplate, type FunnelStrings } from "@/lib/sales/i18n";
import { usDate } from "@/lib/documents/us-date";
import { isEstimateKind } from "./rules";
import type { WeightPrompt } from "./on-the-sale";

/**
 * The sentences that say where box 11 came from, in the reader's language.
 * Built from codes the server sends, so the language toggle can redraw them.
 */

export function lbs(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** "Texas title", "Estimate (EPA test data)", ... */
export function weightSourceLabel(t: FunnelStrings, kind: string | null | undefined): string {
  const words = t.weight.sources as Record<string, string>;
  return (kind && words[kind]) || t.weight.sources.typed_unrecorded;
}

/**
 * "Texas title, entered by Jo Smith on 10/02/2026" or
 * "Estimate (EPA test data), confirmed by Jo Smith on 10/02/2026".
 */
export function weightSourceLine(
  t: FunnelStrings,
  record: { kind: string | null | undefined; by?: string | null; at?: string | null },
): string {
  const source = weightSourceLabel(t, record.kind);
  if (!record.by) return fillTemplate(t.weight.noDate, { source });
  const template = isEstimateKind(record.kind) ? t.weight.confirmed : t.weight.entered;
  return fillTemplate(template, { source, by: record.by, date: usDate(record.at ?? "") || "" }).replace(/ (on|el) $/, "");
}

/** The answers' `_emptyWeight*` keys as a source line, or null when there are none. */
export function sourceLineFromAnswers(t: FunnelStrings, answers: Record<string, string>): string | null {
  if (!answers.emptyWeight) return null;
  return weightSourceLine(t, {
    kind: answers._emptyWeightSource || "typed_unrecorded",
    by: answers._emptyWeightBy || null,
    at: answers._emptyWeightAt || null,
  });
}

/** The vehicle as the method sentence names it: "2019 Toyota Camry 2.5 L". */
export function estimateVehicleName(estimate: NonNullable<WeightPrompt["estimate"]>): string {
  const v = estimate.vehicle;
  // "TOYOTA" from a raw decode reads "Toyota"; "BMW", "GMC" and anything
  // already cased stay as they are.
  const make =
    v.make && v.make === v.make.toUpperCase() && v.make.length > 3
      ? v.make.charAt(0) + v.make.slice(1).toLowerCase()
      : (v.make ?? "");
  const parts = [v.year ? String(v.year) : "", make, v.model, v.displacementL ? `${v.displacementL.toFixed(1)} L` : ""];
  return parts.filter(Boolean).join(" ");
}

/** An EPA model name as a reader writes it: "CAMRY LE/SE" reads "Camry LE/SE", "F150" stays. */
export function epaModelName(name: string): string {
  return name
    .split(/(\s+|\/)/)
    // Words read as words; short codes (LE, XSE, AWD, 4X4) stay as printed.
    .map((word) =>
      /^[A-Z]{4,}$/.test(word) || /^(CAB|VAN|MAX)$/.test(word) ? word.charAt(0) + word.slice(1).toLowerCase() : word,
    )
    .join("");
}

/**
 * The EPA models the figure actually stands on, named: the method sentence
 * must say what EPA tested, not repeat the car being sold.
 */
export function epaModelList(t: FunnelStrings, models: string[]): string {
  const names = [...new Set(models.map(epaModelName))].slice(0, 3);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${t.weight.listAnd} ${names[names.length - 1]}`;
}

/** The one sentence that says how the estimate was reached. */
export function estimateMethod(t: FunnelStrings, estimate: NonNullable<WeightPrompt["estimate"]>): string {
  if (estimate.kind === "estimate_epa" && estimate.epa) {
    const sentence = fillTemplate(t.weight.methodEpa, {
      vehicle: estimateVehicleName(estimate),
      epaModels: epaModelList(t, estimate.epa.models),
      yearUsed: estimate.epa.yearUsed,
      etw: lbs(estimate.epa.etwMedian),
      curb: lbs(estimate.curbLbs),
      low: lbs(estimate.lowLbs),
      high: lbs(estimate.highLbs),
    });
    if (estimate.vehicle.year && estimate.epa.yearUsed !== estimate.vehicle.year) {
      return `${sentence} ${fillTemplate(t.weight.methodEpaOtherYear, {
        year: estimate.vehicle.year,
        yearUsed: estimate.epa.yearUsed,
      })}`;
    }
    return sentence;
  }
  if (estimate.kind === "estimate_canada") {
    return fillTemplate(t.weight.methodCanada, {
      curb: lbs(estimate.curbLbs),
      low: lbs(estimate.lowLbs),
      high: lbs(estimate.highLbs),
    });
  }
  return fillTemplate(t.weight.methodVpic, { curb: lbs(estimate.curbLbs) });
}

/** The cross-checks beside the headline: the other sources' figures. */
export function estimateCrossChecks(t: FunnelStrings, estimate: NonNullable<WeightPrompt["estimate"]>): string[] {
  const lines: string[] = [];
  if (estimate.canada && estimate.kind !== "estimate_canada") {
    lines.push(fillTemplate(t.weight.crossCanada, { lbs: lbs(estimate.canada.curbLbs) }));
  }
  if (estimate.vpicLbs && estimate.kind !== "estimate_vpic") {
    lines.push(fillTemplate(t.weight.crossVpic, { lbs: lbs(estimate.vpicLbs) }));
  }
  return lines;
}

/** The spread between the sources, when they disagree enough to say so. */
export function estimateSpread(estimate: NonNullable<WeightPrompt["estimate"]>): number | null {
  if (estimate.confidence !== "low") return null;
  const figures = [estimate.epa?.curbLbs, estimate.canada?.curbLbs, estimate.vpicLbs].filter(
    (n): n is number => typeof n === "number",
  );
  if (figures.length < 2) return null;
  return Math.max(...figures) - Math.min(...figures);
}
