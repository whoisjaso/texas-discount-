import { dealerSignerPrintedName } from "@/lib/dealership-config";
import { firstUnprintableOnStateForm } from "@/lib/forms/state-form-charset";
import { signerFitsSellerLine } from "@/lib/fill-130u/seller-line-fit";

/**
 * Who signs for the dealer, and whose name prints beside the stroke.
 *
 * The owner's rule (10/01/2026), now the SOP's ("Legal content each document
 * must carry", 130-U bullet): the seller's printed name on the 130-U is the
 * dealer's legal name followed by the signing person's own name in
 * parentheses, "Legal Name, LLC (First Last)". County offices no longer accept
 * the entity alone. The person is whoever's saved signature lands on the
 * seller band: the staff member filing it, who must be cleared to sign, named
 * exactly as they entered it at onboarding. With no name on record the
 * parentheses print "[Not set: signer name]" and filing is refused.
 *
 * Pure (no server imports), so the filing action, the 130-U renderer and the
 * tests share one set of rules.
 */

/** The roster columns the rule reads. */
export type SignerMember = {
  full_name?: string | null;
  can_sign_contracts?: boolean | null;
  onboarding_completed_at?: string | null;
};

/** What the signature reader hands over about the signed-in member. */
export type HeldSigner = {
  dataUrl: string | null;
  /** Cleared to sign. Absent reads as "not known", never as cleared to file. */
  canSign?: boolean;
  /** `onboardedSignerName` of the member, or null. */
  signerName?: string | null;
  /** Whether the session has a roster row at all. */
  hasMember?: boolean;
  /** The stored `full_name` as it stands, for naming what is wrong with it. */
  fullName?: string | null;
};

function collapse(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

/**
 * The name that prints in the parentheses, or null when this member may not
 * sign for the dealer or has no usable name.
 *
 * All of these must hold: a roster row; cleared to sign; onboarding finished
 * (when the row carries the column); a `full_name` of at least two parts with
 * letters and no "@" (signup can store an email address or "Associate"
 * there); every character printable on the state form; and "(First Last)"
 * short enough to print in full on the 130-U seller line at the 7.25pt floor
 * (a longer one would be clipped by the box). The name is returned as
 * entered, spacing collapsed, never re-cased.
 */
export function onboardedSignerName(member: SignerMember | null | undefined): string | null {
  if (!member) return null;
  if (member.can_sign_contracts !== true) return null;
  if (Object.prototype.hasOwnProperty.call(member, "onboarding_completed_at") && !member.onboarding_completed_at) {
    return null;
  }
  const name = collapse(member.full_name ?? "");
  if (!name || name.includes("@") || !/\p{L}/u.test(name)) return null;
  if (name.split(" ").length < 2) return null;
  if (firstUnprintableOnStateForm(name)) return null;
  if (!signerFitsSellerLine(name)) return null;
  return name;
}

/** Where a member fixes their own name; Handle A Sale links to it. */
export const ONBOARDING_PATH = "/admin/account/onboarding";

/**
 * Whether the member can fix the refusal themselves, on the onboarding
 * screen (their name), rather than needing an owner (no profile, or not
 * cleared to sign).
 */
export function dealerSignerFixIsOnboarding(held: HeldSigner | null | undefined): boolean {
  return Boolean(held && held.hasMember && held.canSign === true && !held.signerName);
}

/**
 * Why this member may not file right now, or null when they may.
 *
 * This is the old "Authorised signer" refusal, now satisfied by the person who
 * actually signs rather than by an environment variable no document printed.
 * `DESK_ALLOW_UNSET_FACTS=true` lifts it exactly as it lifts the other dealer
 * facts: the "[Not set: signer name]" marker still prints, so a demo packet
 * can never pass for a real one.
 */
export function dealerSignerProblem(held: HeldSigner | null | undefined): string | null {
  if (held?.signerName) return null;
  if (process.env.DESK_ALLOW_UNSET_FACTS?.trim() === "true") return null;

  if (!held || !held.hasMember) {
    return "This account has no team profile, so no name can print on the dealer line. Ask an owner to add you to the team.";
  }
  if (held.canSign !== true) {
    return "Only a member cleared to sign can file: the dealer line carries the filer's name and signature. Ask an owner to turn signing on, or have a cleared member press File.";
  }
  // Named in words, not as a raw path: Handle A Sale carries the button.
  const unprintable = firstUnprintableOnStateForm(held.fullName ?? "");
  if (unprintable) {
    return `The state form cannot print "${unprintable}" in your name. Enter it again under Finish Onboarding the way it is printed on your ID before filing.`;
  }
  const stored = collapse(held.fullName ?? "");
  if (stored.split(" ").length >= 2 && !signerFitsSellerLine(stored)) {
    return `Your name is too long to print in full on the 130-U seller line. Enter it again under Finish Onboarding the way it is printed on your ID before filing.`;
  }
  return `Add your first and last name before filing: the 130-U prints the seller as ${dealerSignerPrintedName("First Last")}. Use Finish Onboarding on Handle A Sale.`;
}

/**
 * The stroke that may go on a dealer line: the member's saved signature, and
 * none at all once signing has been turned off for them. The signature page
 * still shows a revoked member their own stroke so they can remove it; it is
 * only kept off the paper.
 */
export function dealerStroke(held: HeldSigner): string | null {
  return held.canSign === false ? null : held.dataUrl ?? null;
}

/**
 * The seller band's stroke and the name printed beside it, for one 130-U.
 *
 * Both always come from the same person:
 *
 *   signatures left off     no stroke; the filer's name from the link; the
 *                           viewer is never consulted.
 *   stroke in the link      that stroke and the filer's name from the link.
 *   filed, no stroke        no stroke (the band is left for ink) and the
 *                           filer's name. Never the viewer: a filed document
 *                           is a record and must not borrow whoever opens it.
 *   draft or preview        the viewer's stroke, if cleared, and the viewer's
 *                           name: the preview shows what their filing prints.
 */
export function resolveSellerSigner(
  link: {
    filed: boolean;
    includeSignatures: boolean;
    linkStroke: string | null;
    linkSignerName: string | null;
  },
  viewer: HeldSigner | null,
): { stroke: string | null; name: string | null } {
  if (!link.includeSignatures) return { stroke: null, name: link.linkSignerName };
  if (link.linkStroke) return { stroke: link.linkStroke, name: link.linkSignerName };
  if (link.filed) return { stroke: null, name: link.linkSignerName };
  return { stroke: viewer ? dealerStroke(viewer) : null, name: viewer?.signerName ?? null };
}

/** The filer's name as the completed link carries it, from the dealer half only. */
export function linkSignerName(dealerHalf: Record<string, unknown> | null | undefined): string | null {
  const value = dealerHalf?.dealerSignerName;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
