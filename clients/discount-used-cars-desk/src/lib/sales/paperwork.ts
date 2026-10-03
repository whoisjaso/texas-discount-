import {
  TEXAS_TITLE_FEE,
  DEFAULT_DOC_FEE,
  DEFAULT_REG_FEE,
} from "@/lib/documents/billOfSale";
import {
  BALANCE_OWED_REASON,
  readMoney,
  saleMoney,
  writeMoney,
  type MoneyAnswers,
  type SaleMoney,
} from "@/lib/sales/money";
import type { DealType } from "@/lib/sales/deal-type";
import type { DealFeeLines } from "@/lib/sales/fee-schedule";
import {
  isProblem,
  solveTerms,
  vehicleClass,
  type Frequency,
  type Terms,
  type TermsProblem,
} from "@/lib/documents/terms";
import { dealership } from "@/lib/dealership-config";
import {
  affixedEmptyWeight,
  type EmptyWeightContext,
} from "@/lib/vehicles/empty-weight/on-the-sale";
import { factById, ownedFacts, texasCountyForCity, type DealFact } from "@/lib/sales/deal-facts";
import { askOrderFor, fieldMapFor } from "@/lib/documents/field-maps";
import { factsPrinted, factsRead } from "@/lib/documents/field-maps/types";

/**
 * The paperwork, asked one question at a time, on the sale.
 *
 * A dealer signing a bill of sale used to be sent to the templates section: a
 * form of forty-odd boxes, most of them holding values this software already
 * knew, laid out as one page of everything. That is the right screen for
 * printing a blank form for somebody who walked in off the street. It is the
 * wrong screen for the middle of a sale, where the vehicle, the buyer, the
 * licence and the money have all already been answered and the only honest
 * question is the handful of things nobody has been asked yet.
 *
 * So this file holds the handful. Everything not in here is filled in from the
 * deal, the licence, the vehicle row or the dealership's own configuration,
 * and the operator never sees it as a question. What is left is short enough
 * to put one to a screen, which is the standing rule for this whole flow.
 *
 * Two things are deliberately not here:
 *
 *   the buyer's guide   an FTC window form that is printed and never stored.
 *                       It has no record to write, so it has no questions.
 *   anything derived    tax, monthly payment, amount financed. A figure a
 *                       formula can produce is not a question, and asking it
 *                       invites an answer that disagrees with the formula.
 */

/** What kind of answer a question takes, which decides what is drawn. */
export type PaperworkKind =
  | "choice"
  | "money"
  | "number"
  | "text"
  | "date"
  /** A searchable tap list: the states, the Texas counties. */
  | "list"
  /** Several taps, then Done; stored comma-separated. */
  | "multi"
  /** Dates worked out from the deal, as taps, with "Another Date" for the rest. */
  | "dateChoice"
  /** Seventeen characters read off a car. */
  | "vin";

export type PaperworkOption = {
  value: string;
  label: string;
  /** The one line under the label. Omitted when the label says it all. */
  gloss?: string;
  /**
   * A label worked out from the deal (a date, a rate) names its words here,
   * so the Spanish screen says the same thing: funnel.paperwork.templates.
   */
  template?: string;
  /** The same, for the gloss under the label (the house rate's "starting rate"). */
  glossTemplate?: string;
};

export type PaperworkQuestion = {
  /** Stored under this name on the deal, and used in the URL. */
  key: string;
  /** Asked out loud, as a header, so every word is capitalised. */
  question: string;
  kind: PaperworkKind;
  /** Choices, for a choice question. */
  options?: PaperworkOption[];
  /** The list a "list" question picks from. */
  list?: "usStates" | "texasCounties" | "bodyStyles";
  /**
   * A choice question whose answer can also be something not on the list:
   * the last card opens a box of this kind on the same screen.
   */
  other?: { label: string; kind: "number" | "money" | "text" | "date" };
  /**
   * One sentence, only when the question cannot be answered without it. Most
   * questions here do not have one, and that is the target.
   */
  note?: string;
  /**
   * Whether this question exists on this deal at all.
   *
   * A question that does not apply is absent rather than skippable. A screen
   * whose only answer is Continue is not a screen, and a counter that includes
   * it is lying about how much work is left.
   */
  applies?: (context: PaperworkContext) => boolean;
  /**
   * Whether "not applicable" is a real answer here.
   *
   * Answering "not applicable" stores an empty answer, which the document
   * prints as a blank box, which is what the state form expects.
   */
  optional?: boolean;
};

/**
 * A question with the server-side half taken off.
 *
 * `applies` is a function, and a function cannot cross into a client
 * component: React refuses to serialise it and the screen becomes a server
 * render error with the message hidden in production. Every conditional
 * question in this file crashed its own screen until this existed.
 *
 * Deciding which questions exist, and which options a worked-out choice
 * offers (a date, the house rate), is the server's job and is done by the
 * time one is rendered, so the client never needs a predicate.
 */
export type AskedQuestion = Omit<PaperworkQuestion, "applies">;

/** Drop the parts that only the server can use, resolving worked-out options. */
export function asked(question: PaperworkQuestion, context?: PaperworkContext): AskedQuestion {
  const fact = question as Partial<DealFact>;
  const options =
    fact.dynamicOptions && context ? fact.dynamicOptions(context) : question.options;
  return {
    key: question.key,
    question: question.question,
    kind: question.kind,
    ...(options ? { options } : {}),
    ...(question.list ? { list: question.list } : {}),
    ...(question.other ? { other: question.other } : {}),
    ...(question.note ? { note: question.note } : {}),
    ...(question.optional ? { optional: true } : {}),
  };
}

/** What the question list is allowed to know about the deal. */
export type PaperworkContext = {
  funding: DealType | null;
  /** Body style off the vehicle row, lowercased. Empty when unknown. */
  bodyStyle: string;
  /**
   * The issuing state the intake screen already captured, when it did. A
   * question whose answer the deal already holds is not a question.
   */
  licenceState: string;
  /** The kind of photo ID the intake recorded; null on older records (a licence). */
  idKind?: string | null;
  /**
   * What the money step recorded as crossing the desk today, in dollars.
   * Null when the money step has not been answered. On a buy-here-pay-here
   * deal this is the financing contract's down payment: one fact, asked once.
   */
  paidToday: number | null;
  /** The buyer's confirmed mailing city, for the county's starting value. */
  buyerCity: string;
  /**
   * The county this document starts at: the intake's, or one looked up from
   * the mailing address (`resolveCounty`). A starting value, not an answer.
   */
  buyerCounty: string;
  /**
   * The county the operator typed at intake, when they typed one. The 130-U
   * does not ask it again: the review reads it back with Change.
   */
  intakeCounty?: string;
  /** The buyer's email, for the 130-U box 27 question (asked only with one). */
  buyerEmail?: string;
  /** The contract's date (the business date), for the first-payment taps. */
  contractDate?: string;
  /** The vehicle row's `weight_lbs`, as callers have always passed it. */
  vehicleWeight?: number | null;
  /** Box 11 on this sale (empty-weight/on-the-sale.ts). */
  emptyWeight?: EmptyWeightContext | null;
  /** A question the review's Change link reopened, e.g. "emptyWeight". */
  reopen?: string;
  /** The whole deal in dollars, off the money step, for the note's principal. */
  dealTotal?: number | null;
  /** The car's model year, for the rate ceiling's vehicle class. */
  vehicleYear?: number | null;
  /** The year of the sale, for the same. Defaults to this year. */
  saleYear?: number;
  /** Answers already given on this document. */
  answers: Record<string, string>;
  /**
   * Every document's answers on the deal (`step_data.paperwork`), so a page
   * that prints another document's fact (the 130-U's box 10 is the bill of
   * sale's mileage statement) reads that answer instead of asking again.
   * Absent: only this document's own facts are resolved.
   */
  allAnswers?: Record<string, Record<string, string>>;
};

function frequencyOf(value: string | undefined): Frequency {
  return value === "Weekly" || value === "Bi-weekly" ? value : "Monthly";
}

export type FinancingTerms = Terms & { frequency: Frequency; principal: number };

/**
 * The whole note from what was agreed, or the reason there is none yet.
 *
 * Reads the answers the way a desk gives them: the payment, the count, or
 * both, at the house rate when no rate was said. A deal from before the
 * "agreed on" question existed carries a count and a rate and no `termsBy`,
 * and is read as a count. Null while nothing has been agreed.
 */
export function financingTerms(
  answers: Record<string, string>,
  context: Pick<PaperworkContext, "dealTotal" | "vehicleYear" | "saleYear" | "paidToday">,
): FinancingTerms | TermsProblem | null {
  const total = context.dealTotal;
  if (total === null || total === undefined) return null;
  // Read the way the contract's itemisation reads it (corridor-link `num`):
  // "$", "," and spaces stripped. A deal saved before the down payment was
  // stored as a plain figure can hold "1,500", which Number() alone read as
  // nothing down, solving the payment on a different principal than the
  // amount financed printed beside it.
  const down = answers.downPayment?.trim()
    ? Number(answers.downPayment.replace(/[$,\s]/g, "")) || 0
    : (context.paidToday ?? 0);
  const principal = Math.max(0, Math.round((total - down) * 100) / 100);
  const frequency = frequencyOf(answers.paymentFrequency);
  const by = answers.termsBy;
  const payment = by === "payment" || by === "both" ? Number(answers.paymentAmount) || null : null;
  const count = by === "count" || by === "both" || !by ? Number(answers.numberOfPayments) || null : null;
  if (!payment && !count) return null;
  const apr = by === "both" ? null : answers.apr?.trim() ? Number(answers.apr) : null;
  const cls = vehicleClass(context.saleYear ?? new Date().getUTCFullYear(), context.vehicleYear ?? null);
  const result = solveTerms({
    principal,
    frequency,
    vehicleClass: cls,
    defaultApr: dealership.financing.defaultApr,
    apr,
    payment,
    count,
  });
  return isProblem(result) ? result : { ...result, frequency, principal };
}

/**
 * Documents the corridor carries with NO questions of their own.
 *
 * Every box on these is filled from the sale, so the corridor owes each a
 * read-back of its page, a pad and a filing, and not a single question.
 */
const REVIEW_ONLY_TYPES = new Set([
  "powerOfAttorney",
  "insuranceAcknowledgment",
  "rebuiltDisclosure",
  "towAwayAcknowledgment",
  "buyerResponsibilityStatement",
  "vehicleResponsibility",
]);

/** The documents whose questions this corridor asks, by `document_agreements` type. */
const WALKED_TYPES = ["billOfSale", "form130U", "financing", "vehicleResponsibility", "salvageBillOfSale"];

/** Whether this flow knows how to ask for (or review) a document at all. */
export function hasPaperwork(documentType: string | undefined): boolean {
  return Boolean(
    documentType && (WALKED_TYPES.includes(documentType) || REVIEW_ONLY_TYPES.has(documentType)),
  );
}

/** The answers of another document on the deal, from the context. */
function answersOf(context: PaperworkContext, owner: string): Record<string, string> {
  return context.allAnswers?.[owner] ?? {};
}

/** A fact's own context: its owner's answers, whichever document asks it. */
function contextFor(fact: DealFact, documentType: string, context: PaperworkContext): PaperworkContext {
  if (fact.owner === documentType) return context;
  return { ...context, answers: { ...answersOf(context, fact.owner), ...pick(context.answers, fact.key) } };
}

function pick(answers: Record<string, string>, key: string): Record<string, string> {
  return answers[key] === undefined ? {} : { [key]: answers[key] };
}

/** Whether a fact exists on this deal, read in its owner's answers. */
function factApplies(fact: DealFact, documentType: string, context: PaperworkContext): boolean {
  return !fact.applies || fact.applies(contextFor(fact, documentType, context));
}

/**
 * Whether a fact is a question on this sale at all: it applies, read in its
 * owner's answers. A box reading a fact that does not apply (the cash-only
 * payment method on a bank deal, the rate when the payment and the count
 * were both agreed, the licence state the intake recorded) takes its value
 * from somewhere else, and the review says where (field-maps `fallback`).
 */
export function factAppliesOnSale(fact: DealFact, documentType: string, context: PaperworkContext): boolean {
  return factApplies(fact, documentType, context);
}

/** The value the deal already holds for a fact, when it holds one (never asked). */
function knownValue(fact: DealFact, documentType: string, context: PaperworkContext): string | undefined {
  if (!fact.known) return undefined;
  if (context.reopen === fact.key) return undefined;
  const value = fact.known(contextFor(fact, documentType, context));
  return value === undefined || value === "" ? undefined : value;
}

/**
 * The facts another document owns that this one's pages print and nobody
 * has answered yet, with no starting value to fall back on (or one that may
 * never be filed unseen). They are asked here, stored with their owner, and
 * drop out of this list once answered: a fact is still asked once.
 */
function borrowedFacts(documentType: string, context: PaperworkContext): DealFact[] {
  if (!context.allAnswers) return [];
  const map = fieldMapFor(documentType);
  if (!map) return [];
  const out: DealFact[] = [];
  // Printed boxes only: a carried legacy key (the rebuilt disclosure's ID
  // issuer, which the state page has no line for) is never a question.
  for (const id of factsPrinted(map)) {
    const fact = factById(id);
    if (!fact || fact.owner === documentType || fact.owner.startsWith("guide:")) continue;
    if (!factApplies(fact, documentType, context)) continue;
    if (knownValue(fact, documentType, context) !== undefined) continue;
    if (answersOf(context, fact.owner)[fact.key] !== undefined) continue;
    // A start that resolves files unseen, so nothing is left to ask here; a
    // start with nothing to offer on this sale leaves the box to ask.
    const start = fact.start ? fact.start(contextFor(fact, documentType, context)) : undefined;
    if (start !== undefined && start !== "" && !fact.mustAnswer) continue;
    out.push(fact);
  }
  return out;
}

/**
 * The questions this document asks on this deal, in order.
 *
 * Derived from its pages: the facts it owns, in its map's ask order, that
 * apply to this deal and that the deal does not already hold; then the
 * facts its pages print that another document owns and nobody has answered.
 * Recomputed from the answers each time, so a Yes to "is there a trade-in"
 * grows the follow-on questions in place and a No never shows them.
 */
export function paperworkQuestions(
  documentType: string,
  context: PaperworkContext,
): PaperworkQuestion[] {
  const owned = askOrderFor(documentType)
    .map((id) => factById(id))
    .filter((fact): fact is DealFact => Boolean(fact) && fact!.owner === documentType)
    .filter((fact) => factApplies(fact, documentType, context))
    .filter((fact) => knownValue(fact, documentType, context) === undefined);
  return [...owned, ...borrowedFacts(documentType, context)];
}

/** The fact a document's question key names: its own, or one it borrows. */
export function questionFact(documentType: string, key: string): DealFact | undefined {
  const own = ownedFacts(documentType).find((fact) => fact.key === key);
  if (own) return own;
  const map = fieldMapFor(documentType);
  if (!map) return undefined;
  for (const id of factsRead(map)) {
    const fact = factById(id);
    if (fact && fact.key === key && !fact.owner.startsWith("guide:")) return fact;
  }
  return undefined;
}

/** Where in the list a question sits, or -1 when it does not apply here. */
export function questionPosition(
  questions: PaperworkQuestion[],
  key: string,
): number {
  return questions.findIndex((question) => question.key === key);
}

/**
 * The first question with no answer, or null when every one is answered.
 *
 * What "answered" means is deliberately literal: a key present in the saved
 * answers. A money question answered with zero is answered, because zero is a
 * real answer to "what are we allowing for the trade-in".
 */
export function nextOpenQuestion(
  questions: PaperworkQuestion[],
  answers: Record<string, string>,
): PaperworkQuestion | null {
  return questions.find((question) => answers[question.key] === undefined) ?? null;
}

/**
 * What each question starts at, so most of them are a confirmation.
 *
 * The fact's own starting value (`deal-facts.ts`): the commonest answer, or
 * a value read off the deal. Kept as a function for the screens and the
 * tests that have always asked it.
 */
export function paperworkDefault(
  documentType: string,
  key: string,
  context: PaperworkContext,
): string | undefined {
  const fact = questionFact(documentType, key);
  if (!fact) return undefined;
  const known = knownValue(fact, documentType, context);
  if (known !== undefined) return known;
  const own = contextFor(fact, documentType, context);
  const start = fact.start ? fact.start(own) : undefined;
  if (start !== undefined && start !== "") return start;
  // A guess the screen offers as the likely answer; never filed unseen.
  return fact.suggest ? fact.suggest(own) : start;
}

/**
 * What this document would file right now: the answers given, then what the
 * deal already holds, then the starting value of every question nobody has
 * reached yet, for every fact its pages print.
 *
 * The resolution happens once, here, and the review screen, the preview and
 * the filing all read the same answer. A stored answer always wins, an empty
 * string counts as unanswered (a box somebody cleared, not a choice), and:
 *
 *   - a fact that does not apply to this deal contributes nothing, and a
 *     stored answer to it is dropped. A trade-in described before the
 *     trade-in was answered No no longer prints a trade-in block;
 *   - a mustAnswer fact (a sworn mileage statement, how a salvage car
 *     leaves, the first payment date) is never filled from its start: it
 *     files only from an answer, and the filing refuses without one.
 *
 * Deliberately NOT used for navigation. `nextOpenQuestion` still reads the
 * raw answers, because a question whose start is filled in is a question
 * still worth showing somebody.
 */
export function paperworkAnswers(
  documentType: string,
  context: PaperworkContext,
): Record<string, string> {
  const resolved: Record<string, string> = { ...context.answers };
  const owned = ownedFacts(documentType);
  for (const fact of owned) {
    if (!factApplies(fact, documentType, context)) {
      // A stale answer to a question this deal no longer asks never prints.
      delete resolved[fact.key];
      continue;
    }
    if ((resolved[fact.key] ?? "").trim() !== "") continue;
    if (resolved[fact.key] === "" && fact.optional) continue;
    const known = knownValue(fact, documentType, context);
    if (known !== undefined) {
      resolved[fact.key] = known;
      continue;
    }
    if (fact.mustAnswer || !fact.start) continue;
    const fallback = fact.start(context);
    if (fallback !== undefined && fallback !== "") resolved[fact.key] = fallback;
  }
  // Another document's facts this one prints, read from their owner.
  if (context.allAnswers) {
    const map = fieldMapFor(documentType);
    for (const id of map ? factsRead(map) : []) {
      const fact = factById(id);
      if (!fact || fact.owner === documentType || fact.owner.startsWith("guide:")) continue;
      const own = contextFor(fact, documentType, context);
      if (fact.applies && !fact.applies(own)) {
        delete resolved[fact.key];
        continue;
      }
      const stored = own.answers[fact.key];
      if (stored !== undefined && (stored.trim() !== "" || fact.optional)) {
        resolved[fact.key] = stored;
        continue;
      }
      const known = knownValue(fact, documentType, context);
      if (known !== undefined) {
        resolved[fact.key] = known;
        continue;
      }
      if (fact.mustAnswer || !fact.start) continue;
      const fallback = fact.start(own);
      if (fallback !== undefined && fallback !== "") resolved[fact.key] = fallback;
    }
  }
  /*
    Box 11 with the record of where it came from: the deal's own answer and
    its `_emptyWeight*` keys, or the vehicle's document figure when the
    question was skipped. A stored answer always wins. Underscored keys are
    read by the review and the filing and never listed as answers.
  */
  if (documentType === "form130U") {
    // From the stored answers, not `resolved`: a starting value filled in
    // above is not an answer anybody gave, and must not be recorded as one.
    const affixed = affixedEmptyWeight(context.answers, context.emptyWeight);
    if (affixed) Object.assign(resolved, affixed);
  }
  /*
    The note's solved figures, filed as answers. The contract prints a rate
    and a count and derives the payment from them, so those two are what
    gets filed, whichever two things were actually agreed.
  */
  if (documentType === "financing") {
    const terms = financingTerms(resolved, context);
    if (terms && !isProblem(terms)) {
      resolved.apr = String(terms.apr);
      resolved.numberOfPayments = String(terms.count);
      resolved.paymentAmount = String(terms.payment);
      resolved.lastPaymentAmount = String(terms.lastPayment);
      // Underscored: the review reads these and never lists them as answers.
      resolved._termsCapped = terms.capped ? "yes" : "";
      resolved._termsCeilingApr = String(terms.ceilingApr);
      resolved._termsSolved = "yes";
      resolved._termsProblem = "";
    } else if (terms && isProblem(terms)) {
      resolved._termsProblem = terms.problem;
      resolved._termsMinimumPayment =
        terms.problem === "payment_never_clears" ? String(terms.minimumPayment) : "";
    }
  }
  return resolved;
}

/**
 * The facts a filing may not go without: a mustAnswer fact this document
 * prints that applies and has no stored answer. The filing refuses them by
 * name (`mustAnswer`); a start was never filed for one of these.
 */
export function unansweredSwornFacts(documentType: string, context: PaperworkContext): DealFact[] {
  const out: DealFact[] = [];
  const map = fieldMapFor(documentType);
  const ids = new Set<string>([
    ...ownedFacts(documentType).map((fact) => fact.id),
    ...(map ? factsPrinted(map) : []),
  ]);
  for (const id of ids) {
    const fact = factById(id);
    if (!fact?.mustAnswer || fact.owner.startsWith("guide:")) continue;
    if (fact.owner !== documentType && !context.allAnswers) continue;
    if (!factApplies(fact, documentType, context)) continue;
    // The deal already holds it (the intake's county): answered, not sworn again.
    if (knownValue(fact, documentType, context) !== undefined) continue;
    const own = contextFor(fact, documentType, context);
    if ((own.answers[fact.key] ?? "").trim() === "") out.push(fact);
  }
  return out;
}

/** Every document's answers on the deal, for `PaperworkContext.allAnswers`. */
export function readAllPaperwork(stepData: unknown): Record<string, Record<string, string>> {
  if (!stepData || typeof stepData !== "object") return {};
  const bag = (stepData as Record<string, unknown>)[PAPERWORK_KEY];
  if (!bag || typeof bag !== "object") return {};
  const out: Record<string, Record<string, string>> = {};
  for (const owner of Object.keys(bag as Record<string, unknown>)) {
    out[owner] = readPaperwork(stepData, owner);
  }
  return out;
}

/** The county nearly every Texas deal is filed in, from the mailing city. */
export { texasCountyForCity };

/** The fee line, as the bill of sale should start it. */
export const DEFAULT_FEES = {
  titleFee: TEXAS_TITLE_FEE,
  docFee: DEFAULT_DOC_FEE,
  registrationFee: DEFAULT_REG_FEE,
} as const;

export type PaperworkMoney = SaleMoney & {
  /**
   * The lien, in the three keys the bill of sale and the 130-U already read.
   *
   * Both documents have carried a seller lien since long before this flow
   * existed; what they never had was anything that decided when to raise one.
   * That decision is the money step's, and these keys are how its answer
   * reaches a printed form without either document learning a new vocabulary.
   */
  sellerLienEnabled: boolean;
  sellerLienAmount: number;
  sellerLienReason: string;
};

/**
 * What the deal costs, and what is still owed when the buyer drives off.
 *
 * The corridor never asks for the price, the rate or the fees, because none of
 * them is a question: the price is on the car, the rate is the state's, and
 * the fees are the same on every deal this lot writes. Asking would be four
 * screens producing numbers the software already knows and four chances to
 * type one of them wrong.
 *
 * What it does ask, on the money step, is what the price on the car meant and
 * whether the registration is being paid today. Those two are not derivable
 * from anything, they change every figure below, and the second of them is the
 * difference between a paid deal and a lien on a title.
 */
export function paperworkMoney(
  salePrice: number | null | undefined,
  /**
   * The BILL OF SALE's answers, whichever document is being built: the
   * trade-in is asked there and nowhere else, and every document must carry
   * the same tax, total and balance (SOP "Money"; "every figure is read off
   * the sale once"). Callers pass `readPaperwork(stepData, "billOfSale")`.
   */
  answers: Record<string, string> = {},
  money: Partial<MoneyAnswers> = {},
  funding: DealType | null = null,
  /**
   * The sale's own fee lines, resolved on the server from its fee copy
   * (`dealership-fees.ts`). Absent: the config's, as before.
   */
  fees?: DealFeeLines,
): PaperworkMoney {
  const allowance =
    answers.tradeIn === "yes" ? Math.max(0, Number(answers.tradeInAllowance) || 0) : 0;
  const figures = saleMoney(salePrice, money, allowance, funding, fees);

  return {
    ...figures,
    /*
      The seller's lien is the seller's, and only two fundings give the seller
      one: cash with money still owed, and the in-house note. On a bank deal
      the lender takes the lien, `saleMoney` already reports zero owing, and
      the guard here is the second lock on the same door: a lender-funded
      130-U must never title the car with the dealership as lienholder.
    */
    sellerLienEnabled: funding !== "lender" && figures.lien > 0,
    sellerLienAmount: funding === "lender" ? 0 : figures.lien,
    sellerLienReason: BALANCE_OWED_REASON,
  };
}

export const PAPERWORK_KEY = "paperwork";

/** Answers already given for one document on this deal. */
export function readPaperwork(
  stepData: unknown,
  documentType: string,
): Record<string, string> {
  if (!stepData || typeof stepData !== "object") return {};
  const bag = (stepData as Record<string, unknown>)[PAPERWORK_KEY];
  if (!bag || typeof bag !== "object") return {};
  const held = (bag as Record<string, unknown>)[documentType];
  if (!held || typeof held !== "object") return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(held as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** Merge one answer in without disturbing the rest of `step_data`. */
export function writePaperwork(
  stepData: unknown,
  documentType: string,
  answers: Record<string, string>,
): Record<string, unknown> {
  const base =
    stepData && typeof stepData === "object"
      ? { ...(stepData as Record<string, unknown>) }
      : {};
  const bag =
    base[PAPERWORK_KEY] && typeof base[PAPERWORK_KEY] === "object"
      ? { ...(base[PAPERWORK_KEY] as Record<string, unknown>) }
      : {};
  bag[documentType] = answers;
  base[PAPERWORK_KEY] = bag;
  return base;
}

/**
 * The down payment, written as the one fact it is.
 *
 * The SOP asks the financing contract's "How Much Are They Putting Down?"
 * "prefilled from what the money step says crossed the desk; never asked
 * twice", and every figure on the paper "is read off the sale once". The two
 * answers used to be stored apart with nothing joining them: a down payment
 * typed on the contract never reached the bill of sale's balance or the
 * 130-U's lien. So both writes go through this: `money.paidTodayAmount` and
 * `paperwork.financing.downPayment` are set together, in the same
 * step-data transform, and nothing else is touched.
 */
export function withDownPayment(stepData: unknown, value: string): Record<string, unknown> {
  const withMoney = writeMoney(stepData, { ...readMoney(stepData), paidTodayAmount: value });
  const financing = { ...readPaperwork(withMoney, "financing"), downPayment: value };
  return writePaperwork(withMoney, "financing", financing);
}

/** Whether the financing contract already holds a down payment answer. */
export function hasFinancingDownPayment(stepData: unknown): boolean {
  return Object.prototype.hasOwnProperty.call(readPaperwork(stepData, "financing"), "downPayment");
}
