import { dealerFees, occcDocFeeFilingSeed } from "@/lib/dealership-config";
import {
  COMBINED,
  DEALER_DEPUTY_TITLE_FEE,
  DOC_FEE,
  OTHER_DEALER_CHARGES,
  RULEBOOK_AS_OF,
  STATE_FEES_2026,
  STATE_TITLE_FEE_DOLLARS,
  VIT_REIMBURSEMENT,
  centsAsDollars,
} from "@/lib/legal/texas-dealer-fees";
import { businessDateToday } from "@/lib/documents/us-date";
import { readGovernmentFees } from "@/lib/sales/government-fees";

/**
 * The dealership's fee schedule: the dealer-set fees the owner answers at
 * onboarding, checked against the Texas limits (rulebook,
 * `src/lib/legal/texas-dealer-fees.ts`).
 *
 * Pure. One validator for the onboarding screen (feedback while typing), the
 * save action and the preview mock's database function, so the three can
 * never disagree; the database function repeats the same codes in SQL and
 * its CHECK constraints repeat the caps.
 *
 * How "no matter how the dealer structures its fees" holds, by construction:
 *
 *   1. There is no free-form dealer fee anywhere: the schedule refuses any
 *      field it does not know (`unknownField`).
 *   2. Every charge for paperwork, whatever it is called, is the documentary
 *      fee, and that one figure is capped at $225.00 or the OCCC-filed
 *      maximum.
 *   3. Every other dealer charge goes in the taxed vehicle price.
 *   4. The government lines are never the owner's to type.
 *
 * Texas has no combined cap (rulebook section 4); each limit is enforced on
 * its own, and the screens show "dealer charges on top of the price: $X of $Y
 * allowed". An over-limit figure is refused with the reason and the citation,
 * never trimmed.
 *
 * Every sale keeps a copy of the fees it started with (`step_data.fees`,
 * written at Start A Sale), so a change applies to new sales only.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A documentary fee maximum the dealer filed with the OCCC (7 TAC §84.205(c)). */
export type OcccDocFeeFiling = {
  maxCents: number;
  /** YYYY-MM-DD */
  filedOn: string;
  /** YYYY-MM-DD */
  effectiveOn: string;
  licenseOrNmls: string;
  location: string;
};

/** The answers the owner gives, in cents and plain values. */
export type FeeScheduleFields = {
  /** The one documentary fee for this location, for every buyer. Null: not answered. */
  docFeeCents: number | null;
  occcFiling: OcccDocFeeFiling | null;
  /** Buy here pay here, or contracts sold to a lender (a Ch. 348 "retail seller"). */
  writesFinanceContracts: boolean | null;
  nmlsId: string | null;
  legacyLicense: string | null;
  /** Recorded now; charged on sales from a later update (until then $0). */
  deputy: { isDeputy: boolean; feeCents: number };
  /** Recorded now; charged on sales from a later update (until then $0). */
  vit: { year: number; inBusinessJan1: boolean | null; passesThrough: boolean | null; unitFactor: number | null };
  /** Recorded and reported only: the desk does not write Ch. 345 contracts. */
  financesCh345: boolean | null;
};

export type FeeSchedule = FeeScheduleFields & {
  /** "owner": saved by an owner (the database row). "config": the environment seed. */
  source: "owner" | "config";
  /** 0 is the config seed; each owner save adds one. */
  version: number;
  rulebookAsOf: string;
  savedAt: string | null;
  savedByName: string | null;
};

/**
 * The fees one sale started with, in dollars as the money module uses them.
 * Written once, at Start A Sale; no browser path writes it.
 */
export type DealFees = {
  titleFee: number;
  registrationFee: number;
  docFee: number | null;
  /** The doc fee limit when the copy was taken: $225.00 or the filed maximum. */
  docFeeCapCents: number;
  occcFiling: OcccDocFeeFiling | null;
  scheduleVersion: number;
  source: "owner" | "config";
  takenAt: string;
  rulebookAsOf: string;
};

/**
 * The fee lines the money module adds, in dollars: the title, documentary
 * and registration fees, and, once a sale's government fees are confirmed
 * from webDEALER (government-fees.ts), the inspection program replacement
 * fee and the license plate fee on lines of their own (0 or absent until
 * then, which is every caller from before they existed).
 */
export type DealFeeLines = {
  titleFee: number;
  docFee: number;
  registrationFee: number;
  inspectionFee?: number;
  plateFee?: number;
};

/**
 * What the screens need to show the fee lines: the figures, whether the doc
 * fee is a real figure or a missing one ("Not set", never $0), and whether
 * the government lines are webDEALER's confirmed figures for this sale or
 * still the desk's defaults.
 */
export type DealFeeDisplay = DealFeeLines & { docFeeSet: boolean; governmentConfirmed?: boolean };

export const FEE_PROBLEM_CODES = [
  "feeNotDollars",
  "docFeeRequired",
  "docFeeOverPresumed",
  "docFeeOverFiled",
  "occcFilingIncomplete",
  "occcFilingNotHigher",
  "occcFilingInFuture",
  "occcFilingDatesOutOfOrder",
  "occcFilingNotYetEffective",
  "deputyFeeWithoutDeputy",
  "deputyFeeOverLimit",
  "vitNeedsJan1",
  "vitFactorMissing",
  "vitFactorInvalid",
  "textTooLong",
  "unknownField",
] as const;

export type FeeProblemCode = (typeof FEE_PROBLEM_CODES)[number];

export type FeeProblem = {
  code: FeeProblemCode;
  /** Which answer it is about, for the screen to show it beside. */
  field: string;
  params?: Record<string, string | number>;
};

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

const PRESUMED = DOC_FEE.presumedReasonableMaxCents;
const DEPUTY_MAX = DEALER_DEPUTY_TITLE_FEE.maxCents;
const TEXT_MAX = 120;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether a recorded OCCC filing is in force on a business date (YYYY-MM-DD):
 * filed on or before it, and taken effect on or before it. "A notification
 * is not effective until the OCCC receives a complete form" (7 TAC
 * §84.205(c)(3)), and a dealer that charges more than $225.00 "without first
 * providing a complete notification" violates the rule (§84.205(c)(5)(A)):
 * a filing dated in the future, or not yet in effect, raises nothing.
 */
export function occcFilingInForce(filing: OcccDocFeeFiling | null | undefined, onDate: string = businessDateToday()): boolean {
  if (!filing) return false;
  if (!Number.isInteger(filing.maxCents) || filing.maxCents <= PRESUMED) return false;
  if (!DATE.test(filing.filedOn) || !DATE.test(filing.effectiveOn)) return false;
  if (filing.effectiveOn < filing.filedOn) return false;
  return filing.filedOn <= onDate && filing.effectiveOn <= onDate;
}

/**
 * The doc fee limit for this schedule on a business date: $225.00, or the
 * recorded OCCC-filed maximum once that filing is in force.
 */
export function docFeeCapCents(schedule: Pick<FeeScheduleFields, "occcFiling">, onDate: string = businessDateToday()): number {
  const filing = schedule.occcFiling;
  return filing && occcFilingInForce(filing, onDate) ? filing.maxCents : PRESUMED;
}

/** The English sentence for a problem (the action's `error`; the screens use the catalogue). */
export function feeProblemSentence(problem: FeeProblem): string {
  const params = problem.params ?? {};
  switch (problem.code) {
    case "feeNotDollars":
      return "Type a dollar amount of zero or more, like 150 or 150.00.";
    case "docFeeRequired":
      return "Type your documentary fee. $0 is a valid answer.";
    case "docFeeOverPresumed":
      return `Texas presumes a documentary fee of ${params.limit} or less is reasonable (${params.citation}). To charge more, record the higher maximum you filed with the OCCC.`;
    case "docFeeOverFiled":
      return `The documentary fee is above the maximum you filed with the OCCC (${params.limit}). It can never be more than the filed amount.`;
    case "occcFilingIncomplete":
      return "Fill in every part of the OCCC filing: the filed maximum, the date you filed it, the date it took effect, your license or NMLS number, and the location.";
    case "occcFilingNotHigher":
      return `An OCCC filing is needed only above ${params.limit}. Leave it off, or type the higher maximum you filed.`;
    case "occcFilingInFuture":
      return "The filing date is after today. Record the filing once the OCCC has received it (7 TAC §84.205(c)(3)).";
    case "occcFilingDatesOutOfOrder":
      return "The date it took effect cannot be before the date you filed it. A filing takes effect only once the OCCC receives it (7 TAC §84.205(c)(3)).";
    case "occcFilingNotYetEffective":
      return `Your filing takes effect on ${params.effectiveOn}. Until then the documentary fee may not be more than ${params.limit} (7 TAC §84.205(c)(5)(A)). Save ${params.limit} or less now, and the higher fee once the filing is in effect.`;
    case "deputyFeeWithoutDeputy":
      return "Only a dealer deputized by its county tax office may charge a dealer-deputy title convenience fee (43 TAC §217.168(b)(2)). The state's title fee still applies to every sale.";
    case "deputyFeeOverLimit":
      return `A dealer deputy title fee is ${params.limit} at most (${params.citation}).`;
    case "vitNeedsJan1":
      return "Only a dealer that was in business on January 1 may pass on the inventory tax.";
    case "vitFactorMissing":
      return "Type the unit property tax factor from your inventory tax statement.";
    case "vitFactorInvalid":
      return "The unit property tax factor is a small decimal below 1, like 0.0019.";
    case "textTooLong":
      return `Keep this answer under ${TEXT_MAX} characters.`;
    case "unknownField":
      return "Texas does not let a dealer add that fee on top of the price. Put it in the vehicle price instead.";
  }
}

// ---------------------------------------------------------------------------
// Parsing what was typed
// ---------------------------------------------------------------------------

/**
 * A typed dollar figure, the desk's way (SOP "Money": strip "$", "," and
 * spaces, then test for empty): null when empty, NaN when it is not a dollar
 * amount of zero or more with at most two decimals, else whole cents.
 */
export function typedCents(typed: unknown): number | null {
  if (typeof typed === "number") return Number.isFinite(typed) && typed >= 0 ? Math.round(typed * 100) : Number.NaN;
  const digits = String(typed ?? "").replace(/[$,\s]/g, "");
  if (digits === "") return null;
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(digits)) return Number.NaN;
  return Math.round(Number(digits) * 100);
}

/** What the onboarding screen posts: typed text and plain answers. */
export type FeeScheduleInput = {
  docFee: string;
  occcFiling: {
    max: string;
    filedOn: string;
    effectiveOn: string;
    licenseOrNmls: string;
    location: string;
  } | null;
  writesFinanceContracts: boolean | null;
  nmlsId: string;
  legacyLicense: string;
  deputy: { isDeputy: boolean; fee: string };
  vit: { inBusinessJan1: boolean | null; passesThrough: boolean | null; unitFactor: string };
  financesCh345: boolean | null;
};

const INPUT_KEYS = ["docFee", "occcFiling", "writesFinanceContracts", "nmlsId", "legacyLicense", "deputy", "vit", "financesCh345"];
const OCCC_INPUT_KEYS = ["max", "filedOn", "effectiveOn", "licenseOrNmls", "location"];
const DEPUTY_INPUT_KEYS = ["isDeputy", "fee"];
const VIT_INPUT_KEYS = ["inBusinessJan1", "passesThrough", "unitFactor"];

const FIELD_KEYS = ["docFeeCents", "occcFiling", "writesFinanceContracts", "nmlsId", "legacyLicense", "deputy", "vit", "financesCh345"];
const OCCC_KEYS = ["maxCents", "filedOn", "effectiveOn", "licenseOrNmls", "location"];
const DEPUTY_KEYS = ["isDeputy", "feeCents"];
const VIT_KEYS = ["year", "inBusinessJan1", "passesThrough", "unitFactor"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[], prefix: string): FeeProblem[] {
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({ code: "unknownField" as const, field: prefix ? `${prefix}.${key}` : key }));
}

const cleanText = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim() : "";
  return text ? text : null;
};

const optionalBoolean = (value: unknown): boolean | null => (value === true ? true : value === false ? false : null);

/** The business year the VIT answer is for (the January 1 asked about). */
export function vitYear(today: string): number {
  return Number(today.slice(0, 4)) || Number(RULEBOOK_AS_OF.slice(0, 4));
}

/**
 * The typed answers as schedule fields, with every problem typing alone can
 * show (not a dollar amount, a key that is not a known fee). The limits are
 * `validateFeeSchedule`'s.
 */
export function parseFeeScheduleInput(
  input: unknown,
  today: string,
): { fields: FeeScheduleFields; problems: FeeProblem[] } {
  const problems: FeeProblem[] = [];
  const raw = isRecord(input) ? input : {};
  problems.push(...unknownKeys(raw, INPUT_KEYS, ""));

  const docFeeCents = typedCents(raw.docFee);
  if (docFeeCents === null) problems.push({ code: "docFeeRequired", field: "docFee" });
  else if (!Number.isFinite(docFeeCents)) problems.push({ code: "feeNotDollars", field: "docFee" });

  let occcFiling: OcccDocFeeFiling | null = null;
  if (isRecord(raw.occcFiling)) {
    const held = raw.occcFiling;
    problems.push(...unknownKeys(held, OCCC_INPUT_KEYS, "occcFiling"));
    const maxCents = typedCents(held.max);
    if (maxCents !== null && !Number.isFinite(maxCents)) problems.push({ code: "feeNotDollars", field: "occcFiling.max" });
    occcFiling = {
      maxCents: maxCents === null || !Number.isFinite(maxCents) ? Number.NaN : maxCents,
      filedOn: cleanText(held.filedOn) ?? "",
      effectiveOn: cleanText(held.effectiveOn) ?? "",
      licenseOrNmls: cleanText(held.licenseOrNmls) ?? "",
      location: cleanText(held.location) ?? "",
    };
  } else if (raw.occcFiling !== null && raw.occcFiling !== undefined) {
    problems.push({ code: "occcFilingIncomplete", field: "occcFiling" });
  }

  const deputyRaw = isRecord(raw.deputy) ? raw.deputy : {};
  problems.push(...unknownKeys(deputyRaw, DEPUTY_INPUT_KEYS, "deputy"));
  const isDeputy = deputyRaw.isDeputy === true;
  const typedDeputy = typedCents(deputyRaw.fee);
  if (typedDeputy !== null && !Number.isFinite(typedDeputy)) problems.push({ code: "feeNotDollars", field: "deputy.fee" });
  const deputyCents = typedDeputy === null || !Number.isFinite(typedDeputy) ? 0 : typedDeputy;

  const vitRaw = isRecord(raw.vit) ? raw.vit : {};
  problems.push(...unknownKeys(vitRaw, VIT_INPUT_KEYS, "vit"));
  const factorText = String(vitRaw.unitFactor ?? "").replace(/\s+/g, "");
  // A decimal as printed on the statement ("0.001899"); anything else is no factor.
  const unitFactor: number | null =
    factorText === "" ? null : /^(\d+(\.\d+)?|\.\d+)$/.test(factorText) ? Number(factorText) : Number.NaN;

  return {
    fields: {
      // Null when unanswered, NaN when not a dollar amount (both refused).
      docFeeCents,
      occcFiling,
      writesFinanceContracts: optionalBoolean(raw.writesFinanceContracts),
      nmlsId: cleanText(raw.nmlsId),
      legacyLicense: cleanText(raw.legacyLicense),
      deputy: { isDeputy, feeCents: deputyCents },
      vit: {
        year: vitYear(today),
        inBusinessJan1: optionalBoolean(vitRaw.inBusinessJan1),
        passesThrough: optionalBoolean(vitRaw.passesThrough),
        unitFactor,
      },
      financesCh345: optionalBoolean(raw.financesCh345),
    },
    problems,
  };
}

// ---------------------------------------------------------------------------
// The limits
// ---------------------------------------------------------------------------

/**
 * Every reason this schedule may not be saved or charged, against the Texas
 * limits. Empty when it may. Takes anything (a saved row's JSON, a mock call)
 * and refuses any key that is not a known fee, so no "other fee" can be
 * slipped in under a new name.
 */
export function validateFeeSchedule(next: unknown, options: { today?: string } = {}): FeeProblem[] {
  /** The business date the filing's dates are checked against (America/Chicago). */
  const today = options.today ?? businessDateToday();
  const problems: FeeProblem[] = [];
  if (!isRecord(next)) return [{ code: "docFeeRequired", field: "docFee" }];
  problems.push(...unknownKeys(next, [...FIELD_KEYS, "source", "version", "rulebookAsOf", "savedAt", "savedByName"], ""));

  const fee = next.docFeeCents;
  const filing = isRecord(next.occcFiling) ? next.occcFiling : null;
  if (filing) problems.push(...unknownKeys(filing, OCCC_KEYS, "occcFiling"));

  // The OCCC filing: whole, or not there at all, and only above $225.00.
  let filedMax: number | null = null;
  if (next.occcFiling !== null && next.occcFiling !== undefined) {
    const max = filing?.maxCents;
    const complete =
      filing !== null &&
      typeof max === "number" &&
      Number.isInteger(max) &&
      max > 0 &&
      [filing.filedOn, filing.effectiveOn].every((value) => typeof value === "string" && DATE.test(value) && Number.isFinite(Date.parse(value))) &&
      [filing.licenseOrNmls, filing.location].every((value) => typeof value === "string" && value.trim() !== "");
    if (!complete) {
      problems.push({ code: "occcFilingIncomplete", field: "occcFiling" });
    } else if ((max as number) <= PRESUMED) {
      problems.push({ code: "occcFilingNotHigher", field: "occcFiling.maxCents", params: { limit: centsAsDollars(PRESUMED) } });
    } else if ((filing.filedOn as string) > today) {
      // A filing dated after today has not reached the OCCC (§84.205(c)(3)).
      problems.push({ code: "occcFilingInFuture", field: "occcFiling.filedOn" });
    } else if ((filing.effectiveOn as string) < (filing.filedOn as string)) {
      // Effective only once received: never before the day it was filed.
      problems.push({ code: "occcFilingDatesOutOfOrder", field: "occcFiling.effectiveOn" });
    } else {
      filedMax = max as number;
      /*
        Recorded but not in effect yet: the limit is $225.00 until the
        effective date (§84.205(c)(5)(A)). The filing may be saved ahead of
        it; a fee above $225.00 may not.
      */
      if ((filing.effectiveOn as string) > today && typeof fee === "number" && fee > PRESUMED) {
        problems.push({
          code: "occcFilingNotYetEffective",
          field: "docFee",
          params: { limit: centsAsDollars(PRESUMED), effectiveOn: filing.effectiveOn as string },
        });
      }
    }
    for (const key of ["licenseOrNmls", "location"] as const) {
      const value = filing?.[key];
      if (typeof value === "string" && value.length > TEXT_MAX) problems.push({ code: "textTooLong", field: `occcFiling.${key}` });
    }
  }

  // The documentary fee: every paperwork charge, any label, in one figure.
  if (fee === null || fee === undefined) {
    problems.push({ code: "docFeeRequired", field: "docFee" });
  } else if (typeof fee !== "number" || !Number.isInteger(fee) || fee < 0) {
    problems.push({ code: "feeNotDollars", field: "docFee" });
  } else if (fee > PRESUMED) {
    if (filedMax === null) {
      // No complete filing recorded (an incomplete one is named above).
      if (next.occcFiling === null || next.occcFiling === undefined) {
        problems.push({
          code: "docFeeOverPresumed",
          field: "docFee",
          params: { limit: centsAsDollars(PRESUMED), citation: DOC_FEE.shortCitation },
        });
      }
    } else if (fee > filedMax) {
      problems.push({ code: "docFeeOverFiled", field: "docFee", params: { limit: centsAsDollars(filedMax) } });
    }
  }

  // The dealer deputy title fee: only a deputy, $10.00 at most.
  const deputy = isRecord(next.deputy) ? next.deputy : null;
  if (deputy) problems.push(...unknownKeys(deputy, DEPUTY_KEYS, "deputy"));
  const deputyFee = deputy?.feeCents ?? 0;
  if (typeof deputyFee !== "number" || !Number.isInteger(deputyFee) || deputyFee < 0) {
    problems.push({ code: "feeNotDollars", field: "deputy.fee" });
  } else if (deputyFee > 0 && deputy?.isDeputy !== true) {
    problems.push({ code: "deputyFeeWithoutDeputy", field: "deputy.fee" });
  } else if (deputyFee > DEPUTY_MAX) {
    problems.push({
      code: "deputyFeeOverLimit",
      field: "deputy.fee",
      params: { limit: centsAsDollars(DEPUTY_MAX), citation: "43 TAC §217.168(b)(2)" },
    });
  }

  // The inventory tax: only a dealer in business on January 1, by its factor.
  const vit = isRecord(next.vit) ? next.vit : null;
  if (vit) problems.push(...unknownKeys(vit, VIT_KEYS, "vit"));
  const factor = vit?.unitFactor;
  const factorGiven = factor !== null && factor !== undefined;
  if (factorGiven && (typeof factor !== "number" || !Number.isFinite(factor) || factor < 0 || factor >= 1)) {
    problems.push({ code: "vitFactorInvalid", field: "vit.unitFactor" });
  }
  if ((vit?.passesThrough === true || factorGiven) && vit?.inBusinessJan1 !== true) {
    problems.push({ code: "vitNeedsJan1", field: "vit.inBusinessJan1" });
  } else if (vit?.passesThrough === true && !factorGiven) {
    problems.push({ code: "vitFactorMissing", field: "vit.unitFactor" });
  }

  for (const key of ["nmlsId", "legacyLicense"] as const) {
    const value = next[key];
    if (typeof value === "string" && value.length > TEXT_MAX) problems.push({ code: "textTooLong", field: key });
  }

  return problems;
}

// ---------------------------------------------------------------------------
// The seed, the screens' totals and the database row
// ---------------------------------------------------------------------------

/**
 * The schedule from the environment (`NEXT_PUBLIC_DEALER_DOC_FEE` and the
 * five `NEXT_PUBLIC_DEALER_OCCC_*` variables): the seed and default until an
 * owner saves one, and checked the same way at filing. Never a figure typed
 * in code.
 */
export function configFeeSchedule(today = new Date().toISOString().slice(0, 10)): FeeSchedule {
  const doc = dealerFees.docFee;
  const seed = occcDocFeeFilingSeed;
  let occcFiling: OcccDocFeeFiling | null = null;
  if (seed) {
    const max = typedCents(seed.max ?? "");
    occcFiling = {
      maxCents: max === null || !Number.isFinite(max) ? Number.NaN : max,
      filedOn: seed.filedOn ?? "",
      effectiveOn: seed.effectiveOn ?? "",
      licenseOrNmls: seed.licenseOrNmls ?? "",
      location: seed.location ?? "",
    };
  }
  return {
    source: "config",
    version: 0,
    docFeeCents: doc === null ? null : Number.isFinite(doc) ? Math.round(doc * 100) : Number.NaN,
    occcFiling,
    writesFinanceContracts: null,
    nmlsId: null,
    legacyLicense: null,
    deputy: { isDeputy: false, feeCents: 0 },
    vit: { year: vitYear(today), inBusinessJan1: null, passesThrough: null, unitFactor: null },
    financesCh345: null,
    rulebookAsOf: RULEBOOK_AS_OF,
    savedAt: null,
    savedByName: null,
  };
}

/** The fields alone, as the change log and the database function hold them. */
export function scheduleFields(schedule: FeeScheduleFields): FeeScheduleFields {
  return {
    docFeeCents: schedule.docFeeCents,
    occcFiling: schedule.occcFiling ? { ...schedule.occcFiling } : null,
    writesFinanceContracts: schedule.writesFinanceContracts,
    nmlsId: schedule.nmlsId,
    legacyLicense: schedule.legacyLicense,
    deputy: { ...schedule.deputy },
    vit: { ...schedule.vit },
    financesCh345: schedule.financesCh345,
  };
}

/** A `dealer_fee_schedule` row (snake case) as a schedule. */
export function scheduleFromRow(row: Record<string, unknown>): FeeSchedule {
  const num = (value: unknown): number | null => (value === null || value === undefined || value === "" ? null : Number(value));
  const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
  const bool = (value: unknown): boolean | null => (value === true ? true : value === false ? false : null);
  const max = num(row.occc_filed_max_cents);
  const filing: OcccDocFeeFiling | null =
    max === null
      ? null
      : {
          maxCents: max,
          filedOn: String(row.occc_filed_on ?? ""),
          effectiveOn: String(row.occc_effective_on ?? ""),
          licenseOrNmls: String(row.occc_license_or_nmls ?? ""),
          location: String(row.occc_location ?? ""),
        };
  return {
    source: "owner",
    version: Number(row.version) || 0,
    docFeeCents: num(row.doc_fee_cents),
    occcFiling: filing,
    writesFinanceContracts: bool(row.writes_finance_contracts),
    nmlsId: text(row.nmls_id),
    legacyLicense: text(row.legacy_license),
    deputy: { isDeputy: row.is_dealer_deputy === true, feeCents: Number(row.deputy_fee_cents) || 0 },
    vit: {
      year: Number(row.vit_year) || vitYear(RULEBOOK_AS_OF),
      inBusinessJan1: bool(row.vit_in_business_jan1),
      passesThrough: bool(row.vit_passes_through),
      unitFactor: num(row.vit_unit_factor),
    },
    financesCh345: bool(row.finances_ch345),
    rulebookAsOf: String(row.rulebook_as_of ?? RULEBOOK_AS_OF).slice(0, 10),
    savedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    savedByName: text(row.updated_by_name),
  };
}

/** The schedule as the database function's `p_next` and the change log's `next`. */
export function scheduleToJson(fields: FeeScheduleFields): Record<string, unknown> {
  return scheduleFields(fields) as unknown as Record<string, unknown>;
}

/**
 * The dealer charges on top of the price that Handle A Sale charges today, in
 * cents: the documentary fee. The deputy fee and the inventory tax are
 * recorded at onboarding and are $0 on every sale until they get their own
 * document lines (the lower amount, until then).
 */
export function dealerChargesOnTop(fees: { docFeeCents: number | null }): number {
  const doc = fees.docFeeCents;
  return doc !== null && Number.isFinite(doc) ? doc : 0;
}

/** What may be charged on top of the price today: the doc fee limit. */
export function dealerChargesAllowance(schedule: Pick<FeeScheduleFields, "occcFiling">): number {
  return docFeeCapCents(schedule);
}

/** "Dealer charges on top of the price: $150.00 of $225.00 allowed" (the figures). */
export function dealerChargesLine(schedule: Pick<FeeScheduleFields, "occcFiling" | "docFeeCents">): { charged: string; allowed: string } {
  return { charged: centsAsDollars(dealerChargesOnTop(schedule)), allowed: centsAsDollars(dealerChargesAllowance(schedule)) };
}

// ---------------------------------------------------------------------------
// The per-sale copy
// ---------------------------------------------------------------------------

export const FEES_KEY = "fees";

/**
 * The copy a sale takes when it starts. The title and registration lines are
 * the desk's defaults from the config (until the county computation ships;
 * webDEALER's figure is confirmed on every sale); the doc fee is the
 * schedule's.
 */
export function dealFeesFromSchedule(schedule: FeeSchedule, now: Date = new Date()): DealFees {
  const doc = schedule.docFeeCents;
  return {
    titleFee: dealerFees.titleFee,
    registrationFee: dealerFees.registrationFee,
    docFee: doc === null || !Number.isFinite(doc) ? null : doc / 100,
    docFeeCapCents: docFeeCapCents(schedule),
    occcFiling: schedule.occcFiling && Number.isFinite(schedule.occcFiling.maxCents) ? { ...schedule.occcFiling } : null,
    scheduleVersion: schedule.version,
    source: schedule.source,
    takenAt: now.toISOString(),
    rulebookAsOf: schedule.rulebookAsOf,
  };
}

export type DealFeesRead = { kind: "absent" } | { kind: "malformed" } | { kind: "valid"; fees: DealFees };

const finiteMoney = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * The sale's own copy of its fees. "absent" on a sale started before copies
 * existed; "malformed" on a copy nobody could have written through the desk,
 * which the filing refuses.
 */
export function readDealFees(stepData: unknown): DealFeesRead {
  if (!isRecord(stepData)) return { kind: "absent" };
  const held = stepData[FEES_KEY];
  if (held === undefined || held === null) return { kind: "absent" };
  if (!isRecord(held)) return { kind: "malformed" };
  const doc = held.docFee;
  const filing = held.occcFiling;
  const filingOk =
    filing === null ||
    (isRecord(filing) &&
      typeof filing.maxCents === "number" &&
      Number.isInteger(filing.maxCents) &&
      ["filedOn", "effectiveOn", "licenseOrNmls", "location"].every((key) => typeof filing[key] === "string"));
  const ok =
    finiteMoney(held.titleFee) &&
    finiteMoney(held.registrationFee) &&
    (doc === null || finiteMoney(doc)) &&
    typeof held.docFeeCapCents === "number" &&
    Number.isInteger(held.docFeeCapCents) &&
    filingOk &&
    typeof held.scheduleVersion === "number" &&
    Number.isInteger(held.scheduleVersion) &&
    held.scheduleVersion >= 0 &&
    (held.source === "owner" || held.source === "config") &&
    typeof held.takenAt === "string" &&
    typeof held.rulebookAsOf === "string";
  if (!ok) return { kind: "malformed" };
  return {
    kind: "valid",
    fees: {
      titleFee: held.titleFee as number,
      registrationFee: held.registrationFee as number,
      docFee: doc as number | null,
      docFeeCapCents: held.docFeeCapCents as number,
      occcFiling: filing === null ? null : ({ ...(filing as OcccDocFeeFiling) }),
      scheduleVersion: held.scheduleVersion as number,
      source: held.source as "owner" | "config",
      takenAt: held.takenAt as string,
      rulebookAsOf: held.rulebookAsOf as string,
    },
  };
}

/** Merge the copy in without disturbing the rest of `step_data`. */
export function writeDealFees(stepData: unknown, fees: DealFees): Record<string, unknown> {
  const base = isRecord(stepData) ? { ...stepData } : {};
  base[FEES_KEY] = { ...fees, occcFiling: fees.occcFiling ? { ...fees.occcFiling } : null };
  return base;
}

/** The config's own lines (the default every caller had before copies existed). */
export function configFeeLines(): DealFeeDisplay {
  const doc = dealerFees.docFee;
  const set = doc !== null && Number.isFinite(doc);
  return { titleFee: dealerFees.titleFee, docFee: set ? (doc as number) : 0, registrationFee: dealerFees.registrationFee, docFeeSet: set };
}

/**
 * The three lines the money adds, from a sale's fee copy. A missing doc fee
 * is 0 in the arithmetic and "Not set" on screen (`docFeeSet`).
 *
 * `noRegistration` is the tow-away salvage sale: nothing is registered, so
 * there is no registration line, and the out-the-door split, the total and
 * the salvage bill of sale then agree.
 */
export function dealFeeLines(fees: Pick<DealFees, "titleFee" | "docFee" | "registrationFee">, options: { noRegistration?: boolean } = {}): DealFeeDisplay {
  const set = fees.docFee !== null && Number.isFinite(fees.docFee);
  return {
    titleFee: fees.titleFee,
    docFee: set ? (fees.docFee as number) : 0,
    registrationFee: options.noRegistration ? 0 : fees.registrationFee,
    docFeeSet: set,
  };
}

/**
 * The lines a sale computes with, off its own data alone (pure: for the
 * browser and the freeze rules): the sale's copy when it holds one with a
 * doc fee, else `fallback` (the server's resolved fees), else the config's.
 */
export function feeLinesOf(stepData: unknown, fallback?: DealFeeDisplay | null): DealFeeDisplay {
  const read = readDealFees(stepData);
  if (read.kind === "valid" && read.fees.docFee !== null) return withGovernmentFees(dealFeeLines(read.fees), stepData);
  return fallback ?? withGovernmentFees(configFeeLines(), stepData);
}

/**
 * The lines with the sale's confirmed government fees in place of the desk's
 * title and registration defaults, when the sale holds a valid record of
 * them (government-fees.ts). Unchanged when it holds none.
 */
export function withGovernmentFees(lines: DealFeeDisplay, stepData: unknown): DealFeeDisplay {
  const gov = readGovernmentFees(stepData);
  if (gov.kind !== "valid") return lines;
  return {
    ...lines,
    titleFee: gov.fees.titleFee,
    registrationFee: gov.fees.registrationFee,
    inspectionFee: gov.fees.inspectionFee,
    plateFee: gov.fees.plateFee,
    governmentConfirmed: true,
  };
}

// ---------------------------------------------------------------------------
// At filing
// ---------------------------------------------------------------------------

/**
 * The dealer-charges refusals at filing. "feeOverLimit" covers both doc fee
 * limits; which one is said by `overLimitKind` ($225.00 with no OCCC filing
 * in force, or the maximum of a filing that is), so each refusal names the
 * limit that applies.
 */
export type DealerChargesProblem =
  | "feeOverLimit"
  | "feeAboveToday"
  | "otherDealerFee"
  | "titleFeeNotState"
  | "feeRecordTampered";

/**
 * Whether the sale's doc fee is within the limit under the law as it stands
 * on the business date: $225.00, or a complete OCCC filing still recorded on
 * the current schedule, in force on that date (filed and taken effect), whose
 * maximum is at or above it. Rechecked at every filing, so a filing removed
 * from the schedule refuses an open sale that relied on it.
 */
export function docFeeWithinLimit(
  docFee: number | null,
  schedule: Pick<FeeScheduleFields, "occcFiling">,
  onDate: string = businessDateToday(),
): boolean {
  return docFeeLimitProblem(docFee, schedule, onDate) === null;
}

/**
 * Why a doc fee is over its limit on a business date, or null when it is
 * not: "feeOverLimit" above $225.00 with no OCCC filing in force,
 * "feeOverFiledMax" above the maximum of a filing that is in force.
 */
export function docFeeLimitProblem(
  docFee: number | null,
  schedule: Pick<FeeScheduleFields, "occcFiling">,
  onDate: string = businessDateToday(),
): "feeOverLimit" | "feeOverFiledMax" | null {
  if (docFee === null) return null;
  const cents = Math.round(docFee * 100);
  if (!Number.isFinite(cents) || cents < 0) return "feeOverLimit";
  if (cents <= PRESUMED) return null;
  const filing = schedule.occcFiling;
  if (!filing || !occcFilingInForce(filing, onDate)) return "feeOverLimit";
  const problems = validateFeeSchedule(
    { docFeeCents: cents, occcFiling: filing, deputy: { isDeputy: false, feeCents: 0 }, vit: { year: 0, inBusinessJan1: null, passesThrough: null, unitFactor: null } },
    { today: onDate },
  );
  if (problems.length === 0) return null;
  return problems.some((problem) => problem.code === "docFeeOverFiled") ? "feeOverFiledMax" : "feeOverLimit";
}

/** Dollars typed or stored, in cents; null when empty, NaN when not a figure. */
function postedCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
}

/**
 * What the posted document says about the dealer charges, against the sale's
 * fee copy and the current schedule: no other dealer fee, the doc fee within
 * the limit on the business date and equal to the sale's own, the sale's own
 * no higher than today's (one documentary fee for every buyer: a sale that
 * started under a higher fee takes today's before it files), and the title
 * fee one of the state's two figures. Null when every one holds.
 */
export function postedDealerChargesProblem(
  formData: Record<string, unknown>,
  fees: Pick<DealFees, "docFee">,
  schedule: Pick<FeeScheduleFields, "occcFiling"> & Partial<Pick<FeeScheduleFields, "docFeeCents">>,
  onDate: string = businessDateToday(),
): DealerChargesProblem | null {
  const other = postedCents(formData.otherFees);
  if (other !== null && (Number.isNaN(other) || other !== 0)) return "otherDealerFee";
  if (typeof formData.otherFeesDescription === "string" && formData.otherFeesDescription.trim() !== "") return "otherDealerFee";

  const doc = postedCents(formData.docFee);
  if (doc !== null) {
    if (Number.isNaN(doc)) return "feeOverLimit";
    if (docFeeLimitProblem(doc / 100, schedule, onDate)) return "feeOverLimit";
    const own = Math.round((fees.docFee ?? 0) * 100);
    if (doc !== own) return "feeRecordTampered";
  }
  if (docFeeLimitProblem(fees.docFee, schedule, onDate)) return "feeOverLimit";
  /*
    One documentary fee for every buyer: platform policy (rulebook 1.1 and
    5.1, on Fin. Code §348.006(c)(1), "must charge the documentary fee to
    cash buyers and credit buyers"; and the FTC staff position that a fee
    that varies between buyers may not be advertised at its lower figure). A
    sale may keep a LOWER fee it started with after the owner raises it,
    never a higher one after the owner lowers it.
  */
  const today = schedule.docFeeCents;
  if (
    fees.docFee !== null &&
    today !== null &&
    today !== undefined &&
    Number.isFinite(today) &&
    Math.round(fees.docFee * 100) > today
  ) {
    return "feeAboveToday";
  }

  const title = postedCents(formData.titleFee);
  if (title !== null && !STATE_TITLE_FEE_DOLLARS.some((figure) => Math.round(figure * 100) === title)) {
    return "titleFeeNotState";
  }
  return null;
}

/**
 * Whether a sale's copy says what the record says it should: the doc fee and
 * the OCCC filing of the schedule version it names (the change log's `next`
 * for an owner version, the config seed for version 0). A copy that matches
 * neither was not written by the desk.
 */
export function dealFeesMatchRecord(
  fees: DealFees,
  recorded: Pick<FeeScheduleFields, "docFeeCents" | "occcFiling"> | null,
): boolean {
  if (!recorded) return false;
  const docCents = fees.docFee === null ? null : Math.round(fees.docFee * 100);
  const recordedDoc = recorded.docFeeCents === null || !Number.isFinite(recorded.docFeeCents) ? null : recorded.docFeeCents;
  if (docCents !== recordedDoc) return false;
  const a = fees.occcFiling;
  const b = recorded.occcFiling && Number.isFinite(recorded.occcFiling.maxCents) ? recorded.occcFiling : null;
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.maxCents === b.maxCents &&
    a.filedOn === b.filedOn &&
    a.effectiveOn === b.effectiveOn &&
    a.licenseOrNmls === b.licenseOrNmls &&
    a.location === b.location
  );
}

/**
 * Whether a copy's government lines are the desk's own: every copy is
 * written with the config's title and registration figures
 * (`dealFeesFromSchedule`), so a copy holding any other figure was not
 * written by the desk. (A sale's confirmed webDEALER figures live apart, in
 * `step_data.governmentFees`, and are checked on their own.)
 */
export function dealFeesGovernmentLinesAreDesks(fees: Pick<DealFees, "titleFee" | "registrationFee">): boolean {
  return (
    Math.round(fees.titleFee * 100) === Math.round(dealerFees.titleFee * 100) &&
    Math.round(fees.registrationFee * 100) === Math.round(dealerFees.registrationFee * 100)
  );
}

/**
 * Which limit a "feeOverLimit" refusal is about: "filedMax" when an OCCC
 * filing is in force and the fee is above its maximum, else "noFiling".
 */
export function overLimitKind(
  formData: Record<string, unknown>,
  fees: Pick<DealFees, "docFee">,
  schedule: Pick<FeeScheduleFields, "occcFiling">,
  onDate: string = businessDateToday(),
): "noFiling" | "filedMax" {
  const doc = postedCents(formData.docFee);
  const posted = doc !== null && !Number.isNaN(doc) ? docFeeLimitProblem(doc / 100, schedule, onDate) : null;
  const own = docFeeLimitProblem(fees.docFee, schedule, onDate);
  return (posted ?? own) === "feeOverFiledMax" ? "filedMax" : "noFiling";
}

/** The "feeOverLimit" refusal when the limit is a filed maximum in force. */
export const FEE_OVER_FILED_MAX_MESSAGE =
  "The documentary fee on this sale is above the maximum filed with the OCCC (7 TAC §84.205(d)). It can never be more than the filed amount. Apply today's fees to this sale.";

/** The refusals at filing, in English (FILING_GATE_MESSAGES carries them; the screens use the catalogue). */
export const DEALER_CHARGES_MESSAGES: Record<DealerChargesProblem | "feeSettingsUnreadable", string> = {
  feeOverLimit: `The documentary fee on this sale is above what Texas allows without an OCCC filing in force (${centsAsDollars(PRESUMED)}, ${DOC_FEE.shortCitation}). Record the OCCC filing under Your Fees, or apply today's fees to this sale.`,
  feeAboveToday: "The documentary fee on this sale is higher than today's. Every buyer pays the same documentary fee: apply today's fees to this sale, then file.",
  otherDealerFee: "This document carries a dealer fee Texas does not allow as a line of its own (Tex. Fin. Code §348.005). Put it in the vehicle price instead.",
  titleFeeNotState: `The title fee must be the state's figure, ${centsAsDollars(STATE_FEES_2026.titleFee.cents.nonattainmentOrAffectedCounty)} or ${centsAsDollars(STATE_FEES_2026.titleFee.cents.otherCounty)} (Transp. Code §501.138(a)).`,
  feeRecordTampered: "The fees on this sale do not match the fee record. Apply today's fees to this sale, then file.",
  feeSettingsUnreadable: "The fee settings could not be read. Nothing was filed.",
};

/** For the screens and the tests: the rulebook's answer on a combined cap, in one place. */
export const NO_COMBINED_CAP = {
  statutoryAggregateCap: COMBINED.statutoryAggregateCap,
  citation: COMBINED.citation,
  otherChargesGoTo: OTHER_DEALER_CHARGES.routeTo,
  vitLabel: VIT_REIMBURSEMENT.label,
} as const;
