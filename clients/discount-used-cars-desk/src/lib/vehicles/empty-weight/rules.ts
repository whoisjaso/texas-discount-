/**
 * The Texas rules for box 11 of the 130-U, the empty weight.
 *
 * Pure and safe on the client: no network, no table. Everything here is a
 * rule TxDMV writes down, cited where it is applied, plus one house rule
 * (the margin under 6,000 lb) that is labelled as ours.
 *
 * Sources
 *   VTR-130-UIF, box 11      "Weight (in pounds) of the vehicle without a load,
 *                            rounded up to the next 100 pounds."
 *   Transp. Code 502.055(d)(1), RTB 010-16
 *                            a passenger vehicle's weight from a manufacturer's
 *                            figure (MCO, or a web resource such as KBB or JD
 *                            Power) gets 100 lb added, then the next 100.
 *   Vehicle Weight Verification Guidelines (TxDMV, June 2026)
 *                            MCO: round up, then +100 for passenger class, not
 *                            for truck class. Texas title and out-of-state
 *                            title: round up, never +100 ("this process would
 *                            have been done initially").
 *   Title Manual 10-4, 10-5  the 6,415 lb MCO example (6,600 lb); a weight
 *                            certificate is rounded up, nothing added.
 *   Registration Manual 2-7, 2-8 and Table 2-1 (Title Manual Table 10-1)
 *                            a truck's minimum carrying capacity by empty
 *                            weight, used only when neither the applicant nor
 *                            the door-jamb GVWR can supply one.
 */

/** Where a typed figure came from: a document a person is holding. */
export const DOCUMENT_KINDS = [
  "texas_title",
  "out_of_state_title",
  "mco",
  "weight_certificate",
  "kbb_jdpower",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Where an estimate came from. Never a fact about the car; always confirmed. */
export const ESTIMATE_KINDS = ["estimate_epa", "estimate_canada", "estimate_vpic"] as const;
export type EstimateKind = (typeof ESTIMATE_KINDS)[number];

export type WeightSourceKind = DocumentKind | EstimateKind;
/**
 * A box 11 answered before the source was recorded (digits on the deal with
 * no provenance), kept so the record says so rather than guessing.
 */
export type RecordedSourceKind = WeightSourceKind | "typed_unrecorded";

export function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === "string" && (DOCUMENT_KINDS as readonly string[]).includes(value);
}

export function isEstimateKind(value: unknown): value is EstimateKind {
  return typeof value === "string" && (ESTIMATE_KINDS as readonly string[]).includes(value);
}

export type Box11Rule = "roundUp" | "plus100RoundUp";

/** The registration classes that decide the +100. */
export type WeightClass = "passenger" | "passengerTruck" | "truck" | "bus" | "unknown";

export function roundUp100(lbs: number): number {
  return Math.ceil(lbs / 100) * 100;
}

/**
 * The class, from vPIC's VehicleType first, then its BodyClass, then the
 * lot's own body style. PASS-TRK (an SUV, a minivan) is a passenger class for
 * the +100: the guideline names trucks and truck tractors as the exception.
 */
export function vehicleWeightClass(input: {
  vehicleType?: string | null;
  bodyClass?: string | null;
  bodyStyle?: string | null;
}): WeightClass {
  const type = (input.vehicleType ?? "").toUpperCase();
  if (type.includes("PASSENGER CAR")) return "passenger";
  if (type.includes("MULTIPURPOSE") || type.includes("MPV")) return "passengerTruck";
  if (type.includes("INCOMPLETE")) return "truck";
  if (type.includes("TRUCK")) return "truck";
  if (type.includes("BUS")) return "bus";

  const body = `${input.bodyClass ?? ""} ${input.bodyStyle ?? ""}`.toLowerCase();
  if (!body.trim()) return "unknown";
  if (/\bbus\b/.test(body)) return "bus";
  if (/pickup|truck|\bcab\b|chassis|cargo van/.test(body)) return "truck";
  if (/suv|sport utility|crossover|minivan|\bvan\b|multi-?purpose/.test(body)) return "passengerTruck";
  if (/sedan|saloon|coupe|convertible|cabriolet|wagon|hatchback|roadster/.test(body)) return "passenger";
  return "unknown";
}

/** True for vPIC's INCOMPLETE VEHICLE (a cab-chassis): it has no empty weight until it is built up. */
export function isIncompleteVehicle(input: { vehicleType?: string | null; bodyClass?: string | null }): boolean {
  return (
    (input.vehicleType ?? "").toUpperCase().includes("INCOMPLETE") ||
    /incomplete|cab chassis|chassis cab|cutaway/i.test(input.bodyClass ?? "")
  );
}

/**
 * Box 11 from a reading and where it came from.
 *
 * A title (Texas or out of state) or a weight certificate: rounded up to the
 * next 100, never +100. A manufacturer's figure (MCO, KBB or JD Power, or one
 * of our estimates, which are manufacturer-style curb weights): +100 for a
 * passenger or passenger-truck class vehicle, then rounded up; for a truck or
 * a bus, rounded up only. An unknown class takes the +100, the conservative
 * side, and the person confirming sees the rule line before it is saved.
 */
export function box11(
  reading: number,
  kind: WeightSourceKind,
  cls: WeightClass,
): { lbs: number; rule: Box11Rule } {
  if (kind === "texas_title" || kind === "out_of_state_title" || kind === "weight_certificate") {
    return { lbs: roundUp100(reading), rule: "roundUp" };
  }
  if (cls === "truck" || cls === "bus") return { lbs: roundUp100(reading), rule: "roundUp" };
  return { lbs: roundUp100(reading + 100), rule: "plus100RoundUp" };
}

/**
 * Registration Manual Table 2-1 (Title Manual Table 10-1): a truck's minimum
 * carrying capacity by empty weight. Null above 33,000 lb ("processed as
 * usual") and for nonsense.
 */
export function minimumCarryingCapacity(emptyLbs: number): number | null {
  if (!Number.isFinite(emptyLbs) || emptyLbs <= 0) return null;
  if (emptyLbs <= 6000) return 1000;
  if (emptyLbs <= 7500) return 1500;
  if (emptyLbs <= 10000) return 2000;
  if (emptyLbs <= 14000) return 3000;
  if (emptyLbs <= 16000) return 4000;
  if (emptyLbs <= 19500) return 5000;
  if (emptyLbs <= 26000) return 6000;
  if (emptyLbs <= 33000) return 7000;
  return null;
}

/** GVWR class codes (vPIC "Class 2G: 8,001 - 9,000 lb") to their lower bound. */
export const GVWR_CLASS_LOW: Record<string, number> = {
  "1": 0, "1A": 0, "1B": 3001, "1C": 4001, "1D": 5001, "2E": 6001, "2F": 7001, "2G": 8001, "2H": 9001,
  "3": 10001, "4": 14001, "5": 16001, "6": 19501, "7": 26001, "8": 33001,
};

/** The class code out of vPIC's GVWR text, e.g. "1C", or null. */
export function gvwrClassOf(gvwr: string | null | undefined): string | null {
  const match = /Class (\w+)/.exec(gvwr ?? "");
  return match ? match[1] : null;
}

/**
 * A heavy-duty vehicle: GVWR 8,001 lb or more, or a heavy-duty series in the
 * name. "250/350/450/550" alone count only on a truck or bus, because a Lexus
 * RX 350 or a Mercedes E 350 is a passenger vehicle with the same digits.
 */
export function isHeavyDuty(input: { gvwrClass?: string | null; text?: string | null; cls: WeightClass }): boolean {
  const low = input.gvwrClass ? GVWR_CLASS_LOW[input.gvwrClass] : undefined;
  if (low !== undefined && low >= 8001) return true;
  const text = (input.text ?? "").toUpperCase();
  if (/\b(2500|3500|4500|5500|HD|SUPER DUTY)\b/.test(text)) return true;
  return (input.cls === "truck" || input.cls === "bus") && /\b(250|350|450|550)\b/.test(text);
}

/**
 * Pickups and work vans by name, for a car whose record says nothing else.
 *
 * A lot row may carry no body style (Start A Sale writes one only when the
 * caller passes it) and the VIN decode may fail, time out or be absent. A
 * pickup then has no class at all, and an unknown class must never let it
 * through as a passenger car. The names below are every light pickup and
 * full-size work van sold in the US since the mid-1990s; a match makes the
 * vehicle a truck (pickup) or a cargo van, both of which need a document.
 */
const PICKUP_NAMES = [
  "F150", "F250", "F350", "F450", "SILVERADO", "SIERRA", "TUNDRA", "TACOMA", "T100", "FRONTIER", "TITAN",
  "HARDBODY", "RANGER", "COLORADO", "CANYON", "GLADIATOR", "RIDGELINE", "MAVERICK", "SANTACRUZ", "AVALANCHE",
  "DAKOTA", "SPORTTRAC", "EXPLORERSPORTTRAC", "ESCALADEEXT", "CYBERTRUCK", "R1T", "I280", "I290", "I350",
  "I370", "B2300", "B2500", "B3000", "B4000", "SONOMA", "S10", "CK1500", "CK2500", "CK3500", "C1500",
  "K1500", "C2500", "K2500", "C3500", "K3500", "HUMMEREVPICKUP", "SIERRAEV", "SILVERADOEV", "MARKLT",
  "RAMPICKUP",
];
const VAN_NAMES = [
  "TRANSIT", "PROMASTER", "SPRINTER", "EXPRESS", "SAVANA", "NV200", "NV1500", "NV2500", "NV3500", "NVCARGO",
  "NVPASSENGER", "METRIS", "CITYEXPRESS", "CHEVYVAN", "G1500", "G2500", "G3500",
];
/** Names that are a van only from one maker: a Mercedes E 350 or B 250 is a car. */
const VAN_NAMES_BY_MAKE: Record<string, string[]> = {
  FORD: ["ECONOLINE", "ESERIES", "E150", "E250", "E350", "E450"],
  DODGE: ["RAMVAN", "B150", "B250", "B350"],
};

/** The model text's word prefixes, joined: "Range Rover Sport" gives RANGE, RANGEROVER, RANGEROVERSPORT. */
function namePrefixes(text: string | null | undefined): string[] {
  const words = (text ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 1; i <= words.length; i++) out.push(words.slice(0, i).join(""));
  return out;
}

/** A name on the list, as whole words ("F-150 XLT", "Silverado1500"), never a Range Rover read as RANGER. */
function namedAs(prefixes: string[], names: string[]): boolean {
  return prefixes.some((p) => names.some((n) => p === n || (p.startsWith(n) && /^\d/.test(p.slice(n.length)))));
}

/**
 * "pickup" or "van" from the make and model text alone, or null. A RAM
 * whose model is a bare series (1500, 2500, 3500) is a pickup; a Dodge
 * "Ram 1500" or "Ram Pickup" is too.
 */
export function workVehicleByName(make: string | null | undefined, model: string | null | undefined): "pickup" | "van" | null {
  const prefixes = namePrefixes(model);
  if (prefixes.length === 0) return null;
  const mk = (make ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (namedAs(prefixes, VAN_NAMES) || namedAs(prefixes, VAN_NAMES_BY_MAKE[mk] ?? [])) return "van";
  if (namedAs(prefixes, PICKUP_NAMES)) return "pickup";
  if ((mk === "RAM" || mk === "DODGE") && /^(RAM)?(1500|2500|3500|4500|5500|PICKUP)/.test(prefixes[prefixes.length - 1])) {
    return "pickup";
  }
  return null;
}

/** True for a lot body style that can only mean a cargo or work van ("Van", "Cargo Van"). */
export function isCargoVanBody(bodyStyle: string | null | undefined): boolean {
  return /^\s*(cargo\s+|work\s+|panel\s+)?van\s*$/i.test(bodyStyle ?? "") || /cargo|panel van/i.test(bodyStyle ?? "");
}

export type GateReason =
  | "pickup"
  | "cargoVan"
  | "incomplete"
  | "heavyDuty"
  | "bus"
  | "classUnknown"
  | "lowConfidence"
  | "nearSixThousand";
export type EstimateGate = { ok: "confirm" } | { ok: "document"; reason: GateReason };

/**
 * Whether a person may confirm an estimate with one tap, or must read the
 * figure off a document.
 *
 * Measured against 1,706 crash-test vehicles: an EPA estimate lands on the
 * wrong side of a Texas weight line for about 1 pickup in 10, and there is no
 * EPA data at all for heavy duty. So a pickup or work truck, a cargo van, a
 * cab-chassis, a heavy-duty vehicle and a bus need a title, an MCO or a
 * scale ticket.
 *
 * A vehicle whose class nobody knows (no body style on the lot row, no
 * VehicleType from a decode) needs one too: it could be a pickup, and an
 * unknown class must never pass as a passenger car.
 *
 * An estimate the sources do not support (confidence low, and no second
 * source within 250 lb of it) is a guess, not an estimate: a document.
 *
 * And, as a HOUSE RULE (not TxDMV's): an estimate whose box 11, at the high
 * end of its range, comes within 300 lb of the 6,000 lb registration line
 * (5,700 or more) needs a document too, because the fee class turns on that
 * line (RTB 010-16) and the estimate's range is wider than the margin.
 */
export function estimateGate(
  estimate: { highLbs: number; kind: EstimateKind },
  cls: WeightClass,
  flags: { incomplete?: boolean; heavy?: boolean; cargoVan?: boolean; lowConfidence?: boolean },
): EstimateGate {
  if (cls === "bus") return { ok: "document", reason: "bus" };
  if (flags.incomplete) return { ok: "document", reason: "incomplete" };
  if (flags.heavy) return { ok: "document", reason: "heavyDuty" };
  if (cls === "truck") return { ok: "document", reason: "pickup" };
  if (flags.cargoVan) return { ok: "document", reason: "cargoVan" };
  if (cls === "unknown") return { ok: "document", reason: "classUnknown" };
  if (flags.lowConfidence) return { ok: "document", reason: "lowConfidence" };
  if (box11(estimate.highLbs, estimate.kind, cls).lbs >= 5700) {
    return { ok: "document", reason: "nearSixThousand" };
  }
  return { ok: "confirm" };
}

/** Digits from a typed weight ("3,252" or "3252 lb"), within reason, or null. */
export function parseWeightReading(typed: string | number | null | undefined): number | null {
  if (typed === null || typed === undefined) return null;
  const text = String(typed).replace(/,/g, "").replace(/\s*(lbs?\.?|pounds)\s*$/i, "").trim();
  if (!/^\d{3,5}$/.test(text)) return null;
  const n = Number(text);
  return n >= 500 && n <= 80000 ? n : null;
}
