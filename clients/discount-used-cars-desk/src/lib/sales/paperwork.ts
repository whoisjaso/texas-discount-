import {
  TEXAS_TITLE_FEE,
  DEFAULT_DOC_FEE,
  DEFAULT_REG_FEE,
} from "@/lib/documents/billOfSale";
import {
  BALANCE_OWED_REASON,
  saleMoney,
  type MoneyAnswers,
  type SaleMoney,
} from "@/lib/sales/money";
import type { DealType } from "@/lib/sales/deal-type";
import {
  isProblem,
  solveTerms,
  vehicleClass,
  type Frequency,
  type Terms,
  type TermsProblem,
} from "@/lib/documents/terms";
import { dealership } from "@/lib/dealership-config";

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
export type PaperworkKind = "choice" | "money" | "number" | "text" | "date";

export type PaperworkOption = {
  value: string;
  label: string;
  /** The one line under the label. Omitted when the label says it all. */
  gloss?: string;
};

export type PaperworkQuestion = {
  /** Stored under this name on the deal, and used in the URL. */
  key: string;
  /** Asked out loud, as a header, so every word is capitalised. */
  question: string;
  kind: PaperworkKind;
  /** Choices, for a choice question. */
  options?: PaperworkOption[];
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
   * Most questions have an answer on every deal they appear on. A few are
   * asked of a class of vehicle and still do not apply to every member of
   * it: a carrying capacity is on the door jamb of a work truck and on no
   * door of a family SUV that decodes as a truck. The owner asked for the
   * way out. Answering "not applicable" stores an empty answer, which the
   * document prints as a blank box, which is what the state form expects.
   */
  optional?: boolean;
};

/**
 * A question with the server-side half taken off.
 *
 * `applies` is a function, and a function cannot cross into a client
 * component: React refuses to serialise it and the screen becomes a server
 * render error with the message hidden in production. That is not a
 * hypothetical. Every conditional question in this file crashed its own screen
 * until this existed, and the first one anybody reached was the 130-U's
 * carrying capacity, on a truck.
 *
 * Deciding which questions exist is the server's job and is already done by
 * the time one is rendered, so the client never needs the predicate.
 */
export type AskedQuestion = Omit<PaperworkQuestion, "applies">;

/** Drop the parts that only the server can use. */
export function asked(question: PaperworkQuestion): AskedQuestion {
  return {
    key: question.key,
    question: question.question,
    kind: question.kind,
    ...(question.options ? { options: question.options } : {}),
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
   * The two letters the intake screen already captured, when it did.
   *
   * A question whose answer the deal already holds is not a question. This is
   * the one that proved it: the picker on the intake screen collected it and
   * the bill of sale asked for it again one screen later.
   */
  licenceState: string;
  /**
   * What the money step recorded as crossing the desk today, in dollars.
   *
   * Null when the money step has not been answered. On a buy-here-pay-here
   * deal this figure and the financing contract's down payment are the same
   * dollars, and the walkthrough caught them being asked twice and stored
   * twice: the guide asked what the buyer is paying, then the contract asked
   * how much they are putting down, and nothing connected the answers.
   */
  paidToday: number | null;
  /**
   * The buyer's confirmed mailing city, for the county question.
   *
   * Nearly every Texas deal's county is a lookup away from the city the
   * mailing address already confirmed, and the 130-U was asking it cold.
   */
  buyerCity: string;
  /**
   * The county the operator typed at intake, when they typed one.
   *
   * This exists because guessing was wrong. Intake asks for the county, and
   * the answer used to be dropped when the mailing address was read back, so
   * the 130-U fell through to deriving it from the city. A buyer who lives
   * over a county line from their post town got the wrong box filled from an
   * answer they had already given correctly.
   */
  buyerCounty: string;
  /**
   * The vehicle's empty weight in pounds, when the row holds one.
   *
   * Box 11 of the 130-U, which the state uses to class the registration
   * fee. Nothing asked it, so the box filed blank on every corridor sale.
   * Now it is asked, and a weight already on the vehicle row is the
   * starting answer.
   */
  vehicleWeight?: number | null;
  /**
   * The whole deal in dollars, off the money step, for the note's principal.
   * Null until the money step is answered.
   */
  dealTotal?: number | null;
  /** The car's model year, for the rate ceiling's vehicle class. */
  vehicleYear?: number | null;
  /** The year of the sale, for the same. Defaults to this year. */
  saleYear?: number;
  /** Answers already given on this document. */
  answers: Record<string, string>;
};

/**
 * How the odometer reading is qualified.
 *
 * Federal law requires this on transfer and there are exactly three answers.
 * It is asked first because it is the only one that cannot be inferred from
 * anything: the number is on the dash, but whether it is the true mileage is
 * a judgement about the car's history.
 */
const ODOMETER: PaperworkOption[] = [
  { value: "actual", label: "Yes, That Is The Real Mileage" },
  { value: "exceeds", label: "It Has Rolled Over", gloss: "Past the meter's limit" },
  { value: "not_actual", label: "No, Not The Real Mileage", gloss: "Warranty of odometer discrepancy" },
];

/**
 * Where post goes is a state; where the licence came from is another.
 *
 * Asked only when the intake screen did not already answer it. It has a picker
 * for exactly this, and the answer was being collected there and then dropped
 * before it reached the deal, so this screen asked a second time one screen
 * later. The barcode cannot supply it either: AAMVA has no issuing-state
 * element, which is why every licence was otherwise filed as Texas and looked
 * right on the form.
 */
const LICENCE_STATE: PaperworkQuestion = {
  key: "buyerLicenseState",
  question: "Which State Issued Their Licence?",
  kind: "text",
  note: "Two letters, from the card itself.",
  applies: ({ licenceState }) => !licenceState,
};

/**
 * How the money actually arrived.
 *
 * Financing is not here. By the time this is asked the funding question has
 * already been answered, so offering it again invites an answer that
 * contradicts the deal. What is left is the ways cash actually turns up at a
 * desk in this business.
 */
const PAYMENT: PaperworkOption[] = [
  { value: "Cash", label: "Cash" },
  { value: "Zelle", label: "Zelle" },
  { value: "CashApp", label: "Cash App" },
  { value: "Venmo", label: "Venmo" },
  { value: "Card", label: "Card" },
  { value: "Check", label: "Check" },
];

const BILL_OF_SALE: PaperworkQuestion[] = [
  {
    key: "odometerStatus",
    question: "Is That The Real Mileage?",
    kind: "choice",
    options: ODOMETER,
  },
  LICENCE_STATE,
  {
    key: "paymentMethod",
    question: "How Are They Paying Today?",
    kind: "choice",
    options: PAYMENT,
    /*
      Only a cash deal asks how the money arrived. On buy here pay here the
      answer is the financing contract, already given. On a bank deal the
      money arrives from the lender, and offering Cash or Venmo here is how a
      lender-funded bill of sale printed "Paying With: Cash": the walkthrough
      persona picked the least-wrong option because every option was wrong.
      Both those deals write their method from the funding answer instead.
    */
    applies: ({ funding }) => funding !== "inHouse" && funding !== "lender",
  },
  {
    key: "tradeIn",
    question: "Is There A Trade-In?",
    kind: "choice",
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
    ],
  },
  {
    key: "tradeInDescription",
    question: "What Are They Trading In?",
    kind: "text",
    note: "Year, make and model.",
    applies: ({ answers }) => answers.tradeIn === "yes",
  },
  {
    key: "tradeInAllowance",
    question: "What Are We Allowing For It?",
    kind: "money",
    applies: ({ answers }) => answers.tradeIn === "yes",
  },
  {
    key: "conditionType",
    question: "Sold As-Is Or With A Warranty?",
    kind: "choice",
    options: [
      { value: "as_is", label: "As-Is", gloss: "No dealer warranty" },
      { value: "warranty", label: "With A Warranty" },
    ],
  },
  {
    key: "warrantyDuration",
    question: "How Long Is The Warranty?",
    kind: "text",
    note: "However it is written on the window form.",
    applies: ({ answers }) => answers.conditionType === "warranty",
  },
];

const FORM_130U: PaperworkQuestion[] = [
  {
    key: "countyOfResidence",
    question: "Which County Do They Live In?",
    kind: "text",
    // This has exactly one automatic source, the address autocomplete, and it
    // vanishes the moment somebody types the address instead of picking a
    // suggestion. Nothing on any screen looks wrong when it is blank.
    note: "Field 19 on the form.",
  },
  {
    key: "applicationType",
    question: "What Are We Applying For?",
    kind: "choice",
    options: [
      { value: "titleAndRegistration", label: "Title And Registration" },
      { value: "titleOnly", label: "Title Only" },
      { value: "registrationOnly", label: "Registration Only" },
    ],
  },
  {
    key: "applicantType",
    question: "Is The Buyer A Person Or A Business?",
    kind: "choice",
    options: [
      { value: "Individual", label: "A Person" },
      { value: "Business", label: "A Business" },
    ],
  },
  {
    key: "emptyWeight",
    question: "What Is The Empty Weight?",
    kind: "number",
    // Box 11. The state classes the registration fee by it, and the county
    // sends an application back without it. It is on the door jamb sticker
    // and on the old title; the VIN decode carries it for some vehicles.
    note: "In pounds. Box 11 on the form; on the door jamb or the old title.",
  },
  {
    key: "carryingCapacity",
    question: "What Is The Carrying Capacity?",
    kind: "text",
    note: "Trucks and vans only. It is on the door jamb.",
    // No source anywhere in the product, and it only matters for one class of
    // vehicle, so it is asked only of that class rather than of everybody.
    applies: ({ bodyStyle }) =>
      /truck|van|pickup|cab/.test(bodyStyle),
    // And not every member of that class has one to give: a crossover that
    // decodes as a truck has no rated capacity on any door.
    optional: true,
  },
];

/**
 * The note, as it is actually agreed at a desk.
 *
 * A dealer and a buyer settle on two of three things: the payment, how many
 * payments, or the rate. This used to ask for the rate and the count and
 * derive the payment, which is the one order nobody at a desk talks in.
 * "Four-twenty a month" is what gets said; "18.00% over 30" is what gets
 * printed. So it asks what was agreed and works out the rest, with the rate
 * held to the ceiling Texas puts on a note for this car (`terms.ts`).
 */
const FINANCING: PaperworkQuestion[] = [
  { key: "downPayment", question: "How Much Are They Putting Down?", kind: "money" },
  {
    key: "paymentFrequency",
    question: "How Often Do They Pay?",
    kind: "choice",
    options: [
      { value: "Weekly", label: "Weekly" },
      { value: "Bi-weekly", label: "Every Two Weeks" },
      { value: "Monthly", label: "Monthly" },
    ],
  },
  {
    key: "termsBy",
    question: "What Did You Agree On?",
    kind: "choice",
    // Each option names the figure itself. "The Payment" read as a verb on
    // the screen; a button is chosen for what it is, not what it does.
    options: [
      { value: "payment", label: "The Payment Amount" },
      { value: "count", label: "The Number Of Payments" },
      { value: "both", label: "Both Of Those" },
    ],
  },
  {
    key: "paymentAmount",
    question: "How Much Each Payment?",
    kind: "money",
    applies: ({ answers }) => answers.termsBy === "payment" || answers.termsBy === "both",
  },
  {
    key: "numberOfPayments",
    question: "How Many Payments?",
    kind: "number",
    applies: ({ answers }) => answers.termsBy === "count" || answers.termsBy === "both",
  },
  {
    key: "apr",
    question: "What Is The Rate?",
    kind: "number",
    note: "Held to this car's legal ceiling.",
    // When both the payment and the count were agreed, the rate is what they
    // imply, and asking for a third figure would invite a contradiction.
    applies: ({ answers }) => answers.termsBy !== "both",
  },
  { key: "firstPaymentDate", question: "When Is The First Payment Due?", kind: "date" },
];

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
  const down = answers.downPayment?.trim() ? Number(answers.downPayment) || 0 : (context.paidToday ?? 0);
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
 * Nothing, and that is the point.
 *
 * This form used to ask what we quoted the buyer for registration, typed in by
 * hand. It is the one number on the form the buyer is agreeing to pay if the
 * filing comes back to us, and it was the one number nothing checked: a figure
 * typed here could disagree with the bill of sale sitting next to it on the
 * same desk, and the higher of the two is the one somebody would argue about.
 *
 * It is not a quote. It is tax, title, registration and the doc fee, which the
 * money step has already worked out from the price on the car, so it is filled
 * in rather than asked.
 */
const VEHICLE_RESPONSIBILITY: PaperworkQuestion[] = [];

/**
 * The questions, by `document_agreements` type name.
 *
 * Keyed on the stored type rather than on a slug, so the packet, the guide and
 * this file cannot drift into disagreeing about what a document is called.
 */
/**
 * The salvage bill of sale asks less than the ordinary one.
 *
 * The odometer question stays: federal disclosure is on transfer, salvage
 * or not. How the money arrived stays on a cash deal. Nothing about a
 * warranty: a salvage vehicle sold to be towed away is sold as is by its
 * nature, and offering "with a warranty" would be offering to warrant a
 * car we are telling the buyer cannot be driven. Nothing about a trade-in
 * either; a buyer towing a salvage car home is not trading one in.
 */
const SALVAGE_BILL_OF_SALE: PaperworkQuestion[] = [
  {
    key: "odometerStatus",
    question: "Is That The Real Mileage?",
    kind: "choice",
    options: ODOMETER,
  },
  LICENCE_STATE,
  {
    key: "paymentMethod",
    question: "How Are They Paying Today?",
    kind: "choice",
    options: PAYMENT,
    applies: ({ funding }) => funding !== "inHouse" && funding !== "lender",
  },
  {
    key: "howLeaving",
    question: "How Is The Car Leaving The Lot?",
    kind: "choice",
    // Asked, not assumed, because the tow-away acknowledgment prints it and
    // because "the buyer drove it off" is the one answer this path cannot
    // accept: a salvage car on a public road is the promise of plates made
    // with the keys instead of with words.
    options: [
      { value: "towTruck", label: "On A Tow Truck" },
      { value: "trailer", label: "On A Trailer" },
      { value: "flatbed", label: "On A Flatbed" },
    ],
  },
];

const QUESTIONS: Record<string, PaperworkQuestion[]> = {
  billOfSale: BILL_OF_SALE,
  form130U: FORM_130U,
  financing: FINANCING,
  vehicleResponsibility: VEHICLE_RESPONSIBILITY,
  salvageBillOfSale: SALVAGE_BILL_OF_SALE,
};

/**
 * Documents the corridor carries with NO questions of their own.
 *
 * The power of attorney is the proof case: every field the VTR-271 needs —
 * grantor name, address, vehicle, VIN — is already on the deal, so the
 * corridor owes it a review screen and a filing, not a single question.
 * The owner's walkthrough said it plainly: don't send me to a separate
 * form page for facts the sale already holds.
 */
const REVIEW_ONLY = new Set([
  "powerOfAttorney",
  // Both acknowledgments are drawn entirely from the sale: the buyer, the
  // vehicle, and the prescreen answer or the title status that put them in
  // the packet. The corridor owes each a read-back, a pad and a filing.
  "insuranceAcknowledgment",
  "rebuiltDisclosure",
  // The two tow-away sheets after the salvage bill of sale: everything on
  // them is the sale's own facts and the bill's own answers.
  "towAwayAcknowledgment",
  "buyerResponsibilityStatement",
]);

/** Whether this flow knows how to ask for (or review) a document at all. */
export function hasPaperwork(documentType: string | undefined): boolean {
  return Boolean(documentType && (QUESTIONS[documentType] || REVIEW_ONLY.has(documentType)));
}

/**
 * The questions this document asks on this deal, in order.
 *
 * Recomputed from the answers each time rather than fixed at the start, so a
 * Yes to "is there a trade-in" grows the follow-on questions in place and a
 * No never shows them. That means the count on screen moves when an answer
 * changes, which is honest: the work really did change.
 */
export function paperworkQuestions(
  documentType: string,
  context: PaperworkContext,
): PaperworkQuestion[] {
  const all = QUESTIONS[documentType] ?? [];
  return all.filter((question) => !question.applies || question.applies(context));
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
 * These are not invented. The fee figures are the constants this codebase
 * already carries for Texas, and the rest are either the commonest answer or
 * a value read off the deal by the caller and passed in here.
 *
 * Worth knowing about the fees: those three constants existed but were only
 * ever reachable through the out-the-door calculator, so an ordinary bill of
 * sale printed a real Texas tax figure next to three fee lines of zero.
 * Offering them as the starting answer is what puts them on the paperwork.
 */
export function paperworkDefault(
  documentType: string,
  key: string,
  context: PaperworkContext,
): string | undefined {
  if (documentType === "billOfSale") {
    if (key === "odometerStatus") return "actual";
    if (key === "conditionType") return "as_is";
    if (key === "tradeIn") return "no";
    if (key === "paymentMethod") return context.funding === "cash" ? "Cash" : undefined;
  }
  if (documentType === "salvageBillOfSale") {
    if (key === "odometerStatus") return "actual";
    if (key === "paymentMethod") return context.funding === "cash" ? "Cash" : undefined;
    // No default for how it leaves: the desk says it, every time.
  }
  if (documentType === "form130U") {
    if (key === "applicationType") return "titleAndRegistration";
    if (key === "applicantType") return "Individual";
    /*
      The county, worked out from the city the mailing address already
      confirmed. A default and not an answer: the screen still shows it and
      the operator can change it, which covers the buyer who lives over a
      county line from their post town. Cold-asking it was the 130-U's one
      question with no starting point, on the deal's least famous fact.
    */
    if (key === "countyOfResidence") {
      // What they said, then what the city implies. Never the other way round.
      return context.buyerCounty.trim() || texasCountyForCity(context.buyerCity);
    }
    // The weight the vehicle row already holds, when it holds one. A
    // starting point the operator can correct off the door jamb, not an
    // answer given on their behalf.
    if (key === "emptyWeight" && context.vehicleWeight != null && context.vehicleWeight > 0) {
      return String(Math.round(context.vehicleWeight));
    }
  }
  if (documentType === "financing") {
    if (key === "numberOfPayments") return "36";
    if (key === "paymentFrequency") return "Monthly";
    // The house rate, which the solver holds to the car's ceiling.
    if (key === "apr") return String(dealership.financing.defaultApr);
    /*
      The down payment is the money step's paid-today figure, already given.
      The novice persona's walkthrough caught the same dollars being asked
      twice and stored twice, with nothing connecting the answers: a $2,000
      down payment typed on the money screen met an empty box here.
    */
    if (key === "downPayment" && context.paidToday !== null) {
      return String(context.paidToday);
    }
  }
  return undefined;
}

/**
 * What this document would file right now: the answers given, plus the
 * default for every question nobody has reached yet.
 *
 * `paperworkDefault` used to be read in exactly one place, as the starting
 * value of an input box, which made a default a thing the SCREEN knew and the
 * RECORD did not. Walk the corridor and it becomes an answer; preview or file
 * without walking it and the box on the paper is blank. The 130-U's county
 * was the visible casualty: intake asks for it, the deal stores it, the
 * default resolves it, and the printed form still had an empty county because
 * nobody had opened that one screen.
 *
 * So the resolution happens once, here, and the review screen, the preview
 * and the filing all read the same answer. A stored answer always wins, an
 * empty string counts as unanswered (that is a box somebody cleared, not a
 * choice), and a question this deal does not ask contributes nothing.
 *
 * Deliberately NOT used for navigation. `nextOpenQuestion` still reads the
 * raw answers, because a question whose default is filled in is a question
 * still worth showing somebody: the default is a starting point they can
 * change, and skipping to Review past four unasked questions would be the
 * corridor deciding it knows the deal better than the person selling the car.
 */
export function paperworkAnswers(
  documentType: string,
  context: PaperworkContext,
): Record<string, string> {
  const resolved: Record<string, string> = { ...context.answers };
  for (const question of paperworkQuestions(documentType, context)) {
    if ((resolved[question.key] ?? "").trim() !== "") continue;
    const fallback = paperworkDefault(documentType, question.key, context);
    if (fallback !== undefined && fallback !== "") resolved[question.key] = fallback;
  }
  /*
    The note's solved figures, filed as answers.

    The contract prints a rate and a count and derives the payment from them,
    so those two are what gets filed, whichever two things were actually
    agreed. Writing them here means the review screen, the preview, the
    filed document and the payment schedule all read the same three numbers.
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
 * The county nearly every Texas deal is filed in, from the mailing city.
 *
 * The big cities and this lot's own metro, not all 254 counties: a table
 * covering most deals with certainty beats one covering all deals with
 * guesses. A city this table does not know returns undefined and the
 * question is simply asked, exactly as before.
 */
const TEXAS_CITY_COUNTY: Record<string, string> = {
  houston: "Harris",
  pasadena: "Harris",
  baytown: "Harris",
  "deer park": "Harris",
  humble: "Harris",
  katy: "Harris",
  spring: "Harris",
  tomball: "Harris",
  cypress: "Harris",
  "la porte": "Harris",
  channelview: "Harris",
  "sugar land": "Fort Bend",
  richmond: "Fort Bend",
  rosenberg: "Fort Bend",
  "missouri city": "Fort Bend",
  pearland: "Brazoria",
  angleton: "Brazoria",
  alvin: "Brazoria",
  "league city": "Galveston",
  galveston: "Galveston",
  "texas city": "Galveston",
  friendswood: "Galveston",
  conroe: "Montgomery",
  "the woodlands": "Montgomery",
  "san antonio": "Bexar",
  austin: "Travis",
  "round rock": "Williamson",
  georgetown: "Williamson",
  dallas: "Dallas",
  irving: "Dallas",
  garland: "Dallas",
  mesquite: "Dallas",
  "grand prairie": "Dallas",
  "fort worth": "Tarrant",
  arlington: "Tarrant",
  plano: "Collin",
  mckinney: "Collin",
  frisco: "Collin",
  "el paso": "El Paso",
  "corpus christi": "Nueces",
  laredo: "Webb",
  lubbock: "Lubbock",
  amarillo: "Potter",
  brownsville: "Cameron",
  mcallen: "Hidalgo",
  killeen: "Bell",
  waco: "McLennan",
  "wichita falls": "Wichita",
  midland: "Midland",
  odessa: "Ector",
  beaumont: "Jefferson",
  "port arthur": "Jefferson",
  tyler: "Smith",
  "college station": "Brazos",
  bryan: "Brazos",
  denton: "Denton",
  lewisville: "Denton",
  abilene: "Taylor",
};

export function texasCountyForCity(city: string): string | undefined {
  const key = city.trim().toLowerCase();
  if (!key) return undefined;
  return TEXAS_CITY_COUNTY[key];
}

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
  answers: Record<string, string> = {},
  money: Partial<MoneyAnswers> = {},
  funding: DealType | null = null,
): PaperworkMoney {
  const allowance =
    answers.tradeIn === "yes" ? Math.max(0, Number(answers.tradeInAllowance) || 0) : 0;
  const figures = saleMoney(salePrice, money, allowance, funding);

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
