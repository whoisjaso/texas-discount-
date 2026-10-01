import { gateTitleStatus, isTitleStatus, type TitleStatus } from "@/lib/vehicles/title-status";
import type { SalvagePath } from "@/lib/sales/salvage-plan";

/**
 * One badge per deal, saying what the title lets this sale be.
 *
 * The owner's brief: prevent bad promises by design, not memory. The
 * promise this is built against is the one a dealer makes on the phone,
 * "you'll have plates by Friday", on a car whose title cannot deliver them.
 * So every place a deal is listed carries one of these, computed from the
 * same two facts the packet is computed from: the car's verified title and
 * the sale's salvage answer. Nobody types a badge.
 *
 * Pure. The tone is the only presentational hint, and it is a word rather
 * than a colour so the stylesheet decides what "stop" looks like.
 */

export type DealBadgeKey =
  | "readyNormal"
  | "readyRebuilt"
  | "rebuiltPacketIncomplete"
  | "doNotPromisePlates"
  | "decideSalvagePath"
  | "cannotBeSold"
  | "titleUnknown";

export type DealBadge = {
  key: DealBadgeKey;
  /** What the row says, capitalised like every corridor heading. */
  label: string;
  /** One line under it, for the reader who does not know what the label means. */
  gloss: string;
  tone: "ok" | "hold" | "stop";
};

const BADGES: Record<DealBadgeKey, DealBadge> = {
  readyNormal: {
    key: "readyNormal",
    label: "Ready For Normal Sale",
    gloss: "The ordinary packet. Plates can be promised.",
    tone: "ok",
  },
  readyRebuilt: {
    key: "readyRebuilt",
    label: "Ready For Normal Sale",
    gloss: "Rebuilt salvage title. The disclosure is in the packet on its own.",
    tone: "ok",
  },
  rebuiltPacketIncomplete: {
    key: "rebuiltPacketIncomplete",
    label: "Rebuilt Packet Incomplete",
    gloss: "Salvage title being rebuilt in our name. No documents until the county's title arrives.",
    tone: "hold",
  },
  doNotPromisePlates: {
    key: "doNotPromisePlates",
    label: "Do Not Promise Plates",
    gloss: "Sold as salvage, tow-away only. No registration, no plates, no 130-U.",
    tone: "stop",
  },
  decideSalvagePath: {
    key: "decideSalvagePath",
    label: "Decide The Salvage Path",
    gloss: "Salvage title. Rebuild it first, or sell it as salvage to be towed away. The documents wait.",
    tone: "hold",
  },
  cannotBeSold: {
    key: "cannotBeSold",
    label: "Cannot Be Sold",
    gloss: "This title cannot be titled for the road again by anyone.",
    tone: "stop",
  },
  titleUnknown: {
    key: "titleUnknown",
    label: "Say What The Title Is",
    gloss: "Nobody has looked at the title. No document files until somebody does.",
    tone: "hold",
  },
};

export function dealTitleBadge(
  titleStatus: string | null | undefined,
  salvagePath: SalvagePath | null | undefined,
): DealBadge {
  const status: TitleStatus = isTitleStatus(titleStatus) ? titleStatus : "unknown";
  const gate = gateTitleStatus(status);
  if (gate.ok) return status === "rebuilt_salvage" ? BADGES.readyRebuilt : BADGES.readyNormal;
  if (gate.reason === "unverified") return BADGES.titleUnknown;
  if (status !== "salvage_unrebuilt") return BADGES.cannotBeSold;
  if (salvagePath === "towAway") return BADGES.doNotPromisePlates;
  if (salvagePath === "rebuild") return BADGES.rebuiltPacketIncomplete;
  return BADGES.decideSalvagePath;
}

/** Every badge, for the screen that explains them and the test that pins them. */
export const DEAL_BADGES: readonly DealBadge[] = Object.values(BADGES);
