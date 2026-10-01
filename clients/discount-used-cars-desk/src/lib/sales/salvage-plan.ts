/**
 * What happens with a salvage title, decided on the sale.
 *
 * The desk asks what the title is; a salvage answer used to have exactly
 * one path, rebuild first. The owner's brief names three, because the lot
 * sees all three:
 *
 *   rebuild    the title becomes a rebuilt salvage title in our name first
 *              (the title work inside the guide), and the car then sells
 *              like any rebuilt car, with its disclosure.
 *   towAway    the car is sold on its salvage title, as is, to be towed off
 *              the lot. No plates, no registration, no 130-U from us. The
 *              packet is a different packet: a salvage bill of sale, a
 *              tow-away acknowledgment that says no plates in so many words,
 *              and a buyer responsibility statement. Texas licenses salvage
 *              vehicle dealing separately (Occupations Code ch. 2302), so
 *              the choice says so where it is offered.
 *   undecided  nobody has decided. The sale captures everything it can and
 *              the documents wait, with a badge that says why.
 *
 * Stored under a named key in `step_data`, like the funding answer and the
 * sale plan, so a second dealership inherits it with no migration to run.
 * Pure: nothing here touches a database, and the guide, the badge, the
 * document set and the filing gate all read the same three words.
 */

export const SALVAGE_PLAN_KEY = "salvagePlan";

export type SalvagePath = "rebuild" | "towAway" | "undecided";

export const SALVAGE_PATHS: readonly SalvagePath[] = ["rebuild", "towAway", "undecided"] as const;

export function isSalvagePath(value: unknown): value is SalvagePath {
  return value === "rebuild" || value === "towAway" || value === "undecided";
}

export type SalvagePlan = {
  /** Null until somebody answers; "undecided" is an answer that says wait. */
  path: SalvagePath | null;
  decidedAt: string | null;
};

export const EMPTY_SALVAGE_PLAN: SalvagePlan = { path: null, decidedAt: null };

export function readSalvagePlan(stepData: unknown): SalvagePlan {
  if (!stepData || typeof stepData !== "object") return EMPTY_SALVAGE_PLAN;
  const raw = (stepData as Record<string, unknown>)[SALVAGE_PLAN_KEY];
  if (!raw || typeof raw !== "object") return EMPTY_SALVAGE_PLAN;
  const entry = raw as Record<string, unknown>;
  return {
    path: isSalvagePath(entry.path) ? entry.path : null,
    decidedAt: typeof entry.decidedAt === "string" ? entry.decidedAt : null,
  };
}

/** Merge the answer into an existing step_data blob without disturbing the rest. */
export function writeSalvagePlan(stepData: unknown, plan: SalvagePlan): Record<string, unknown> {
  const base =
    stepData && typeof stepData === "object" ? { ...(stepData as Record<string, unknown>) } : {};
  base[SALVAGE_PLAN_KEY] = { path: plan.path, decidedAt: plan.decidedAt };
  return base;
}

/** The guide step's URL key, one and only one. */
export const SALVAGE_STEP_KEY = "plan:salvage";

/**
 * The tow-away packet, by `document_agreements` name, in the order the
 * corridor walks them. Every one is our own sheet, drawn from the sale; none
 * of them is a state form, because on this path we file nothing with the
 * state.
 */
export const TOW_AWAY_DOCUMENTS: readonly string[] = [
  "salvageBillOfSale",
  "towAwayAcknowledgment",
  "buyerResponsibilityStatement",
] as const;

/**
 * Everything the ordinary packet has that a tow-away sale must NOT carry.
 *
 * A 130-U would be an application to title and register a car that cannot
 * be registered; a vehicle responsibility form describes the buyer filing a
 * registration that does not exist; the insurance acknowledgment promises a
 * filing we will not make; a power of attorney lets us sign an application
 * we are not making; and the ordinary bill of sale says "as is" without
 * saying "not for the road". Each of them is a promise of plates in
 * disguise, and this path exists to make that promise impossible.
 */
export const TOW_AWAY_REMOVES: readonly string[] = [
  "billOfSale",
  "form130U",
  "vehicleResponsibility",
  "insuranceAcknowledgment",
  "powerOfAttorney",
  "rebuiltDisclosure",
] as const;

/**
 * Whether a salvage answer on this sale is one of the tow-away kind. Read
 * everywhere the packet or the plan branch on it, so the branch is one line
 * and never a comparison somebody retypes.
 */
export function isTowAway(stepData: unknown): boolean {
  return readSalvagePlan(stepData).path === "towAway";
}
