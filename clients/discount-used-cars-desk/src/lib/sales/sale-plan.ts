/**
 * How this particular sale is going to work, asked before the paperwork.
 *
 * Three questions decide which documents a deal owes and what the buyer
 * carries out of here:
 *
 *   1. Who registers the vehicle, us or them.
 *   2. Did they show proof of insurance today, or are they coming back.
 *   3. Who is taking it for the state inspection, or is it already done.
 *
 * The owner's word for this screen was a prescreening: what KIND of sale is
 * this. It runs before the bill of sale because the answers change the
 * packet, and a packet you cannot know until you are three documents deep is
 * a packet somebody assembles wrong.
 *
 * Registration is the load-bearing one. Since Texas HB 718 (July 2025) the
 * dealer files title and registration through webDEALER on a retail sale, so
 * the default is us. A buyer who files for themselves is the exception, and
 * it swaps our application for an acknowledgment that they took the job on:
 * no title application from us, and the Vehicle Responsibility form instead.
 *
 * When we file, a fourth question decides one more document: who signs the
 * title application. The 130-U wants the buyer's own signature, and the
 * buyer is standing at the desk on nearly every sale this corridor writes,
 * so they sign it, on the pad or in ink, and nothing else is needed. Only
 * when the buyer is NOT here to sign do we sign for them, and that is what
 * the limited power of attorney is for. It used to be required on every
 * dealer-files sale on the theory that webDEALER needed it, and that theory
 * had a hole the size of the whole lot: the plain VTR-271 is not lawful on a
 * vehicle still subject to federal odometer disclosure, which is any car
 * under twenty model years old, which is every car this dealership sells.
 * So every ordinary sale reached "Sign The Power Of Attorney", was told the
 * form could not be used, and stopped. The power of attorney is now the
 * exception it always was in practice, and the ordinary sale finishes.
 *
 * Stored under a named key in `step_data` for the same reason funding is:
 * the blob's other keys are step numbers from the retired pipeline, a name
 * cannot collide with those, and a second dealership inherits this with no
 * migration to run.
 */

import type { DealType } from "@/lib/sales/deal-type";

export const SALE_PLAN_KEY = "salePlan";

/** Who files the title and registration. */
export type RegistrationBy = "dealer" | "buyer";

/** Where the state inspection stands. */
export type InspectionBy = "dealer" | "buyer" | "done";

/**
 * Who puts a signature on the title application when we file it.
 *
 * `buyer` is the buyer at the desk signing the 130-U themselves. `dealer` is
 * us signing on their behalf because they are not here, which is the only
 * case that needs a power of attorney.
 */
export type TitleSignedBy = "buyer" | "dealer";

export type SalePlan = {
  registrationBy: RegistrationBy | null;
  /** Asked only when the dealer files. Null on the buyer-files branch. */
  titleSignedBy: TitleSignedBy | null;
  /**
   * Whether the price on the window covers title and registration.
   *
   * This is what makes the Vehicle Responsibility form's figure a QUOTE
   * rather than a guess: if the buyer is filing themselves and the price did
   * not include registration, the amount they would owe us to take the job
   * back is the amount we quoted them here.
   */
  priceIncludesRegistration: boolean | null;
  /** True only when proof was actually shown at the desk. */
  insuranceShown: boolean | null;
  inspectionBy: InspectionBy | null;
  /** Staff acknowledgment only. Never printed on a buyer's agreement. */
  inspectionAcknowledgment?: InspectionAcknowledgment;
};

export const INSPECTION_NOTICE_VERSION = "2026-09-08";
export type InspectionAcknowledgment = {
  at: string;
  by: string;
  version: typeof INSPECTION_NOTICE_VERSION;
};

function readInspectionAcknowledgment(value: unknown): InspectionAcknowledgment | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entry = value as Record<string, unknown>;
  if (entry.version !== INSPECTION_NOTICE_VERSION || typeof entry.at !== "string" ||
      !Number.isFinite(Date.parse(entry.at)) || typeof entry.by !== "string" || !entry.by.trim()) return undefined;
  return { at: entry.at, by: entry.by, version: INSPECTION_NOTICE_VERSION };
}

export const EMPTY_SALE_PLAN: SalePlan = {
  registrationBy: null,
  titleSignedBy: null,
  priceIncludesRegistration: null,
  insuranceShown: null,
  inspectionBy: null,
};

export function readSalePlan(stepData: unknown): SalePlan {
  if (!stepData || typeof stepData !== "object") return EMPTY_SALE_PLAN;
  const raw = (stepData as Record<string, unknown>)[SALE_PLAN_KEY];
  if (!raw || typeof raw !== "object") return EMPTY_SALE_PLAN;

  const entry = raw as Record<string, unknown>;
  const registrationBy =
    entry.registrationBy === "dealer" || entry.registrationBy === "buyer"
      ? entry.registrationBy
      : null;
  const inspectionBy =
    entry.inspectionBy === "dealer" ||
    entry.inspectionBy === "buyer" ||
    entry.inspectionBy === "done"
      ? entry.inspectionBy
      : null;

  const titleSignedBy =
    entry.titleSignedBy === "buyer" || entry.titleSignedBy === "dealer"
      ? entry.titleSignedBy
      : null;
  const acknowledgment = inspectionBy === "buyer"
    ? readInspectionAcknowledgment(entry.inspectionAcknowledgment)
    : undefined;

  return {
    registrationBy,
    // Only meaningful when we file. A stale value on the buyer branch is
    // dropped on read, so a document set can never be built from it.
    titleSignedBy: registrationBy === "dealer" ? titleSignedBy : null,
    priceIncludesRegistration:
      typeof entry.priceIncludesRegistration === "boolean"
        ? entry.priceIncludesRegistration
        : null,
    // Strictly boolean. An absent answer is not a "no": it means nobody has
    // been asked, and the checklist says so rather than accusing a buyer of
    // driving uninsured.
    insuranceShown: typeof entry.insuranceShown === "boolean" ? entry.insuranceShown : null,
    inspectionBy,
    ...(acknowledgment ? { inspectionAcknowledgment: acknowledgment } : {}),
  };
}

/** Merge a plan into an existing step_data blob without disturbing the rest. */
export function writeSalePlan(
  stepData: unknown,
  plan: SalePlan,
): Record<string, unknown> {
  const base =
    stepData && typeof stepData === "object"
      ? { ...(stepData as Record<string, unknown>) }
      : {};
  base[SALE_PLAN_KEY] = {
    registrationBy: plan.registrationBy,
    titleSignedBy: plan.titleSignedBy,
    priceIncludesRegistration: plan.priceIncludesRegistration,
    insuranceShown: plan.insuranceShown,
    inspectionBy: plan.inspectionBy,
    ...(plan.inspectionBy === "buyer" && plan.inspectionAcknowledgment
      ? { inspectionAcknowledgment: plan.inspectionAcknowledgment } : {}),
  };
  return base;
}

export type PlanQuestionId =
  | "registrationBy"
  | "titleSignedBy"
  | "priceIncludesRegistration"
  | "inspectionBy"
  | "insuranceShown";

/**
 * The questions this sale actually has to answer, in order.
 *
 * The owner's rule, in his words: he does not want to say the customer is
 * registering the vehicle and then keep being asked things that do not
 * pertain to that route. So the chain is derived rather than fixed, and a
 * question only appears once the answer above it has made it relevant.
 *
 * Two questions are conditional, one per branch. Registration comes first
 * because it decides the branch. When WE file, the next question is who
 * signs the application, because that is what puts a power of attorney in
 * the packet or leaves it out. When the BUYER files, the next question is
 * whether the price covered registration: that is the case where the figure
 * becomes a quote they might owe us later, and it is the number the Vehicle
 * Responsibility form prints. Neither question exists on the other branch.
 *
 * Inspection and insurance are asked on every sale. They are facts about
 * this car and this buyer on this day, not consequences of who files.
 *
 * Derived here rather than laid out in the component so the chain can be
 * tested without rendering anything, and so a second screen cannot invent a
 * different order.
 */
export function planQuestions(plan: SalePlan): PlanQuestionId[] {
  const questions: PlanQuestionId[] = ["registrationBy"];
  if (plan.registrationBy === "dealer") {
    questions.push("titleSignedBy");
  }
  if (plan.registrationBy === "buyer") {
    questions.push("priceIncludesRegistration");
  }
  questions.push("inspectionBy", "insuranceShown");
  return questions;
}

/**
 * What a given question currently holds.
 *
 * Exported through `isPlanQuestionAnswered` rather than used as a truthiness
 * test anywhere: `priceIncludesRegistration: false` is an ANSWER, and a
 * falsy check would call it missing and hold the sale on a question the
 * operator already answered.
 */
function answerFor(plan: SalePlan, id: PlanQuestionId): unknown {
  switch (id) {
    case "registrationBy":
      return plan.registrationBy;
    case "titleSignedBy":
      return plan.titleSignedBy;
    case "priceIncludesRegistration":
      return plan.priceIncludesRegistration;
    case "inspectionBy":
      return plan.inspectionBy;
    case "insuranceShown":
      return plan.insuranceShown;
  }
}

/** Answered, where `false` counts and only `null` does not. */
export function isPlanQuestionAnswered(plan: SalePlan, id: PlanQuestionId): boolean {
  return answerFor(plan, id) !== null;
}

/**
 * Every question this sale owes, answered.
 *
 * The owner's mandate: there is no way to move on without answering, because
 * the answers are the paperwork trail. Measured against the DERIVED chain,
 * so a question the sale never had to ask cannot block it, and a question it
 * does have to ask cannot be skipped.
 */
/**
 * The plan to judge a packet by, or undefined when it is not yet answered.
 *
 * Every screen that asks what a deal owes goes through this, so they cannot
 * drift apart. They already had: `requiredDocumentTypes` takes an optional
 * plan, only the corridor passed one, and the sales list, the sale detail
 * view and the delivery manifest all showed the funding-only packet. The same
 * deal owed different documents depending on which screen you opened.
 *
 * Undefined rather than an empty plan, because `requiredDocumentTypes` reads
 * undefined as "funding only", which is exactly right for a deal from before
 * the questions existed.
 */
export function settledPlan(stepData: unknown): SalePlan | undefined {
  const plan = readSalePlan(stepData);
  return isSalePlanComplete(plan) ? plan : undefined;
}

export function isSalePlanComplete(plan: SalePlan): boolean {
  return planQuestions(plan).every((id) => isPlanQuestionAnswered(plan, id));
}

/** The first question still owed, for a screen that walks them in order. */
export function nextUnanswered(plan: SalePlan): PlanQuestionId | null {
  return planQuestions(plan).find((id) => !isPlanQuestionAnswered(plan, id)) ?? null;
}

/**
 * Apply ONE answer to a plan, with whatever it invalidates.
 *
 * The per-question screens each write a single field, and they must not send
 * a whole plan: a client that submits its own copy of every answer will,
 * on a CAS retry, overwrite a sibling answer that committed in between. So
 * the caller sends one field, this applies it to the CURRENT stored plan,
 * and the invalidation rule lives here rather than in a component.
 *
 * Switching registration clears the other branch's question: to the dealer
 * clears whether the price included registration, to the buyer clears who
 * signs the application. Each exists on one route only, and leaving one set
 * would mean a stale answer riding along on a branch that never asked it,
 * which `planQuestions` would not surface for correction.
 */
export function applyPlanAnswer(
  plan: SalePlan,
  id: PlanQuestionId,
  value: RegistrationBy | TitleSignedBy | InspectionBy | boolean,
): SalePlan {
  switch (id) {
    case "registrationBy": {
      const registrationBy = value as RegistrationBy;
      return {
        ...plan,
        registrationBy,
        titleSignedBy: registrationBy === "buyer" ? null : plan.titleSignedBy,
        priceIncludesRegistration:
          registrationBy === "dealer" ? null : plan.priceIncludesRegistration,
      };
    }
    case "titleSignedBy":
      return { ...plan, titleSignedBy: value as TitleSignedBy };
    case "priceIncludesRegistration":
      return { ...plan, priceIncludesRegistration: value as boolean };
    case "inspectionBy": {
      if (value === plan.inspectionBy) return plan;
      const next = { ...plan, inspectionBy: value as InspectionBy };
      delete next.inspectionAcknowledgment;
      return next;
    }
    case "insuranceShown":
      return { ...plan, insuranceShown: value as boolean };
  }
}

/** Whether a value is a legal answer to a given question. */
export function isValidAnswer(id: PlanQuestionId, value: unknown): boolean {
  switch (id) {
    case "registrationBy":
    case "titleSignedBy":
      return value === "dealer" || value === "buyer";
    case "inspectionBy":
      return value === "dealer" || value === "buyer" || value === "done";
    case "priceIncludesRegistration":
    case "insuranceShown":
      return typeof value === "boolean";
  }
}

export function isPlanQuestionId(value: unknown): value is PlanQuestionId {
  return (
    value === "registrationBy" ||
    value === "titleSignedBy" ||
    value === "priceIncludesRegistration" ||
    value === "inspectionBy" ||
    value === "insuranceShown"
  );
}

/**
 * What the plan changes about the packet.
 *
 * Returned as two lists rather than applied here, so `requiredDocumentTypes`
 * stays the single place that assembles a document set and this stays the
 * single place that knows what the three answers MEAN.
 */
export type PlanDocumentEffect = {
  add: string[];
  remove: string[];
};

export function planDocumentEffect(
  plan: SalePlan,
  /**
   * The vehicle's verified title status, which the sale reads and never asks.
   * A rebuilt vehicle owes the buyer a written disclosure under 43 TAC
   * 215.160, so the packet grows one document without anybody choosing it.
   */
  titleStatus?: string | null,
): PlanDocumentEffect {
  const add: string[] = [];
  const remove: string[] = [];

  if (titleStatus === "rebuilt_salvage") {
    add.push("rebuiltDisclosure");
  }

  if (plan.registrationBy === "buyer") {
    // They took the filing on. We make no application, so the 130-U comes
    // off and the acknowledgment goes on. The power of attorney is not on
    // the base list, so there is nothing of ours to remove.
    remove.push("form130U");
    add.push("vehicleResponsibility");
  }

  if (plan.registrationBy === "dealer" && plan.titleSignedBy === "dealer") {
    // The buyer is not here to sign the application, so we sign it for
    // them, and the instrument that lets us is the limited power of
    // attorney. This is the ONLY route that owes one.
    add.push("powerOfAttorney");
  }

  if (plan.insuranceShown === false) {
    // Driving off without proof is its own signature, not a line buried in
    // another form.
    add.push("insuranceAcknowledgment");
  }

  return { add, remove };
}

/**
 * The errands the buyer leaves with, for the document that prints them.
 *
 * Shaped for BillOfSalePreview's `outstanding` prop. An unanswered question
 * stays undefined so the page shows the row as open rather than inventing a
 * status nobody gave.
 */
export function outstandingFromPlan(plan: SalePlan): {
  registrationByDealer?: boolean;
  insuranceShown?: boolean;
  inspectionByDealer?: boolean;
  inspectionDone?: boolean;
} {
  return {
    ...(plan.registrationBy !== null
      ? { registrationByDealer: plan.registrationBy === "dealer" }
      : {}),
    ...(plan.insuranceShown !== null ? { insuranceShown: plan.insuranceShown } : {}),
    ...(plan.inspectionBy !== null
      ? {
          inspectionByDealer: plan.inspectionBy === "dealer",
          inspectionDone: plan.inspectionBy === "done",
        }
      : {}),
  };
}

/**
 * Which power of attorney instrument this sale needs, when it needs one.
 *
 * The plain VTR-271 cannot be used in a dealer transaction to assign title
 * on a vehicle subject to federal odometer disclosure, which is anything
 * under twenty model years old. On such a car, us signing for an absent
 * buyer needs the secure VTR-271-A, a controlled form from the county tax
 * office that this product does not fill. It is named here, at the plan,
 * so the review screen can say which form to fetch and file the record of
 * it, rather than refusing at the printer.
 *
 * `null` means no power of attorney is owed at all: the buyer signs the
 * application themselves, or they are filing it.
 */
export function poaInstrument(
  plan: SalePlan,
  vehicleYear: number | null,
  today: Date = new Date(),
): "VTR-271" | "VTR-271-A" | "unknown-year" | null {
  if (plan.registrationBy !== "dealer" || plan.titleSignedBy !== "dealer") return null;
  if (vehicleYear == null) return "unknown-year";
  const age = today.getFullYear() - vehicleYear;
  return age >= 20 ? "VTR-271" : "VTR-271-A";
}

/**
 * Kept for the callers and tests that asked the older question: does this
 * plan put us on a modern car with only the plain form available. It is no
 * longer a refusal, because the answer is a different form rather than a
 * stop, but the condition it names is unchanged.
 */
export function planRefusal(
  plan: SalePlan,
  vehicleYear: number | null,
  today: Date = new Date(),
): string | null {
  return poaInstrument(plan, vehicleYear, today) === "VTR-271-A"
    ? "odometer-exempt-required"
    : null;
}

/** Placed here so callers do not re-derive the funding rule alongside it. */
export type SalePlanContext = { funding: DealType | null; plan: SalePlan };

// ============================================================
// Step identity
// ============================================================

/**
 * One exhaustive map from question to URL key, and back.
 *
 * Adversarial review flagged that inventing `plan:registration` style keys
 * without wiring them means the router's default branch treats them as a
 * document, and the operator lands on a document heading with no controls.
 * So the mapping is a typed record with no string building at the call
 * sites: a new question cannot be added without giving it a key here, and
 * `planQuestionForStep` is the only way back.
 */
export const PLAN_STEP_KEY: Record<PlanQuestionId, string> = {
  registrationBy: "plan:registration",
  titleSignedBy: "plan:title-signer",
  priceIncludesRegistration: "plan:price-includes",
  inspectionBy: "plan:inspection",
  insuranceShown: "plan:insurance",
};

const STEP_TO_QUESTION: Record<string, PlanQuestionId> = Object.fromEntries(
  (Object.entries(PLAN_STEP_KEY) as Array<[PlanQuestionId, string]>).map(
    ([question, key]) => [key, question],
  ),
);

export function planQuestionForStep(stepKey: string): PlanQuestionId | null {
  return STEP_TO_QUESTION[stepKey] ?? null;
}

export function isPlanStepKey(stepKey: string): boolean {
  return planQuestionForStep(stepKey) !== null;
}

// ============================================================
// Changing your mind after documents exist
// ============================================================

/**
 * Whether an answer may still be changed.
 *
 * The plan decides which documents a sale owes. Change registration from us
 * to the buyer and the power of attorney and the 130-U come off the list
 * while the Vehicle Responsibility goes on; change it back and they return.
 * That is harmless while nothing has been signed and dangerous the moment
 * something has, for a reason adversarial review had to point out to me:
 * guide completion is recovered by DOCUMENT TYPE, so a 130-U that was
 * finalized, dropped by a branch switch, and then brought back by switching
 * again would read as already done. A signed document would silently
 * reattach to a sale whose terms had changed underneath it.
 *
 * The honest answer, for now, is refusal. Reopening a finalized document is
 * a real feature with a real design (supersede the old version, reopen its
 * signature, record who and why) and it does not exist yet. Pretending the
 * edit is safe because the screen allows it would be worse than saying no.
 *
 * The dependency is wider than the two obvious documents, which is also
 * something the review caught: insurance adds or removes an acknowledgment,
 * and the price answer feeds the figure printed on the Vehicle
 * Responsibility form. So any plan answer is frozen once a document that
 * derives from the plan has been finalized.
 */
export type PlanEditRefusal = {
  refused: true;
  reason: "documents-finalized";
  /** Named so the screen can say WHICH document is holding the answer. */
  blockedBy: string[];
};

/** Document types whose content or existence the plan decides. */
const PLAN_DERIVED_DOCUMENTS = [
  "powerOfAttorney",
  "form130U",
  "vehicleResponsibility",
  "insuranceAcknowledgment",
  "rebuiltDisclosure",
  // The tow-away packet exists only because of the salvage answer, so a
  // signed sheet from it freezes that answer the same way.
  "salvageBillOfSale",
  "towAwayAcknowledgment",
  "buyerResponsibilityStatement",
] as const;

export function planEditRefusal(
  finalizedDocumentTypes: readonly string[],
): PlanEditRefusal | null {
  const blockedBy = PLAN_DERIVED_DOCUMENTS.filter((type) =>
    finalizedDocumentTypes.includes(type),
  );
  if (blockedBy.length === 0) return null;
  return { refused: true, reason: "documents-finalized", blockedBy };
}
