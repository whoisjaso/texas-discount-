/**
 * The Texas fee limits, as the desk enforces them.
 *
 * The desk's mirror of the machine-readable block (section 5.10) of the
 * rulebook in the premium-dealer-build skill,
 * `.claude/skills/premium-dealer-build/references/texas-dealer-fees.md`,
 * as of RULEBOOK_AS_OF. Nothing here is invented: every figure carries the
 * citation, the date it took effect and the status the rulebook gives it.
 * A test pins these figures to the rulebook's JSON block, and the skill's
 * `scripts/check-fee-module.cjs` diffs them on every build and every
 * January. If the law changes, the rulebook changes first and this file
 * second.
 *
 * Amounts are in cents. Pure: no dealer fact lives here (the dealer's own
 * figures are the owner's, saved at onboarding; see `fee-schedule.ts`), and
 * it is safe in the browser.
 *
 * Never write the phrase that names the venue county in full here: the
 * dealer-facts guard bans it outside the config. The county tax office's
 * form is cited as "HCTax MV-065" and tables are keyed by bare county name.
 */

/** The rulebook's own "as of" date. Re-checked every build and every January. */
export const RULEBOOK_AS_OF = "2026-10-03";

/** Where the rulebook lives, relative to the agency repository's root. */
export const RULEBOOK_PATH = ".claude/skills/premium-dealer-build/references/texas-dealer-fees.md";

/** Dates on which something in the rulebook is known to change (rulebook section 6.3). */
export const RECHECK_DATES = [
  { date: "2026-10-16", what: "Finance Commission meeting: OCCC MV licensing draft (7 TAC §84.604, NMLS); re-check §84.205(c)(4)" },
  { date: "2026-11-01", what: "Bexar County joins the emissions program ($18.50 station cap; 30 TAC §114.50(a)(2), §114.53(a)(2))" },
  { date: "2027-01-01", what: "New TxDMV Fee Chart 1C: county local fees for 2027" },
] as const;

/**
 * How sure the rulebook is of a figure (its "Status labels").
 *
 *   confirmed        primary text read, confirmed by both fact-checkers
 *   corrected        the first research had another value; this one is used
 *   agencyGuidance   no statute or rule, but an agency publication says it
 *   unverified       no primary source found; the safer handling applies
 *   platformPolicy   the desk's own safer choice where the law is silent
 *   conflicting      the sources disagree; the lower limit is used
 */
export type LegalStatus =
  | "confirmed"
  | "corrected"
  | "agencyGuidance"
  | "unverified"
  | "platformPolicy"
  | "conflicting";

export type LegalFigure = {
  citation: string;
  /** The date the figure took effect, as the rulebook gives it. */
  effective: string;
  status: LegalStatus;
};

// ---------------------------------------------------------------------------
// Dealer-set (the owner answers these at onboarding)
// ---------------------------------------------------------------------------

/**
 * The documentary fee on a Ch. 348 motor vehicle sale (rulebook 1.1).
 *
 * $225.00 or less is presumed reasonable. More only up to a maximum the
 * dealer has filed with the OCCC, and never more than that. Every charge for
 * handling or processing documents, whatever it is called, is this fee and
 * counts toward the limit. The same for franchised and independent dealers.
 */
export const DOC_FEE = {
  presumedReasonableMaxCents: 22500,
  /** The five facts a filing above the presumed amount needs, all required. */
  aboveMaxRequires: ["occcFiledMaxCents", "occcFiledOn", "occcEffectiveOn", "occcLicenseOrNmlsId", "location"] as const,
  neverAbove: "occcFiledMaxCents",
  onePerLocation: true,
  sameForCashAndCredit: true,
  editablePerDeal: false,
  sameForFranchisedAndIndependent: true,
  /** Platform policy: the limit and the notice apply to cash-only dealers too. */
  appliesToCashOnlyDealers: "platform policy",
  /** Labels that are the documentary fee under another name (rulebook 1.3). */
  bucketIncludesAnyChargeFor: [
    "documentary",
    "documentation",
    "doc",
    "admin",
    "administrative",
    "processing",
    "paperwork",
    "e-file",
    "electronic filing",
    "filing",
    "title service",
    "title processing",
    "compliance",
    "plate database",
  ] as const,
  taxable: false,
  citation: "Tex. Fin. Code §348.006(c), (e), (f); 7 TAC §84.205(b)-(d) (49 TexReg 4903); OCCC Bulletin B16-5 rev. 2024-07-02",
  /** The one-line citation the screens show beside the limit. */
  shortCitation: "7 TAC §84.205(b)(1)",
  effective: "2024-07-11",
  status: "confirmed",
} as const satisfies LegalFigure & Record<string, unknown>;

/**
 * Motorcycles, mopeds, ATVs, towable RVs and watercraft on a Ch. 345
 * contract (rulebook 1.1). A hard maximum: no filing raises it. The desk
 * does not write these contracts; the owner's answer is recorded only.
 */
export const DOC_FEE_CH345 = {
  maxCentsLandOnlyOrWatercraftOnly: 20000,
  maxCentsLandAndWatercraft: 25000,
  filingException: false,
  citation: "Tex. Fin. Code §345.251(b)-(d); 7 TAC §86.201(c)-(e) (49 TexReg 6736)",
  effective: "2024-09-05",
  status: "confirmed",
} as const satisfies LegalFigure & Record<string, unknown>;

/** A dealer deputized by its county tax office (rulebook 1.4). On top of the doc fee. */
export const DEALER_DEPUTY_TITLE_FEE = {
  maxCents: 1000,
  defaultCents: 0,
  separateFromDocFee: true,
  citation: "43 TAC §217.168(b)(2) (49 TexReg 8980); Transp. Code §520.0071",
  effective: "2025-07-01",
  status: "confirmed",
} as const satisfies LegalFigure & Record<string, unknown>;

/**
 * The plate-database compliance fee (rulebook 1.5). The statute allows up to
 * $20; TxDMV guidance forbids it. The sources conflict, so the lower limit
 * applies: off. If counsel ever approves it, it counts inside the doc fee.
 */
export const PLATE_DATABASE_FEE = {
  statutoryMaxCents: 2000,
  platformMaxCents: 0,
  enableOnlyWithCounselApproval: true,
  ifEnabledCountsInDocFeeBucket: true,
  citation: "Transp. Code §503.0631(f) vs TxDMV Dealer Manual 2026 p. 135 and HB 718 FAQ 2025-03-21 (conflict; lower limit chosen)",
  effective: "statute 2007-09-01; guidance 2025-2026",
  status: "conflicting",
} as const satisfies LegalFigure & Record<string, unknown>;

/** The vehicle inventory tax reimbursement (rulebook 1.6). A formula, not a figure. */
export const VIT_REIMBURSEMENT = {
  maxFormula: "netSalesPriceCents * unitPropertyTaxFactor",
  zeroWhen: ["notInBusinessOnJan1", "saleToDealer", "fleetSale5PlusSameBuyerSameYear", "subsequentSaleSameVehicleSameYear"] as const,
  mayBeLoweredOrWaived: true,
  label: "Dealer's Inventory Tax",
  taxable: false,
  citation: "Tax Code §23.121, §23.122(b), (g); §152.002(b)(7); Comptroller 96-254 (rev. 3/2026); OCCC Interpretation 94-1",
  shortCitation: "Tax Code §23.121-.122",
  effective: "current",
  status: "confirmed",
} as const satisfies LegalFigure & Record<string, unknown>;

/** Prep, reconditioning, "dealer service", add-ons: never a line of their own (rulebook 1.3). */
export const OTHER_DEALER_CHARGES = {
  separateLineMaxCents: 0,
  routeTo: "vehiclePrice",
  taxable: true,
  includeInAdvertisedPrice: true,
  citation: "Tex. Fin. Code §§348.004(c), 348.005; OCCC Agreed Orders L24-00112, L24-00113, L25-035, L25-038; 43 TAC §215.250(a) (49 TexReg 2704)",
  effective: "§348.005 2017-09-01; §215.250 2024-06-01",
  status: "confirmed",
} as const satisfies LegalFigure & Record<string, unknown>;

/**
 * Is there one combined cap? No (rulebook section 4). A finding from the
 * absence of any such provision in the codes and rules read on the as-of
 * date, not a quoted rule. What works like one is the closed list plus each
 * limit on its own: the doc fee, the deputy fee, the VIT.
 */
export const COMBINED = {
  statutoryAggregateCap: null,
  withNothingElseRecordedCents: 22500,
  formula: "min(docFeeBucket, docFeeCap) + dealerDeputyTitleFee + vitReimbursement",
  citation: "No aggregate cap in Texas law (absence finding, 2026-10-03); closed list Tex. Fin. Code §348.005, §348.006(a)",
  effective: RULEBOOK_AS_OF,
  status: "confirmed",
} as const satisfies LegalFigure & Record<string, unknown>;

// ---------------------------------------------------------------------------
// State-set (shown read-only; the desk never asks the owner for these)
// ---------------------------------------------------------------------------

/** The 24 "affected counties" of Health & Safety Code §386.001(2), which pay the $33 title fee. */
export const AFFECTED_COUNTIES = [
  "Bastrop", "Bexar", "Caldwell", "Comal", "Ellis", "Gregg", "Guadalupe", "Harrison", "Hays", "Henderson", "Hood", "Hunt",
  "Johnson", "Kaufman", "Nueces", "Parker", "Rockwall", "Rusk", "San Patricio", "Smith", "Travis", "Upshur", "Williamson", "Wilson",
] as const;

/** The emissions counties (30 TAC §114.2(8), §114.50(a)(2), §114.80(b)). */
export const EMISSIONS_COUNTIES = {
  current: [
    "Brazoria", "Collin", "Dallas", "Denton", "El Paso", "Ellis", "Fort Bend", "Galveston", "Harris",
    "Johnson", "Kaufman", "Montgomery", "Parker", "Rockwall", "Tarrant", "Travis", "Williamson",
  ],
  addedOn: { Bexar: "2026-11-01" },
  citation: "30 TAC §114.2(8), §114.50(a)(2), §114.80(b)",
} as const;

/**
 * The government lines of a 2026 retail sale (rulebook 2.1), for display.
 * Phase 1 shows them; it does not yet charge them by county and weight
 * (the deal keeps the desk's flat title and registration lines until the
 * county computation ships). webDEALER's computed figure always wins.
 */
export const STATE_FEES_2026 = {
  year: 2026,
  salesTax: {
    rate: 0.0625,
    citation: "Tax Code §152.021(b), §152.002; Comptroller 96-254 (rev. 3/2026)",
    effective: "rate since 1991",
    status: "confirmed",
  },
  titleFee: {
    cents: { nonattainmentOrAffectedCounty: 3300, otherCounty: 2800 },
    by: "buyer county of residence",
    /** Confirmed $33 through federal ozone nonattainment, outside the affected list. */
    confirmed33ByNonattainment: ["Harris"],
    nonattainmentListComplete: false,
    citation: "Transp. Code §501.138(a); Health & Safety Code §386.001(2); HCTax MV-065 Rev 08/25",
    effective: "2021-09-01",
    status: "confirmed",
  },
  registrationBase: {
    cents: { upTo6000lb: 5075, from6001to10000lb: 5400, motorcycleOrMoped: 3000 },
    citation: "Transp. Code §§502.251, 502.252(a), 502.253; TxDMV Fee Chart 1C",
    effective: "2026-01-01..2026-12-31 chart",
    status: "confirmed",
  },
  texasSureFee: {
    cents: 100,
    note: "§502.357(a) has two $1 sentences; take webDEALER's figure",
    citation: "Transp. Code §502.357(a)",
    effective: "current",
    status: "confirmed",
  },
  localCountyFee: {
    statutoryMaxCents: 3150,
    by: "buyer county of registration",
    known2026Cents: {
      Harris: 1150,
      Dallas: 1150,
      Travis: 1150,
      Tarrant: 1000,
      Bexar: 2150,
      Cameron: 2150,
      Hidalgo: 2000,
      "El Paso": 2000,
      Webb: 2000,
    } as Record<string, number>,
    changesOnlyOn: "01-01",
    citation: "Transp. Code §§502.401-502.403; TxDMV Fee Chart 1C (2026)",
    effective: "calendar 2026",
    status: "confirmed",
  },
  processingHandlingFee: {
    cents: 475,
    citation: "Transp. Code §502.1911; 43 TAC §217.183(a) (49 TexReg 8980)",
    effective: "2024-11-14",
    status: "confirmed",
  },
  inspectionReplacementFee: {
    cents: { usedOrAnnual: 750, newTwoYearFirstRegistration: 1675, rentalThreeYear: 2225 },
    ownLine: true,
    notRegistrationFee: true,
    citation: "Transp. Code §548.510(a)-(c), (f); OCCC Bulletin B25-1",
    effective: "2025-01-01",
    status: "confirmed",
  },
  emissionsFeeAtRegistration: {
    /** Both figures are shown; neither is charged by the desk. */
    ruleCentsNonLirap: 250,
    publishedCents: 275,
    /**
     * The rule's figure in counties in the LIRAP program, for vehicles
     * subject to OBD tests (30 TAC §114.53(d)(2)(A), (3)(A), eff.
     * 2026-09-17; rulebook section 2.1). Never charged: used only as the
     * top of the registration side's typo bound (government-fees.ts).
     */
    ruleCentsLirapObd: 850,
    sourceOfTruth: "webDEALER",
    hardCode: false,
    onlyWhen: "dealer AND buyer in emissions counties; gasoline vehicle 2-24 years old",
    citation: "30 TAC §114.53(d) (51 TexReg 6274, eff. 2026-09-17); HCTax MV-065; webDEALER guide July 2026 §6.6",
    effective: "2026-09-17",
    status: "conflicting",
  },
  buyerPlateFee: {
    cents: 1000,
    everyRetailSale: true,
    neverMore: true,
    exempt: "vehicles exempt from registration fees (§502.453, §502.456)",
    citation: "43 TAC §215.155(e) (49 TexReg 8953; current 50 TexReg 6506); Transp. Code §503.063(g)",
    effective: "2025-07-01",
    status: "confirmed",
  },
  evFee: {
    cents: { annual: 20000, newTwoYear: 40000 },
    citation: "Transp. Code §502.360",
    effective: "2023-09-01",
    status: "confirmed",
  },
} as const;

/** The two figures the title fee may be (rulebook 2.1), in dollars, as the deal stores money. */
export const STATE_TITLE_FEE_DOLLARS: readonly number[] = [
  STATE_FEES_2026.titleFee.cents.nonattainmentOrAffectedCounty / 100,
  STATE_FEES_2026.titleFee.cents.otherCounty / 100,
];

/** The title fee for a buyer's county, or null when the rulebook cannot say (take webDEALER's). */
export function titleFeeCentsForCounty(county: string | null | undefined): number | null {
  const name = (county ?? "").trim().replace(/\s+county$/i, "");
  if (!name) return null;
  const known33 = [...AFFECTED_COUNTIES, ...STATE_FEES_2026.titleFee.confirmed33ByNonattainment].some(
    (entry) => entry.toLowerCase() === name.toLowerCase(),
  );
  if (known33) return STATE_FEES_2026.titleFee.cents.nonattainmentOrAffectedCounty;
  // The nonattainment list was not compiled from a primary source (open
  // question 12), so no county is known to pay $28: webDEALER decides.
  return null;
}

/** The 2026 local county fee for a county, or null when the table does not carry it. */
export function localFeeCentsForCounty(county: string | null | undefined): number | null {
  const name = (county ?? "").trim().replace(/\s+county$/i, "");
  const table = STATE_FEES_2026.localCountyFee.known2026Cents;
  const key = Object.keys(table).find((entry) => entry.toLowerCase() === name.toLowerCase());
  return key ? table[key] : null;
}

/** Whether a county is in the emissions program on a date (YYYY-MM-DD). */
export function isEmissionsCounty(county: string | null | undefined, onDate: string): boolean {
  const name = (county ?? "").trim().replace(/\s+county$/i, "").toLowerCase();
  if (!name) return false;
  if (EMISSIONS_COUNTIES.current.some((entry) => entry.toLowerCase() === name)) return true;
  return Object.entries(EMISSIONS_COUNTIES.addedOn).some(([entry, from]) => entry.toLowerCase() === name && onDate >= from);
}

/** Every figure above that carries a citation, by name, for the guard test and the review screen. */
export const LEGAL_FIGURES: Record<string, LegalFigure> = {
  docFee: DOC_FEE,
  docFeeCh345: DOC_FEE_CH345,
  dealerDeputyTitleFee: DEALER_DEPUTY_TITLE_FEE,
  plateDatabaseFee: PLATE_DATABASE_FEE,
  vitReimbursement: VIT_REIMBURSEMENT,
  otherDealerCharges: OTHER_DEALER_CHARGES,
  combinedOnTopOfPrice: COMBINED,
  salesTax: STATE_FEES_2026.salesTax,
  titleFee: STATE_FEES_2026.titleFee,
  registrationBase: STATE_FEES_2026.registrationBase,
  texasSureFee: STATE_FEES_2026.texasSureFee,
  localCountyFee: STATE_FEES_2026.localCountyFee,
  processingHandlingFee: STATE_FEES_2026.processingHandlingFee,
  inspectionReplacementFee: STATE_FEES_2026.inspectionReplacementFee,
  emissionsFeeAtRegistration: STATE_FEES_2026.emissionsFeeAtRegistration,
  buyerPlateFee: STATE_FEES_2026.buyerPlateFee,
  evFee: STATE_FEES_2026.evFee,
};

/** "$225.00" from 22500. */
export function centsAsDollars(cents: number): string {
  const value = Math.round(cents) / 100;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Whether the rulebook is from an earlier calendar year than `today` (YYYY-MM-DD): its January re-check is due. */
export function rulebookRecheckDue(today: string): boolean {
  return today.slice(0, 4) > RULEBOOK_AS_OF.slice(0, 4);
}
