import type { FreezeField } from "@/lib/sales/bill-of-sale-freeze";
import type { PaperworkContext, PaperworkOption, PaperworkQuestion } from "@/lib/sales/paperwork";
import { dealership } from "@/lib/dealership-config";
import { idDocumentType, readIdKind } from "@/lib/forms/id-document";
import { firstPaymentChoices } from "@/lib/sales/date-choices";

/**
 * Every deal fact the desk asks, once, in one list.
 *
 * A document's pages say which facts they print (`field-maps/`). This file
 * says who asks each fact, how, and where the answer is kept. Anything not
 * in here is not a question: it is read off the vehicle, the licence, the
 * owner's fees, the dealership or the money step.
 *
 * The rules a fact carries:
 *
 *   owner        the corridor that asks it: a document type ("billOfSale")
 *                or a guide step ("guide:plan"). One owner per fact, so a
 *                fact is asked in one place and read everywhere else.
 *   known        the deal already holds it (the intake, the money step):
 *                never opened, read back on the review with Change.
 *   start        the value a screen opens on. Filed unseen when nobody
 *                walks past it, EXCEPT a mustAnswer fact.
 *   mustAnswer   a sworn statement or a date the paper is signed against:
 *                filing refuses until somebody has answered it.
 *   optional     "Not applicable" is a real answer and stores a blank.
 *
 * A tap is the default. A fact is typed only when its answer has no small
 * set (`freeText` says why), and long sets (states, counties) are a
 * searchable tap list rather than a box to type two letters into.
 */

export type DealFact = PaperworkQuestion & {
  /** `<owner>.<key>`, the name the field maps use. */
  id: string;
  owner: string;
  /** Options worked out from the deal (dates, the house rate). */
  dynamicOptions?: (context: PaperworkContext) => PaperworkOption[];
  known?: (context: PaperworkContext) => string | undefined;
  start?: (context: PaperworkContext) => string | undefined;
  /**
   * A likely answer the screen pre-selects that is only a guess (the county
   * a city implies): shown, never filed until somebody taps it.
   */
  suggest?: (context: PaperworkContext) => string | undefined;
  mustAnswer?: true;
  freeze?: FreezeField;
  /** Why this one is typed rather than tapped. Only free-form answers may be. */
  freeText?: string;
  /** Where a guide-owned fact is stored, for the record (the guide writes it). */
  stored?: string;
};

const choice = (value: string, label: string, gloss?: string): PaperworkOption =>
  gloss ? { value, label, gloss } : { value, label };

/*
  How the odometer reading is qualified. Federal law requires this on
  transfer and there are exactly three answers. It is a sworn statement, so
  it files only from an answer: the start is "actual", pre-selected, and
  somebody still has to say so.
*/
export const ODOMETER: PaperworkOption[] = [
  choice("actual", "Yes, That Is The Real Mileage"),
  choice("exceeds", "It Has Rolled Over", "Past the meter's limit"),
  choice("not_actual", "No, Not The Real Mileage", "Warranty of odometer discrepancy"),
];

/*
  How the money actually arrived. Financing is not here: by the time this
  is asked the funding question is answered, and offering it again invites
  an answer that contradicts the deal.
*/
export const PAYMENT: PaperworkOption[] = [
  choice("Cash", "Cash"),
  choice("Zelle", "Zelle"),
  choice("CashApp", "Cash App"),
  choice("Venmo", "Venmo"),
  choice("Card", "Card"),
  choice("Check", "Check"),
];

/*
  A cashier's check, a money order or the money split two ways is still how
  the money arrived: the last card types it, and the paper prints the words.
*/
const PAYMENT_OTHER = { label: "Another Way", kind: "text" as const };

/** The FTC Buyers Guide's own list of systems, the only honest set for "systems covered". */
export const WARRANTY_SYSTEMS: PaperworkOption[] = [
  choice("frameBody", "Frame & Body"),
  choice("engine", "Engine"),
  choice("transmission", "Transmission & Drive Shaft"),
  choice("differential", "Differential"),
  choice("cooling", "Cooling System"),
  choice("electrical", "Electrical System"),
  choice("fuel", "Fuel System"),
  choice("accessories", "Accessories"),
  choice("brakes", "Brake System"),
  choice("airBags", "Air Bags"),
  choice("steering", "Steering System"),
  choice("suspension", "Suspension System"),
  choice("tires", "Tires"),
  choice("wheels", "Wheels"),
  choice("exhaust", "Exhaust System"),
];

/** The labels of stored system keys, in the form's order. */
export function warrantySystemLabels(stored: string | undefined): string[] {
  const keys = (stored ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  return WARRANTY_SYSTEMS.filter((option) => keys.includes(option.value)).map((option) => option.label);
}

/*
  Which state issued the licence, asked only when the intake did not say,
  only for a document a state issues, and as a tap on the state list. The
  answer reaches every document's ID line (corridor-link baseFacts). It
  used to be typed as two letters and then dropped: the paper printed "TX"
  whatever was typed.
*/
const licenceStateApplies = (context: PaperworkContext) =>
  !context.licenceState && idDocumentType(readIdKind(context.idKind)).needsState;

const LICENCE_STATE_QUESTION = "Which State Issued Their Licence?";

/** The 130-U box 27 question exists only where box 26 has an email to send to. */
const hasEmail = (context: PaperworkContext) => Boolean((context.buyerEmail ?? "").trim());

/**
 * The documents' own facts. The order inside each owner is not the ask
 * order: the document's field map says that (`askOrder`).
 */
export const DOCUMENT_FACTS: DealFact[] = [
  // ── Bill of sale ──────────────────────────────────────────────────────
  {
    id: "billOfSale.odometerStatus",
    owner: "billOfSale",
    key: "odometerStatus",
    question: "Is That The Real Mileage?",
    kind: "choice",
    options: ODOMETER,
    start: () => "actual",
    mustAnswer: true,
    freeze: "odometer",
  },
  {
    id: "billOfSale.buyerLicenseState",
    owner: "billOfSale",
    key: "buyerLicenseState",
    question: LICENCE_STATE_QUESTION,
    kind: "list",
    list: "usStates",
    note: "As printed on the card.",
    applies: licenceStateApplies,
    freeze: "buyerId",
  },
  {
    id: "billOfSale.paymentMethod",
    owner: "billOfSale",
    key: "paymentMethod",
    question: "How Are They Paying Today?",
    kind: "choice",
    options: PAYMENT,
    other: PAYMENT_OTHER,
    /*
      Only a cash deal asks how the money arrived. On buy here pay here the
      answer is the financing contract; on a bank deal the money arrives
      from the lender. Both write their method from the funding answer.
    */
    applies: ({ funding }) => funding !== "inHouse" && funding !== "lender",
    start: (context) => (context.funding === "cash" ? "Cash" : undefined),
    freeze: "paymentMethod",
  },
  {
    id: "billOfSale.tradeIn",
    owner: "billOfSale",
    key: "tradeIn",
    question: "Is There A Trade-In?",
    kind: "choice",
    options: [choice("no", "No"), choice("yes", "Yes")],
    start: () => "no",
    freeze: "tradeIn",
  },
  {
    id: "billOfSale.tradeInDescription",
    owner: "billOfSale",
    key: "tradeInDescription",
    question: "What Are They Trading In?",
    kind: "text",
    note: "Year, make and model.",
    applies: ({ answers }) => answers.tradeIn === "yes",
    freeText: "a vehicle description has no small set of answers",
    freeze: "tradeIn",
  },
  {
    id: "billOfSale.tradeInVin",
    owner: "billOfSale",
    key: "tradeInVin",
    question: "What Is The Trade-In's VIN?",
    kind: "vin",
    note: "Seventeen characters, off the dash or the door. Box 36 on the 130-U.",
    applies: ({ answers }) => answers.tradeIn === "yes",
    optional: true,
    freeText: "a VIN is read off the car",
    freeze: "tradeIn",
  },
  {
    id: "billOfSale.tradeInAllowance",
    owner: "billOfSale",
    key: "tradeInAllowance",
    question: "What Are We Allowing For It?",
    kind: "money",
    applies: ({ answers }) => answers.tradeIn === "yes",
    freeText: "money",
    freeze: "tradeIn",
  },
  {
    id: "billOfSale.conditionType",
    owner: "billOfSale",
    key: "conditionType",
    question: "Sold As-Is Or With A Warranty?",
    kind: "choice",
    options: [choice("as_is", "As-Is", "No dealer warranty"), choice("warranty", "With A Warranty")],
    start: () => "as_is",
    freeze: "warranty",
  },
  {
    id: "billOfSale.warrantyKind",
    owner: "billOfSale",
    key: "warrantyKind",
    question: "Full Or Limited Warranty?",
    kind: "choice",
    // The Buyers Guide's two boxes under DEALER WARRANTY, in its words.
    options: [choice("limited", "Limited Warranty"), choice("full", "Full Warranty")],
    applies: ({ answers }) => answers.conditionType === "warranty",
  },
  {
    id: "billOfSale.warrantyLaborPercent",
    owner: "billOfSale",
    key: "warrantyLaborPercent",
    question: "What Share Of The Labor Do We Pay?",
    kind: "number",
    note: "A percentage. The Buyers Guide prints it beside LIMITED WARRANTY.",
    applies: ({ answers }) => answers.conditionType === "warranty" && answers.warrantyKind === "limited",
    freeText: "a percentage the dealer sets on this sale",
  },
  {
    id: "billOfSale.warrantyPartsPercent",
    owner: "billOfSale",
    key: "warrantyPartsPercent",
    question: "What Share Of The Parts Do We Pay?",
    kind: "number",
    note: "A percentage. The Buyers Guide prints it beside LIMITED WARRANTY.",
    applies: ({ answers }) => answers.conditionType === "warranty" && answers.warrantyKind === "limited",
    freeText: "a percentage the dealer sets on this sale",
  },
  {
    id: "billOfSale.warrantySystems",
    owner: "billOfSale",
    key: "warrantySystems",
    question: "Which Systems Does It Cover?",
    kind: "multi",
    options: WARRANTY_SYSTEMS,
    note: "The systems the Buyers Guide lists. Tap each one covered, then Done.",
    applies: ({ answers }) => answers.conditionType === "warranty",
  },
  {
    id: "billOfSale.warrantyDuration",
    owner: "billOfSale",
    key: "warrantyDuration",
    question: "How Long Is The Warranty?",
    kind: "text",
    note: "As it reads on the window form, e.g. 30 days or 1,000 miles.",
    applies: ({ answers }) => answers.conditionType === "warranty",
    freeText: "a duration in the dealer's own words (days, months or miles)",
    freeze: "warranty",
  },

  // ── Form 130-U ────────────────────────────────────────────────────────
  {
    id: "form130U.countyOfResidence",
    owner: "form130U",
    key: "countyOfResidence",
    question: "Which County Do They Live In?",
    kind: "list",
    list: "texasCounties",
    note: "Field 19 on the form.",
    /*
      Asked once, at intake. When intake recorded it the 130-U does not ask
      again: the review reads it back with Change. Otherwise it starts at
      the county the mailing city implies.
    */
    known: (context) => (context.intakeCounty ?? "").trim() || undefined,
    /*
      The start is the county the mailing ADDRESS geocodes to (the Census
      lookup the page runs), filed when nobody changes it. The county the
      CITY implies is only a guess (Katy, Pearland, Dallas, Fort Worth and
      Plano sit in more than one county; south Amarillo is Randall, not
      Potter): pre-selected on the screen as the likely answer, and never
      filed unseen. The power of attorney prints the same county.
    */
    start: (context) => context.buyerCounty.trim() || undefined,
    suggest: (context) => texasCountyForCity(context.buyerCity),
  },
  {
    id: "form130U.applicationType",
    owner: "form130U",
    key: "applicationType",
    question: "What Are We Applying For?",
    kind: "choice",
    options: [
      choice("titleAndRegistration", "Title And Registration"),
      choice("titleOnly", "Title Only"),
      choice("registrationOnly", "Registration Only"),
    ],
    start: () => "titleAndRegistration",
  },
  {
    id: "form130U.applicantType",
    owner: "form130U",
    key: "applicantType",
    question: "Is The Buyer A Person Or A Business?",
    kind: "choice",
    options: [choice("Individual", "A Person"), choice("Business", "A Business")],
    start: () => "Individual",
  },
  {
    id: "form130U.businessName",
    owner: "form130U",
    key: "businessName",
    question: "What Is The Business's Legal Name?",
    kind: "text",
    note: "As registered. Box 16 prints it as the applicant.",
    applies: ({ answers }) => answers.applicantType === "Business",
    freeText: "a business name",
  },
  {
    id: "form130U.businessFein",
    owner: "form130U",
    key: "businessFein",
    question: "What Is The Business's FEIN?",
    kind: "text",
    note: "Nine digits. Box 14 prints it in place of a licence number.",
    applies: ({ answers }) => answers.applicantType === "Business",
    freeText: "a federal employer number",
  },
  {
    id: "form130U.emptyWeight",
    owner: "form130U",
    key: "emptyWeight",
    question: "What Is The Empty Weight?",
    kind: "number",
    note: "In pounds. Box 11; it is on the Texas title (WEIGHT) or the out-of-state title. The door jamb shows GVWR, not the empty weight.",
    /*
      Skipped when the vehicle already holds a document figure, which is
      affixed with its source. Otherwise the screen offers a sourced
      estimate for one tap, or asks for the figure and its document.
    */
    applies: (c) => !c.emptyWeight?.onFile || c.answers.emptyWeight !== undefined || c.reopen === "emptyWeight",
    start: (context) => (context.emptyWeight?.onFile ? String(context.emptyWeight.onFile.box11) : undefined),
    freeText: "a figure read off a title or a weight certificate",
  },
  {
    id: "form130U.carryingCapacity",
    owner: "form130U",
    key: "carryingCapacity",
    question: "What Is The Carrying Capacity?",
    kind: "text",
    note: "Trucks and vans only. The GVWR on the door jamb less the empty weight, or the buyer's own figure.",
    // Starts at the TxDMV minimum on the screen only (the page passes it);
    // never a start here, so never filed unseen.
    applies: ({ bodyStyle }) => /truck|van|pickup|cab/.test(bodyStyle),
    optional: true,
    freeText: "a figure read off the door jamb (the TxDMV minimum is offered on the screen)",
  },
  {
    id: "form130U.renewalReminders",
    owner: "form130U",
    key: "renewalReminders",
    question: "Email Them Registration Renewal Reminders?",
    kind: "choice",
    // Box 27. It used to be ticked for anybody with an email on file.
    options: [choice("yes", "Yes, Email Reminders"), choice("no", "No")],
    note: "Box 27 on the form. The state sends them to the email in box 26.",
    applies: hasEmail,
  },

  // ── Financing contract ────────────────────────────────────────────────
  {
    id: "financing.downPayment",
    owner: "financing",
    key: "downPayment",
    question: "How Much Are They Putting Down?",
    kind: "money",
    /*
      The money step's paid-today figure is the down payment, already given:
      read back on the review with Change, never asked twice.
    */
    known: (context) => (context.paidToday !== null ? String(context.paidToday) : undefined),
    freeText: "money",
  },
  {
    id: "financing.paymentFrequency",
    owner: "financing",
    key: "paymentFrequency",
    question: "How Often Do They Pay?",
    kind: "choice",
    options: [choice("Weekly", "Weekly"), choice("Bi-weekly", "Every Two Weeks"), choice("Monthly", "Monthly")],
    start: () => "Monthly",
  },
  {
    id: "financing.termsBy",
    owner: "financing",
    key: "termsBy",
    question: "What Did You Agree On?",
    kind: "choice",
    options: [
      choice("payment", "The Payment Amount"),
      choice("count", "The Number Of Payments"),
      choice("both", "Both Of Those"),
    ],
  },
  {
    id: "financing.paymentAmount",
    owner: "financing",
    key: "paymentAmount",
    question: "How Much Each Payment?",
    kind: "money",
    applies: ({ answers }) => answers.termsBy === "payment" || answers.termsBy === "both",
    freeText: "money",
  },
  {
    id: "financing.numberOfPayments",
    owner: "financing",
    key: "numberOfPayments",
    question: "How Many Payments?",
    kind: "choice",
    // 36 is the desk's default term, labelled as that until the owner sets a house term.
    options: [choice("36", "36 Payments", "The desk's default term")],
    other: { label: "Another Number", kind: "number" },
    applies: ({ answers }) => answers.termsBy === "count" || answers.termsBy === "both",
    start: () => "36",
  },
  {
    id: "financing.apr",
    owner: "financing",
    key: "apr",
    question: "What Is The Rate?",
    kind: "choice",
    note: "Held to this car's legal ceiling.",
    dynamicOptions: () => [
      {
        value: String(dealership.financing.defaultApr),
        label: `${Number(dealership.financing.defaultApr).toFixed(2)}%`,
        gloss: "The desk's starting rate",
        glossTemplate: "startingRate",
      },
    ],
    other: { label: "Another Rate", kind: "number" },
    // When both the payment and the count were agreed, the rate is what they imply.
    applies: ({ answers }) => answers.termsBy !== "both",
    start: () => String(dealership.financing.defaultApr),
  },
  {
    id: "financing.firstPaymentDate",
    owner: "financing",
    key: "firstPaymentDate",
    question: "When Is The First Payment Due?",
    kind: "dateChoice",
    /*
      A tap from the contract date and how often they pay; "Another Date"
      opens a date box. It files only from an answer: every BHPH contract
      the walks filed read "Monthly beginning" with no date, under a notice
      telling the buyer not to sign a contract with blank spaces.
    */
    dynamicOptions: (context) =>
      firstPaymentChoices(context.contractDate, context.answers.paymentFrequency),
    other: { label: "Another Date", kind: "date" },
    mustAnswer: true,
  },

  // ── Salvage bill of sale ──────────────────────────────────────────────
  {
    id: "salvageBillOfSale.odometerStatus",
    owner: "salvageBillOfSale",
    key: "odometerStatus",
    question: "Is That The Real Mileage?",
    kind: "choice",
    options: ODOMETER,
    start: () => "actual",
    mustAnswer: true,
    freeze: "odometer",
  },
  {
    id: "salvageBillOfSale.buyerLicenseState",
    owner: "salvageBillOfSale",
    key: "buyerLicenseState",
    question: LICENCE_STATE_QUESTION,
    kind: "list",
    list: "usStates",
    note: "As printed on the card.",
    applies: licenceStateApplies,
    freeze: "buyerId",
  },
  {
    id: "salvageBillOfSale.paymentMethod",
    owner: "salvageBillOfSale",
    key: "paymentMethod",
    question: "How Are They Paying Today?",
    kind: "choice",
    options: PAYMENT,
    other: PAYMENT_OTHER,
    applies: ({ funding }) => funding !== "inHouse" && funding !== "lender",
    start: (context) => (context.funding === "cash" ? "Cash" : undefined),
    freeze: "paymentMethod",
  },
  {
    id: "salvageBillOfSale.howLeaving",
    owner: "salvageBillOfSale",
    key: "howLeaving",
    question: "How Is The Car Leaving The Lot?",
    kind: "choice",
    // "The buyer drove it off" is the one answer this path cannot accept.
    options: [choice("towTruck", "On A Tow Truck"), choice("trailer", "On A Trailer"), choice("flatbed", "On A Flatbed")],
    mustAnswer: true,
    freeze: "howLeaving",
  },
];

/**
 * The facts the guide asks, registered so the maps can name them. The guide
 * screens ask and store these; the paperwork corridor never does.
 */
export const GUIDE_FACTS: DealFact[] = [
  guideFact("guide:language.language", "What Language Is The Sale In?", "choice", "deals.language"),
  guideFact("guide:funding.type", "How Are They Paying?", "choice", "step_data.funding.type"),
  guideFact("guide:lender.lender", "Which Lender Is Funding It?", "choice", "step_data.funding.lenderId / lenderOther"),
  guideFact("guide:paid.amount", "How Much Are They Paying?", "money", "step_data.money.amount"),
  guideFact("guide:price.priceBasis", "Does That Include Tax And Fees?", "choice", "step_data.money.priceBasis"),
  guideFact("guide:price.paidTodayAmount", "How Much Are They Paying Today?", "money", "step_data.money.paidTodayAmount"),
  guideFact("guide:plan.registrationBy", "Who Files The Title And Registration?", "choice", "step_data.salePlan.registrationBy"),
  guideFact("guide:plan.titleSignedBy", "Who Signs The Title Application?", "choice", "step_data.salePlan.titleSignedBy"),
  guideFact("guide:plan.inspectionBy", "Where Does The Inspection Stand?", "choice", "step_data.salePlan.inspectionBy"),
  guideFact("guide:plan.insuranceShown", "Did They Show Proof Of Insurance?", "choice", "step_data.salePlan.insuranceShown"),
  guideFact("guide:plate.plate", "What Plate Is Going On It?", "text", "step_data.plate"),
  guideFact("guide:salvage.path", "What Happens With The Salvage Title?", "choice", "step_data.salvagePlan.path"),
  guideFact("guide:start.titleOrigin", "Title From Another State?", "list", "step_data.titleOrigin.state"),
  guideFact("guide:titleWork.vtr61", "Rebuild The Title First.", "choice", "vehicle_title_work(step='vtr61')"),
];

function guideFact(id: string, question: string, kind: PaperworkQuestion["kind"], stored: string): DealFact {
  const [owner, key] = id.split(".");
  return {
    id,
    owner,
    key,
    question,
    kind,
    stored,
    ...(kind === "text" ? { freeText: "a plate is read off the plate webDEALER issues" } : {}),
    ...(kind === "money" ? { freeText: "money" } : {}),
  };
}

export const DEAL_FACTS: DealFact[] = [...DOCUMENT_FACTS, ...GUIDE_FACTS];

export function factById(id: string): DealFact | undefined {
  return DEAL_FACTS.find((fact) => fact.id === id);
}

/** A document's own facts, keyed by their stored key. */
export function ownedFacts(owner: string): DealFact[] {
  return DOCUMENT_FACTS.filter((fact) => fact.owner === owner);
}

/** The kinds that are taps. Everything else is typed and must say why. */
export const TAP_KINDS = new Set<PaperworkQuestion["kind"]>(["choice", "list", "multi", "dateChoice"]);

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
