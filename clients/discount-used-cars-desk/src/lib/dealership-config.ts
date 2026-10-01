/**
 * Single source of truth for every dealership fact the desk and its documents
 * print. Nothing else in `src/` may type one of these values (a guard test
 * enforces it).
 *
 * This desk belongs to Discount Used Cars and Trucks, LLC (8108 Gulf Fwy,
 * Houston). Nothing here may be invented. The facts below were verified on
 * 10/01/2026 and each carries its source:
 *
 * - TXDMV: the Independent (GDN) Motor Vehicle Dealers List, data current as
 *   of 10/01/2026: business name DISCOUNT USED CARS AND TRUCKS, LLC, DBA
 *   Discount Used Cars and Trucks, GDN P145000 (Active, licence type Motor
 *   Vehicle, active since 11/06/2017, expires 09/30/2027), Harris County,
 *   8108 Gulf Fwy, Houston, TX 77017. The Texas Secretary of State file
 *   0802832466 (domestic LLC, formed 10/09/2017) and the Comptroller agree on
 *   the entity and the address.
 * - PUBLIC: the Google listing at 8108 Gulf Fwy and the dealer's own sign,
 *   pending the owner's confirmation (languages).
 * - OWNER: the dealership's billboard artwork and the owner's texts,
 *   10/01/2026: hours Tuesday to Saturday 10:00 to 19:00, Sunday and Monday
 *   closed (supersedes the Google listing's Monday to Friday 10:00 to 17:00);
 *   public website www.discountusedcarsandtrucks.com; phone (713) 900-5050
 *   confirmed.
 * - every other fact is `null`: owner, documentary fee, email, payment
 *   destinations, SMS provider, salvage licence, lenders and map position.
 *   Screens say it is missing, previews print a visible "Not set" marker in
 *   its place, and filing a document is refused until it is supplied (see
 *   `missingDealerFacts`). The person who signs for the dealer is not a
 *   config fact: it is the filing member's own onboarding name (see
 *   `dealerSignerPrintedName`).
 *
 * Each value is overridable through an environment variable so the owner can
 * supply it without a code change.
 */

import { isAnalyticsId } from "@/lib/public-analytics";
import { normalizeSiteOrigin } from "@/lib/site-origin";
import type { Lender } from "@/lib/sales/lenders";

/**
 * A configured value, or null. Always called with a LITERAL
 * `process.env.NEXT_PUBLIC_*` reference: Next.js inlines only literal public
 * references into browser bundles, and the live receipt (client) and the
 * filed document (server) must compute from the same figures. Facts are
 * public by nature (they print on every document), so they are NEXT_PUBLIC_;
 * only mail senders, lienholder ids and switches stay server-side.
 */
const env = (value: string | undefined): string | null =>
  value && value.trim() ? value.trim() : null;

/**
 * The desk's OWN origin (a "desk." host beside the public website; the
 * recommended value is in .env.example), never the dealer's public website. It is
 * used only to build links: signing texts, capture QR codes, recovery and
 * invite links, and the internal render. It is never printed on paper (SOP:
 * "The website on paper versus the desk's own address"); the printed website
 * is `dealership.website`. Until NEXT_PUBLIC_SITE_URL is set, links use the
 * local development origin and filing is refused ("Desk address").
 */
const CONFIGURED_ORIGIN = env(process.env.NEXT_PUBLIC_SITE_URL) ?? env(process.env.NEXT_PUBLIC_BASE_URL);
export const SITE_URL = CONFIGURED_ORIGIN
  ? normalizeSiteOrigin(CONFIGURED_ORIGIN, { canonicalOrigin: CONFIGURED_ORIGIN, aliases: [] })
  : "http://localhost:5190";
export const SITE_URL_CONFIGURED = CONFIGURED_ORIGIN !== null;

export type DealershipHours = {
  /** Schema.org day names this rule applies to. */
  days: string[];
  /** 24h "HH:MM" open time, or null when closed. */
  opens: string | null;
  /** 24h "HH:MM" close time, or null when closed. */
  closes: string | null;
};

export type SocialProfile = {
  label: string;
  href: string;
};

// OWNER: (713) 900-5050 confirmed 10/01/2026 (billboard artwork and texts),
// matching the Google listing at 8108 Gulf Fwy and the dealer's "713 900
// 50/50" sign. The TxDMV licence record lists (713) 203-3890, which is not the
// number the desk prints. One phone field only, never two that can disagree.
const RAW_PHONE = env(process.env.NEXT_PUBLIC_DEALER_PHONE) ?? "+17139005050";

/**
 * A website as it prints on paper: "https://www.x.com/" -> "www.x.com".
 * Null when nothing is left, so an empty override reads as unset.
 */
function printableHost(value: string | null): string | null {
  if (!value) return null;
  const host = value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return host || null;
}

/** "+17139005050" -> "(713) 900-5050" */
function formatUsPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length !== 10) return e164;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export const dealership = {
  // TXDMV: the DBA on GDN P145000. PUBLIC: the Google listing at 8108 Gulf Fwy.
  name: env(process.env.NEXT_PUBLIC_DEALER_NAME) ?? "Discount Used Cars and Trucks",
  // The wordmark on the dealer's logo.
  shortName: env(process.env.NEXT_PUBLIC_DEALER_SHORT_NAME) ?? "Discount",
  /**
   * TXDMV: BusinessName "DISCOUNT USED CARS AND TRUCKS, LLC" on the
   * Independent (GDN) Motor Vehicle Dealers List, current 10/01/2026. Texas
   * SOS file 0802832466 (domestic LLC, formed 10/09/2017). An LLC contracts
   * under its entity name as licensed, so there is no "DBA" construction.
   * Both records hold the name in capitals, so the casing is not part of the
   * fact. It is written here in the casing the documents' name normaliser
   * produces ("And", "LLC"), so the bill of sale, the 130-U and every other
   * document print one identical name.
   */
  legalName: (env(process.env.NEXT_PUBLIC_DEALER_LEGAL_NAME) ?? "Discount Used Cars And Trucks, LLC") as string | null,
  /** The desk's own origin, for links only. Never printed (see SITE_URL). */
  url: SITE_URL,
  /**
   * OWNER: billboard artwork and texts, 10/01/2026. The public website as
   * printed on paper (letterhead, bill of sale, Buyer's Guide). Never the desk
   * origin, and never a base for links (SOP: "The website on paper versus the
   * desk's own address").
   */
  website: (printableHost(env(process.env.NEXT_PUBLIC_DEALER_WEBSITE)) ?? "www.discountusedcarsandtrucks.com") as string | null,

  googleSiteVerification: env(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION) ?? undefined,
  googleAnalyticsId: env(process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID) ?? "",
  processStudySource: null as string | null,

  /**
   * Texting the buyer their paperwork stays OFF until the owner names an SMS
   * provider, registers the sending campaign and has the consent wording
   * reviewed. Flipping it is a deliberate commit, not a default.
   */
  paperworkTextsEnabled: env(process.env.PAPERWORK_TEXTS_ENABLED) === "true",

  creditApplicationUrl: env(process.env.NEXT_PUBLIC_CREDIT_APPLICATION_URL),

  phone: {
    e164: RAW_PHONE,
    display: formatUsPhone(RAW_PHONE),
    href: `tel:${RAW_PHONE}`,
    smsHref: `sms:${RAW_PHONE}`,
  },

  /** Not supplied: ask the owner. */
  email: env(process.env.NEXT_PUBLIC_DEALER_EMAIL),

  /**
   * TXDMV: Texas GDN (General Distinguishing Number), Active, licence type
   * Motor Vehicle (independent), active since 11/06/2017, expires 09/30/2027.
   * Renewal is the owner's to track.
   */
  license: env(process.env.NEXT_PUBLIC_DEALER_LICENSE) ?? "P145000",

  /** Texas salvage vehicle dealer licence (Occ. Code ch. 2302), when held. */
  salvageDealerLicense: env(process.env.NEXT_PUBLIC_SALVAGE_DEALER_LICENSE),

  titleWork: {
    certifiedLienholderId: env(process.env.TITLE_LIENHOLDER_ID),
    sellerFinancedPermit: env(process.env.SELLER_FINANCED_PERMIT),
  },

  /**
   * The house rate on an in-house note when only one of the payment or the
   * count was agreed: the floor of the Chapter 303 optional ceiling (Texas
   * Finance Code §303.009). The solver never lets any rate exceed the ceiling
   * for the car's class.
   */
  financing: {
    defaultApr: Number(env(process.env.NEXT_PUBLIC_FINANCING_DEFAULT_APR)) || 18,
  },

  // TXDMV + Comptroller + PUBLIC (Google listing): 8108 Gulf Fwy, Houston,
  // TX 77017 (ZIP+4 77017-3620). No suite.
  address: {
    street: env(process.env.NEXT_PUBLIC_DEALER_STREET) ?? "8108 Gulf Fwy",
    locality: env(process.env.NEXT_PUBLIC_DEALER_CITY) ?? "Houston",
    region: env(process.env.NEXT_PUBLIC_DEALER_STATE) ?? "TX",
    postalCode: env(process.env.NEXT_PUBLIC_DEALER_ZIP) ?? "77017",
    country: "US",
    /** Single-line form for compact UI. */
    oneLine: `${env(process.env.NEXT_PUBLIC_DEALER_STREET) ?? "8108 Gulf Fwy"}, ${env(process.env.NEXT_PUBLIC_DEALER_CITY) ?? "Houston"}, ${env(process.env.NEXT_PUBLIC_DEALER_STATE) ?? "TX"} ${env(process.env.NEXT_PUBLIC_DEALER_ZIP) ?? "77017"}`,
  },

  /** TXDMV: the county on the dealer licence record, which the 130-U names. */
  county: env(process.env.NEXT_PUBLIC_DEALER_COUNTY) ?? "Harris",

  /**
   * The business clock. Every date on a document or signature is the business
   * date here, never the server's UTC date. Houston, Texas keeps Central time
   * (the lot is at 8108 Gulf Fwy, Houston); the owner confirms it with the
   * rest of the facts.
   */
  timeZone: env(process.env.NEXT_PUBLIC_DEALER_TIME_ZONE) ?? "America/Chicago",

  /** Not supplied: no map position is printed until the owner confirms one. */
  geo: null as { latitude: number; longitude: number } | null,

  // OWNER: Tuesday to Saturday 10:00 to 19:00, Sunday and Monday closed, from
  // the billboard artwork and texts (10/01/2026); supersedes the Google
  // listing's Monday to Friday 10:00 to 17:00. Sunday is listed before Monday
  // so the closed line reads "Sunday And Monday".
  hours: [
    {
      days: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "10:00",
      closes: "19:00",
    },
    { days: ["Sunday", "Monday"], opens: null, closes: null },
  ] satisfies DealershipHours[],

  priceRange: null as string | null,
  /** Not supplied: no service area is claimed until the owner states one. */
  serviceArea: null as string | null,
  // PUBLIC: the dealer's Facebook page.
  socials: [
    { label: "Facebook", href: "https://www.facebook.com/Discountusedcars/" },
  ] as SocialProfile[],

  // PUBLIC (historic): "Se Habla Español" on the dealer's sign, pending the
  // owner's confirmation.
  languages: ["en", "es"] as const,
  defaultLanguage: "en" as const,

  /**
   * Where customers send money. `null` means not offered: the payment screen
   * says to contact the office rather than naming a destination. Never a
   * default: a wrong value here sends a customer's money to someone else.
   */
  payments: {
    zelle: env(process.env.NEXT_PUBLIC_DEALER_ZELLE),
    applePay: env(process.env.NEXT_PUBLIC_DEALER_APPLE_PAY),
    cashApp: env(process.env.NEXT_PUBLIC_DEALER_CASH_APP),
    paypal: env(process.env.NEXT_PUBLIC_DEALER_PAYPAL),
  } as Record<string, string | null>,

  /** Not supplied: no lender is named until the owner lists them. */
  lenders: [] as Lender[],

  /** TxDMV webDEALER, where Texas dealers file title since 1 July 2025. */
  webDealerUrl: env(process.env.NEXT_PUBLIC_WEBDEALER_URL) ?? "https://www.txdmv.gov/dealers/webdealer",

  /**
   * Read only by the legacy rental agreement's fallback. Sale documents print
   * the FILING member's onboarding name instead, as "<legal name> (First
   * Last)" (`dealerSignerPrintedName`; SOP "Legal content each document must
   * carry", 130-U bullet; owner's instruction 10/01/2026).
   */
  signer: {
    name: env(process.env.NEXT_PUBLIC_DEALER_SIGNER_NAME),
    title: env(process.env.NEXT_PUBLIC_DEALER_SIGNER_TITLE),
  },

  profile: {
    owner: env(process.env.NEXT_PUBLIC_DEALER_OWNER),
    locale: env(process.env.NEXT_PUBLIC_DEALER_LOCALE) ?? "Houston, Texas",
    // What the lot sells. No second line of business.
    segment: env(process.env.NEXT_PUBLIC_DEALER_SEGMENT) ?? "pre-owned cars, trucks and SUVs",
    offers: env(process.env.NEXT_PUBLIC_DEALER_OFFERS),
  },

  hasNonEssentialStorage: isAnalyticsId(env(process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID) ?? ""),
};

/**
 * Money constants for the sale. Texas statute supplies the tax rate, title fee
 * and registration fee; the documentary fee is the dealer's own and is not
 * known yet. Null means "not set": the receipt shows it as missing and a
 * document cannot be filed until it is supplied.
 */
/**
 * A dollar amount the owner types into the environment, read the way the
 * desk reads a money box (SOP "Money": strip "$", "," and spaces before
 * testing for empty): "$1,000" is 1000. Null when unset; NaN when something
 * was typed that is not a dollar amount, or is below zero, so the document
 * stays refused and the refusal can say why rather than printing it.
 */
function envDollars(value: string | undefined): number | null {
  const raw = env(value);
  if (raw === null) return null;
  const digits = raw.replace(/[$,\s]/g, "");
  const amount = digits === "" ? Number.NaN : Number(digits);
  return Number.isFinite(amount) && amount >= 0 ? amount : Number.NaN;
}

export const dealerFees = {
  /** Texas motor vehicle sales tax, Tax Code §152.021. */
  taxRate: Number(env(process.env.NEXT_PUBLIC_DEALER_TAX_RATE)) || 0.0625,
  titleFee: Number(env(process.env.NEXT_PUBLIC_DEALER_TITLE_FEE)) || 33,
  registrationFee: Number(env(process.env.NEXT_PUBLIC_DEALER_REGISTRATION_FEE)) || 75,
  docFee: env(process.env.NEXT_PUBLIC_DEALER_DOC_FEE) === null ? null : Number(env(process.env.NEXT_PUBLIC_DEALER_DOC_FEE)),
  /**
   * Not supplied: ask the owner. The Vehicle Responsibility Acknowledgment's
   * late-handling fee, owed if the buyer hands the filing back (SOP "Legal
   * content each document must carry": "the figure and late fee if it comes
   * back to the dealer"). The $100 the desk printed was another dealer's
   * policy carried over in the port, never Discount's. Null prints
   * "[Not set: late-handling fee]" and that one document cannot be filed.
   */
  lateHandlingFee: envDollars(process.env.NEXT_PUBLIC_DEALER_LATE_HANDLING_FEE),
};

/** What prints in place of a fact the owner has not supplied. */
export function notSet(label: string): string {
  return `[Not set: ${label}]`;
}

/** A fact, or its visible "Not set" marker. */
export function factOr(value: string | null | undefined, label: string): string {
  return value && value.trim() ? value : notSet(label);
}

/**
 * The dealer's printed name beside a dealer signature: the legal name, then
 * the signing person's own name in parentheses, "Legal Name, LLC (First
 * Last)". County offices no longer accept the entity alone (owner's
 * instruction 10/01/2026; SOP "Legal content each document must carry",
 * 130-U bullet). A person with no name on record prints the visible
 * "[Not set: signer name]" marker, never the entity alone. The one place the
 * pairing is built.
 */
export function dealerSignerPrintedName(person: string | null | undefined): string {
  return `${factOr(dealership.legalName, "dealer legal name")} (${factOr(person, "signer name")})`;
}

/**
 * The facts a filed document cannot go without, in the words the owner is
 * asked for them. Empty when every one is supplied.
 */
export function missingDealerFacts(): string[] {
  const missing: string[] = [];
  if (!dealership.legalName) missing.push("Dealer legal name");
  if (!dealership.license) missing.push("Dealer licence (GDN) number");
  if (!dealership.county) missing.push("County");
  if (dealerFees.docFee === null || !Number.isFinite(dealerFees.docFee)) missing.push("Documentary fee");
  // No "Authorised signer" here any more: the dealer line now carries the
  // FILING member's own name and stroke, and `finalizePaperwork` refuses a
  // filer who is not cleared and named (`dealerSignerProblem`; SOP 130-U
  // bullet, owner's instruction 10/01/2026). The env signer printed nowhere
  // on a sale document, so it guarded nothing.
  if (!dealership.website) missing.push("Website domain");
  // The website printed on paper and the desk's own origin are two facts
  // (SOP "The website on paper versus the desk's own address"). Without the
  // desk origin a filing would store completed links on the local
  // development address, so it stays a refusal of its own.
  if (!SITE_URL_CONFIGURED) missing.push("Desk address");
  // Two values, never one host for both jobs: the desk printing its own
  // origin on paper, or building signing links on the public site, is the
  // mistake the SOP section exists to prevent. Compared without "www.", in
  // either direction.
  if (SITE_URL_CONFIGURED && dealership.website && sameHost(SITE_URL, dealership.website)) {
    missing.push("Website domain (must be the public site, not the desk address)");
  }
  return missing;
}

/** Whether two addresses name the same host, ignoring scheme, "www." and case. */
function sameHost(a: string, b: string): boolean {
  const host = (value: string) =>
    value.trim().replace(/^https?:\/\//i, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/^www\./i, "").toLowerCase();
  return host(a) !== "" && host(a) === host(b);
}

/**
 * Why a document may not be filed right now, or null when it may.
 *
 * A filed document is a legal record, so one that would print a "Not set"
 * marker in place of the dealer's name, licence, county or fee is refused.
 * `DESK_ALLOW_UNSET_FACTS=true` lifts the refusal for demos and local walks
 * only; the markers still print, so a demo packet can never pass for a real one.
 */
export function filingBlockedReason(): string | null {
  const missing = missingDealerFacts();
  if (missing.length === 0) return null;
  if (env(process.env.DESK_ALLOW_UNSET_FACTS) === "true") return null;
  return `Add these dealer details before filing: ${missing.join(", ")}.`;
}

/**
 * Why one particular document may not be filed, or null when it may.
 *
 * For a fact only one document prints, so it never blocks the rest of the
 * packet the way `filingBlockedReason` does: today, the late-handling fee on
 * the Vehicle Responsibility Acknowledgment (SOP "Legal content each document
 * must carry"; never invent a dealer fact). `DESK_ALLOW_UNSET_FACTS=true`
 * lifts it exactly as it lifts the others, and the marker still prints.
 */
export function documentFilingBlockedReason(documentType: string): string | null {
  if (documentType !== "vehicleResponsibility") return null;
  const fee = dealerFees.lateHandlingFee;
  if (fee !== null && Number.isFinite(fee)) return null;
  if (env(process.env.DESK_ALLOW_UNSET_FACTS) === "true") return null;
  if (fee !== null) {
    return "Fix this dealer detail before filing the Vehicle Responsibility Acknowledgment: Late-handling fee is not a dollar amount (NEXT_PUBLIC_DEALER_LATE_HANDLING_FEE).";
  }
  return "Add this dealer detail before filing the Vehicle Responsibility Acknowledgment: Late-handling fee.";
}

/**
 * Day names as they sit inside a sentence. Spanish keeps them lower case; the
 * line's first letter is capitalised where the line is built.
 */
const DAY_NAMES: Record<"en" | "es", Record<string, string>> = {
  en: {
    Monday: "Monday",
    Tuesday: "Tuesday",
    Wednesday: "Wednesday",
    Thursday: "Thursday",
    Friday: "Friday",
    Saturday: "Saturday",
    Sunday: "Sunday",
  },
  es: {
    Monday: "lunes",
    Tuesday: "martes",
    Wednesday: "miércoles",
    Thursday: "jueves",
    Friday: "viernes",
    Saturday: "sábado",
    Sunday: "domingo",
  },
};

/** "sábado y domingo" -> "Sábado y domingo" */
function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "09:00" -> "9:00 AM" */
function to12Hour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export type HoursLines = {
  /** The open rule: "Tuesday to Saturday, 10:00 AM to 7:00 PM". */
  weekday: string;
  /**
   * The closed days: "Sunday And Monday: Closed". The key keeps the name it
   * had when only Sunday was closed, so no caller changes shape.
   */
  sunday: string;
  closedWord: string;
};

/**
 * The hours as two lines of copy, built from `dealership.hours`: one open
 * rule (a run of days with one opening and one closing time) and every day
 * the lot is closed, joined into one line ("Sunday And Monday: Closed",
 * "Domingo y lunes: Cerrado").
 */
export function hoursLines(locale: string): HoursLines {
  const isEs = locale === "es";
  const names = DAY_NAMES[isEs ? "es" : "en"];
  const day = (name: string) => names[name] ?? name;

  const open = dealership.hours.find((rule) => rule.opens && rule.closes);
  const shutDays = dealership.hours.filter((rule) => !rule.opens).flatMap((rule) => rule.days.map(day));
  const closedWord = isEs ? "Cerrado" : "Closed";
  const and = isEs ? " y " : " And ";

  let weekday = notSet("business hours");
  if (open?.opens && open.closes) {
    const first = day(open.days[0]);
    const last = day(open.days[open.days.length - 1]);
    const from = to12Hour(open.opens);
    const until = to12Hour(open.closes);
    weekday = capitalizeFirst(isEs ? `${first} a ${last}, ${from} a ${until}` : `${first} to ${last}, ${from} to ${until}`);
  }

  const closedDays = shutDays.length > 1
    ? `${shutDays.slice(0, -1).join(", ")}${and}${shutDays[shutDays.length - 1]}`
    : shutDays[0];

  return {
    weekday,
    sunday: closedDays ? `${capitalizeFirst(closedDays)}: ${closedWord}` : "",
    closedWord,
  };
}

/** Google Maps directions link built from the address above. */
export const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${dealership.address.street} ${dealership.address.locality} ${dealership.address.region} ${dealership.address.postalCode}`,
)}`;

/** The public site's routes, as the desk links back to them. */
export const routes = {
  home: "/",
  inventory: "/inventory",
  newArrivals: "/inventory",
  vinLookup: "/inventory",
  about: "/visit",
  contact: "/visit",
  privacy: "/visit",
  terms: "/visit",
  financing: "/financing",
  sellTrade: "/visit",
  registrationHelp: "/visit",
  inventoryUpdates: "/visit",
  prequalify: "/financing",
  savedVehicles: "/inventory",
} as const;

export const bodyStyles = ["Sedan", "SUV", "Truck", "Coupe", "Van", "Hatchback"] as const;
export type BodyStyle = (typeof bodyStyles)[number];

export const purchasePaths = ["cash", "financing", "either"] as const;
export type PurchasePath = (typeof purchasePaths)[number];

/** Approved disclosure language. Add no claim without the dealer's sign-off. */
export const legal = {
  en: {
    inventory: "All vehicles are subject to prior sale.",
    pricing:
      "Advertised prices do not include applicable tax, title, license, registration, or dealer fees unless expressly stated.",
    financing: "Financing is subject to lender approval and applicable terms.",
  },
  es: {
    inventory: "Todos los vehículos están sujetos a venta previa.",
    pricing:
      "Los precios anunciados no incluyen impuestos, título, placas, registro ni cargos del concesionario, salvo que se indique expresamente.",
    financing: "El financiamiento está sujeto a la aprobación del prestamista y a los términos aplicables.",
  },
} as const;

export function copyrightLine(year: number): string {
  return `© ${year} ${dealership.legalName ?? dealership.name}.`;
}

const HOST = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
// The public website's domain, never the desk's: the desk host (desk.<domain>)
// must never reach a customer's inbox (SOP "The website on paper versus the
// desk's own address"). Not used to make up a sender: see mailFrom below.
const MAIL_HOST = (dealership.website ?? HOST).replace(/^www\./, "");

/**
 * The brand layer. Discount Used Cars and Trucks has a full logo (the red car
 * swoosh, DISCOUNT in red, the name in navy and the road), a white-text
 * version of it for black grounds, the swoosh on its own, and black-ink
 * versions of the logo and the swoosh for paper. There is no separate
 * wordmark or monogram artwork: the name is drawn in wide capitals and the
 * logo stands in for the monogram.
 */
export const brand = {
  wordmarkArtwork: {
    light: env(process.env.NEXT_PUBLIC_BRAND_WORDMARK_LIGHT) ?? "",
    dark: env(process.env.NEXT_PUBLIC_BRAND_WORDMARK_DARK) ?? "",
  },
  monogramArtwork: {
    copper: env(process.env.NEXT_PUBLIC_BRAND_MONOGRAM_COPPER) ?? "",
    cream: env(process.env.NEXT_PUBLIC_BRAND_MONOGRAM_CREAM) ?? "",
    ink: env(process.env.NEXT_PUBLIC_BRAND_MONOGRAM_INK) ?? "",
  },
  short: dealership.shortName,
  full: dealership.name,
  /** Registered entity for contracts, or its visible "Not set" marker. */
  legal: factOr(dealership.legalName, "dealer legal name"),

  wordmark: env(process.env.NEXT_PUBLIC_BRAND_WORDMARK) ?? "DISCOUNT",
  subline: env(process.env.NEXT_PUBLIC_BRAND_SUBLINE) ?? "Used Cars and Trucks",

  /** The full-colour logo (480 × 185, transparent), for light grounds. */
  logo: env(process.env.NEXT_PUBLIC_BRAND_LOGO) ?? "/brand/discount-logo-sm.png",
  /** The same logo with the navy turned white, for the black rail. */
  logoReverse: env(process.env.NEXT_PUBLIC_BRAND_LOGO_REVERSE) ?? "/brand/discount-logo-reverse-sm.png",
  /** The red car swoosh alone (640 × 87), set over the drawn name. */
  mark: env(process.env.NEXT_PUBLIC_BRAND_MARK) ?? "/brand/discount-mark.png",
  /** Black ink only, for printed documents: a copier turns colour to mud. */
  logoInk: env(process.env.NEXT_PUBLIC_BRAND_LOGO_INK) ?? "/brand/discount-logo-ink-sm.png",
  markInk: env(process.env.NEXT_PUBLIC_BRAND_MARK_INK) ?? "/brand/discount-mark-ink.png",
  logoPrint: env(process.env.BRAND_LOGO_PRINT),

  /** The public website as printed on paper; never the desk origin. */
  host: factOr(dealership.website, "website domain"),

  /**
   * The senders customers see. Not supplied: null until RESEND_FROM_EMAIL and
   * SUPPORT_FROM_EMAIL name verified mailboxes, and mail through Resend stays
   * unsent ("not configured") until then. A mailbox built from the website's
   * domain would be an address nobody confirmed (never invent a dealer fact).
   */
  mailFrom: env(process.env.RESEND_FROM_EMAIL) as string | null,
  mailHost: MAIL_HOST,
  supportFrom: env(process.env.SUPPORT_FROM_EMAIL) as string | null,
  /**
   * The address customers are told to write to. The dealer's email is not
   * supplied, so this stays null and the emails print its "Not set" marker:
   * a mailbox built from the site host would be an address nobody confirmed.
   */
  supportReplyTo: (env(process.env.SUPPORT_REPLY_TO) ?? dealership.email) as string | null,

  filePrefix: "Discount",
};

export const seoKeywords: string[] = [dealership.shortName, dealership.name];

export const editorialImages = {
  hero: { desktop: "", large: "", mobile: "" },
  categories: { performance: "", trucks: "", economy: "", premium: "" },
  interior: "",
} as const;
