import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeVin, isValidVin } from "@/lib/nhtsa";
import { createClient } from "@/lib/supabase/server";
import { epaTableInfo } from "./epa";
import { estimateEmptyWeight, specFromDecode, specFromRow } from "./estimate";
import { isDocumentKind } from "./rules";
import { estimateFitsVehicle, isWeightEstimate, weightFingerprint, type WeightEstimate } from "./types";

/**
 * The estimate a sale screen shows, worked out once and kept.
 *
 * The same rules the county lookup keeps (documents/resolve.ts):
 *
 *   ask only when needed    a vehicle with a document record on it needs no
 *                           estimate and costs no request; a stored estimate
 *                           against the current table is used as it is.
 *   silent on failure       a timeout, an outage, a refused write or an odd
 *                           shape all come back as "nothing learned" or as
 *                           the bundled EPA figure alone, and the 130-U asks
 *                           its question exactly as before.
 *   never overrule a person the estimate goes in `weight_estimate` only, and
 *                           only when nobody wrote one first. `weight_lbs`,
 *                           box 11 as a person confirmed it, is never touched.
 *   keep only what is sure  an estimate is kept on the vehicle only when it
 *                           was worked out from a decode (or the car has no
 *                           VIN to decode). One made from the lot row because
 *                           vPIC failed this once is shown, held in memory for
 *                           a few minutes, and worked out again next time, so
 *                           an outage never fixes a car's class for good.
 *   follow the car          a stored estimate carries the row it was made for
 *                           (types.ts weightFingerprint); a corrected VIN,
 *                           year, make, model, trim or engine makes it stale.
 */

export type WeightVehicle = {
  id: string;
  vin?: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim?: string | null;
  bodyStyle?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
  weightLbs?: number | null;
  weightSource?: string | null;
  weightEstimate?: unknown;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a lot-row estimate (the decode failed) is held before the decode is tried again. */
const RETRY_MS = 5 * 60 * 1000;
type Held = { at: number; estimate: WeightEstimate | null; retry: boolean };
const cache: Map<string, Held> = ((globalThis as { __deskWeightCache?: Map<string, Held> }).__deskWeightCache ??=
  new Map());

/** Forget every cached estimate. For tests. */
export function resetWeightCache(): void {
  cache.clear();
}

function cacheKey(vehicle: WeightVehicle): string {
  return `${vehicle.id}|${weightFingerprint(vehicle)}`;
}

/** Make names as vPIC and the lot may each write them, compared as one. */
const MAKE_SAME: Record<string, string> = {
  MERCEDES: "MERCEDESBENZ",
  VW: "VOLKSWAGEN",
  CHEVY: "CHEVROLET",
  RAM: "DODGE",
  LANDROVER: "LANDROVER",
  RANGEROVER: "LANDROVER",
};
function makeKey(make: string | null | undefined): string {
  const k = (make ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return MAKE_SAME[k] ?? k;
}

/**
 * The car's empty-weight estimate, or null.
 *
 * Null without any network call when the vehicle already carries a document
 * record (a title, MCO, certificate or KBB/JD Power figure): box 11 is known
 * and an estimate would only be noise beside it.
 */
export async function resolveVehicleWeight(
  vehicle: WeightVehicle | null | undefined,
  opts: {
    network?: boolean;
    /** The operator's client, for the best-effort write. Defaults to the session's. */
    client?: SupabaseClient | null;
    fetcher?: typeof fetch;
    decode?: typeof decodeVin;
    persist?: boolean;
  } = {},
): Promise<WeightEstimate | null> {
  if (!vehicle) return null;
  try {
    if (isDocumentKind(vehicle.weightSource) && typeof vehicle.weightLbs === "number" && vehicle.weightLbs > 0) {
      return null;
    }
    const current = epaTableInfo();
    const vin = (vehicle.vin ?? "").trim().toUpperCase();
    const decodable = isValidVin(vin);
    const raw = isWeightEstimate(vehicle.weightEstimate) ? vehicle.weightEstimate : null;
    // Reused only when it is about this row, against this table, and (for a
    // car with a VIN) came from a decode: a lot-row estimate is retried.
    const usable =
      raw &&
      raw.table.built === current.built &&
      raw.table.v === current.v &&
      estimateFitsVehicle(raw, vehicle) &&
      (raw.vehicle.from === "decode" || !decodable || !opts.network);
    if (usable) return raw;

    const key = cacheKey(vehicle);
    const held = cache.get(key);
    if (held && Date.now() - held.at < (held.retry ? RETRY_MS : DAY_MS)) {
      return held.estimate;
    }

    const row = specFromRow({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      bodyStyle: vehicle.bodyStyle,
      engine: vehicle.engine,
      drivetrain: vehicle.drivetrain,
      fuelType: vehicle.fuelType,
    });
    let spec = row;
    // The whole lookup is held to about six seconds, decode and Canada together.
    const started = Date.now();
    if (opts.network && decodable) {
      const decoded = await (opts.decode ?? decodeVin)(vin, { timeoutMs: 4000 }).catch(() => null);
      // A decode that names a different car than the lot row (another year,
      // another make: a mistyped VIN) is not this car's decode.
      const sameYear = !!decoded?.year && (!vehicle.year || decoded.year === vehicle.year);
      const sameMake = !!decoded?.make && (!vehicle.make || makeKey(decoded.make) === makeKey(vehicle.make));
      if (decoded && sameYear && sameMake) {
        spec = {
          ...specFromDecode(decoded, row.models),
          // The lot's own words win where the decode is silent.
          displacementL: decoded.displacementL ?? row.displacementL,
          driveType: decoded.driveType ?? row.driveType,
          fuelType: decoded.fuelType ?? row.fuelType,
          bodyStyle: row.bodyStyle ?? decoded.bodyStyle,
        };
      }
    }
    const worked = await estimateEmptyWeight(spec, {
      network: opts.network,
      fetcher: opts.fetcher,
      budgetMs: Math.max(0, 6000 - (Date.now() - started)),
    });
    const estimate: WeightEstimate | null = worked ? { ...worked, fingerprint: weightFingerprint(vehicle) } : null;
    // Cached only when the network was asked, so a later screen that may use
    // it is not stuck with the offline answer for a day.
    if (opts.network) cache.set(key, { at: Date.now(), estimate, retry: decodable && spec.from === "row" });

    // Kept on the vehicle only when it came from a decode, or there is no VIN
    // a decode could ever add: a lot-row stand-in for a failed decode is not.
    const keep = !!estimate && (estimate.vehicle.from === "decode" || !decodable);
    if (estimate && keep && opts.persist !== false && vehicle.id) {
      try {
        const client = opts.client ?? (await createClient());
        const patch = { weight_estimate: estimate, weight_estimated_at: estimate.at };
        const query = client.from("vehicles").update(patch).eq("id", vehicle.id);
        // Only over nothing, or over the exact estimate this read saw: a
        // second tab's newer write is never replayed over.
        const guarded = raw
          ? query.eq("weight_estimated_at", raw.at)
          : query.is("weight_estimate", null);
        await guarded;
      } catch {
        // Refused by row level security, offline, or a schema without the
        // column yet: the estimate is still shown, just not kept.
      }
    }
    return estimate;
  } catch {
    return null;
  }
}
