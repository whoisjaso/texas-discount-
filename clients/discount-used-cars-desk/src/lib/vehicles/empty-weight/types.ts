import type { WeightClass } from "./rules";

/**
 * An estimate of a car's empty (curb) weight, with everything needed to say
 * where it came from. Stored on the vehicle as `weight_estimate` and, once a
 * person confirms it, copied onto the deal as `_emptyWeightEstimate`.
 *
 * Never printed, previewed or pasted on its own. Types only, so the client
 * screens can read one without pulling in the server-only table.
 */
export type WeightEstimate = {
  v: 1;
  /** The headline figure, from `source`. */
  curbLbs: number;
  lowLbs: number;
  highLbs: number;
  source: "epa" | "canada" | "vpic";
  confidence: "high" | "medium" | "low";
  epa?: {
    curbLbs: number;
    lowLbs: number;
    highLbs: number;
    etwMedian: number;
    etwMin: number;
    etwMax: number;
    yearUsed: number;
    level: string;
    n: number;
    models: string[];
    sourceUrls: string[];
  };
  canada?: { curbLbs: number; lowLbs: number; highLbs: number; n: number; models: string[] };
  vpic?: { curbLbs: number };
  vehicle: {
    year: number | null;
    make: string;
    model: string;
    displacementL: number | null;
    vehicleType: string | null;
    bodyClass: string | null;
    gvwrClass: string | null;
    cls: WeightClass;
    heavy: boolean;
    incomplete: boolean;
    /** A cargo or work van, by name or by the lot's body style: needs a document. */
    cargoVan?: boolean;
    from: "decode" | "row";
  };
  /**
   * The vehicle row this was worked out for (weightFingerprint). A stored
   * estimate is reused only while the row still says the same car: a VIN,
   * year, make, model, trim or engine corrected on the lot makes it stale.
   */
  fingerprint?: string;
  /** The bundled EPA table this was computed against. */
  table: { built: string; v: number };
  at: string;
};

/** Whether a stored value is an estimate this code wrote (and can trust the shape of). */
export function isWeightEstimate(value: unknown): value is WeightEstimate {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<WeightEstimate>;
  return (
    e.v === 1 &&
    typeof e.curbLbs === "number" &&
    typeof e.lowLbs === "number" &&
    typeof e.highLbs === "number" &&
    (e.source === "epa" || e.source === "canada" || e.source === "vpic") &&
    (e.confidence === "high" || e.confidence === "medium" || e.confidence === "low") &&
    !!e.vehicle &&
    typeof e.vehicle === "object" &&
    !!e.table &&
    typeof e.table.built === "string"
  );
}

/** What identifies the car an estimate was worked out for. */
export type WeightIdentity = {
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  bodyStyle?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
};

function norm(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim().toUpperCase().replace(/\s+/g, " ");
}

/** The vehicle row, as one string: any change to what the estimate read changes it. */
export function weightFingerprint(vehicle: WeightIdentity): string {
  return [
    vehicle.vin,
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.trim,
    vehicle.bodyStyle,
    vehicle.engine,
    vehicle.drivetrain,
    vehicle.fuelType,
  ]
    .map(norm)
    .join("|");
}

/**
 * Whether a stored estimate is still about this vehicle row. One with a
 * fingerprint must match it exactly; an older one without must at least
 * name the same year, make and model.
 */
export function estimateFitsVehicle(estimate: WeightEstimate, vehicle: WeightIdentity): boolean {
  if (estimate.fingerprint !== undefined) return estimate.fingerprint === weightFingerprint(vehicle);
  const model = norm(vehicle.model).split(" ")[0] ?? "";
  const named = norm(estimate.vehicle.model).split(" ")[0] ?? "";
  return (
    (estimate.vehicle.year ?? null) === (vehicle.year ?? null) &&
    norm(estimate.vehicle.make) === norm(vehicle.make) &&
    model !== "" &&
    model === named
  );
}

/**
 * Whether a second source stands within 250 lb of the headline figure. A
 * low-confidence estimate nobody else supports is not offered for one tap.
 */
export function estimateCorroborated(estimate: WeightEstimate): boolean {
  const others: number[] = [];
  if (estimate.source !== "epa" && estimate.epa) others.push(estimate.epa.curbLbs);
  if (estimate.source !== "canada" && estimate.canada) others.push(estimate.canada.curbLbs);
  if (estimate.source !== "vpic" && estimate.vpic) others.push(estimate.vpic.curbLbs);
  return others.some((lbs) => Math.abs(lbs - estimate.curbLbs) <= 250);
}
