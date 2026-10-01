import { firstUnprintableOnStateForm } from "@/lib/forms/state-form-charset";
import { signerFitsSellerLine } from "@/lib/fill-130u/seller-line-fit";

/**
 * A staff member's own name, as onboarding asks for it.
 *
 * Pure, so the server action and its tests share exactly one set of rules.
 * The name matters more than a profile field usually does: it prints in the
 * parentheses on the 130-U seller line ("Legal Name, LLC (First Last)") and
 * under every dealer signature line (owner's instruction 10/01/2026; SOP
 * "First sign-in: onboarding"). So it is the person's legal name, asked as two
 * parts, and kept exactly as typed apart from spacing (SOP 130-U bullet:
 * "named exactly as they entered it at onboarding").
 */

export const STAFF_NAME_PART_MAX = 60;

export type NamePart = "first" | "last";

export type CleanedNamePart = { ok: true; value: string } | { ok: false; error: string };

/**
 * Why a part was refused, as a code the onboarding screen translates
 * (messages/*.json funnel.onboarding.errors), with what the sentence names.
 */
export type NamePartProblem =
  | { code: "empty"; part: NamePart }
  | { code: "tooLong"; part: NamePart; max: number }
  | { code: "badChars"; part: NamePart }
  | { code: "unprintable"; part: NamePart; char: string };

export type CheckedNamePart = { ok: true; value: string } | ({ ok: false } & NamePartProblem);

/** Letters (any script, with their marks), spaces, apostrophes, periods and hyphens. */
const ALLOWED = /^[\p{L}\p{M} '’.-]+$/u;

const LABEL: Record<NamePart, string> = { first: "first name", last: "last name" };

/**
 * One part of the name, cleaned, or the problem with it.
 *
 * NFC, trimmed, inner runs of spaces collapsed, and nothing else: the casing
 * is the person's own, so "de la Cruz", "McDonald" and "van Dyke" print as
 * typed.
 */
export function checkStaffNamePart(raw: unknown, part: NamePart): CheckedNamePart {
  const value = (typeof raw === "string" ? raw : "").normalize("NFC").trim().replace(/\s+/g, " ");

  if (!value) return { ok: false, code: "empty", part };
  if (value.length > STAFF_NAME_PART_MAX) return { ok: false, code: "tooLong", part, max: STAFF_NAME_PART_MAX };
  // The marker a missing fact prints. A name that reads like one would pass
  // for an unset field on a state form.
  if (/^\[?not set/i.test(value) || !ALLOWED.test(value)) return { ok: false, code: "badChars", part };
  if (!/\p{L}/u.test(value)) return { ok: false, code: "empty", part };

  const unprintable = firstUnprintableOnStateForm(value);
  if (unprintable) return { ok: false, code: "unprintable", part, char: unprintable };

  return { ok: true, value };
}

/** The English sentence for a refused part (the action's `error`). */
export function namePartProblemSentence(problem: NamePartProblem): string {
  const label = LABEL[problem.part];
  switch (problem.code) {
    case "empty":
      return `Enter your ${label}.`;
    case "tooLong":
      return `Your ${label} is longer than ${problem.max} characters. Enter it as it is on your ID.`;
    case "badChars":
      return `Use only letters, spaces, apostrophes, periods and hyphens in your ${label}.`;
    case "unprintable":
      return `The state form cannot print "${problem.char}" in your ${label}. Type it the way it is printed on your ID.`;
  }
}

/** One part of the name, cleaned, or the sentence that says why not. */
export function cleanStaffNamePart(raw: unknown, part: NamePart): CleanedNamePart {
  const checked = checkStaffNamePart(raw, part);
  if (checked.ok) return checked;
  return { ok: false, error: namePartProblemSentence(checked) };
}

/** The whole name as it is stored in `full_name` and printed: "First Last". */
export function staffFullName(first: string, last: string): string {
  return `${first} ${last}`;
}

/**
 * The two parts a member already saved at onboarding, for the boxes.
 *
 * Recovered only when onboarding wrote them: `display_name` is the first name
 * and `full_name` begins with it and a space. A `full_name` from the single
 * signup box is never split by guessing where the surname starts, so both
 * boxes start empty and the person types their name once more.
 */
export function onboardingNameParts(member: {
  full_name?: string | null;
  display_name?: string | null;
} | null): { first: string; last: string } {
  const first = member?.display_name?.trim() ?? "";
  const full = member?.full_name?.trim() ?? "";
  if (!first || !full.startsWith(`${first} `)) return { first: "", last: "" };
  const last = full.slice(first.length + 1).trim();
  return last ? { first, last } : { first: "", last: "" };
}

/**
 * The name onboarding saved, when it is still one onboarding would accept:
 * both parts as `onboardingNameParts` recovers them, each passing the rules
 * above unchanged, and "(First Last)" short enough to print in full on the
 * 130-U seller line. Null otherwise (nothing saved yet, a signup name, or one
 * saved before a rule existed), which is when the screen stays open to fix it.
 */
export function savedOnboardingName(member: {
  full_name?: string | null;
  display_name?: string | null;
} | null): { first: string; last: string } | null {
  const parts = onboardingNameParts(member);
  if (!parts.first || !parts.last) return null;
  const first = checkStaffNamePart(parts.first, "first");
  const last = checkStaffNamePart(parts.last, "last");
  if (!first.ok || !last.ok || first.value !== parts.first || last.value !== parts.last) return null;
  if (!signerFitsSellerLine(staffFullName(parts.first, parts.last))) return null;
  return parts;
}

/**
 * Whether there is nothing left for onboarding to ask this member: a usable
 * saved name and, for a member cleared to sign, a saved signature.
 */
export function onboardingSatisfied(member: {
  full_name?: string | null;
  display_name?: string | null;
  can_sign_contracts?: boolean | null;
  signature_data_url?: string | null;
} | null): boolean {
  if (!member || !savedOnboardingName(member)) return false;
  return member.can_sign_contracts !== true || Boolean(member.signature_data_url);
}

export type OnboardingStep = "name" | "signature" | "done";

/**
 * The screens this member walks, in order.
 *
 * The signature screen is shown only to a member cleared to sign
 * (`can_sign_contracts`); the SOP has everybody else skip it. "Done" is
 * always last. There is no password screen: whether onboarding should
 * replace a temporary password is the owner's decision, still open.
 */
export function onboardingSteps(input: { canSign: boolean }): OnboardingStep[] {
  return input.canSign ? ["name", "signature", "done"] : ["name", "done"];
}

/** Where a returning member picks up: the first screen that still has work. */
export function firstOpenStep(input: {
  canSign: boolean;
  hasName: boolean;
  hasSignature: boolean;
}): OnboardingStep {
  if (!input.hasName) return "name";
  if (input.canSign && !input.hasSignature) return "signature";
  return "done";
}
