import "server-only";

/**
 * Transport Canada's curb weight for a model, through vPIC.
 *
 * vPIC republishes the Canadian Vehicle Specifications (Transport Canada) at
 * GetCanadianVehicleSpecifications: one record per model and trim, with a
 * curb weight (CW) in whole kilograms. Measured against 1,706 crash-test
 * vehicles the median trim is 84 lb from the scale at the median, a little
 * behind the EPA estimate (67 lb), so it is the second source and the
 * cross-check, never the first. It has no engine field, so it cannot tell a
 * V6 from a V8 or gas from diesel; the range it gives says so.
 *
 * Silent on failure: a timeout, an outage or an odd shape is "nothing
 * learned", never an error on a sale screen. A port of the research's
 * cvslookup.py: candidates by make and model tokens, then the drive and cab
 * preferences, then the median trim.
 */

const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles/GetCanadianVehicleSpecifications/";
const KG_TO_LB = 2.20462;
const MAKE: Record<string, string> = { "RAM TRUCKS": "RAM", "MERCEDES BENZ": "MERCEDES-BENZ", MERCEDES: "MERCEDES-BENZ" };
const FOUR = new Set(["4X4", "4WD", "AWD", "4MATIC", "XDRIVE", "QUATTRO", "4MOTION", "ALL4", "SHAWD"]);
const TWO = new Set(["2WD", "4X2", "FWD", "RWD"]);
const CAB: Record<string, "R" | "E" | "C"> = {
  REG: "R", REGULAR: "R", EXT: "E", EXTENDED: "E", QUAD: "E", DOUBLE: "E", SUPERCAB: "E", KING: "E", ACCESS: "E", CLUB: "E",
  CREW: "C", CREWCAB: "C", SUPERCREW: "C", CREWMAX: "C", MEGA: "C",
};

function toks(s: string | null | undefined): string[] {
  return (s ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
}

export type CanadaRow = { make: string; model: string; tset: Set<string>; drive: 2 | 4 | null; cab: "R" | "E" | "C" | null; cwLb: number };

/** One CVS record, read the way cvslookup.py reads it. Null when it has no curb weight. */
export function readCanadaRecord(record: unknown): CanadaRow | null {
  const specs = (record as { Specs?: unknown })?.Specs;
  if (!Array.isArray(specs)) return null;
  const s: Record<string, string> = {};
  for (const item of specs) {
    const name = (item as { Name?: unknown })?.Name;
    const value = (item as { Value?: unknown })?.Value;
    if (typeof name === "string") s[name] = typeof value === "string" ? value : String(value ?? "");
  }
  const cw = Number(s.CW);
  if (!Number.isFinite(cw) || cw <= 0 || !s.Model || !s.Make) return null;
  const model = s.Model.toUpperCase();
  const tk = toks(model.replace("P/U", "PU"));
  const tset = new Set(tk);
  for (let i = 0; i < tk.length - 1; i++) tset.add(tk[i] + tk[i + 1]);
  const drive = [...tset].some((t) => FOUR.has(t)) ? 4 : [...tset].some((t) => TWO.has(t)) ? 2 : null;
  const cab = tk.map((t) => CAB[t]).find(Boolean) ?? null;
  const make = s.Make.toUpperCase();
  return { make: MAKE[make] ?? make, model, tset, drive, cab, cwLb: Math.round(cw * KG_TO_LB) };
}

export type CanadaEstimate = { curbLbs: number; lowLbs: number; highLbs: number; n: number; models: string[] };

/** The median trim of the matching records, or null. Pure, for the tests. */
export function canadaFromRecords(
  rows: CanadaRow[],
  spec: { make: string; model: string; drive?: 2 | 4 | null; cab?: "R" | "E" | "C" | null },
): CanadaEstimate | null {
  const upper = spec.make.toUpperCase();
  const mk = MAKE[upper] ?? upper;
  const mks = new Set([mk, ...(mk === "DODGE" || mk === "RAM" ? ["DODGE", "RAM"] : [])]);
  const makeToks = new Set(toks(spec.make));
  const need = toks(spec.model).filter((t) => !makeToks.has(t));
  if (need.length === 0) return null;
  const joined = need.join("");
  let hit = rows.filter((r) => mks.has(r.make) && (need.every((t) => r.tset.has(t)) || r.tset.has(joined)));
  if (spec.drive) {
    // A truck or SUV line without a drive token is the 2WD base in CVS naming.
    const h = hit.filter((r) => r.drive === spec.drive || (r.drive === null && spec.drive === 2));
    if (h.length > 0) hit = h;
  }
  if (spec.cab) {
    const h = hit.filter((r) => r.cab === spec.cab);
    if (h.length > 0) hit = h;
  }
  if (hit.length === 0) return null;
  const w = hit.map((r) => r.cwLb).sort((a, b) => a - b);
  return {
    curbLbs: w[Math.floor((w.length - 1) / 2)],
    lowLbs: w[0],
    highLbs: w[w.length - 1],
    n: w.length,
    models: hit.map((r) => r.model).slice(0, 5),
  };
}

/** The cab, from the words a decode or the lot carries ("SuperCrew", "Crew Cab"). */
export function cabOf(text: string | null | undefined): "R" | "E" | "C" | null {
  const tk = toks(text);
  for (let i = 0; i < tk.length; i++) {
    const pair = i < tk.length - 1 ? CAB[tk[i] + tk[i + 1]] : undefined;
    if (pair) return pair;
    if (CAB[tk[i]]) return CAB[tk[i]];
  }
  return null;
}

/**
 * Transport Canada's figure for a vehicle, live. Null on any failure, and
 * never slower than `timeoutMs` (default 4 s).
 */
export async function canadaEstimate(
  spec: { year: number; make: string; model: string; drive?: 2 | 4 | null; cab?: "R" | "E" | "C" | null },
  opts: { timeoutMs?: number; fetcher?: typeof fetch } = {},
): Promise<CanadaEstimate | null> {
  if (!Number.isInteger(spec.year) || !spec.make || !spec.model) return null;
  const doFetch = opts.fetcher ?? fetch;
  const makes = [spec.make];
  const upper = spec.make.toUpperCase();
  if (upper === "RAM") makes.push("Dodge");
  if (upper === "DODGE") makes.push("Ram");
  try {
    const rows: CanadaRow[] = [];
    for (const make of makes) {
      const url = `${BASE}?Year=${spec.year}&Make=${encodeURIComponent(make)}&Model=&units=Metric&format=json`;
      const res = await doFetch(url, {
        signal: AbortSignal.timeout(opts.timeoutMs ?? 4000),
        // A model year's specs do not change: a month of cache is honest.
        next: { revalidate: 2592000 },
      } as RequestInit);
      if (!res.ok) continue;
      const body = (await res.json()) as { Results?: unknown };
      if (!Array.isArray(body?.Results)) continue;
      for (const record of body.Results) {
        const row = readCanadaRecord(record);
        if (row) rows.push(row);
      }
    }
    return canadaFromRecords(rows, spec);
  } catch {
    return null;
  }
}
