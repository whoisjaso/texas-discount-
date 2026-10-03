import { readMoney, typedDollars } from "@/lib/sales/money";
import { paperworkMoney, readPaperwork } from "@/lib/sales/paperwork";
import { readFunding } from "@/lib/sales/deal-type";
import { nameForForms, readBuyerId, settled } from "@/lib/sales/buyer-id";
import { readSalePlan } from "@/lib/sales/sale-plan";
import { readPlate } from "@/lib/sales/webdealer";
import { feeLinesOf, type DealFeeDisplay } from "@/lib/sales/fee-schedule";

/**
 * The bill of sale holds everything it states (owner's decision 10/02/2026;
 * SOP "The sale plan", Freeze).
 *
 * Once a bill of sale is filed, a change to anything it prints that the desk
 * lets staff edit is refused with the way out: void the bill of sale and file
 * it again. The down payment was the first of these (down-payment-freeze.ts,
 * which keeps its own code and sentence); this is the rest: the price, what it
 * includes, how the buyer pays, the lender, the trade-in, the payment method,
 * the mileage statement, the warranty, how a salvage car leaves, the buyer's
 * name, ID and address, the plan's Still To Do, the plate and the language.
 *
 * Measured as the paper reads, not as the boxes were typed: the same figure
 * typed another way, an empty amount that resolves to the car's price, or a
 * default answered out loud is not a change. Two passes keep the common save
 * cheap: pass 1 compares the raw inputs from the deal alone (no lookup), and
 * only when one of them moved does the writer look up the filed bill of sale
 * and compare the printed values (pass 2).
 *
 * Pure, so every writer, the screens and the tests share one rule.
 */

export const BILL_OF_SALE_FROZEN_CODE = "billOfSaleFrozen" as const;

/** What a refusal names, in the order a refusal names the first of several. */
export const FREEZE_FIELDS = [
  "price",
  "priceBasis",
  "funding",
  "lender",
  "tradeIn",
  "paymentMethod",
  "odometer",
  "warranty",
  "howLeaving",
  "buyerName",
  "buyerId",
  "buyerAddress",
  "registration",
  "inspection",
  "insurance",
  "plate",
  "language",
] as const;

export type FreezeField = (typeof FREEZE_FIELDS)[number];

const sentence = (filedWith: string, beforeChanging: string) =>
  `The bill of sale is already filed with ${filedWith}. Void the bill of sale and file it again before changing ${beforeChanging}.`;

/** The English refusals; the screens render funnel.freeze.* in the corridor's language. */
export const FREEZE_MESSAGES: Record<FreezeField | "generic", string> = {
  price: sentence("the price it states", "the price"),
  priceBasis: sentence("what its price includes", "whether tax and fees are included"),
  funding: sentence("how the buyer is paying", "how they pay"),
  lender: sentence("the lender it names", "the lender"),
  tradeIn: sentence("the trade-in it states", "the trade-in"),
  paymentMethod: sentence("how the money was paid", "the payment method"),
  odometer: sentence("its mileage statement", "the mileage statement"),
  warranty: sentence("the warranty it states", "the warranty"),
  howLeaving: sentence("how the car leaves the lot", "how it leaves"),
  buyerName: sentence("the buyer's name", "the buyer's name"),
  buyerId: sentence("the buyer's ID", "the buyer's ID"),
  buyerAddress: sentence("the buyer's address", "the buyer's address"),
  plate: sentence("the plate it states", "the plate"),
  registration: sentence("who files the title and registration", "who files them"),
  inspection: sentence("where the inspection stands", "it"),
  insurance: sentence("whether proof of insurance was shown", "it"),
  language:
    "The bill of sale is already filed in the language of the sale. Void the bill of sale and file it again before changing the language.",
  generic: sentence("what this would change", "it"),
};

/** The power of attorney is ink on the county's form; the desk cannot void it. */
export const HELD_BY_POWER_OF_ATTORNEY_MESSAGE =
  "The power of attorney is filed with the buyer's name and address and is signed in ink. A new one is needed before changing them; ask the owner.";

/**
 * A plan answer a filed plan-derived document holds (planEditRefusal: the
 * 130-U, the power of attorney, the acknowledgments). Voiding the bill of sale
 * voids every one of them but the power of attorney, so that is the way out;
 * a filed power of attorney is ink on the county's form and needs a new one.
 */
export const PLAN_FROZEN_CODE = "planFrozen" as const;

export function planHeldMessage(titles: readonly string[], byPowerOfAttorney: boolean): string {
  return byPowerOfAttorney
    ? "The power of attorney is filed with this answer and is signed in ink. A new one is needed before changing it; ask the owner."
    : `This answer is on the filed paperwork (${titles.join(", ")}). Void the bill of sale and file it again before changing it.`;
}

export type BillOfSaleFrozenRefusal = {
  ok: false;
  code: typeof BILL_OF_SALE_FROZEN_CODE;
  field: FreezeField | "generic";
  error: string;
  /** Set when the holder is a filed power of attorney rather than the bill of sale. */
  heldBy?: "powerOfAttorney";
};

export function billOfSaleFrozen(field: FreezeField | "generic"): BillOfSaleFrozenRefusal {
  return { ok: false, code: BILL_OF_SALE_FROZEN_CODE, field, error: FREEZE_MESSAGES[field] };
}

export function heldByPowerOfAttorney(field: "buyerName" | "buyerAddress" | "registration" | "inspection" | "insurance"): BillOfSaleFrozenRefusal {
  return {
    ok: false,
    code: BILL_OF_SALE_FROZEN_CODE,
    field,
    error: HELD_BY_POWER_OF_ATTORNEY_MESSAGE,
    heldBy: "powerOfAttorney",
  };
}

/** Text as the paper reads it: trimmed, spaces collapsed, case folded. */
function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

/** A typed figure as a figure: "1,500", "$1500.00" and "1500" are one value. */
function dollars(value: unknown): string {
  const typed = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
  if (typed.replace(/[$,\s]/g, "") === "") return "";
  const figure = typedDollars(typed);
  return figure === null ? text(typed) : figure.toFixed(2);
}

const cents = (value: number) => (Number.isFinite(value) ? (Math.round(value * 100) / 100).toFixed(2) : "0.00");

const NOT_CHOSEN = "not chosen yet";

/** The lender the paper names: the directory's entry, or the name typed for one not listed. */
function lenderOf(stepData: unknown): string {
  const funding = readFunding(stepData);
  if (funding.type !== "lender") return "";
  const other = text(funding.lenderOther);
  return `${text(funding.lenderId)}|${other === NOT_CHOSEN ? "" : other}`;
}

function buyerParts(stepData: unknown) {
  const held = readBuyerId(stepData);
  const parts = nameForForms(held).parts;
  return {
    name: [text(settled(held.name)), text(parts.first), text(parts.middle), text(parts.last), text(parts.suffix)].join("|"),
    licence: text(settled(held.licenseNumber)),
    address: [held.mailing.street, held.mailing.city, held.mailing.state, held.mailing.postal].map(text).join("|"),
  };
}

function stillToDo(stepData: unknown) {
  const plan = readSalePlan(stepData);
  return {
    registration: plan.registrationBy === "buyer" ? "buyer" : "dealer",
    inspection: plan.inspectionBy ?? "",
    insurance: plan.insuranceShown === null ? "" : String(plan.insuranceShown),
  };
}

/**
 * The raw inputs of the statement, off the deal alone (pass 1). Both
 * bill-of-sale families' answers are read, because which one is filed is not
 * known until the lookup.
 */
export function statementInputs(stepData: unknown): Record<string, string> {
  const money = readMoney(stepData);
  const funding = readFunding(stepData);
  const bill = readPaperwork(stepData, "billOfSale");
  const salvage = readPaperwork(stepData, "salvageBillOfSale");
  const buyer = buyerParts(stepData);
  const plan = stillToDo(stepData);
  // The answers as typed: the money reader parses a typed figure its own way
  // (a trade-in allowance of "2,000" reads as nothing), so any retyping is a
  // move worth looking up, and pass 2 decides on what the paper prints.
  const answers = (bag: Record<string, string>) =>
    Object.keys(bag)
      .sort()
      .map((key) => `${key}=${text(bag[key])}`)
      .join(";");
  return {
    price: dollars(money.amount),
    priceBasis: money.priceBasis,
    downPayment: dollars(money.paidTodayAmount),
    funding: funding.type ?? "",
    lender: `${text(funding.lenderId)}|${text(funding.lenderOther)}`,
    billAnswers: answers(bill),
    salvageAnswers: answers(salvage),
    buyerName: buyer.name,
    buyerId: buyer.licence,
    buyerAddress: buyer.address,
    registration: plan.registration,
    inspection: plan.inspection,
    insurance: plan.insurance,
    plate: text(readPlate(stepData)),
  };
}

/** Pass 1: whether anything the bill of sale could state moved at all. */
export function statementInputsChanged(before: unknown, after: unknown): boolean {
  const a = statementInputs(before);
  const b = statementInputs(after);
  return Object.keys({ ...a, ...b }).some((key) => a[key] !== b[key]);
}

export type BillOfSaleRoot = "billOfSale" | "salvageBillOfSale";

export type BillOfSaleStatement = {
  inputs: Record<string, string>;
  /** The money figures as printed, in cents. */
  money: string;
  /** Everything else printed, by the field a refusal would name. */
  printed: Record<FreezeField, string>;
};

/**
 * What the filed bill of sale states, as the deal stands (pass 2). `advertised`
 * is the vehicle row's price, which the figures fall back to only on a deal
 * with no typed amount; `rootType` says which bill of sale is filed.
 */
export function billOfSaleStatement(
  stepData: unknown,
  context: {
    advertised: number | null | undefined;
    rootType?: string | null;
    /**
     * The fee lines the filed copy printed (`filedBillOfSaleOn`), for a sale
     * with no fee copy of its own. A sale's own copy (`step_data.fees`) is
     * read first: the fees are fixed per sale, so the statement before and
     * after a change computes with the same three lines.
     */
    fees?: Pick<DealFeeDisplay, "titleFee" | "docFee" | "registrationFee"> | null;
  },
): BillOfSaleStatement {
  const rootType: BillOfSaleRoot = context.rootType === "salvageBillOfSale" ? "salvageBillOfSale" : "billOfSale";
  const salvage = rootType === "salvageBillOfSale";
  const funding = readFunding(stepData);
  const bill = readPaperwork(stepData, "billOfSale");
  const answers = readPaperwork(stepData, rootType);
  const lines = feeLinesOf(stepData, context.fees ? { ...context.fees, docFeeSet: true } : null);
  // A tow-away sale registers nothing, so its figures carry no registration
  // fee (the same lines the filing computed with; dealership-fees.ts).
  const fees = salvage ? { ...lines, registrationFee: 0 } : lines;
  const figures = paperworkMoney(context.advertised, bill, readMoney(stepData), funding.type, fees);
  const money = [
    figures.salePrice,
    figures.tax,
    figures.titleFee,
    figures.docFee,
    salvage ? 0 : figures.registrationFee,
    salvage ? 0 : figures.tradeInAllowance,
    salvage ? figures.salePrice + figures.tax + figures.titleFee + figures.docFee : figures.total,
    figures.paidToday,
    salvage ? 0 : figures.sellerLienAmount,
  ]
    .map(cents)
    .concat(salvage ? "" : String(figures.sellerLienEnabled))
    .join("|");
  const cash = funding.type !== "lender" && funding.type !== "inHouse";
  const condition = text(answers.conditionType || "as_is");
  const buyer = buyerParts(stepData);
  const plan = stillToDo(stepData);
  const printed: Record<FreezeField, string> = {
    // The money group is compared as one, then named by the input that moved.
    price: "",
    priceBasis: "",
    funding: funding.type ?? "",
    lender: lenderOf(stepData),
    tradeIn: salvage
      ? ""
      : bill.tradeIn === "yes"
        ? `yes|${text(bill.tradeInDescription)}|${dollars(bill.tradeInAllowance)}`
        : "no",
    paymentMethod: cash ? text(answers.paymentMethod || "Cash") : "",
    odometer: text(answers.odometerStatus || "actual"),
    warranty: salvage ? "" : condition === "warranty" ? `warranty|${text(answers.warrantyDuration)}` : condition,
    howLeaving: salvage ? text(answers.howLeaving) : "",
    buyerName: buyer.name,
    buyerId: `${buyer.licence}|${text(answers.buyerLicenseState)}`,
    buyerAddress: buyer.address,
    registration: salvage ? "" : plan.registration,
    inspection: salvage ? "" : plan.inspection,
    insurance: salvage ? "" : plan.insurance,
    // Compared against what the filed copy printed (platePrintedConflict).
    plate: "",
    // The deal's language is a column, compared at its own writer.
    language: "",
  };
  return { inputs: statementInputs(stepData), money, printed };
}

/** The inputs whose change moves the money figures, in the order a refusal names them. */
const MONEY_INPUTS: ReadonlyArray<[string, FreezeField]> = [
  ["price", "price"],
  ["priceBasis", "priceBasis"],
  ["funding", "funding"],
  ["lender", "lender"],
  ["billAnswers", "tradeIn"],
];

/**
 * Pass 2: the fields whose printed value differs between two statements, in
 * the order a refusal names them. A change to the money is named by the input
 * that moved it (the price, its basis, the funding, the trade-in), or as the
 * price when the vehicle row's price moved it on a deal with no typed amount.
 */
export function frozenFieldsChanged(a: BillOfSaleStatement, b: BillOfSaleStatement): FreezeField[] {
  const changed = new Set<FreezeField>();
  for (const field of FREEZE_FIELDS) {
    if (a.printed[field] !== b.printed[field]) changed.add(field);
  }
  if (a.money !== b.money) {
    const moved = MONEY_INPUTS.find(([key]) => a.inputs[key] !== b.inputs[key]);
    changed.add(moved ? moved[1] : "price");
  }
  return FREEZE_FIELDS.filter((field) => changed.has(field));
}

/**
 * The plate against the plate the filed bill of sale printed. A bill of sale
 * filed with no plate ("not yet") lets the title step record the issued one;
 * a printed plate refuses any other.
 */
export function platePrintedConflict(printedPlate: string | null | undefined, next: string | null | undefined): boolean {
  const printed = text(printedPlate).replace(/\s+/g, "");
  if (!printed) return false;
  return printed !== text(next).replace(/\s+/g, "");
}

/** The ID number against the licence the filed bill of sale printed (Close The Sale). */
export function idPrintedConflict(printedLicence: string | null | undefined, next: string | null | undefined): boolean {
  const typed = text(next).replace(/\s+/g, "");
  if (!typed) return false;
  return text(printedLicence).replace(/\s+/g, "") !== typed;
}

/**
 * Every key the bill of sale's printed payload carries (corridor-link.ts,
 * both bill-of-sale families), and why it is or is not frozen. A guard test
 * fails on any key the renderer prints that is not classified here.
 *
 *   frozen:<fields>   a desk screen can change it, so the freeze holds it
 *   fixed:<reason>    nothing at the desk changes it once the sale started
 */
export const BILL_OF_SALE_PRINTED_KEYS: Readonly<Record<string, string>> = {
  saleDate: "fixed:the filing date",
  stockNumber: "fixed:printed empty",
  outstanding: "frozen:registration,inspection,insurance",
  buyerName: "frozen:buyerName",
  applicantFirstName: "frozen:buyerName",
  applicantMiddleName: "frozen:buyerName",
  applicantLastName: "frozen:buyerName",
  applicantSuffix: "frozen:buyerName",
  buyerPhone: "fixed:the customer row, written at Start A Sale; no desk screen edits it",
  buyerEmail: "fixed:the customer row, written at Start A Sale; no desk screen edits it",
  buyerAddress: "frozen:buyerAddress",
  buyerCity: "frozen:buyerAddress",
  buyerState: "frozen:buyerAddress",
  buyerZip: "frozen:buyerAddress",
  buyerLicense: "frozen:buyerId",
  buyerIdNumber: "frozen:buyerId",
  buyerIdKind: "fixed:the customer row, written at Start A Sale",
  buyerLicenseState: "fixed:the customer row, written at Start A Sale (the bill of sale's own licence-state answer is frozen with buyerId)",
  vehicleYear: "fixed:the vehicle row",
  vehicleMake: "fixed:the vehicle row",
  vehicleModel: "fixed:the vehicle row",
  vehicleVin: "fixed:the vehicle row",
  vin: "fixed:the vehicle row",
  vehicleDescription: "fixed:the vehicle row",
  vehicleBodyStyle: "fixed:the vehicle row",
  vehicleMileage: "fixed:the vehicle row, written at Start A Sale",
  vehicleColor: "fixed:the vehicle row",
  vehicleTrim: "fixed:the vehicle row",
  vehiclePlate: "frozen:plate",
  coBuyerName: "fixed:printed empty",
  coBuyerAddress: "fixed:printed empty",
  coBuyerCity: "fixed:printed empty",
  coBuyerState: "fixed:printed empty",
  coBuyerZip: "fixed:printed empty",
  coBuyerPhone: "fixed:printed empty",
  coBuyerEmail: "fixed:printed empty",
  coBuyerLicense: "fixed:printed empty",
  coBuyerLicenseState: "fixed:printed empty",
  odometerReading: "fixed:the vehicle row, written at Start A Sale",
  odometerStatus: "frozen:odometer",
  salePrice: "frozen:price,priceBasis,funding,tradeIn",
  tradeInAllowance: "frozen:tradeIn",
  tradeInDescription: "frozen:tradeIn",
  tradeInVin: "fixed:printed empty",
  tradeInPayoff: "fixed:printed as zero; the desk never asks it",
  tax: "frozen:price,priceBasis,tradeIn",
  titleFee: "fixed:the deal's fee copy (step_data.fees), written at Start A Sale, or its government fees confirmed from webDEALER (step_data.governmentFees), which refuse a change while a bill of sale is filed",
  docFee: "fixed:the deal's fee copy (step_data.fees), written at Start A Sale",
  registrationFee: "fixed:the deal's fee copy (step_data.fees), written at Start A Sale, or its government fees confirmed from webDEALER (step_data.governmentFees), which refuse a change while a bill of sale is filed",
  docFeeNotice: "fixed:statutory notice version, written at filing",
  docFeeNoticeSpanish: "fixed:the sale's language at filing (the language itself is frozen)",
  total: "frozen:price,priceBasis,tradeIn",
  otherFees: "fixed:printed as zero",
  otherFeesDescription: "fixed:printed empty",
  paymentMethod: "frozen:paymentMethod,funding",
  paymentMethodOther: "frozen:lender",
  conditionType: "frozen:warranty",
  warrantyDuration: "frozen:warranty",
  warrantyDescription: "fixed:printed empty",
  amountPaidToday: "frozen:price,priceBasis,funding (the down payment keeps its own refusal)",
  sellerLienEnabled: "frozen:price,priceBasis,funding,tradeIn",
  sellerLienAmount: "frozen:price,priceBasis,funding,tradeIn",
  sellerLienReason: "fixed:constant wording",
  sellerLienDate: "fixed:the filing date",
  sellerLienholderName: "fixed:dealer config",
  sellerLienholderAddress: "fixed:dealer config",
  sellerLienholderCity: "fixed:dealer config",
  sellerLienholderState: "fixed:dealer config",
  sellerLienholderZip: "fixed:dealer config",
  titleLienholderName: "frozen:lender",
  titleLienholderAddress: "frozen:lender",
  titleLienholderCity: "frozen:lender",
  titleLienholderState: "frozen:lender",
  titleLienholderZip: "frozen:lender",
  titleLienReason: "frozen:lender",
  howLeaving: "frozen:howLeaving",
  salvageLicense: "fixed:dealer config",
  titleOriginState: "fixed:written at Start A Sale",
  language: "frozen:language",
  dealerSignerName: "fixed:the filer, recorded at filing",
};

/**
 * Keys the bill of sale prints only on a sale that charges them: the
 * government lines of their own, once the sale's government fees are
 * confirmed from webDEALER (government-fees.ts). Classified the same way.
 */
export const BILL_OF_SALE_CONDITIONAL_PRINTED_KEYS: Readonly<Record<string, string>> = {
  inspectionFee: "fixed:the sale's government fees confirmed from webDEALER (step_data.governmentFees), which refuse a change while a bill of sale is filed",
  plateFee: "fixed:the sale's government fees confirmed from webDEALER (step_data.governmentFees), which refuse a change while a bill of sale is filed",
};
