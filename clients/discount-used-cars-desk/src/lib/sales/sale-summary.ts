/**
 * The whole sale on one page: the expert lane.
 *
 * The corridor asks one question per screen, and the research says that is
 * right for the person who has never done this. The same research says it is
 * wrong for the person who does ten deals a day, and names the fix: give the
 * repeat user a summary whose every line links into the question behind it.
 * GOV.UK calls it Check Answers, blesses it for exactly this reader, and its
 * own guidance is that the fast lane must be a RENDERING of the same answers
 * rather than a second way to store them.
 *
 * So this is a second renderer, not a second wizard. It takes the step list
 * `buildGuideSteps` already derived and adds the one thing that list does not
 * carry: what each step was answered WITH. Nothing here decides whether a
 * step is done, nothing here writes, and changing an answer goes back through
 * the same screen and the same validation the guided lane uses. TurboTax's
 * Forms Mode is the cautionary tale for the alternative: a second lane that
 * bypasses the calculation layer produces returns that cannot be filed.
 *
 * Pure on purpose. It imports no client and no server module, only types, so
 * the summary is built in the browser from plain facts the page hands over.
 * That is what keeps the language toggle instant: the row values are chosen
 * here from the catalogue at render time, so switching to Spanish reprints
 * the whole page without a navigation and without losing anything.
 */

import { titleFilingWindow } from "@/lib/documents/lien";
import type { DealType } from "@/lib/sales/deal-type";
import type { SalePlan } from "@/lib/sales/sale-plan";
import type { SalvagePath } from "@/lib/sales/salvage-plan";

/** The furthest state a document has reached on this deal. */
export type SummaryDocumentState = "none" | "draft" | "filed" | "signed";

/**
 * A value, described rather than rendered.
 *
 * The page runs on the server and the words are chosen on the client, so what
 * crosses between them has to be language-free. A figure travels as a number
 * and is formatted in the reader's own locale; a fixed answer travels as the
 * name of a word and is looked up in the catalogue; only a proper noun, which
 * is the same in both languages, travels as text.
 */
export type SummaryValue =
  | { kind: "none" }
  | { kind: "text"; text: string }
  | { kind: "date"; date: string }
  | { kind: "money"; amount: number }
  | { kind: "word"; word: SummaryWord }
  | { kind: "document"; state: SummaryDocumentState };

/** Every fixed answer the summary can print, as a catalogue lookup. */
export type SummaryWord =
  | "yes"
  | "no"
  | "cash"
  | "bhph"
  | "bank"
  | "dealerFiles"
  | "buyerFiles"
  | "buyerSigns"
  | "dealerSigns"
  | "inspectionDealer"
  | "inspectionBuyer"
  | "inspectionDone"
  | "shown"
  | "notShown"
  | "onFile"
  | "notOnFile"
  | "english"
  | "spanish"
  | "titleClean"
  | "titleRebuilt"
  | "titleBonded"
  | "titleSalvage"
  | "titleNonrepairable"
  | "titleExport"
  | "titleUnknown"
  | "rebuildFirst"
  | "towAway"
  | "undecided";

export type SummaryRow = {
  /**
   * The step this row shows.
   *
   * The row and the corridor cannot disagree about whether something is
   * answered, because this is the key the step list itself emitted.
   */
  key: string;
  /** Which statement to print, resolved against `funnel.summary.rows`. */
  labelKey: string;
  value: SummaryValue;
  done: boolean;
  /**
   * Where Change goes, or null for a row that reports rather than asks.
   *
   * The derived figures (total, balance) have no question of their own: they
   * are what the answers above them come to. A Change link on them would
   * promise an edit that does not exist.
   */
  href: string | null;
};

export type SummaryGroup = {
  id: string;
  /** Resolved against `funnel.summary.groups`. */
  titleKey: string;
  rows: SummaryRow[];
};

/**
 * Everything the summary needs, as plain data.
 *
 * Assembled on the server from `SaleDetail` and the step list, because that
 * is where the database modules live. Serializable by construction: no
 * functions, no class instances, no `Date`.
 */
export type SummaryFacts = {
  dealId: string;
  vehicleLabel: string | null;
  vin: string | null;
  buyerName: string | null;
  dealLanguage: "en" | "es" | null;
  licenceOnFile: boolean;
  funding: DealType | null;
  lenderName: string | null;
  money: {
    /** What the dealer typed, raw. Empty when nobody has been asked. */
    amount: string;
    priceBasis: "" | "outTheDoor" | "vehicleOnly";
    total: number;
    paidToday: number;
    lien: number;
  };
  plan: SalePlan;
  /** The verified title on the car, as stored; null when the sale has no car. */
  titleStatus: string | null;
  /** The issuing state of an out-of-state title, or null for Texas. */
  titleOriginState: string | null;
  /** What happens with a salvage title, when the car is on one. */
  salvagePath: SalvagePath | null;
  /** Every document this deal requires, with how far it has got. */
  documents: Array<{ type: string; state: SummaryDocumentState }>;
  plate: string | null;
  /** `{ key, done }` straight off `buildGuideSteps`, in its own order. */
  steps: Array<{ key: string; done: boolean }>;
  /**
   * ISO date the clock started: the sale, as the deal records it. The
   * filing window is counted from here. Null on a deal with no date yet.
   */
  deliveredOn: string | null;
  /**
   * The note, solved from what was agreed, on an in-house deal. Null when
   * the deal is not financed in-house or nothing has been agreed yet.
   */
  financing: {
    payment: number;
    count: number;
    apr: number;
    /** ISO date of the last payment, when the first due date is known. */
    paidOffOn: string | null;
  } | null;
};

const NONE: SummaryValue = { kind: "none" };

/** A step's `done`, or false when this sale never had that step. */
function isDone(facts: SummaryFacts, key: string): boolean {
  return facts.steps.find((step) => step.key === key)?.done ?? false;
}

function hasStep(facts: SummaryFacts, key: string): boolean {
  return facts.steps.some((step) => step.key === key);
}

/**
 * The corridor screen for one step, with the way home attached.
 *
 * `from=summary` is what makes Change a round trip rather than a one way
 * door: the screen it opens sends the operator back here instead of to the
 * deal page, which is the half of the Check Answers pattern people forget.
 */
export function summaryStepHref(dealId: string, stepKey: string): string {
  return `/admin/sales/${encodeURIComponent(dealId)}/guide/${encodeURIComponent(stepKey)}?from=summary`;
}

export function summaryHref(dealId: string): string {
  return `/admin/sales/${encodeURIComponent(dealId)}/summary`;
}

/** The title's word, from the stored status, for the catalogue to say. */
function titleWord(status: string | null): SummaryWord {
  switch (status) {
    case "clean":
      return "titleClean";
    case "rebuilt_salvage":
      return "titleRebuilt";
    case "bonded":
      return "titleBonded";
    case "salvage_unrebuilt":
      return "titleSalvage";
    case "nonrepairable":
      return "titleNonrepairable";
    case "export_only":
      return "titleExport";
    default:
      return "titleUnknown";
  }
}

function text(value: string | null | undefined): SummaryValue {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? { kind: "text", text: trimmed } : NONE;
}

/**
 * Every group and row for this sale, in the order a dealer scans them.
 *
 * The order is not the corridor's. The corridor asks who is buying first
 * because a funding question with no buyer is meaningless; a dealer checking
 * a deal over looks for the car and the money first, which is also the order
 * Frazer's own deal entry has used for years. Both orders are right for their
 * own reader, which is the whole argument for two lanes.
 *
 * A group with no rows is dropped rather than printed empty: a cash sale has
 * no lender and should not be told so.
 */
export function buildSaleSummary(facts: SummaryFacts): SummaryGroup[] {
  const href = (key: string) =>
    hasStep(facts, key) ? summaryStepHref(facts.dealId, key) : null;

  const groups: SummaryGroup[] = [];

  // ---- The car -------------------------------------------------------
  // Chosen before the corridor starts, so it has no step and no Change link
  // into a question. It is here because a summary that omits which car this
  // is answers the wrong question.
  groups.push({
    id: "car",
    titleKey: "car",
    rows: [
      {
        key: "vehicle",
        labelKey: "vehicle",
        value: text(facts.vehicleLabel),
        done: Boolean(facts.vehicleLabel),
        href: null,
      },
      {
        key: "vin",
        labelKey: "vin",
        value: text(facts.vin),
        done: Boolean(facts.vin),
        href: null,
      },
      /*
        The title, because it decides the packet. Answered at the desk on
        every sale and read here; a Change would be a change to the car,
        which is inventory's screen, so this row reports.
      */
      {
        key: "titleStatus",
        labelKey: "titleStatus",
        value: { kind: "word", word: titleWord(facts.titleStatus) },
        done: facts.titleStatus !== null && facts.titleStatus !== "unknown",
        href: null,
      },
      ...(facts.titleOriginState
        ? [
            {
              key: "titleOrigin",
              labelKey: "titleOrigin",
              value: text(facts.titleOriginState),
              done: true,
              href: null,
            } satisfies SummaryRow,
          ]
        : []),
    ],
  });

  // ---- The buyer -----------------------------------------------------
  const buyerRows: SummaryRow[] = [
    {
      key: "buyer",
      labelKey: "buyer",
      value: text(facts.buyerName),
      done: isDone(facts, "buyer"),
      href: href("buyer"),
    },
    {
      key: "buyerId",
      labelKey: "licence",
      value: {
        kind: "word",
        word: isDone(facts, "buyerId")
          ? "onFile"
          : facts.licenceOnFile
            ? "onFile"
            : "notOnFile",
      },
      done: isDone(facts, "buyerId"),
      href: href("buyerId"),
    },
  ];
  // Only when the sale actually recorded one. A deal from before the
  // question was asked should not be shown a language it never chose.
  if (facts.dealLanguage) {
    buyerRows.push({
      key: "language",
      labelKey: "language",
      value: { kind: "word", word: facts.dealLanguage === "es" ? "spanish" : "english" },
      done: !hasStep(facts, "language") || isDone(facts, "language"),
      href: href("language"),
    });
  }
  groups.push({ id: "buyer", titleKey: "buyer", rows: buyerRows });

  // ---- The money -----------------------------------------------------
  const askedAmount = facts.money.amount.trim() !== "";
  const moneyRows: SummaryRow[] = [
    {
      key: "paid",
      labelKey: "amount",
      value: askedAmount ? { kind: "money", amount: facts.money.total } : NONE,
      done: isDone(facts, "paid"),
      href: href("paid"),
    },
    {
      key: "price",
      labelKey: "includesTaxAndFees",
      value:
        facts.money.priceBasis === ""
          ? NONE
          : { kind: "word", word: facts.money.priceBasis === "outTheDoor" ? "yes" : "no" },
      done: isDone(facts, "price"),
      href: href("price"),
    },
  ];
  // The derived figures, only once both answers exist. Printing a balance
  // from half an answer is printing a number nobody agreed to.
  if (askedAmount && facts.money.priceBasis !== "") {
    moneyRows.push({
      key: "paidToday",
      labelKey: "paidToday",
      value: { kind: "money", amount: facts.money.paidToday },
      done: true,
      href: null,
    });
    if (facts.money.lien > 0) {
      moneyRows.push({
        key: "balance",
        labelKey: "balance",
        value: { kind: "money", amount: facts.money.lien },
        done: true,
        href: null,
      });
    }
  }
  // The note, when the lot carries it: what each payment is, how many, at
  // what rate, and the day it is paid off. Read off the financing answers
  // and the solver, never typed here.
  if (facts.financing) {
    const note = facts.financing;
    const done = isDone(facts, "document:financing");
    const change = href("document:financing");
    moneyRows.push(
      { key: "eachPayment", labelKey: "eachPayment", value: { kind: "money", amount: note.payment }, done, href: change },
      { key: "payments", labelKey: "payments", value: { kind: "text", text: String(note.count) }, done, href: change },
      { key: "rate", labelKey: "rate", value: { kind: "text", text: `${note.apr.toFixed(2)}%` }, done, href: change },
    );
    if (note.paidOffOn) {
      moneyRows.push({ key: "paidOff", labelKey: "paidOff", value: { kind: "date", date: note.paidOffOn }, done, href: change });
    }
  }
  groups.push({ id: "money", titleKey: "money", rows: moneyRows });

  // ---- How they are paying -------------------------------------------
  const payingRows: SummaryRow[] = [
    {
      key: "funding",
      labelKey: "paidBy",
      value:
        facts.funding === null
          ? NONE
          : {
              kind: "word",
              word:
                facts.funding === "cash" ? "cash" : facts.funding === "inHouse" ? "bhph" : "bank",
            },
      done: isDone(facts, "funding"),
      href: href("funding"),
    },
  ];
  if (hasStep(facts, "lender")) {
    payingRows.push({
      key: "lender",
      labelKey: "lender",
      value: text(facts.lenderName),
      done: isDone(facts, "lender"),
      href: href("lender"),
    });
  }
  groups.push({ id: "paying", titleKey: "paying", rows: payingRows });

  // ---- The plan ------------------------------------------------------
  // Only the questions this sale actually has. The chain is conditional:
  // whether the price covers registration is asked only when the buyer is
  // the one filing, so a dealer-filed sale must not be shown an empty row.
  const planRows: SummaryRow[] = [];
  // The salvage answer, first, because on a salvage car it decides whether
  // any of the rows under it exist.
  if (hasStep(facts, "plan:salvage")) {
    planRows.push({
      key: "plan:salvage",
      labelKey: "salvagePath",
      value:
        facts.salvagePath === null
          ? NONE
          : {
              kind: "word",
              word:
                facts.salvagePath === "rebuild"
                  ? "rebuildFirst"
                  : facts.salvagePath === "towAway"
                    ? "towAway"
                    : "undecided",
            },
      done: isDone(facts, "plan:salvage"),
      href: href("plan:salvage"),
    });
  }
  if (hasStep(facts, "plan:registration")) {
    planRows.push({
      key: "plan:registration",
      labelKey: "registrationBy",
      value:
        facts.plan.registrationBy === null
          ? NONE
          : {
              kind: "word",
              word: facts.plan.registrationBy === "dealer" ? "dealerFiles" : "buyerFiles",
            },
      done: isDone(facts, "plan:registration"),
      href: href("plan:registration"),
    });
  }
  if (hasStep(facts, "plate")) {
    // Asked right after the registration answer on a dealer-filed sale. An
    // answered "not yet" reads as done with no plate, which is the truth.
    planRows.push({
      key: "plate",
      labelKey: "plate",
      value: text(facts.plate),
      done: isDone(facts, "plate"),
      href: href("plate"),
    });
  }
  if (hasStep(facts, "plan:title-signer")) {
    planRows.push({
      key: "plan:title-signer",
      labelKey: "titleSignedBy",
      value:
        facts.plan.titleSignedBy === null
          ? NONE
          : {
              kind: "word",
              word: facts.plan.titleSignedBy === "buyer" ? "buyerSigns" : "dealerSigns",
            },
      done: isDone(facts, "plan:title-signer"),
      href: href("plan:title-signer"),
    });
  }
  if (hasStep(facts, "plan:price-includes")) {
    planRows.push({
      key: "plan:price-includes",
      labelKey: "priceIncludesRegistration",
      value:
        facts.plan.priceIncludesRegistration === null
          ? NONE
          : { kind: "word", word: facts.plan.priceIncludesRegistration ? "yes" : "no" },
      done: isDone(facts, "plan:price-includes"),
      href: href("plan:price-includes"),
    });
  }
  if (hasStep(facts, "plan:inspection")) {
    planRows.push({
      key: "plan:inspection",
      labelKey: "inspection",
      value:
        facts.plan.inspectionBy === null
          ? NONE
          : {
              kind: "word",
              word:
                facts.plan.inspectionBy === "done"
                  ? "inspectionDone"
                  : facts.plan.inspectionBy === "dealer"
                    ? "inspectionDealer"
                    : "inspectionBuyer",
            },
      done: isDone(facts, "plan:inspection"),
      href: href("plan:inspection"),
    });
  }
  if (hasStep(facts, "plan:insurance")) {
    planRows.push({
      key: "plan:insurance",
      labelKey: "insurance",
      value:
        facts.plan.insuranceShown === null
          ? NONE
          : { kind: "word", word: facts.plan.insuranceShown ? "shown" : "notShown" },
      done: isDone(facts, "plan:insurance"),
      href: href("plan:insurance"),
    });
  }
  if (planRows.length > 0) {
    groups.push({ id: "plan", titleKey: "plan", rows: planRows });
  }

  // ---- The paperwork -------------------------------------------------
  const paperRows: SummaryRow[] = facts.documents.map((document) => ({
    key: `document:${document.type}`,
    labelKey: `document:${document.type}`,
    value: { kind: "document", state: document.state },
    done: isDone(facts, `document:${document.type}`),
    href: href(`document:${document.type}`),
  }));
  paperRows.push({
    key: "title",
    labelKey: "plate",
    value: text(facts.plate),
    done: isDone(facts, "title"),
    href: href("title"),
  });
  /*
    The filing clock. Thirty days from the sale, forty-five when the lot
    financed it, and on a seller-financed sale a second date the desk must
    never learn about afterwards: the day the deferred tax is due in full.
    Both rows read done when the title step is done, because that is what
    settles them.
  */
  if (facts.deliveredOn && facts.funding) {
    const window = titleFilingWindow(facts.funding, facts.deliveredOn);
    paperRows.push({
      key: "titleFileBy",
      labelKey: "titleFileBy",
      value: { kind: "date", date: window.fileBy },
      done: isDone(facts, "title"),
      href: href("title"),
    });
    if (window.taxDueInFullBy) {
      paperRows.push({
        key: "taxDueInFullBy",
        labelKey: "taxDueInFullBy",
        value: { kind: "date", date: window.taxDueInFullBy },
        done: isDone(facts, "title"),
        href: href("title"),
      });
    }
  }
  groups.push({ id: "paperwork", titleKey: "paperwork", rows: paperRows });

  return groups.filter((group) => group.rows.length > 0);
}

/** Every row across every group, for counting and for finding what is open. */
export function summaryRows(groups: SummaryGroup[]): SummaryRow[] {
  return groups.flatMap((group) => group.rows);
}

/**
 * How much of the sale is answered.
 *
 * Counted over rows that can be answered, so the reporting rows (a total, a
 * VIN) neither flatter the number nor hold it back.
 */
export function summaryProgress(groups: SummaryGroup[]): { done: number; total: number } {
  const answerable = summaryRows(groups).filter((row) => row.href !== null);
  return {
    done: answerable.filter((row) => row.done).length,
    total: answerable.length,
  };
}

/**
 * The first row still waiting, so one button can carry the operator to it.
 *
 * ONS's hub and spoke pattern: the continue button goes to the next
 * incomplete section, and once nothing is incomplete it stops being a
 * continue button at all. Null here means the sale is answered through.
 */
export function nextOpenSummaryRow(groups: SummaryGroup[]): SummaryRow | null {
  return summaryRows(groups).find((row) => row.href !== null && !row.done) ?? null;
}
