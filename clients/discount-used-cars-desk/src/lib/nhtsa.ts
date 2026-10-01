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
  curbWeightLbs: number | null;
  gvwr: string | null;
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

export async function decodeVin(vin: string): Promise<NHTSADecodedVehicle> {
  const url = `${NHTSA_BASE}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
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
    errorCode: r.ErrorCode || "0",
  };
}
