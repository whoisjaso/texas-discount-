/**
 * From a salvage title to a rebuilt one: the path a car takes before it
 * can be sold.
 *
 * A dealer without a salvage dealer licence cannot retail a car on a
 * salvage title. The title has to become a rebuilt salvage title in the
 * dealership's own name first (Transportation Code ch. 501 subch. E; the
 * VTR-61 Rebuilt Vehicle Statement filed with a 130-U and the ownership
 * evidence at the county tax office), and only then can the title be
 * assigned to a buyer, with the rebuilt disclosure the sale already makes.
 *
 * This module is the path itself, pure: the steps in order, who does each,
 * which are the county's to ask for rather than the law's to require, and
 * how far along a car is. The screen and the action read it; nothing here
 * touches a database.
 *
 * Steps marked `optional` are not skipped lightly. They are the ones a
 * county may or may not ask for, and the screen says so in those words
 * rather than pretending to know every county's desk.
 */

export type TitlePathStepKey =
  | "ownership"
  | "repairs"
  | "photos"
  | "vtr61"
  | "inspection"
  | "form130u"
  | "county"
  | "received";

export type TitlePathStep = {
  key: TitlePathStepKey;
  /** The short line on the checklist. */
  label: string;
  /** The one sentence under it, for the person who has not done this before. */
  what: string;
  /** Who moves this step: the desk, or the county tax office. */
  who: "dealer" | "county";
  /** A county's ask rather than the state's rule; the screen says so. */
  optional?: boolean;
  /** A form the desk can fill from the car, when there is one. */
  form?: { label: string; href: (vehicleId: string) => string };
};

export const TITLE_PATH_STEPS: readonly TitlePathStep[] = [
  {
    key: "ownership",
    label: "Salvage title in hand, assigned to us",
    what: "The salvage title, or the other state's equivalent, assigned to the dealership. Nothing files without it.",
    who: "dealer",
  },
  {
    key: "repairs",
    label: "Repairs finished, with receipts",
    what: "A receipt or bill of sale for every component part used. An engine, frame or body needs ownership evidence of its own.",
    who: "dealer",
  },
  {
    key: "photos",
    label: "Photos of the repairs",
    what: "Before and after. No county asks; every dispute does.",
    who: "dealer",
    optional: true,
  },
  {
    key: "vtr61",
    label: "VTR-61 Rebuilt Vehicle Statement",
    what: "Filled from the car here. Signed in ink by the rebuilder and by us as the owner; page 2 lists the parts.",
    who: "dealer",
    form: { label: "Fill the VTR-61", href: (vehicleId) => `/api/documents/vtr-61?vehicleId=${encodeURIComponent(vehicleId)}` },
  },
  {
    key: "inspection",
    label: "Inspection report, if the county asks",
    what: "Some counties still want a passing inspection report on a rebuilt vehicle. Keep it with the packet.",
    who: "dealer",
    optional: true,
  },
  {
    key: "form130u",
    label: "Form 130-U for the rebuilt title, in our name",
    what: "Title only, no registration, with the rebuilt salvage remark. The applicant is the dealership, not a buyer.",
    who: "dealer",
    form: { label: "Open the 130-U", href: () => "/admin/documents/form-130u" },
  },
  {
    key: "county",
    label: "Packet handed to the county tax office",
    what: "The salvage title, the VTR-61, the 130-U, the receipts and the fees, together.",
    who: "dealer",
  },
  {
    key: "received",
    label: "Rebuilt salvage title received",
    what: "The county issues the title in our name. Marking this makes the car sellable, with the rebuilt disclosure on every sale.",
    who: "county",
  },
] as const;

export const TITLE_PATH_KEYS: readonly TitlePathStepKey[] = TITLE_PATH_STEPS.map((step) => step.key);

export function isTitlePathStepKey(value: unknown): value is TitlePathStepKey {
  return typeof value === "string" && (TITLE_PATH_KEYS as readonly string[]).includes(value);
}

export type TitleWorkRow = {
  step: string;
  completed_at: string | null;
  note?: string | null;
  /** The step's typed facts (the VTR-61's, on its row). See title-work-evidence.ts. */
  data?: unknown;
  /** The files that prove the step, with short-lived URLs when a screen loaded them. */
  files?: unknown;
};

export type TitlePathProgress = {
  /** Steps done, keyed by step. */
  done: Partial<Record<TitlePathStepKey, { at: string; note: string | null }>>;
  /** Required steps done, over required steps. */
  requiredDone: number;
  requiredTotal: number;
  /** The first required step still open, or null when the path is walked. */
  next: TitlePathStep | null;
  /** True once every required step before "received" is done. */
  readyToReceive: boolean;
};

/** How far along one car is, from its rows. */
export function titlePathProgress(rows: readonly TitleWorkRow[]): TitlePathProgress {
  // The last row for a step is its answer: a step undone (completed_at
  // null) after being done is open again.
  const done: TitlePathProgress["done"] = {};
  for (const row of rows) {
    if (!isTitlePathStepKey(row.step)) continue;
    if (row.completed_at) done[row.step] = { at: row.completed_at, note: row.note ?? null };
    else delete done[row.step];
  }
  const required = TITLE_PATH_STEPS.filter((step) => !step.optional);
  const requiredDone = required.filter((step) => done[step.key]).length;
  const next = required.find((step) => !done[step.key]) ?? null;
  const beforeReceipt = required.filter((step) => step.key !== "received");
  const readyToReceive = beforeReceipt.every((step) => done[step.key]);
  return { done, requiredDone, requiredTotal: required.length, next, readyToReceive };
}

/**
 * What the sale owes the buyer once the car is on a rebuilt title. Said on
 * the title-work screen so the desk knows what follows, and nowhere else,
 * because the sale already does these on its own.
 */
export const AFTER_REBUILT_TITLE: readonly string[] = [
  "The rebuilt title notice goes on the car while it is offered for sale.",
  "The buyer signs the Rebuilt Title Disclosure before any other sale document.",
  "The title assigns to the buyer on the 130-U, as on any sale.",
];
