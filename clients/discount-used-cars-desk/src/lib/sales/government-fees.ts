import {
  STATE_FEES_2026,
  STATE_TITLE_FEE_DOLLARS,
  centsAsDollars,
  isEmissionsCounty,
  localFeeCentsForCounty,
  titleFeeCentsForCounty,
} from "@/lib/legal/texas-dealer-fees";

/**
 * A sale's government fees, as webDEALER computes them (rulebook
 * texas-dealer-fees.md section 2 and 5.3).
 *
 * Every government line on the buyer's paper must be the amount actually
 * paid to the public official (Tex. Fin. Code §348.005(1), (3); OCCC Agreed
 * Order L25-087), and webDEALER, where every Texas dealer files the title
 * and registration (Transp. Code §520.0055), computes them. The desk cannot
 * compute every one itself: the emissions fee's sources conflict, the
 * federal nonattainment county list is not compiled, and a county's local fee
 * changes every January. So a person reads webDEALER's computed fees for this
 * sale and records them here, and until they do a document printing these
 * lines is not filed (refile-gates.ts, `governmentFeesUnconfirmed`).
 *
 * Four lines, as the paper prints them:
 *
 *   title fee            $33 or $28 by the buyer's county (Transp. Code
 *                        §501.138(a)); never $28 for a county known to pay $33.
 *   registration fee     base plus TexasSure, local county fees, processing
 *                        and handling, and the emissions fee where it applies:
 *                        the registration side of webDEALER's receipt.
 *   inspection program   its own line, never inside the registration line
 *   replacement fee      (Transp. Code §548.510; OCCC Bulletin B25-1).
 *   license plate fee    exactly $10 on every retail sale (43 TAC
 *                        §215.155(e)), unless the vehicle is exempt from
 *                        registration fees (§502.453, §502.456).
 *
 * Pure, safe in the browser. Written only by the server action
 * (`confirmGovernmentFeesAction`); `step_data.governmentFees` is protected
 * like the fee copy (step-data-write.ts), and filing validates it again.
 */

export const GOVERNMENT_FEES_KEY = "governmentFees";

export type GovernmentFees = {
  /** Dollars. */
  titleFee: number;
  /** Dollars: the registration side of webDEALER's receipt, without the two lines below. */
  registrationFee: number;
  /** Dollars: the inspection program replacement fee, its own line. */
  inspectionFee: number;
  /** Dollars: the $10 license plate fee, or 0 on a vehicle exempt from registration fees. */
  plateFee: number;
  /** Exempt from registration fees (Transp. Code §502.453, §502.456): no plate fee, registration may be $0. */
  exemptFromRegistrationFees: boolean;
  /** The buyer's county of residence the figures are for. */
  county: string;
  source: "webDEALER";
  confirmedAt: string;
  confirmedByName: string;
  confirmedById: string | null;
};

/** What the screen posts: typed text and plain answers. */
export type GovernmentFeesInput = {
  titleFee: string;
  registrationFee: string;
  inspectionFee: string;
  plateFee: string;
  exemptFromRegistrationFees: boolean;
  county: string;
};

export const GOVERNMENT_FEES_PROBLEM_CODES = [
  "govCountyMissing",
  "govNotDollars",
  "govTitleFeeNotState",
  "govTitleFeeCounty",
  "govRegistrationOutOfRange",
  "govInspectionFee",
  "govPlateFee",
] as const;

export type GovernmentFeesProblemCode = (typeof GOVERNMENT_FEES_PROBLEM_CODES)[number];

export type GovernmentFeesProblem = {
  code: GovernmentFeesProblemCode;
  field: keyof GovernmentFeesInput;
  params?: Record<string, string>;
};

const cents = (dollars: number) => Math.round(dollars * 100);

/**
 * The registration side's bounds for a car or light truck of 10,000 lb or
 * less in 2026, from the rulebook's figures (section 2.1), so a typo is
 * caught before it is printed:
 *
 *   least: base $50.75 (Transp. Code §502.252(a)) + TexasSure $1
 *          (§502.357(a)) + processing and handling $4.75 (§502.1911);
 *          no local fee, no emissions fee.
 *   most:  base $54.00 (§502.252(a), 6,001-10,000 lb) + TexasSure $2.00
 *          (both §502.357(a) sentences) + local fees $31.50 (§§502.401-.403)
 *          + processing and handling $4.75 + the rule's highest emissions
 *          figure $8.50 (30 TAC §114.53(d)(2)(A)) + the electric vehicle fee
 *          $200 (§502.360).
 *
 * A vehicle exempt from registration fees may record $0.
 */
export const REGISTRATION_BOUNDS_CENTS = {
  least:
    STATE_FEES_2026.registrationBase.cents.upTo6000lb +
    STATE_FEES_2026.texasSureFee.cents +
    STATE_FEES_2026.processingHandlingFee.cents,
  most:
    STATE_FEES_2026.registrationBase.cents.from6001to10000lb +
    2 * STATE_FEES_2026.texasSureFee.cents +
    STATE_FEES_2026.localCountyFee.statutoryMaxCents +
    STATE_FEES_2026.processingHandlingFee.cents +
    STATE_FEES_2026.emissionsFeeAtRegistration.ruleCentsLirapObd +
    STATE_FEES_2026.evFee.cents.annual,
} as const;

/** The inspection program replacement fee's lawful figures, and $0 for an exempt vehicle (§548.511). */
export const INSPECTION_FEE_CENTS: readonly number[] = [
  0,
  STATE_FEES_2026.inspectionReplacementFee.cents.usedOrAnnual,
  STATE_FEES_2026.inspectionReplacementFee.cents.newTwoYearFirstRegistration,
  STATE_FEES_2026.inspectionReplacementFee.cents.rentalThreeYear,
];

/** "Harris" from "Harris County", trimmed, for comparing counties. */
export function countyName(county: string | null | undefined): string {
  return (county ?? "").normalize("NFC").replace(/\s+/g, " ").trim().replace(/\s+county$/i, "");
}

export function sameCounty(a: string | null | undefined, b: string | null | undefined): boolean {
  return countyName(a).toLowerCase() === countyName(b).toLowerCase();
}

function typedDollarCents(typed: unknown): number | null {
  if (typeof typed === "number") return Number.isFinite(typed) && typed >= 0 ? Math.round(typed * 100) : Number.NaN;
  const digits = String(typed ?? "").replace(/[$,\s]/g, "");
  if (digits === "") return null;
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(digits)) return Number.NaN;
  return Math.round(Number(digits) * 100);
}

/**
 * Every reason these figures may not stand, against the cited lines. Empty
 * when they may. Takes anything (a stored record, a posted form).
 */
export function validateGovernmentFees(fees: Partial<Record<keyof GovernmentFees, unknown>>): GovernmentFeesProblem[] {
  const problems: GovernmentFeesProblem[] = [];
  const county = typeof fees.county === "string" ? countyName(fees.county) : "";
  if (!county) problems.push({ code: "govCountyMissing", field: "county" });

  const exempt = fees.exemptFromRegistrationFees === true;
  const money = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? cents(value) : null;

  const title = money(fees.titleFee);
  if (title === null) {
    problems.push({ code: "govNotDollars", field: "titleFee" });
  } else if (!STATE_TITLE_FEE_DOLLARS.some((figure) => cents(figure) === title)) {
    problems.push({ code: "govTitleFeeNotState", field: "titleFee" });
  } else if (county && titleFeeCentsForCounty(county) === STATE_FEES_2026.titleFee.cents.nonattainmentOrAffectedCounty && title !== titleFeeCentsForCounty(county)) {
    problems.push({ code: "govTitleFeeCounty", field: "titleFee", params: { county, fee: centsAsDollars(STATE_FEES_2026.titleFee.cents.nonattainmentOrAffectedCounty) } });
  }

  const registration = money(fees.registrationFee);
  if (registration === null) {
    problems.push({ code: "govNotDollars", field: "registrationFee" });
  } else {
    const least = exempt ? 0 : REGISTRATION_BOUNDS_CENTS.least;
    if (registration < least || registration > REGISTRATION_BOUNDS_CENTS.most) {
      problems.push({
        code: "govRegistrationOutOfRange",
        field: "registrationFee",
        params: { least: centsAsDollars(least), most: centsAsDollars(REGISTRATION_BOUNDS_CENTS.most) },
      });
    }
  }

  const inspection = money(fees.inspectionFee);
  if (inspection === null) {
    problems.push({ code: "govNotDollars", field: "inspectionFee" });
  } else if (!INSPECTION_FEE_CENTS.includes(inspection)) {
    problems.push({ code: "govInspectionFee", field: "inspectionFee" });
  }

  const plate = money(fees.plateFee);
  if (plate === null) {
    problems.push({ code: "govNotDollars", field: "plateFee" });
  } else if (plate !== (exempt ? 0 : STATE_FEES_2026.buyerPlateFee.cents)) {
    problems.push({ code: "govPlateFee", field: "plateFee", params: { fee: centsAsDollars(STATE_FEES_2026.buyerPlateFee.cents) } });
  }
  return problems;
}

/** The typed answers as figures, with every problem. */
export function parseGovernmentFeesInput(input: unknown): {
  figures: Pick<GovernmentFees, "titleFee" | "registrationFee" | "inspectionFee" | "plateFee" | "exemptFromRegistrationFees" | "county">;
  problems: GovernmentFeesProblem[];
} {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const problems: GovernmentFeesProblem[] = [];
  const read = (key: "titleFee" | "registrationFee" | "inspectionFee" | "plateFee"): number => {
    const value = typedDollarCents(raw[key]);
    if (value === null || !Number.isFinite(value)) {
      problems.push({ code: "govNotDollars", field: key });
      return Number.NaN;
    }
    return value / 100;
  };
  const figures = {
    titleFee: read("titleFee"),
    registrationFee: read("registrationFee"),
    inspectionFee: read("inspectionFee"),
    plateFee: read("plateFee"),
    exemptFromRegistrationFees: raw.exemptFromRegistrationFees === true,
    county: typeof raw.county === "string" ? countyName(raw.county) : "",
  };
  const seen = new Set(problems.map((problem) => `${problem.code}:${problem.field}`));
  for (const problem of validateGovernmentFees(figures)) {
    const key = `${problem.code}:${problem.field}`;
    if (!seen.has(key)) problems.push(problem);
  }
  return { figures, problems };
}

export type GovernmentFeesRead = { kind: "absent" } | { kind: "malformed" } | { kind: "valid"; fees: GovernmentFees };

/** The sale's recorded government fees: absent, valid, or a record the desk could not have written. */
export function readGovernmentFees(stepData: unknown): GovernmentFeesRead {
  if (!stepData || typeof stepData !== "object" || Array.isArray(stepData)) return { kind: "absent" };
  const held = (stepData as Record<string, unknown>)[GOVERNMENT_FEES_KEY];
  if (held === undefined || held === null) return { kind: "absent" };
  if (typeof held !== "object" || Array.isArray(held)) return { kind: "malformed" };
  const record = held as Record<string, unknown>;
  if (validateGovernmentFees(record).length > 0) return { kind: "malformed" };
  if (record.source !== "webDEALER" || typeof record.confirmedAt !== "string" || typeof record.confirmedByName !== "string") {
    return { kind: "malformed" };
  }
  return {
    kind: "valid",
    fees: {
      titleFee: record.titleFee as number,
      registrationFee: record.registrationFee as number,
      inspectionFee: record.inspectionFee as number,
      plateFee: record.plateFee as number,
      exemptFromRegistrationFees: record.exemptFromRegistrationFees === true,
      county: countyName(record.county as string),
      source: "webDEALER",
      confirmedAt: record.confirmedAt,
      confirmedByName: record.confirmedByName,
      confirmedById: typeof record.confirmedById === "string" ? record.confirmedById : null,
    },
  };
}

/** The record as the patch writes it (only the one key). */
export function governmentFeesPatch(fees: GovernmentFees): Record<string, unknown> {
  return { [GOVERNMENT_FEES_KEY]: { ...fees } };
}

/**
 * What the desk can work out on its own, to show beside the boxes as a
 * check (never filed): the title fee where the county is known to pay $33,
 * the registration side where the county's 2026 local fee is in the table,
 * the vehicle's weight is known and no emissions fee applies, the used-car
 * inspection fee, and the $10 plate fee. Null where webDEALER alone can say.
 */
export function governmentEstimate(
  county: string | null | undefined,
  emptyWeightLbs: number | null | undefined,
  onDate: string,
): { titleFee: number | null; registrationFee: number | null; inspectionFee: number; plateFee: number; emissions: boolean } {
  const name = countyName(county);
  const title = titleFeeCentsForCounty(name);
  const local = localFeeCentsForCounty(name);
  const emissions = isEmissionsCounty(name, onDate);
  const weight = typeof emptyWeightLbs === "number" && Number.isFinite(emptyWeightLbs) && emptyWeightLbs > 0 ? emptyWeightLbs : null;
  const base =
    weight === null
      ? null
      : weight <= 6000
        ? STATE_FEES_2026.registrationBase.cents.upTo6000lb
        : weight <= 10000
          ? STATE_FEES_2026.registrationBase.cents.from6001to10000lb
          : null;
  const registration =
    base !== null && local !== null && !emissions
      ? base + STATE_FEES_2026.texasSureFee.cents + local + STATE_FEES_2026.processingHandlingFee.cents
      : null;
  return {
    titleFee: title === null ? null : title / 100,
    registrationFee: registration === null ? null : registration / 100,
    inspectionFee: STATE_FEES_2026.inspectionReplacementFee.cents.usedOrAnnual / 100,
    plateFee: STATE_FEES_2026.buyerPlateFee.cents / 100,
    emissions,
  };
}

/** The refusals, in English (the action's `error`; the screens use the catalogue). */
export function governmentFeesProblemSentence(problem: GovernmentFeesProblem): string {
  const params = problem.params ?? {};
  switch (problem.code) {
    case "govCountyMissing":
      return "Type the county the buyer lives in. The fees depend on it.";
    case "govNotDollars":
      return "Type each fee as webDEALER shows it, like 51.75.";
    case "govTitleFeeNotState":
      return "The title fee is $33.00 or $28.00 (Transp. Code §501.138(a)). Type webDEALER's figure.";
    case "govTitleFeeCounty":
      return `${params.county} County pays the ${params.fee} title fee (Transp. Code §501.138(a); Health & Safety Code §386.001(2)).`;
    case "govRegistrationOutOfRange":
      return `A car or light truck registers for ${params.least} to ${params.most} in Texas in 2026. Check webDEALER's figure.`;
    case "govInspectionFee":
      return "The inspection program replacement fee is $7.50 on a used vehicle (Transp. Code §548.510), or $0 on an exempt one. Type webDEALER's figure.";
    case "govPlateFee":
      return `The license plate fee is exactly ${params.fee} on every retail sale (43 TAC §215.155(e)), and $0 only on a vehicle exempt from registration fees.`;
  }
}

/** The documents that print the government lines, on a sale the dealer files the title for. */
export const GOVERNMENT_LINE_DOCUMENTS = ["billOfSale", "financing", "vehicleResponsibility"] as const;

export type GovernmentFeesFilingProblem = "governmentFeesUnconfirmed" | "governmentFeesInvalid" | "governmentFeesCountyChanged";

/**
 * The filing's refusal over the sale's government fees, or null:
 *
 *   governmentFeesInvalid        the sale holds a record the desk could not
 *                                have written (any document).
 *   governmentFeesCountyChanged  the 130-U names a county other than the one
 *                                the fees were recorded for.
 *   governmentFeesUnconfirmed    a document printing the government lines,
 *                                on a sale that registers, with none
 *                                recorded. `allowUnset` (DESK_ALLOW_UNSET_FACTS,
 *                                demos and local walks only) lifts this one
 *                                alone: an unrecorded per-sale figure is an
 *                                unset fact, never a limit.
 */
export function governmentFeesFilingProblem(input: {
  documentType: string;
  stepData: unknown;
  /** The tow-away sale registers nothing: no government lines to record. */
  registersNothing: boolean;
  /** The county the 130-U posts. */
  postedCounty?: unknown;
  allowUnset: boolean;
}): GovernmentFeesFilingProblem | null {
  const read = readGovernmentFees(input.stepData);
  if (read.kind === "malformed") return "governmentFeesInvalid";
  if (
    input.documentType === "form130U" &&
    read.kind === "valid" &&
    typeof input.postedCounty === "string" &&
    countyName(input.postedCounty) !== "" &&
    !sameCounty(input.postedCounty, read.fees.county)
  ) {
    return "governmentFeesCountyChanged";
  }
  if (input.registersNothing) return null;
  if (!(GOVERNMENT_LINE_DOCUMENTS as readonly string[]).includes(input.documentType)) return null;
  if (read.kind === "absent" && !input.allowUnset) return "governmentFeesUnconfirmed";
  return null;
}

export const GOVERNMENT_FEES_FILING_MESSAGES: Record<GovernmentFeesFilingProblem, string> = {
  governmentFeesUnconfirmed:
    "Record this sale's government fees from webDEALER first: the title fee, the registration, the inspection program fee and the license plate fee. A government fee on paper must be the amount paid to the state (Tex. Fin. Code §348.005).",
  governmentFeesInvalid: "This sale's government fees are not figures the desk recorded. Record them again from webDEALER.",
  governmentFeesCountyChanged:
    "The buyer's county on this form is not the county the government fees were recorded for. Record the government fees again from webDEALER for the buyer's county.",
};
