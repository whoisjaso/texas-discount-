/**
 * The sale, one question at a time.
 *
 * The desk view shows a sale as a state: everything at once, pick what is
 * next. That is the right screen for someone who runs deals daily and wants to
 * jump to the one thing outstanding. It is the wrong screen for someone
 * covering the desk who has never done this, because "pick what is next"
 * assumes you know what next is.
 *
 * So this is the other reading of the same data. One screen, one question,
 * nothing else on it. Not a second source of truth: the steps are computed
 * from the sale, so answering one here changes what the desk shows, and a
 * document signed on the desk removes a step from here. There is no wizard
 * state to get out of sync because there is no wizard state.
 *
 * Why this is not the nine-step flow that was retired. That one was a fixed
 * sequence of nine screens, six of which asked nothing at all: an icon, a
 * status line, and Continue. This generates steps from what the deal is
 * missing, so a step exists only when there is a question to answer. A cash
 * sale never sees a lender step. A sale with the bill of sale already signed
 * never sees it either.
 */

import {
  SALE_DOCUMENTS,
  documentStateFor,
  isDocumentDone,
  type SaleDetail,
  type SaleDocumentEntry,
} from "@/lib/admin/sale-desk";
import { isDocumentExcluded, requiredDocumentTypes } from "@/lib/sales/deal-type";
import {
  PLAN_STEP_KEY,
  isPlanQuestionAnswered,
  isSalePlanComplete,
  planQuestions,
  readSalePlan,
} from "@/lib/sales/sale-plan";
import { isComplete as buyerIdComplete, readBuyerId } from "@/lib/sales/buyer-id";
import { readMoney } from "@/lib/sales/money";
import { isLanguageSettled } from "@/lib/sales/deal-language";
import { titleHoldsDocuments } from "@/lib/vehicles/title-status";
import { SALVAGE_STEP_KEY, readSalvagePlan } from "@/lib/sales/salvage-plan";

export type GuideStepKey =
  | "language"
  | "buyer"
  | "buyerId"
  | "funding"
  | "lender"
  | "paid"
  | "price"
  | `plan:${string}`
  | "plate"
  | `document:${string}`
  | "titleWork"
  | "title"
  | "packet"
  | "done";

export type GuideStep = {
  key: GuideStepKey;
  /** The question, as a person would ask it out loud. */
  question: string;
  /** True once the deal already holds the answer. */
  done: boolean;
  /** The document this step is about, for the document steps. */
  document?: SaleDocumentEntry;
};

/**
 * Every step this sale has, in the order they make sense.
 *
 * Every question is a header, so every word is capitalised, including "the",
 * "is" and "and". That is the owner's standing instruction and it is written
 * into DESIGN.md under Capitalisation; it outranks any generic house style
 * that would sentence-case a question. The document steps take their wording
 * from the document's own title rather than lowercasing it, which is what was
 * breaking the rule on those screens.
 *
 * Order is not arbitrary and is not configurable. Who is buying comes before
 * how they are paying because the funding question is meaningless without a
 * buyer, and the paperwork comes before the title filing because webDEALER
 * wants numbers the bill of sale establishes.
 *
 * Completed steps stay in the list rather than being dropped. A flow that
 * silently shortens as you work gives no sense of where you are, and someone
 * who wants to check what they put on the bill of sale needs a way back to it.
 */
export function buildGuideSteps(sale: SaleDetail): GuideStep[] {
  const steps: GuideStep[] = [];

  /**
   * Only on a deal that predates the question. New deals answer it at
   * StartSale, where the select refuses to submit unanswered, so this step
   * would only ever say Continue there — and a step that only says Continue
   * is not a step. On a legacy deal the answer is legally load-bearing
   * (FTC 455.5; Tex. Fin. Code §348.006) and the documents gate on it, so
   * it is asked first: everything after it may print from it.
   */
  if (!isLanguageSettled(sale.stepData)) {
    steps.push({
      key: "language",
      question: "What Language Is The Sale In?",
      done: false,
    });
  }

  /*
    The salvage question, first, on a salvage car.

    The desk said the title is salvage; what it did not say is what happens
    with it, and everything below turns on the answer: the prescreen exists
    only if we are titling the car, the packet is a different packet on the
    tow-away path, and a "not sure yet" is a hold with a badge that says so.
    Asked before the buyer because it is the fact about THIS sale the dealer
    has to say out loud before promising anything to the person at the desk.
  */
  const salvagePath = readSalvagePlan(sale.stepData).path;
  const salvage = sale.vehicle?.titleStatus === "salvage_unrebuilt";
  const towAway = salvage && salvagePath === "towAway";
  if (salvage) {
    steps.push({
      key: SALVAGE_STEP_KEY,
      question: "What Happens With The Salvage Title?",
      // "Not sure yet" is an answer that holds the documents; it does not
      // count as done, so the corridor keeps offering the question.
      done: salvagePath === "rebuild" || salvagePath === "towAway",
    });
  }

  steps.push({
    key: "buyer",
    question: "Who Is Buying The Car?",
    done: Boolean(sale.buyer?.name?.trim()),
  });

  // Before the money question, because the licence is what the buyer hands
  // over first and every later document quotes from it.
  const buyerId = readBuyerId(sale.stepData);
  steps.push({
    key: "buyerId",
    /*
      Two questions wearing one key, and the split is the fix for a real
      complaint: the card was scanned at intake, and the funnel then said "Put
      The Licence On File." as if that had not happened. The screen underneath
      already showed the photos and asked for a check, but the question over
      it read as asking again, and the person reading it was right to be
      annoyed. Once a photograph exists this step is a review, and it says so.

      Not "Photograph" in the capture wording either. A phone camera is one of
      three ways this step gets done: the desk can send the link to a phone,
      put the card on the office flatbed, or type what it says. Naming one of
      them made the other two look like workarounds.
    */
    question: buyerId.image ? "Check What The Card Says." : "Put The Licence On File.",
    done: buyerIdComplete(buyerId),
  });

  steps.push({
    key: "funding",
    question: "How Are They Paying?",
    done: sale.funding.type !== null,
  });

  // Only when an outside lender is carrying it. On a cash sale this question
  // does not exist, rather than existing and being skippable.
  if (sale.funding.type === "lender") {
    steps.push({
      key: "lender",
      question: "Which Lender Is Funding It?",
      /*
        The placeholder does not count. The funding screen used to write
        "Not chosen yet" to get past a validation, and this check read it as
        an answer: the step marked itself done, `nextOpenStep` never offered
        it, and lender deals reached the packet with no lender on record.
        The placeholder is no longer written, but deals carrying it exist.
      */
      done:
        Boolean(sale.funding.lenderId) ||
        Boolean(sale.funding.lenderOther && sale.funding.lenderOther !== "Not chosen yet"),
    });
  }

  /**
   * Two questions about money, one to a screen, before any document.
   *
   * They were one screen with both on it, on the argument that the running
   * total is what makes either answerable. The owner's rule is stronger and
   * simpler: one question a page, all the way through, so that somebody who
   * has never done this can be handed the phone and get it right. A screen
   * holding two questions is a screen where the second one gets missed.
   *
   * Both come before the paperwork because three documents read from them: the
   * bill of sale wants the total and the balance, the 130-U wants the balance,
   * and the vehicle responsibility form wants what the tax and fees come to.
   * Asking inside the bill of sale would answer it on one document and leave
   * the other two to be typed again, which is how two forms on one desk end up
   * disagreeing about one deal.
   */
  const money = readMoney(sale.stepData);

  /**
   * The amount, then what it means.
   *
   * The amount is first because it is the owner's stated order and because it
   * anchors everything: the figure two people agreed on out loud is the one
   * fact the software cannot know. The vehicle row's price only prefills the
   * box. The walkthrough that settled this was a car listed at $0, which made
   * the old basis-first screen open with "The car is marked $0.00" and no way
   * anywhere to say what the deal was actually for.
   *
   * The basis is second because it is what the amount means: the same $3,500
   * is a paid deal when it included everything and $618.75 owing when it was
   * the car alone. Answering it produces the receipt, so the receipt lives on
   * that page.
   */
  steps.push({
    key: "paid",
    question: "How Much Are They Paying?",
    // A deal from before the amount question holds only a paid figure, and on
    // those deals it was the answer to this.
    done: money.amount.trim() !== "" || money.paidTodayAmount.trim() !== "",
  });

  steps.push({
    key: "price",
    question: "Does That Include Tax And Fees?",
    done: money.priceBasis !== "",
  });

  /*
    The prescreen, before any document exists.

    Who files the registration, whether the price covered it, where the
    inspection stands, and whether insurance was shown. The answers decide
    the packet, so the packet cannot be built until they are given: the loop
    below reads them, and the guide will not offer a document step until this
    step is done.

    The owner's mandate is that there is no moving on without answering,
    because the answers ARE the paperwork trail.
  */
  /*
    The prescreen, one question per step.

    Each question the chain owes becomes its own guide step with its own URL,
    so Back works, a refresh lands where it left off, and the count is real.
    The chain is DERIVED, so a question this route does not ask is simply not
    a step: the price question does not exist on the dealer route rather than
    existing and being skipped.
  */
  /*
    No prescreen on a tow-away sale. Every one of its questions is about
    titling and registering the car (who files, who signs the application,
    the plate, the inspection, the insurance the registration needs), and
    on this path nobody files anything. Asking them would be asking the
    dealer to describe a registration that is not happening.
  */
  const plan = readSalePlan(sale.stepData);
  for (const questionId of towAway ? [] : planQuestions(plan)) {
    steps.push({
      key: PLAN_STEP_KEY[questionId] as GuideStepKey,
      question: PLAN_STEP_QUESTION[questionId],
      done: isPlanQuestionAnswered(plan, questionId),
    });

    /*
      The plate, asked the moment we know we are the ones filing.

      The owner's reason: the plate prints on the bill of sale and the
      130-U, and it is the last thing webDEALER asks, so a plate typed here
      is typed once and read three times. Asked only on the dealer-files
      route, because a buyer filing for themselves gets their plate from
      the county, not from us. "Not yet" is an answer: the handoff screen at
      the end still takes the plate webDEALER issues.
    */
    if (questionId === "registrationBy" && plan.registrationBy === "dealer") {
      steps.push({
        key: "plate",
        question: "What Plate Is Going On It?",
        done: Boolean(sale.plate) || sale.plateAsked,
      });
    }
  }

  /*
    Documents do not exist until the plan does.

    The previous version appended them regardless, which meant the corridor
    could be walked around: the answers decide which documents a sale owes,
    so building them from an unanswered plan is building the wrong packet.
    Adversarial review caught it; the plan's own claim that the packet
    "cannot be built" without the answers was not true of the code.
  */
  const planSettled = towAway || isSalePlanComplete(plan);

  /*
    Only the DOCUMENTS wait on the plan.

    An earlier draft returned early with just a packet step, which dropped
    the title step and broke the corridor's own shape: the packet is the last
    thing and it comes after the title, on every sale. What actually has to
    wait is the document list, because the answers decide which documents a
    sale owes and building them from an unanswered plan builds the wrong
    packet.
  */
  /*
    A salvage title holds the documents.

    The sale has begun and everything above was worth capturing: the buyer,
    the licence, the money, the plan. What cannot happen yet is a document,
    because the car cannot be assigned on a salvage title. So the corridor's
    next step is the title work itself, inside the guide, and the document
    steps do not exist until the county's rebuilt title flips the car, at
    which point they appear with the rebuilt disclosure among them.
  */
  const titleHold = titleHoldsDocuments(sale.vehicle?.titleStatus, salvagePath);
  // The title work is a step only once the sale has chosen to rebuild. An
  // undecided salvage sale holds at the salvage question instead, which is
  // the step still open above, and never shows a checklist for a path
  // nobody picked.
  if (titleHold && salvagePath === "rebuild") {
    steps.push({
      key: "titleWork",
      question: "Rebuild The Title First.",
      done: false,
    });
  }

  const requiredTypes =
    planSettled && !titleHold
      ? requiredDocumentTypes(
          sale.funding.type,
          plan,
          sale.vehicle?.titleStatus ?? null,
          salvagePath,
        )
      : [];
  for (const entry of SALE_DOCUMENTS) {
    if (!entry.documentType) continue;
    if (isDocumentExcluded(entry.documentType, sale.funding.type)) continue;
    if (!requiredTypes.includes(entry.documentType)) continue;

    steps.push({
      key: `document:${entry.documentType}`,
      question: `Sign The ${entry.title}.`,
      // Filed and signed both count as done: filing IS the corridor's step.
      // What changed is only that the screen stops calling an unsigned
      // document signed.
      done: isDocumentDone(documentStateFor(entry, sale.documents)),
      document: entry,
    });
  }

  /*
    The title filing, on every sale but one. A tow-away sale files nothing:
    the salvage title is assigned to the buyer by hand on its back, and the
    step that says "File The Title And Get Plates" would be the exact
    promise this path exists to prevent. So it does not exist here.
  */
  if (!towAway) {
    steps.push({
      key: "title",
      question: "File The Title And Get Plates.",
      // The plate is the proof this happened. Nothing else on the deal changes
      // when a title is filed, so nothing else can stand in for it.
      done: Boolean(sale.plate),
    });
  }

  /**
   * The last step, and the reason it is last is a working day.
   *
   * A sale can be run start to finish on a phone standing next to the car, and
   * a phone cannot reach a printer without a cable nobody has. So the work
   * does not end at a signature: it ends at a screen a computer can open half
   * an hour later and print from. Putting it anywhere but the end would make
   * it a detour; at the end it is the natural close.
   *
   * Done when there is something to print, which is a fact about this step
   * rather than a restatement of the ones above it. Left permanently open it
   * would make every finished sale read as unfinished forever, and the desk
   * would keep offering it as the next thing to do on a deal from March.
   */
  steps.push({
    key: "packet",
    question: "Print Or Save The Paperwork.",
    done: Object.values(sale.documents).some(isDocumentDone),
  });

  return steps;
}

/** The first step still waiting on an answer, or null when the sale is done. */
export function nextOpenStep(steps: GuideStep[]): GuideStep | null {
  return steps.find((step) => !step.done) ?? null;
}

export function guideProgress(steps: GuideStep[]): {
  done: number;
  total: number;
} {
  return {
    done: steps.filter((step) => step.done).length,
    total: steps.length,
  };
}

export function findGuideStep(
  steps: GuideStep[],
  key: string,
): GuideStep | null {
  return steps.find((step) => step.key === key) ?? null;
}

/** Where a step sits in the list, for "3 of 7" and for back and next. */
export function stepPosition(steps: GuideStep[], key: string): number {
  return steps.findIndex((step) => step.key === key);
}

/**
 * What each prescreen question asks, in the corridor's voice.
 *
 * Here rather than in the component so the guide can label its own steps
 * (the packet list, the progress rail, and any "next up" line all read from
 * the step's question), and so adding a question without giving it words is
 * a type error.
 */
export const PLAN_STEP_QUESTION: Record<
  import("@/lib/sales/sale-plan").PlanQuestionId,
  string
> = {
  registrationBy: "Who Files The Title And Registration?",
  titleSignedBy: "Who Signs The Title Application?",
  priceIncludesRegistration: "Does The Price Include Registration?",
  inspectionBy: "Where Does The Inspection Stand?",
  insuranceShown: "Did They Show Proof Of Insurance?",
};
