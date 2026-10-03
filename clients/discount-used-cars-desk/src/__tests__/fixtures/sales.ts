import type { SaleDetail } from "@/lib/admin/sale-desk";
import { paperworkAnswers, paperworkQuestions } from "@/lib/sales/paperwork";
import { paperworkFilingContext } from "@/lib/sales/paperwork-filing-context";
import { requiredDocumentTypes } from "@/lib/sales/deal-type";
import { settledPlan } from "@/lib/sales/sale-plan";
import { readSalvagePlan } from "@/lib/sales/salvage-plan";

/**
 * One sale per route the desk walks, each as getSaleDetail returns it once
 * the corridor's questions are answered. The page tests file every owed
 * document of every route through `filedFormData`, exactly as the review
 * screen posts it, and read each document back through its probe.
 */

type Over = {
  funding?: SaleDetail["funding"];
  language?: "en" | "es";
  vehicle?: Partial<NonNullable<SaleDetail["vehicle"]>>;
  buyer?: Partial<NonNullable<SaleDetail["buyer"]>>;
  stepData?: Record<string, unknown>;
  plate?: string | null;
};

const LANGUAGE = (value: "en" | "es") => ({ value, at: "2026-10-03T14:00:00Z", by: "member-1" });

const BUYER_ID = {
  name: { read: "AVERY J COLLINS JR", confirmed: "Avery J Collins Jr" },
  nameParts: { first: "Avery", middle: "J", last: "Collins", suffix: "Jr" },
  licenseNumber: { read: "12345678", confirmed: "12345678" },
  mailing: { street: "8810 Coronation Dr", city: "Houston", state: "TX", postal: "77034", county: "Harris" },
  mailingConfirmed: true,
};

const DEALER_PLAN = { registrationBy: "dealer", titleSignedBy: "buyer", inspectionBy: "done", insuranceShown: true };

export function routeSale(id: string, over: Over = {}): SaleDetail {
  const language = over.language ?? "en";
  return {
    id,
    status: "in_progress",
    language,
    createdAt: "2026-10-03T14:00:00.000Z",
    startedAt: "2026-10-03T14:00:00.000Z",
    completedAt: null,
    buyer: {
      id: `${id}-buyer`,
      name: "Avery Collins",
      phone: "+17135550188",
      email: "avery@example.com",
      idNumber: "12345678",
      idState: "TX",
      idKind: "stateLicence",
      address: "8810 Coronation Dr, Houston, TX 77034",
      ...over.buyer,
    },
    vehicle: {
      id: `${id}-car`,
      titleStatus: "clean",
      year: 2021,
      make: "Chevrolet",
      model: "Malibu LT",
      vin: "1G1ZD5ST8MF345678",
      status: "available",
      salePrice: 9000,
      bodyStyle: "Sedan",
      mileage: 64280,
      exteriorColor: "Red",
      trim: null,
      stockNumber: "D-1042",
      weightLbs: 3100,
      weightSource: "texas_title",
      weightReadingLbs: 3100,
      weightRule: "roundUp",
      ...over.vehicle,
    },
    documents: {},
    registration: null,
    funding: over.funding ?? { type: "cash", lenderId: null, lenderOther: null },
    plate: over.plate === undefined ? "27422DLR" : over.plate,
    plateAsked: true,
    stepData: {
      languageConfirmed: LANGUAGE(language),
      buyerId: BUYER_ID,
      funding: over.funding ?? { type: "cash", lenderId: null, lenderOther: null },
      salePlan: DEALER_PLAN,
      ...over.stepData,
    },
  };
}

/** Every answer the corridor would hold once walked, per document. */
const WALKED = {
  billOfSale: { odometerStatus: "actual", paymentMethod: "Zelle", tradeIn: "no", conditionType: "as_is" },
  form130U: { applicationType: "titleAndRegistration", applicantType: "Individual", renewalReminders: "no" },
};

export const ROUTES: Record<string, SaleDetail> = {
  cashPaid: routeSale("cash-paid", {
    stepData: {
      money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
      paperwork: WALKED,
    },
  }),
  cashBalance: routeSale("cash-balance", {
    stepData: {
      money: { amount: "3500", priceBasis: "vehicleOnly", paidTodayAmount: "3500" },
      paperwork: WALKED,
    },
  }),
  bhphTrade: routeSale("bhph-trade", {
    funding: { type: "inHouse", lenderId: null, lenderOther: null },
    stepData: {
      funding: { type: "inHouse", lenderId: null, lenderOther: null },
      money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "1500" },
      paperwork: {
        billOfSale: {
          odometerStatus: "actual",
          tradeIn: "yes",
          tradeInVin: "1HGCM82633A004352",
          tradeInDescription: "2012 Honda Civic LX",
          tradeInAllowance: "2000",
          conditionType: "as_is",
        },
        form130U: WALKED.form130U,
        financing: { downPayment: "1500", paymentFrequency: "Monthly", termsBy: "count", numberOfPayments: "36", apr: "18", firstPaymentDate: "2026-11-03" },
      },
    },
  }),
  bankTypedLender: routeSale("bank", {
    funding: { type: "lender", lenderId: null, lenderOther: "First Community Bank" },
    stepData: {
      funding: { type: "lender", lenderId: null, lenderOther: "First Community Bank" },
      money: { amount: "12000", priceBasis: "vehicleOnly", paidTodayAmount: "2000" },
      paperwork: { billOfSale: { odometerStatus: "actual", tradeIn: "no", conditionType: "as_is" }, form130U: WALKED.form130U },
    },
  }),
  buyerFilesNoInsurance: routeSale("buyer-files", {
    stepData: {
      salePlan: { registrationBy: "buyer", priceIncludesRegistration: false, inspectionBy: "buyer", insuranceShown: false },
      money: { amount: "10000", priceBasis: "outTheDoor", paidTodayAmount: "" },
      paperwork: WALKED,
    },
  }),
  rebuilt: routeSale("rebuilt", {
    vehicle: { titleStatus: "rebuilt_salvage" },
    stepData: { money: { amount: "7000", priceBasis: "vehicleOnly", paidTodayAmount: "" }, paperwork: WALKED },
  }),
  towAway: routeSale("tow-away", {
    vehicle: { titleStatus: "salvage_unrebuilt" },
    plate: null,
    stepData: {
      salvagePlan: { path: "towAway" },
      salePlan: {},
      money: { amount: "2500", priceBasis: "vehicleOnly", paidTodayAmount: "" },
      paperwork: { salvageBillOfSale: { odometerStatus: "actual", paymentMethod: "Cash", howLeaving: "flatbed" } },
    },
  }),
  spanish: routeSale("spanish", {
    language: "es",
    buyer: { name: "Lucía Hernández" },
    stepData: {
      buyerId: { ...BUYER_ID, name: { read: null, confirmed: "Lucía Hernández" }, nameParts: { first: "Lucía", middle: "", last: "Hernández", suffix: "" } },
      money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
      paperwork: WALKED,
    },
  }),
  business: routeSale("business", {
    stepData: {
      money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
      paperwork: {
        billOfSale: WALKED.billOfSale,
        form130U: { ...WALKED.form130U, applicantType: "Business", businessName: "Gulf Coast Hauling, LLC", businessFein: "741234567" },
      },
    },
  }),
  /*
    The two intake gaps the corridor fills: a licence whose issuing state
    the intake did not record (asked on the bill of sale), and a mailing
    address with no county (asked on the 130-U, where the city's county is
    only a guess: south Amarillo is Randall, not Potter).
  */
  noIntakeState: routeSale("no-intake-state", {
    buyer: { idState: "" },
    stepData: {
      money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
      paperwork: { billOfSale: { ...WALKED.billOfSale, buyerLicenseState: "OK" }, form130U: WALKED.form130U },
    },
  }),
  noIntakeCounty: routeSale("no-intake-county", {
    stepData: {
      buyerId: { ...BUYER_ID, mailing: { street: "2100 S Polk St", city: "Amarillo", state: "TX", postal: "79109" } },
      money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
      paperwork: { billOfSale: WALKED.billOfSale, form130U: { ...WALKED.form130U, countyOfResidence: "Randall" } },
    },
  }),
  warranty: routeSale("warranty", {
    stepData: {
      money: { amount: "9000", priceBasis: "vehicleOnly", paidTodayAmount: "" },
      paperwork: {
        billOfSale: {
          ...WALKED.billOfSale,
          conditionType: "warranty",
          warrantyKind: "limited",
          warrantyLaborPercent: "50",
          warrantyPartsPercent: "50",
          warrantySystems: "engine,transmission",
          warrantyDuration: "30 days or 1,000 miles",
        },
        form130U: WALKED.form130U,
      },
    },
  }),
};

/** The documents a route owes, in the packet's order. */
export function owedDocuments(sale: SaleDetail): string[] {
  return requiredDocumentTypes(
    sale.funding.type,
    settledPlan(sale.stepData),
    sale.vehicle?.titleStatus ?? null,
    readSalvagePlan(sale.stepData).path,
  );
}

/** What the review screen posts for a document on this sale: answers over money. */
export function filedFormData(documentType: string, sale: SaleDetail): Record<string, unknown> {
  const county = (sale.stepData as { buyerId?: { mailing?: { county?: string } } }).buyerId?.mailing?.county ?? "";
  const { money, context } = paperworkFilingContext(sale, documentType, county);
  return {
    ...paperworkAnswers(documentType, context),
    ...money,
    ...(documentType === "vehicleResponsibility" ? { quotedRegistrationAmount: money.registrationCost } : {}),
  };
}

/** The questions a document still has open on this sale. */
export function openQuestions(documentType: string, sale: SaleDetail): string[] {
  const county = (sale.stepData as { buyerId?: { mailing?: { county?: string } } }).buyerId?.mailing?.county ?? "";
  const { context } = paperworkFilingContext(sale, documentType, county);
  return paperworkQuestions(documentType, context)
    .filter((question) => context.answers[question.key] === undefined)
    .map((question) => question.key);
}
