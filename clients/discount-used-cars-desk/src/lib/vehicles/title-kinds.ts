import type { TitleStatus } from "@/lib/vehicles/title-status";

/**
 * The title question, asked at the desk in words a person can answer.
 *
 * The owner's rule: a dealer does not arrive with the title already
 * classified, and the software is the one that should know what each
 * answer means. So every choice carries, in one line each, what the paper
 * looks like, what the buyer will sign because of it, and what we do. And
 * "I don't know" is an answer, which opens how to tell rather than a wall.
 *
 * `path` is what the sale does next:
 *   proceeds       the ordinary corridor, with whatever the answer adds
 *   rebuild-first  the sale begins and holds its documents until the title
 *                  is rebuilt in our name (Title Work inside the guide), or
 *                  until the sale decides to sell the car as salvage to be
 *                  towed away, which has its own packet
 *   null           no retail sale can begin: a nonrepairable title is a
 *                  title the state will never register again, and the desk
 *                  says so at the car rather than at the last document
 */

export type TitlePath = "proceeds" | "rebuild-first";

export type TitleKind = {
  value: Exclude<TitleStatus, "unknown" | "export_only">;
  /** Catalogue key suffix under funnel.start: titleKind<Key>, titleKind<Key>Paper, ... */
  key: "Clean" | "Rebuilt" | "Bonded" | "Salvage" | "Nonrepairable";
  path: TitlePath | null;
  /** What the answer adds to the packet, by document type. */
  adds: string[];
};

export const TITLE_KINDS: readonly TitleKind[] = [
  { value: "clean", key: "Clean", path: "proceeds", adds: [] },
  { value: "rebuilt_salvage", key: "Rebuilt", path: "proceeds", adds: ["rebuiltDisclosure"] },
  { value: "bonded", key: "Bonded", path: "proceeds", adds: [] },
  { value: "salvage_unrebuilt", key: "Salvage", path: "rebuild-first", adds: [] },
  // Offered so the desk can say it and be stopped with the reason, rather
  // than picking the nearest true-looking card and finding out at the
  // county. A nonrepairable title can be sold for parts or scrap only.
  { value: "nonrepairable", key: "Nonrepairable", path: null, adds: [] },
] as const;

export function titleKindFor(status: string | null | undefined): TitleKind | null {
  return TITLE_KINDS.find((kind) => kind.value === status) ?? null;
}

/** The sale's path for a status, or null for one a retail sale cannot take. */
export function titlePathFor(status: string | null | undefined): TitlePath | null {
  return titleKindFor(status)?.path ?? null;
}

/**
 * How to tell, for the person holding the paper who does not know.
 *
 * Catalogue keys under funnel.start (titleTell1 ... titleTell4), so the
 * corridor's Spanish toggle carries them. Kept as keys here so the desk and
 * its test agree on how many lines there are.
 */
export const TITLE_TELL_KEYS = ["titleTell1", "titleTell2", "titleTell3", "titleTell4"] as const;

/**
 * Where the title was issued, when it was not Texas.
 *
 * An out-of-state title is not a brand: it is a clean, rebuilt, salvage or
 * nonrepairable title from somewhere else, and the brand still decides the
 * packet. What the state adds is a step before Texas will title the car: a
 * VIN inspection (Form VTR-68-A, the Vehicle Identification Certificate
 * from an auto theft investigator) filed with the 130-U. Recorded on the
 * sale so the title step can say so, and printed nowhere else.
 */
export const TITLE_ORIGIN_KEY = "titleOrigin";

export type TitleOrigin = {
  /** Two letters, the issuing state, or null for a Texas title. */
  state: string | null;
};

export function readTitleOrigin(stepData: unknown): TitleOrigin {
  if (!stepData || typeof stepData !== "object") return { state: null };
  const raw = (stepData as Record<string, unknown>)[TITLE_ORIGIN_KEY];
  if (!raw || typeof raw !== "object") return { state: null };
  const state = (raw as Record<string, unknown>).state;
  return { state: typeof state === "string" && /^[A-Z]{2}$/.test(state) && state !== "TX" ? state : null };
}

export function writeTitleOrigin(stepData: unknown, origin: TitleOrigin): Record<string, unknown> {
  const base =
    stepData && typeof stepData === "object" ? { ...(stepData as Record<string, unknown>) } : {};
  base[TITLE_ORIGIN_KEY] = { state: origin.state };
  return base;
}

/** True when the title came from another state and Texas wants the VIN inspected first. */
export function needsVinInspection(origin: TitleOrigin): boolean {
  return origin.state !== null;
}
