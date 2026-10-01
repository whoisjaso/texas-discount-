/**
 * Single source of truth for every dealership fact the desk and its documents
 * print. Nothing else in `src/` may type one of these values (a guard test
 * enforces it).
 *
 * Nothing here may be invented. Vega's Auto Sales & Glass Co. has not supplied
 * its FACTS block yet, so:
 *
 * - values visible on the business's own public listings (Facebook page,
 *   Google Business listing via Birdeye, MapQuest, Waze) are filled in and
 *   marked PUBLIC, pending the owner's confirmation;
 * - values on the state's licence record are filled in and marked TXDMV:
 *   the Independent (GDN) Motor Vehicle Dealers List, data current as of
 *   09/26/2026 (licence P113248, Active, expires 01/31/2027, Harris County,
 *   7722 Galveston Rd, (713) 941-1622);
 * - every other fact is `null`. Screens say it is missing, previews print a
 *   visible "Not set" marker in its place, and filing a document is refused
 *   until it is supplied (see `missingDealerFacts`).
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
 * The domain is not known yet. Until NEXT_PUBLIC_SITE_URL is set, links the
 * desk builds (signing texts, capture QR codes) use the origin it is served
 * from, which is correct locally and on any preview deployment.
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

// PUBLIC: (713) 941-1622 on the Facebook page, Google listing and MapQuest.
const RAW_PHONE = env(process.env.NEXT_PUBLIC_DEALER_PHONE) ?? "+17139411622";

/** "+17139411622" -> "(713) 941-1622" */
function formatUsPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length !== 10) return e164;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export const dealership = {
  // PUBLIC: the name on the Facebook page and the Google listing.
  name: env(process.env.NEXT_PUBLIC_DEALER_NAME) ?? "Vega's Auto Sales & Glass Co.",
  shortName: env(process.env.NEXT_PUBLIC_DEALER_SHORT_NAME) ?? "Vega's",
  /**
   * TXDMV: the licence is held by Constantino Vega (business name) doing
   * business as VEGA'S AUTO SALES (DBA).
   */
  legalName: (env(process.env.NEXT_PUBLIC_DEALER_LEGAL_NAME) ?? "Constantino Vega DBA Vega's Auto Sales") as string | null,
  url: SITE_URL,

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
   * Motor Vehicle, expires 01/31/2027. Renewal is the owner's to track.
   */
  license: env(process.env.NEXT_PUBLIC_DEALER_LICENSE) ?? "P113248",

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

  // PUBLIC: 7722 Galveston Rd, Houston, TX 77034 on every listing.
  address: {
    street: env(process.env.NEXT_PUBLIC_DEALER_STREET) ?? "7722 Galveston Rd",
    locality: env(process.env.NEXT_PUBLIC_DEALER_CITY) ?? "Houston",
    region: env(process.env.NEXT_PUBLIC_DEALER_STATE) ?? "TX",
    postalCode: env(process.env.NEXT_PUBLIC_DEALER_ZIP) ?? "77034",
    country: "US",
    /** Single-line form for compact UI. */
    oneLine: `${env(process.env.NEXT_PUBLIC_DEALER_STREET) ?? "7722 Galveston Rd"}, ${env(process.env.NEXT_PUBLIC_DEALER_CITY) ?? "Houston"}, ${env(process.env.NEXT_PUBLIC_DEALER_STATE) ?? "TX"} ${env(process.env.NEXT_PUBLIC_DEALER_ZIP) ?? "77034"}`,
  },

  /** TXDMV: the county on the dealer licence record, which the 130-U names. */
  county: env(process.env.NEXT_PUBLIC_DEALER_COUNTY) ?? "Harris",

  /**
   * The business clock. Every date on a document or signature is the business
   * date here, never the server's UTC date. Texas (Houston) default; the owner
   * confirms it with the rest of the facts.
   */
  timeZone: env(process.env.NEXT_PUBLIC_DEALER_TIME_ZONE) ?? "America/Chicago",

  geo: null as { latitude: number; longitude: number } | null,

  // PUBLIC: Monday to Saturday 9:00 to 18:00, closed Sunday (Google, Waze).
  hours: [
    {
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "09:00",
      closes: "18:00",
    },
    { days: ["Sunday"], opens: null, closes: null },
  ] satisfies DealershipHours[],

  priceRange: null as string | null,
  serviceArea: "Houston and surrounding areas",
  socials: [
    { label: "Facebook", href: "https://www.facebook.com/profile.php?id=100064755109997" },
  ] as SocialProfile[],

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

  lenders: [] as Lender[],

  /** TxDMV webDEALER, where Texas dealers file title since 1 July 2025. */
  webDealerUrl: env(process.env.NEXT_PUBLIC_WEBDEALER_URL) ?? "https://www.txdmv.gov/dealers/webdealer",

  /** The authorised signer printed under the dealer line. Not supplied. */
  signer: {
    name: env(process.env.NEXT_PUBLIC_DEALER_SIGNER_NAME),
    title: env(process.env.NEXT_PUBLIC_DEALER_SIGNER_TITLE),
  },

  profile: {
    owner: env(process.env.NEXT_PUBLIC_DEALER_OWNER),
    locale: env(process.env.NEXT_PUBLIC_DEALER_LOCALE) ?? "Houston, Texas",
    segment: env(process.env.NEXT_PUBLIC_DEALER_SEGMENT) ?? "pre-owned cars, trucks and SUVs, and auto glass",
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
export const dealerFees = {
  /** Texas motor vehicle sales tax, Tax Code §152.021. */
  taxRate: Number(env(process.env.NEXT_PUBLIC_DEALER_TAX_RATE)) || 0.0625,
  titleFee: Number(env(process.env.NEXT_PUBLIC_DEALER_TITLE_FEE)) || 33,
  registrationFee: Number(env(process.env.NEXT_PUBLIC_DEALER_REGISTRATION_FEE)) || 75,
  docFee: env(process.env.NEXT_PUBLIC_DEALER_DOC_FEE) === null ? null : Number(env(process.env.NEXT_PUBLIC_DEALER_DOC_FEE)),
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
 * The facts a filed document cannot go without, in the words the owner is
 * asked for them. Empty when every one is supplied.
 */
export function missingDealerFacts(): string[] {
  const missing: string[] = [];
  if (!dealership.legalName) missing.push("Dealer legal name");
  if (!dealership.license) missing.push("Dealer licence (GDN) number");
  if (!dealership.county) missing.push("County");
  if (dealerFees.docFee === null || !Number.isFinite(dealerFees.docFee)) missing.push("Documentary fee");
  if (!dealership.signer.name) missing.push("Authorised signer");
  if (!SITE_URL_CONFIGURED) missing.push("Website domain");
  return missing;
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

const DAY_NAMES: Record<"en" | "es", Record<string, string>> = {
  en: { Monday: "Monday", Saturday: "Saturday", Sunday: "Sunday" },
  es: { Monday: "Lunes", Saturday: "sábado", Sunday: "Domingo" },
};

/** "09:00" -> "9:00 AM" */
function to12Hour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export type HoursLines = {
  weekday: string;
  sunday: string;
  closedWord: string;
};

export function hoursLines(locale: string): HoursLines {
  const isEs = locale === "es";
  const names = DAY_NAMES[isEs ? "es" : "en"];
  const day = (name: string) => names[name] ?? name;

  const open = dealership.hours.find((rule) => rule.opens && rule.closes) ?? dealership.hours[0];
  const shut = dealership.hours.find((rule) => !rule.opens);

  const first = day(open.days[0]);
  const last = day(open.days[open.days.length - 1]);
  const from = to12Hour(open.opens ?? "09:00");
  const until = to12Hour(open.closes ?? "18:00");
  const closedWord = isEs ? "Cerrado" : "Closed";
  const closedDay = day(shut?.days[0] ?? "Sunday");

  return {
    weekday: isEs ? `${first} a ${last}, ${from} a ${until}` : `${first} to ${last}, ${from} to ${until}`,
    sunday: `${closedDay}: ${closedWord}`,
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
const MAIL_HOST = HOST.replace(/^www\./, "");

/**
 * The brand layer. Vega's has an emblem (`logo`) but no wordmark or monogram
 * artwork, so the name is drawn and the emblem stands in for the monogram.
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

  wordmark: env(process.env.NEXT_PUBLIC_BRAND_WORDMARK) ?? "VEGA'S",
  subline: env(process.env.NEXT_PUBLIC_BRAND_SUBLINE) ?? "Auto Sales · Glass Co.",

  /** The emblem the owner supplied: gold ring, Texas flag, black SS. */
  logo: env(process.env.NEXT_PUBLIC_BRAND_LOGO) ?? "/brand/vegas-logo-sm.png",
  logoPrint: env(process.env.BRAND_LOGO_PRINT),

  /** The website as printed on paper; a marker until the domain is supplied. */
  host: SITE_URL_CONFIGURED ? HOST : notSet("website domain"),

  /** Mail stays unsent until a verified sending domain is configured. */
  mailFrom: env(process.env.RESEND_FROM_EMAIL) ?? `documents@${MAIL_HOST}`,
  mailHost: MAIL_HOST,
  supportFrom: env(process.env.SUPPORT_FROM_EMAIL) ?? `support@${MAIL_HOST}`,
  supportReplyTo: env(process.env.SUPPORT_REPLY_TO) ?? env(process.env.NEXT_PUBLIC_DEALER_EMAIL) ?? `support@${MAIL_HOST}`,

  filePrefix: "Vegas",
};

export const seoKeywords: string[] = [dealership.shortName, dealership.name];

export const editorialImages = {
  hero: { desktop: "", large: "", mobile: "" },
  categories: { performance: "", trucks: "", economy: "", premium: "" },
  interior: "",
} as const;
