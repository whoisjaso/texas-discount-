import "server-only";
import table from "./epa-etw-table.generated";
import type { EpaTable, EpaRow } from "./epa-etw-table.generated";

/**
 * An empty-weight estimate from EPA's own test data, bundled.
 *
 * Every model year EPA publishes the Test Car List, the vehicles each
 * manufacturer tested for fuel economy with their Equivalent Test Weight.
 * ETW is the inertia class of loaded vehicle weight, which is curb weight
 * plus 300 lb (40 CFR 86.1803-01; 40 CFR 1066.805 Table 1 and paragraph (b)).
 * So the estimate is ETW less 300 lb, give or take half a class.
 *
 * This is a line-for-line port of `estimate` in
 * scripts/empty-weight/reference_estimate.py, which is the oracle: the test
 * the-estimate-is-epa-test-weight-less-300 holds this to the same curb, range
 * and year on every crash-test fixture row. Measured on 1,706 crash-test
 * vehicles with lab-measured curb weights: 89.9% covered, median error 67 lb,
 * p95 346 lb, against vPIC's own CurbWeightLB at +139 lb median and p95 686.
 *
 * It is an ESTIMATE. It is never printed, never filed and never pasted
 * without a named person confirming it on the 130-U (on-the-sale.ts).
 */

const DATA = table as EpaTable;

const FOUR = ["4WD", "4X4", "AWD", "4MATIC", "XDRIVE", "QUATTRO", "4MOTION", "SYNCRO", "SHAWD", "ALL4", "4XE", "E4WD", "AWD/4WD"];
const TWO = ["2WD", "4X2", "FWD", "RWD"];
const MAKE_ALIAS: Record<string, string> = {
  "MERCEDES BENZ": "MERCEDES-BENZ",
  "MECEDES-BENZ": "MERCEDES-BENZ",
  VW: "VOLKSWAGEN",
  "ROLLS ROYCE": "ROLLS-ROYCE",
  "LINCOLN-MERCURY": "LINCOLN",
  "RANGE ROVER": "LAND ROVER",
  SRT: "DODGE",
};
const HD_RX = /\b(2500|3500|4500|5500|250|350|450|550|HD|SUPER DUTY|SD)\b/;
const GM_SERIES = /^[CK](15|25|35)(00)?$/;
const GV_LO: Record<string, number> = {
  "1": 0, "1A": 0, "1B": 3001, "1C": 4001, "1D": 5001, "2E": 6001, "2F": 7001, "2G": 8001, "2H": 9001,
  "3": 10001, "4": 14001, "5": 16001, "6": 19501, "7": 26001, "8": 33001,
};

function toks(s: string | null | undefined): string[] {
  return (s ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
}
function alnum(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
const DRIVE_WORDS = new Set([...FOUR, ...TWO].map(alnum));
/**
 * Words that, added to the query in an EPA name, make it a different vehicle:
 * Bronco and BRONCO SPORT, ProMaster and PROMASTER CITY, Transit and TRANSIT
 * CONNECT, Range Rover and RANGE ROVER EVOQUE, Cherokee and GRAND CHEROKEE,
 * Civic and CIVIC TYPE R. Trim words (LE, SE, XLE) are not on the list: a
 * CAMRY LE/SE is a Camry.
 */
const OTHER_MODEL = new Set([
  "SPORT", "CITY", "CONNECT", "EVOQUE", "VELAR", "CLUBMAN", "COUNTRYMAN", "PACEMAN", "TYPE", "PRIME",
  "CROSS", "CROSSTOUR", "ALLROAD", "ALLTRACK", "SPORTWAGEN", "SPORTBACK", "GRAND", "MAX", "XL", "ESV",
  "EXT", "LONG", "WILDERNESS", "CHASSIS", "TRAC",
]);
function gm(t: string): string {
  return t.replace(GM_SERIES, (_whole, series: string) => `${series}00`);
}
function ngrams(tokens: string[], into: Set<string>) {
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j <= Math.min(tokens.length, i + 4); j++) into.add(tokens.slice(i, j).join(""));
  }
}
/** True when the EPA name adds a word that makes it a different vehicle from the query. */
function otherModel(rowModel: string, query: Set<string>): boolean {
  for (const t of toks(rowModel)) {
    const w = gm(t);
    if (!query.has(w) && OTHER_MODEL.has(w)) return true;
  }
  return false;
}
function modelKeys(model: string, make: string): Set<string> {
  const keys = new Set<string>();
  const mk = new Set(toks(make));
  for (const alt of model.toUpperCase().split("/")) {
    const tk = toks(alt).filter((t) => !mk.has(t) && !DRIVE_WORDS.has(alnum(t)));
    ngrams(tk, keys);
    ngrams(tk.map(gm), keys);
  }
  return keys;
}

/** Python's round(x, 1): half to even on an exact tie, the exact decimal otherwise. */
export function pyRound1(x: number): number {
  const exact = x.toFixed(20);
  const tie = /\.\d50*$/.test(exact);
  if (!tie) return Number(x.toFixed(1));
  const scaled = Math.trunc(x * 10);
  const even = scaled % 2 === 0 ? scaled : scaled + Math.sign(x);
  return even / 10;
}

type Row = {
  make: string;
  groups: Set<string>;
  model: string;
  keys: Set<string>;
  tset: Set<string>;
  hyb: boolean;
  ev: boolean;
  disp: number | null;
  drive: number | null;
  etws: number[];
};

const byYear = new Map<number, Row[]>();
const groupMakes = new Map(Object.entries(DATA.groups).map(([key, makes]) => [key, new Set(makes)]));

function rowsFor(year: number): Row[] {
  const held = byYear.get(year);
  if (held) return held;
  const rows = (DATA.years[String(year)] ?? []).map((raw: EpaRow): Row => {
    const [make, model, disp, drive, flags, etws] = raw;
    const isGroup = make.startsWith("@");
    const rowMake = isGroup ? "" : make;
    const tset = new Set<string>();
    for (const alt of model.split("/")) for (const t of toks(alt)) tset.add(gm(t));
    return {
      make: rowMake,
      groups: isGroup ? (groupMakes.get(make) ?? new Set()) : new Set(),
      model,
      keys: modelKeys(model, rowMake),
      tset,
      hyb: (flags & 1) === 1,
      ev: (flags & 2) === 2,
      disp,
      drive: drive || null,
      etws,
    };
  });
  byYear.set(year, rows);
  return rows;
}

function candidates(year: number, makeIn: string, model: string, series: string): { hit: Row[]; other: Set<Row> } {
  const upper = makeIn.toUpperCase();
  const make = MAKE_ALIAS[upper] ?? upper;
  const ok = new Set([make, ...(make === "RAM" || make === "DODGE" ? ["DODGE", "RAM"] : [])]);
  const rows = rowsFor(year).filter((r) => ok.has(r.make) || (!r.make && r.groups.has(make)));
  const makeToks = new Set(toks(make));
  const mt = toks(model).filter((t) => !makeToks.has(t));
  const want = [alnum(model), alnum(mt.join(" "))];
  let hit = rows.filter((r) => want.some((w) => r.keys.has(w)));
  // Python's str.split(): runs of whitespace, no empty pieces.
  const seriesWords = series.split(/\s+/).filter(Boolean);
  if (hit.length === 0 && series) {
    const want2 = seriesWords.map((s) => alnum(`${model} ${s}`));
    hit = rows.filter((r) => want2.some((w) => r.keys.has(w)));
  }
  if (hit.length === 0) {
    const need = new Set(mt.map(gm));
    if (need.size > 0) hit = rows.filter((r) => [...need].every((t) => r.tset.has(t)));
  }
  const other = new Set<Row>();
  if (hit.length > 0) {
    const query = new Set(toks(`${model} ${series}`).map(gm));
    for (const r of hit) if (otherModel(r.model, query)) other.add(r);
  }
  return { hit, other };
}

function vpicDrive(driveType: string | null | undefined): 2 | 4 | null {
  const d = (driveType ?? "").toUpperCase();
  if (!d) return null;
  if (d.includes("AWD") || d.includes("4WD") || d.includes("4X4") || d.includes("ALL") || d.includes("FOUR")) return 4;
  if (d.includes("4X2") || d.includes("FWD") || d.includes("RWD") || d.includes("FRONT") || d.includes("REAR") || d.includes("2WD")) return 2;
  return null;
}

function halfBin(etw: number): number {
  return etw <= 4000 ? 62.5 : etw <= 5500 ? 125 : 250;
}

/** Python's statistics.median_low. */
function medianLow(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** What the estimator reads, in vPIC's own field names. */
export type EpaSpec = {
  ModelYear: string | number | null;
  Make: string | null;
  Model: string | null;
  Series?: string | null;
  Trim?: string | null;
  DisplacementL?: string | number | null;
  DriveType?: string | null;
  FuelTypePrimary?: string | null;
  ElectrificationLevel?: string | null;
  GVWR?: string | null;
};

export type EpaEstimate = {
  curbLbs: number;
  lowLbs: number;
  highLbs: number;
  etwMedian: number;
  etwMin: number;
  etwMax: number;
  yearUsed: number;
  /**
   * How the match was made: model, +disp, +hyb, +partial (only longer EPA
   * names matched, e.g. BRONCO SPORT for a Bronco), +variant (the query named
   * a variant, e.g. Series TYPE R, and only its rows were kept), +drive or
   * +drive-unmatched.
   */
  level: string;
  /** How many EPA test rows the figure stands on. */
  n: number;
  /** The EPA model names it matched, upper case, at most six. */
  models: string[];
  /** The EPA files for the year used. */
  sourceUrls: string[];
};

function modelNames(spec: EpaSpec): string[] {
  const names: string[] = [];
  const raw = (spec.Model ?? "").replace(/\([^)]*\)/g, " ");
  for (const alt of raw.split("/")) if (alt.trim()) names.push(alt.trim());
  for (const value of [spec.Series, spec.Trim]) {
    const v = (value ?? "").replace(/\([^)]*\)/g, " ").trim();
    for (const w of v.toUpperCase().split(/[\s/,]+/)) {
      if (/^(?:[A-Z]{1,4}-?\d{2,3}[A-Z]{0,4}|\d{3}[A-Z]{1,3})$/.test(w) && !names.includes(w)) names.push(w);
    }
  }
  return names;
}

function parseFloatStrict(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = value.trim();
  if (!text || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return null;
  return Number(text);
}

/** The EPA estimate for a vehicle, or null when EPA has nothing that fits. */
export function epaEstimate(spec: EpaSpec): EpaEstimate | null {
  const yearText = String(spec.ModelYear ?? "").trim();
  if (!/^[+-]?\d+$/.test(yearText)) return null;
  const year = Number(yearText);
  const make = (spec.Make ?? "").toUpperCase();
  const dispRaw = parseFloatStrict(spec.DisplacementL);
  const disp = dispRaw === null ? null : pyRound1(dispRaw);
  const drive = vpicDrive(spec.DriveType);
  const fuel = (spec.FuelTypePrimary ?? "").toUpperCase();
  const el = (spec.ElectrificationLevel ?? "").toUpperCase();
  const isEv = fuel === "ELECTRIC" || el.includes("BEV");
  const isHyb = (el.includes("HEV") || el.includes("HYBRID")) && !isEv;
  const gvClass = /Class (\w+)/.exec(spec.GVWR ?? "");
  const gv = gvClass ? GV_LO[gvClass[1]] : undefined;
  const hdText = [spec.Model ?? "", spec.Series ?? "", spec.Trim ?? ""].join(" ").toUpperCase();
  const heavy = (gv !== undefined && gv >= 8001) || HD_RX.test(hdText);
  const series = spec.Series ?? "";

  for (const yy of [year, year - 1, year - 2, year + 1]) {
    for (const name of modelNames(spec)) {
      const found = candidates(yy, make, name, series);
      let hit = found.hit;
      let level = "model";
      if (hit.length === 0) continue;
      if (heavy) {
        const nums = new Set(hdText.match(/\b(2500|3500|250|350|HD)\b/g) ?? []);
        hit = hit.filter((r) => {
          if (nums.size === 0) return false;
          const inName = r.model.toUpperCase().match(/(2500|3500|250|350|HD)/g) ?? [];
          return inName.some((x) => nums.has(x));
        });
        if (hit.length === 0) continue;
      }
      const ev = hit.filter((r) => r.ev === isEv);
      if (ev.length === 0) continue;
      hit = ev;
      if (!isEv && disp !== null) {
        const h = hit.filter((r) => r.disp !== null && Math.abs(r.disp - disp) <= 0.11);
        if (h.length === 0) continue;
        hit = h;
        level += "+disp";
      }
      const hy = hit.filter((r) => r.hyb === isHyb);
      if (hy.length > 0) {
        hit = hy;
        level += "+hyb";
      }
      // A short name also matches longer names (ProMaster in PROMASTER CITY,
      // Bronco in BRONCO SPORT): the query's own model wins when it is there,
      // and the level says +partial when it is not.
      const ex = hit.filter((r) => !found.other.has(r));
      if (ex.length > 0) hit = ex;
      else level += "+partial";
      // And the other way round: when the query names a variant (a Civic
      // with Series TYPE R), the rows that carry it win over the plain
      // model's, which weigh a different car.
      const want = new Set(toks(`${name} ${series}`).map(gm).filter((w) => OTHER_MODEL.has(w)));
      if (want.size > 0) {
        const named = hit.filter((r) => toks(r.model).some((t) => want.has(gm(t))));
        if (named.length > 0 && named.length < hit.length) {
          hit = named;
          level += "+variant";
        }
      }
      if (drive !== null) {
        const h = hit.filter((r) => r.drive === drive || r.drive === null);
        if (h.length > 0) {
          hit = h;
          level += "+drive";
        } else {
          level += "+drive-unmatched";
        }
      }
      const etws = hit.flatMap((r) => r.etws);
      const med = medianLow(etws);
      const min = Math.min(...etws);
      const max = Math.max(...etws);
      return {
        curbLbs: med - 300,
        lowLbs: Math.floor(min - halfBin(min) - 300),
        highLbs: Math.ceil(max + halfBin(max) - 300),
        etwMedian: med,
        etwMin: min,
        etwMax: max,
        yearUsed: yy,
        level,
        n: etws.length,
        models: [...new Set(hit.map((r) => r.model))].sort().slice(0, 6),
        sourceUrls: (DATA.sources[String(yy)] ?? []).map((s) => s.url),
      };
    }
  }
  return null;
}

/** When and how the bundled table was built, for the record beside an estimate. */
export function epaTableInfo(): { built: string; v: number; page: string } {
  return { built: DATA.built, v: DATA.v, page: DATA.page };
}

/** For the provenance test: the table's metadata without its rows. */
export function epaTableMeta(): Pick<EpaTable, "v" | "built" | "relation" | "rowFormat" | "sources" | "page"> & {
  yearCounts: Record<string, number>;
} {
  return {
    v: DATA.v,
    built: DATA.built,
    relation: DATA.relation,
    rowFormat: DATA.rowFormat,
    sources: DATA.sources,
    page: DATA.page,
    yearCounts: Object.fromEntries(Object.entries(DATA.years).map(([y, rows]) => [y, rows.length])),
  };
}
