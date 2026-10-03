const NHTSA_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

export interface NHTSADecodedVehicle {
  make: string;
  model: string;
  year: number | null;
  trim: string | null;
  bodyStyle: string | null;
  vehicleType: string | null;
  doors: number | null;
  drivetrain: string | null;
  transmission: string | null;
  fuelType: string | null;
  engine: string | null;
  engineHP: number | null;
  turbo: boolean;
  manufacturer: string | null;
  plantCountry: string | null;
  /**
   * vPIC's CurbWeightLB: a VIN-pattern value, often the heaviest version of
   * the model (measured +139 lb median, p95 686 lb; absent before MY2015 and
   * for whole makes). A cross-check for the empty-weight estimate only, never
   * box 11 on its own (SOP "Empty weight (130-U box 11)").
   */
  curbWeightLbs: number | null;
  /** vPIC's GVWR text: a class range, never a carrying capacity. */
  gvwr: string | null;
  /** The GVWR class code out of that text ("1C", "2G"), for the heavy-duty gate. */
  gvwrClass: string | null;
  /** vPIC's raw Model, before the trim is joined on (the estimate matches on it). */
  modelName: string | null;
  series: string | null;
  displacementL: number | null;
  /** vPIC's raw DriveType ("4WD/4-Wheel Drive/4x4"). */
  driveType: string | null;
  electrificationLevel: string | null;
  /** vPIC's raw BodyClass ("Pickup", "Incomplete - Cab Chassis"). */
  bodyClass: string | null;
  errorCode: string;
}

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;

export function isValidVin(vin: string): boolean {
  return VIN_REGEX.test(vin);
}

function valOrNull(val: string): string | null {
  if (!val || val === "Not Applicable") return null;
  return val;
}

function numOrNull(val: string): number | null {
  if (!val) return null;
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : null;
}

function normalizeBodyStyle(bodyClass: string): string | null {
  if (!bodyClass) return null;
  const lower = bodyClass.toLowerCase();
  if (lower.includes("sedan") || lower.includes("saloon")) return "Sedan";
  if (lower.includes("suv") || lower.includes("sport utility") || lower.includes("multi-purpose")) return "SUV";
  if (lower.includes("pickup") || lower.includes("truck")) return "Truck";
  if (lower.includes("coupe")) return "Coupe";
  if (lower.includes("convertible") || lower.includes("cabriolet")) return "Convertible";
  if (lower.includes("wagon") || lower.includes("estate")) return "Wagon";
  if (lower.includes("hatchback")) return "Hatchback";
  if (lower.includes("van") || lower.includes("minivan")) return "Van";
  if (lower.includes("crossover")) return "Crossover";
  return bodyClass;
}

function normalizeDrivetrain(driveType: string): string | null {
  if (!driveType) return null;
  const lower = driveType.toLowerCase();
  if (lower.includes("awd") || lower.includes("all-wheel")) return "AWD";
  if (lower.includes("4wd") || lower.includes("4x4") || lower.includes("four-wheel")) return "4WD";
  if (lower.includes("rwd") || lower.includes("rear-wheel")) return "RWD";
  if (lower.includes("fwd") || lower.includes("front-wheel")) return "FWD";
  if (lower === "4x2") return "2WD";
  return driveType;
}

function normalizeMake(make: string): string {
  if (!make) return "";
  const preserve: Record<string, string> = {
    BMW: "BMW",
    GMC: "GMC",
    RAM: "RAM",
  };
  const upper = make.toUpperCase();
  if (preserve[upper]) return preserve[upper];
  return make.charAt(0).toUpperCase() + make.slice(1).toLowerCase();
}

function normalizePlantCountry(country: string): string | null {
  if (!country) return null;
  const cleaned = country.replace(/\s*\([^)]*\)\s*/g, "").trim();
  return cleaned
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function buildEngineString(
  cylinders: string,
  displacement: string,
  config: string
): string | null {
  const parts: string[] = [];
  if (displacement) parts.push(`${displacement}L`);
  if (cylinders) {
    if (config && config.toLowerCase().includes("v")) {
      parts.push(`V${cylinders}`);
    } else {
      parts.push(`${cylinders}-Cylinder`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export async function decodeVin(
  vin: string,
  opts: { timeoutMs?: number } = {},
): Promise<NHTSADecodedVehicle> {
  const url = `${NHTSA_BASE}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
  });

  if (!res.ok) {
    throw new Error(`NHTSA API error: ${res.status}`);
  }

  const data = await res.json();
  const r = data.Results?.[0];

  if (!r) {
    throw new Error("No results from NHTSA API");
  }

  const year = numOrNull(r.ModelYear);

  return {
    make: normalizeMake(r.Make || ""),
    model: [r.Model, r.Trim].filter(Boolean).join(" ") || "",
    year: year !== null ? Math.round(year) : null,
    trim: valOrNull(r.Trim),
    bodyStyle: normalizeBodyStyle(r.BodyClass || ""),
    vehicleType: valOrNull(r.VehicleType),
    doors: numOrNull(r.Doors) !== null ? Math.round(numOrNull(r.Doors)!) : null,
    drivetrain: normalizeDrivetrain(r.DriveType || ""),
    transmission: valOrNull(r.TransmissionStyle),
    fuelType: valOrNull(r.FuelTypePrimary),
    engine: buildEngineString(
      r.EngineCylinders || "",
      r.DisplacementL || "",
      r.EngineConfiguration || ""
    ),
    engineHP: numOrNull(r.EngineHP) !== null ? Math.round(numOrNull(r.EngineHP)!) : null,
    turbo: r.Turbo === "Yes",
    manufacturer: valOrNull(r.Manufacturer),
    plantCountry: normalizePlantCountry(r.PlantCountry || ""),
    curbWeightLbs: numOrNull(r.CurbWeightLB) !== null ? Math.round(numOrNull(r.CurbWeightLB)!) : null,
    gvwr: valOrNull(r.GVWR),
    gvwrClass: /Class (\w+)/.exec(r.GVWR || "")?.[1] ?? null,
    modelName: valOrNull(r.Model),
    series: valOrNull(r.Series),
    displacementL: numOrNull(r.DisplacementL),
    driveType: valOrNull(r.DriveType),
    electrificationLevel: valOrNull(r.ElectrificationLevel),
    bodyClass: valOrNull(r.BodyClass),
    errorCode: r.ErrorCode || "0",
  };
}
