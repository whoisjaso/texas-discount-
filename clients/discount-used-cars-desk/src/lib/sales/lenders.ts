/**
 * Where a financed deal gets submitted.
 *
 * The list is alphabetical inside its groups because that is how you find a
 * name you already know, and finding a known name is what this screen is for.
 * The one grouping that survives is the owner's own: banks and credit unions
 * first, because they are where a financed deal starts, and everything else
 * after. An earlier version sorted aggregators to the top on the theory that
 * they are the right door for most deals. That is true and it is a tag on the
 * row instead, because sorting by usefulness means the operator has to read
 * the whole list to find out where "Westlake" ended up.
 *
 * Three kinds sit here and the difference matters when you are funding a
 * customer's car:
 *
 *   lender      buys the retail instalment contract. This is the one you want
 *               when a buyer needs financing.
 *   aggregator  takes one application and shops it to many lenders. Most
 *               subprime lenders below accept applications this way rather
 *               than through their own site.
 *   capital     funds the dealership, not the customer: floor plan, lines of
 *               credit, bulk purchase of a note portfolio. Listed because a
 *               dealer needs them, tagged because sending a buyer's
 *               application to one would waste an afternoon.
 *
 * Sources. The bulk of this comes from the SubPrime Auto Finance News Finance
 * Company Directory, a published industry list, cross-checked against each
 * company's own site. Where a dealer-facing page was confirmed it is used;
 * otherwise the company's site is, because that is where the "dealers" link
 * lives. Nothing here was written from memory, and a company the directory
 * listed without a URL keeps `portal: null` rather than a guessed one: a login
 * link handed to someone covering the desk gets trusted, so a wrong one is
 * worse than none.
 *
 * A dealer's own relationships still win. `dealership.lenders` overrides any
 * entry by id, which is how the rep-specific login replaces the public page.
 */

export type LenderKind = "lender" | "aggregator" | "capital";

export type Lender = {
  /** Stable key stored on the deal. Never renamed once a deal references it. */
  id: string;
  name: string;
  kind: LenderKind;
  /** Dealer-facing page where confirmed, else the company site, else null. */
  portal: string | null;
  /** Three or four words: what this is, for someone who has not used it. */
  gloss: string;
  /** Extra words the search should match, such as an initialism. */
  aliases?: string[];
  /**
   * The institutions a customer walks in already trusting.
   *
   * A bank or a credit union is where the owner starts a financed deal: the
   * rates are the ones a prime buyer expects, and the name is one the buyer
   * has heard. The retail, subprime and capital rows matter too, which is
   * why they stay in the same list rather than behind a tab, but when nobody
   * has typed anything yet the trusted institutions read first.
   *
   * Tagged as data rather than sniffed out of a gloss, because "bank owned"
   * in a subprime lender's gloss is not a bank.
   */
  group?: "bank" | "creditUnion";
  /**
   * How this lender must appear in box 34 of the 130-U, and its TxDMV
   * certified (eTitle) lienholder id for box 32.
   *
   * Absent until confirmed from the lender's own dealer paperwork. A
   * lienholder box with a name and no address is one a clerk completes; one
   * with a guessed address is one a clerk trusts, and a bank's name over
   * the wrong street on a filed state form was the audit's worst finding.
   */
  lienholder?: {
    /** When the titling name differs from the trading name. */
    name?: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    certifiedLienholderId?: string | null;
  };
};

export const LENDER_SEED: Lender[] = [
  {
    id: "acAutopay",
    name: "AC Autopay",
    kind: "capital",
    portal: "https://www.autopay.com",
    gloss: "Buys note portfolios",
  },
  {
    id: "afsAcceptance",
    name: "AFS Acceptance",
    kind: "lender",
    portal: "https://www.afsacceptance.com",
    gloss: "Subprime, open bankruptcies",
    aliases: ["afs"],
  },
  {
    id: "agoraData",
    name: "Agora Data",
    kind: "capital",
    portal: "https://agoradata.com",
    gloss: "Capital for note holders",
  },
  {
    id: "americanCreditAcceptance",
    name: "American Credit Acceptance",
    kind: "lender",
    portal: "https://americancreditacceptance.com/dealers/pos/",
    gloss: "Subprime, no enrolment fee",
    aliases: ["aca"],
  },
  {
    id: "arivo",
    name: "Arivo Acceptance",
    kind: "lender",
    portal: "https://www.arivo.com",
    gloss: "Subprime retail contracts",
  },
  {
    id: "autoUse",
    name: "Auto Use",
    kind: "lender",
    portal: "https://www.autouse.com",
    gloss: "Floor plan and subprime retail",
  },
  {
    id: "automotiveCredit",
    name: "Automotive Credit Corporation",
    kind: "lender",
    portal: "https://www.automotivecredit.com",
    gloss: "Subprime retail contracts",
    aliases: ["acc"],
  },
  {
    id: "capitalOne",
    name: "Capital One Auto Finance",
    kind: "lender",
    portal: null,
    gloss: "Prime and near prime",
    group: "bank",
  },
  {
    id: "chaseAuto",
    name: "Chase Auto Finance",
    kind: "lender",
    portal: "https://www.chase.com",
    gloss: "Bank, prime credit",
    group: "bank",
  },
  {
    id: "columbusFinance",
    name: "Columbus Finance",
    kind: "lender",
    portal: "https://www.columbusfinance.com",
    gloss: "Regional subprime, Ohio",
  },
  {
    id: "consumerPortfolio",
    name: "Consumer Portfolio Services",
    kind: "lender",
    portal: "https://www.hityournumbers.com",
    gloss: "Seven subprime programmes",
    aliases: ["cps", "hit your numbers"],
  },
  {
    id: "creditAcceptance",
    name: "Credit Acceptance",
    kind: "lender",
    portal: "https://www.creditacceptance.com",
    gloss: "Deep subprime programme",
    aliases: ["cac"],
  },
  {
    id: "cudl",
    name: "CUDL",
    kind: "aggregator",
    portal: null,
    gloss: "Credit union lending network",
    aliases: ["origence", "credit union"],
    group: "creditUnion",
  },
  {
    id: "dealercenter",
    name: "DealerCenter",
    kind: "aggregator",
    portal: null,
    gloss: "Independent dealer platform",
  },
  {
    id: "dealertrack",
    name: "Dealertrack",
    kind: "aggregator",
    portal: "https://us.dealertrack.com/",
    gloss: "Credit application network",
  },
  {
    id: "diamondFinance",
    name: "Diamond Finance",
    kind: "lender",
    portal: null,
    gloss: "Regional subprime, New York",
  },
  {
    id: "equityAutoFinance",
    name: "Equity Auto Finance",
    kind: "lender",
    portal: "https://www.equityautofinance.com",
    gloss: "Subprime retail contracts",
  },
  {
    id: "exeter",
    name: "Exeter Finance",
    kind: "lender",
    portal: "https://dealerportal.exeterfinance.com/",
    gloss: "Subprime retail instalment",
  },
  {
    id: "firstInvestors",
    name: "First Investors Financial Services",
    kind: "lender",
    portal: "https://www.fifsg.com/Dealers",
    gloss: "Non-prime retail contracts",
    aliases: ["fifsg", "1st investors"],
  },
  {
    id: "flagship",
    name: "Flagship Credit Acceptance",
    kind: "lender",
    portal: "https://www.flagshipcredit.com",
    gloss: "Nationwide subprime lender",
  },
  {
    id: "friendlyFinance",
    name: "Friendly Finance",
    kind: "lender",
    portal: null,
    gloss: "Regional subprime, Maryland",
  },
  {
    id: "globalLending",
    name: "Global Lending Services",
    kind: "lender",
    portal: "https://glsauto.com/dealers.html",
    gloss: "Subprime, 47 states",
    aliases: ["gls"],
  },
  {
    id: "goFinancial",
    name: "GO Financial",
    kind: "lender",
    portal: "https://www.gofinancial.com",
    gloss: "Subprime, non-recourse",
  },
  {
    id: "heritageAuto",
    name: "Heritage Auto Finance",
    kind: "lender",
    portal: null,
    gloss: "Subprime, high mileage",
    aliases: ["haf"],
  },
  {
    id: "lobel",
    name: "Lobel Financial",
    kind: "lender",
    portal: "https://www.lobelfinancial.com/dealers",
    gloss: "Subprime, instant approvals",
    aliases: ["dealwriter"],
  },
  {
    id: "prestige",
    name: "Prestige Financial",
    kind: "lender",
    portal: "https://www.gopfs.com",
    gloss: "No minimum score",
    aliases: ["gopfs"],
  },
  {
    id: "regionalAcceptance",
    name: "Regional Acceptance",
    kind: "lender",
    portal: "https://www.regionalacceptance.com",
    gloss: "Non-prime, bank owned",
  },
  {
    id: "roadloans",
    name: "RoadLoans",
    kind: "lender",
    portal: "https://www.roadloans.com",
    gloss: "Direct to consumer, Santander",
  },
  {
    id: "routeone",
    name: "RouteOne",
    kind: "aggregator",
    portal: "https://www.routeone.com/",
    gloss: "Submit once, many decide",
  },
  {
    id: "safco",
    name: "Southern Auto Finance Company",
    kind: "lender",
    portal: "https://www.gosafco.com",
    gloss: "Subprime, 23 states",
    aliases: ["safco"],
  },
  {
    id: "santander",
    name: "Santander Consumer",
    kind: "lender",
    portal: "https://santanderconsumerusa.com/dealers",
    gloss: "Full credit spectrum",
  },
  {
    id: "sensibleAuto",
    name: "Sensible Auto Finance",
    kind: "lender",
    portal: "https://www.sensibleauto.com",
    gloss: "Subprime, no monthly fees",
  },
  {
    id: "sevenLynx",
    name: "Seven Lynx Financing",
    kind: "lender",
    portal: "https://www.sevenlynxgroup.com",
    gloss: "Subprime, Florida only",
  },
  {
    id: "skopos",
    name: "Skopos Financial",
    kind: "lender",
    portal: "https://www.skoposfinancial.com",
    gloss: "Deep subprime, under 600",
  },
  {
    id: "spartanPartners",
    name: "Spartan Financial Partners",
    kind: "capital",
    portal: "https://www.spartan-partners.com",
    gloss: "Lines of credit for BHPH",
  },
  {
    id: "uDriveAcceptance",
    name: "U Drive Acceptance",
    kind: "lender",
    portal: "https://www.udriveac.com",
    gloss: "Subprime, midwest states",
    aliases: ["udac"],
  },
  {
    id: "unitedAutoCredit",
    name: "United Auto Credit",
    kind: "lender",
    portal: "https://www.unitedautocredit.net/dealerpartners.aspx",
    gloss: "Non-prime since 1996",
    aliases: ["uacc"],
  },
  {
    id: "vehicleAcceptance",
    name: "Vehicle Acceptance Corporation",
    kind: "lender",
    portal: "https://www.vacorp.com",
    gloss: "Subprime, 20 states",
    aliases: ["vac"],
  },
  {
    id: "verosCredit",
    name: "Veros Credit",
    kind: "lender",
    portal: "https://veroscredit.com",
    gloss: "Non-prime and subprime",
  },
  {
    id: "wellsFargoAuto",
    name: "Wells Fargo Auto",
    kind: "lender",
    // The directory printed wellsfargoautofinance.com. That domain no longer
    // resolves at all, so it is null rather than a link that fails in front of
    // a customer. Whoever holds the Wells Fargo relationship can add the page
    // their rep uses.
    portal: null,
    gloss: "Bank, prime credit",
    group: "bank",
  },
  {
    id: "westlake",
    name: "Westlake Financial",
    kind: "lender",
    portal: "https://www.westlakefinancial.com/dealer/",
    gloss: "Full spectrum, all 50 states",
  },
  {
    id: "wisdomFinancial",
    name: "Wisdom Financial",
    kind: "lender",
    portal: "https://www.wisdomfinancials.com",
    gloss: "Subprime, New York based",
  },
];

/**
 * The dealer's list, merged over the seed, alphabetical.
 *
 * Passed in rather than imported so this stays a pure function: the tests can
 * hand it a fixture, and nothing here reaches for a specific dealership.
 */
export function buildLenderDirectory(dealerLenders: Lender[] = []): Lender[] {
  const byId = new Map<string, Lender>();
  for (const lender of LENDER_SEED) byId.set(lender.id, lender);
  for (const lender of dealerLenders) byId.set(lender.id, lender);

  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

/** Banks and credit unions ahead of everything else; see `Lender.group`. */
function directoryRank(lender: Lender): number {
  return lender.group === "bank" || lender.group === "creditUnion" ? 0 : 1;
}

/**
 * Filter by what someone typed.
 *
 * Matches name and aliases, so "CPS" finds Consumer Portfolio Services and
 * "UACC" finds United Auto Credit. An empty query returns everything, so the
 * list reads as a directory before it reads as a search, and the directory
 * leads with the banks and credit unions: they are where the owner starts a
 * financed deal, and the names a buyer already knows should not sit under
 * thirty subprime programmes. Alphabetical inside each group, because that is
 * still how a known name is found. A typed query is left exactly as it was:
 * somebody typing has a name in mind, and reordering their matches would be
 * the software arguing.
 */
export function searchLenders(lenders: Lender[], query: string): Lender[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [...lenders].sort(
      (a, b) =>
        directoryRank(a) - directoryRank(b) ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );
  }

  return lenders.filter((lender) => {
    if (lender.name.toLowerCase().includes(needle)) return true;
    return (lender.aliases ?? []).some((alias) =>
      alias.toLowerCase().includes(needle),
    );
  });
}

export function findLender(
  lenders: Lender[],
  id: string | null,
): Lender | null {
  if (!id) return null;
  return lenders.find((lender) => lender.id === id) ?? null;
}

/** The row tag. Retail lenders are the default and carry none. */
export function lenderTag(kind: LenderKind): string | null {
  if (kind === "aggregator") return "Submits to many";
  if (kind === "capital") return "Funds the lot";
  return null;
}
