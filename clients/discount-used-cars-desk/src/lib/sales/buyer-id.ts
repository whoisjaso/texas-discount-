/**
 * The buyer's licence: photographed on a phone, read by a machine, confirmed
 * by a person.
 *
 * Three separate ideas live here and keeping them separate is the whole design.
 *
 *   what the camera saw     the image, and when it arrived
 *   what the machine read   candidate fields, every one of them a guess
 *   what a person confirmed the values the paperwork is allowed to use
 *
 * Nothing crosses from the second column to the third on its own. An OCR pass
 * misreads a licence number about as often as a tired human does, and a wrong
 * number on a title application is a rejected filing rather than a typo
 * somebody notices. So extraction fills the form and a person still has to look
 * at it.
 *
 * The mailing address is singled out, and it is worth saying why rather than
 * treating it as one more field. It is the value most often different from what
 * is printed on the licence, because people move and licences lag. It is also
 * the one whose error is silent: every document completes, everybody signs, and
 * the plates go to an address the buyer left months ago. Nothing on any screen
 * looks wrong. So it gets its own explicit confirmation and the flow does not
 * continue without it. That is intentional friction and it stays.
 *
 * Stored in `step_data`, the JSONB blob whose other keys are step numbers from
 * the retired paperwork pipeline. A named key cannot collide with those, and
 * using the blob rather than a new column means a second dealership inherits
 * this with no migration to run.
 */

import {
  EMPTY_ADDRESS,
  joinAddress,
  splitAddress,
  type AamvaAddress,
} from "@/lib/sales/aamva";
import {
  EMPTY_NAME,
  NAME_FIELDS,
  hasName,
  splitPersonName,
  type StoredName,
} from "@/lib/forms/person-name";

export { EMPTY_ADDRESS, joinAddress, type AamvaAddress };
export { EMPTY_NAME, NAME_FIELDS, type StoredName };

/** A value the machine proposed, and what a person did about it. */
export type IdField = {
  /** What the reader produced. Null when it could not find the field. */
  read: string | null;
  /** What a person settled on. Null until they have looked at it. */
  confirmed: string | null;
};

export type BuyerId = {
  /** Storage path of the front of the card. Null until something uploads. */
  image: string | null;
  /**
   * Storage path of the back of the card.
   *
   * The back used to be decoded and thrown away, which left the sale holding a
   * photograph of one side of a two sided document. The back is where the
   * restrictions, the endorsements and the issuing authority's own text live,
   * and somebody asking to see the licence on a deal is not asking to see half
   * of it.
   *
   * Null on a deal whose barcode never read, because a card nobody framed
   * successfully has no photograph of its back worth filing.
   */
  backImage: string | null;
  /**
   * Storage path of the file a scanner produced, when there was one.
   *
   * A phone takes a photograph and that is the whole record. An office scanner
   * hands back a PDF, and that PDF is a better artifact than any photograph of
   * the same card: flat, evenly lit, at the resolution the glass was set to,
   * and already the kind of file that gets attached to a filing. So it is kept
   * as it arrived, next to the rasterised page the screen shows.
   *
   * Null for every licence that came from a camera, which is most of them.
   */
  document: string | null;
  /** ISO timestamp the image landed, which is what the desk waits on. */
  capturedAt: string | null;
  name: IdField;
  licenseNumber: IdField;
  dateOfBirth: IdField;
  expires: IdField;
  /** The address printed on the licence, as one line, because a card is one line. */
  address: IdField;
  /**
   * Where post actually goes. Separate from `address` because they differ often
   * enough that treating them as one field is how plates get lost.
   *
   * Four parts rather than one line. The licence hands them over as four
   * separate elements and every document downstream has four boxes for them,
   * so the single free text box in the middle was the only place in the whole
   * chain that threw the structure away, and it did it in front of the person
   * whose job is to check the values. A street, a city, a state and a postal
   * code crammed into one field read as a jumble, which is the report that
   * caused this.
   */
  mailing: AamvaAddress;
  /**
   * Set only by a person answering the question out loud. Never inferred from
   * mailingAddress being non-empty: a pre-filled box that nobody read is
   * exactly the failure this guards.
   */
  mailingConfirmed: boolean;
  /**
   * The name in the four boxes the state forms actually print.
   *
   * Same argument as `mailing`, and for the same reason: the 130-U prints
   * First, Middle, Last and Suffix as four boxes and so does the VTR-271, so
   * a single free text name meant every form had to infer where the surname
   * began. That inference cannot be made correctly. "Ana Maria Garcia" and
   * "John Michael Smith" are the same shape and only one of the two splits is
   * right, and the wrong one goes on a title application.
   *
   * Stored empty on deals that predate this, where the joined `name` field is
   * still all there is and a split is the only option left.
   */
  nameParts: StoredName;
};

export const EMPTY_FIELD: IdField = { read: null, confirmed: null };

/** The four boxes, in the order they are read aloud off an envelope. */
export const MAILING_FIELDS = [
  { key: "street", label: "Street", caps: "words", mode: "text" },
  { key: "city", label: "City", caps: "words", mode: "text" },
  { key: "state", label: "State", caps: "characters", mode: "text" },
  { key: "postal", label: "ZIP", caps: "none", mode: "numeric" },
] as const;

export type MailingKey = (typeof MAILING_FIELDS)[number]["key"];

export const EMPTY_BUYER_ID: BuyerId = {
  image: null,
  backImage: null,
  document: null,
  capturedAt: null,
  name: EMPTY_FIELD,
  licenseNumber: EMPTY_FIELD,
  dateOfBirth: EMPTY_FIELD,
  expires: EMPTY_FIELD,
  address: EMPTY_FIELD,
  mailing: EMPTY_ADDRESS,
  mailingConfirmed: false,
  nameParts: EMPTY_NAME,
};

/** The fields a reader is asked to find, in the order a person checks them. */
/**
 * The fields a reader is asked to find, in the order a person checks them.
 *
 * Each carries the keyboard it should summon on a phone. This is not a detail:
 * the single most upvoted mechanical complaint in a month of practitioner
 * threads was inputs that hand you a full QWERTY when the field only ever takes
 * digits. A licence number typed on the wrong keyboard is slower and likelier
 * to be wrong, and this screen is used with a customer standing at the desk.
 */
export const ID_FIELDS = [
  { key: "name", label: "Full Name", mode: "text", caps: "words" },
  {
    key: "licenseNumber",
    label: "Licence Number",
    // Texas licences are digits, but other states mix letters in, so the
    // keyboard stays full while the shift key does not have to be hunted for.
    mode: "text",
    caps: "characters",
  },
  { key: "dateOfBirth", label: "Date Of Birth", mode: "numeric", caps: "none" },
  { key: "expires", label: "Expires", mode: "numeric", caps: "none" },
  { key: "address", label: "Address On Licence", mode: "text", caps: "words" },
] as const;

export type IdFieldKey = (typeof ID_FIELDS)[number]["key"];

export const BUYER_ID_KEY = "buyerId";

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

function readField(raw: unknown): IdField {
  if (!raw || typeof raw !== "object") return EMPTY_FIELD;
  const entry = raw as Record<string, unknown>;
  return { read: text(entry.read), confirmed: text(entry.confirmed) };
}

/**
 * The mailing address, whichever way the row happens to hold it.
 *
 * Every deal written before this change stores a single `mailingAddress`
 * string, and some of those are addresses somebody confirmed and signed on.
 * Reading them back as one unparsed street would put a city and a postal code
 * in the street box of a title application, so the old shape is split rather
 * than trusted flat.
 */
function readMailing(entry: Record<string, unknown>): AamvaAddress {
  const raw = entry.mailing;
  if (raw && typeof raw === "object") {
    const parts = raw as Record<string, unknown>;
    return {
      street: text(parts.street),
      city: text(parts.city),
      state: text(parts.state)?.toUpperCase() ?? null,
      postal: text(parts.postal),
      // Read back rather than dropped. Intake asks for the county because the
      // 130-U has a box for it; rebuilding this object without it is how a
      // typed answer became a guess from the city further down the line.
      county: text(parts.county),
    };
  }
  return splitAddress(text(entry.mailingAddress));
}

/** One line, for a label, a search, or a document that wants a single string. */
export function mailingOneLine(buyerId: BuyerId): string | null {
  return joinAddress(buyerId.mailing);
}

/** Whether anything at all has been entered. Blank in every box is no address. */
export function hasMailing(mailing: AamvaAddress): boolean {
  return MAILING_FIELDS.some(({ key }) => (mailing[key] ?? "").trim().length > 0);
}

/**
 * The name to put in a government form's four boxes, and whether it is known
 * or inferred.
 *
 * `typed` when a person filled the boxes, `split` when all we have is the one
 * string older deals stored and the surname had to be located by rule. A
 * caller showing this to an operator can say which it is; a caller printing a
 * title application gets the best available either way.
 */
export function nameForForms(buyerId: BuyerId): {
  parts: StoredName;
  source: "typed" | "split" | "none";
} {
  if (hasName(buyerId.nameParts)) {
    return { parts: buyerId.nameParts, source: "typed" };
  }
  const whole = settled(buyerId.name);
  if (!whole) return { parts: EMPTY_NAME, source: "none" };
  const guessed = splitPersonName(whole);
  return {
    parts: {
      first: guessed.first ?? null,
      middle: guessed.middle ?? null,
      last: guessed.last ?? null,
      suffix: guessed.suffix ?? null,
    },
    source: "split",
  };
}

export function readBuyerId(stepData: unknown): BuyerId {
  if (!stepData || typeof stepData !== "object") return EMPTY_BUYER_ID;
  const raw = (stepData as Record<string, unknown>)[BUYER_ID_KEY];
  if (!raw || typeof raw !== "object") return EMPTY_BUYER_ID;

  const entry = raw as Record<string, unknown>;
  return {
    image: text(entry.image),
    backImage: text(entry.backImage),
    document: text(entry.document),
    capturedAt: text(entry.capturedAt),
    name: readField(entry.name),
    licenseNumber: readField(entry.licenseNumber),
    dateOfBirth: readField(entry.dateOfBirth),
    expires: readField(entry.expires),
    address: readField(entry.address),
    mailing: readMailing(entry),
    // Anything other than a literal true is false. A string, a 1 or a missing
    // key all mean nobody answered the question.
    mailingConfirmed: entry.mailingConfirmed === true,
    nameParts: readNameParts(entry),
  };
}

/**
 * The stored name boxes, or four empties.
 *
 * Deliberately does NOT fall back to splitting the joined `name` field. A
 * split is a guess, and a guess that arrives through the same door as a typed
 * answer cannot be told apart from one later. Callers that want the fallback
 * ask for it explicitly, which is what `nameForForms` is for.
 */
function readNameParts(entry: Record<string, unknown>): StoredName {
  const raw = entry.nameParts;
  if (!raw || typeof raw !== "object") return EMPTY_NAME;
  const parts = raw as Record<string, unknown>;
  return {
    first: text(parts.first),
    middle: text(parts.middle),
    last: text(parts.last),
    suffix: text(parts.suffix),
  };
}

/** Merge into an existing step_data blob without disturbing the rest. */
export function writeBuyerId(
  stepData: unknown,
  buyerId: BuyerId,
): Record<string, unknown> {
  const base =
    stepData && typeof stepData === "object"
      ? { ...(stepData as Record<string, unknown>) }
      : {};
  base[BUYER_ID_KEY] = buyerId;
  return base;
}

/**
 * What a field is worth using. Confirmed wins, and an unconfirmed read is
 * never returned as if it were settled, because the point of the split is that
 * the two are not interchangeable.
 */
export function settled(field: IdField): string | null {
  return field.confirmed;
}

/** True once the phone has delivered a photograph. This is what the desk waits on. */
export function hasImage(buyerId: BuyerId): boolean {
  return Boolean(buyerId.image);
}

/**
 * Fields the reader proposed that nobody has confirmed yet.
 *
 * A field the reader could not find at all is not outstanding: there is nothing
 * to confirm, and a person will type it or leave it blank. Only a machine guess
 * sitting unreviewed is a problem, because that is the one that looks finished.
 */
export function unconfirmedFields(buyerId: BuyerId): IdFieldKey[] {
  return ID_FIELDS.filter(({ key }) => {
    const field = buyerId[key];
    return field.read !== null && field.confirmed === null;
  }).map(({ key }) => key);
}

/**
 * Why the step is not finished, or null when it is.
 *
 * Ordered by what a person can act on first. A missing photograph cannot be
 * fixed by confirming fields, so it is reported before them.
 */
export function blockedBecause(buyerId: BuyerId): string | null {
  /**
   * Typing the card is a complete way to finish this step — the screen says
   * so out loud, and it is what the step was before the phone handoff
   * existed. So a missing photograph blocks only a deal that ALSO lacks the
   * two typed facts every document quotes: a confirmed name and a confirmed
   * licence number. The persona walk found the mismatch: the screen offered
   * "Type What The Card Says", the operator typed it all, and the guide
   * kept routing back to "Put The Licence On File" forever, because this
   * check demanded the photograph unconditionally.
   */
  const typedThrough =
    settled(buyerId.name) !== null && settled(buyerId.licenseNumber) !== null;
  if (!hasImage(buyerId) && !typedThrough) {
    return "No photograph of the licence yet.";
  }
  if (unconfirmedFields(buyerId).length > 0) {
    return "Some values the reader proposed have not been checked.";
  }
  if (!hasMailing(buyerId.mailing)) return "No mailing address.";
  if (!buyerId.mailingConfirmed) {
    return "The mailing address has not been confirmed.";
  }
  return null;
}

export function isComplete(buyerId: BuyerId): boolean {
  return blockedBecause(buyerId) === null;
}

/**
 * Apply a reader's output.
 *
 * Extraction only ever fills `read`. It cannot touch `confirmed`, and it cannot
 * touch `mailingConfirmed`, so re-running the reader on a better photograph can
 * never silently un-confirm or re-confirm something a person already settled.
 */
export function applyExtraction(
  buyerId: BuyerId,
  extracted: Partial<Record<IdFieldKey, string | null>>,
): BuyerId {
  const next: BuyerId = { ...buyerId };
  for (const { key } of ID_FIELDS) {
    if (!(key in extracted)) continue;
    next[key] = { ...buyerId[key], read: text(extracted[key]) };
  }
  return next;
}

/**
 * Is any field still waiting for a first answer?
 *
 * Asked before running the slower reader over the front of the card. A licence
 * whose barcode gave up everything has nothing left to look for, and a second
 * pass over it would cost time for a result that `gapsOnly` would discard.
 */
export function hasUnreadFields(buyerId: BuyerId): boolean {
  return ID_FIELDS.some(
    ({ key }) => buyerId[key].read === null && buyerId[key].confirmed === null,
  );
}

/**
 * Narrow a reader's output to the fields nothing has read yet.
 *
 * The barcode on the back of a licence is what the issuing authority encoded.
 * The print on the front is what a camera made of ink. Both arrive through
 * `applyExtraction`, which overwrites `read` for every key it is handed, so
 * handing it a full set of OCR values after a good barcode scan would quietly
 * replace DMV data with guesses and nothing on any screen would look wrong.
 *
 * So the weaker reader is filtered through this first. It fills gaps and never
 * competes: a field the barcode already answered is left exactly as it was.
 *
 * A field a person has already confirmed is also left alone. Its `read` is what
 * they were shown when they made that decision, and rewriting it underneath
 * them would make the record disagree with what was on screen at the time.
 */
export function gapsOnly(
  buyerId: BuyerId,
  candidate: Partial<Record<IdFieldKey, string | null>>,
): Partial<Record<IdFieldKey, string | null>> {
  const gaps: Partial<Record<IdFieldKey, string | null>> = {};
  for (const { key } of ID_FIELDS) {
    if (!(key in candidate)) continue;
    const value = text(candidate[key]);
    if (value === null) continue;
    if (buyerId[key].read !== null) continue;
    if (buyerId[key].confirmed !== null) continue;
    gaps[key] = value;
  }
  return gaps;
}

/**
 * A person confirming values.
 *
 * `mailingConfirmed` is only ever set by passing it explicitly, so it cannot
 * ride along on an unrelated save.
 */
export function applyConfirmation(
  buyerId: BuyerId,
  input: {
    fields?: Partial<Record<IdFieldKey, string | null>>;
    mailing?: Partial<AamvaAddress>;
    mailingConfirmed?: boolean;
    nameParts?: Partial<StoredName>;
  },
): BuyerId {
  const next: BuyerId = { ...buyerId };

  for (const { key } of ID_FIELDS) {
    if (!input.fields || !(key in input.fields)) continue;
    next[key] = { ...buyerId[key], confirmed: text(input.fields[key]) };
  }

  if (input.mailing) {
    const value: AamvaAddress = {
      street: text(input.mailing.street),
      city: text(input.mailing.city),
      state: text(input.mailing.state)?.toUpperCase() ?? null,
      postal: text(input.mailing.postal),
      county: text(input.mailing.county),
    };
    const changed = MAILING_FIELDS.some(({ key }) => value[key] !== buyerId.mailing[key]);
    next.mailing = value;
    // Changing any part invalidates any previous confirmation. Somebody
    // confirmed the old one; nobody has looked at this.
    if (changed) next.mailingConfirmed = false;
  }

  if (input.nameParts) {
    // The four boxes a government form prints, saved as typed. No split, no
    // inference: if a box is empty it is empty, and the form shows it empty
    // rather than filling it with a guess nobody made.
    next.nameParts = {
      first: text(input.nameParts.first),
      middle: text(input.nameParts.middle),
      last: text(input.nameParts.last),
      suffix: text(input.nameParts.suffix),
    };
  }

  if (input.mailingConfirmed === true) {
    // Confirming an address that is not there is not a confirmation.
    next.mailingConfirmed = hasMailing(next.mailing);
  } else if (input.mailingConfirmed === false) {
    next.mailingConfirmed = false;
  }

  return next;
}

/**
 * The address on the licence, offered as the starting point for the mailing
 * address. It is a suggestion to accept or overwrite, never a default that
 * counts as confirmed.
 *
 * Split into the same four parts the boxes have. The card was read as four
 * elements, so the pieces exist; splitting the joined line back apart here is
 * for the deals whose only record of it is that line.
 */
export function suggestedMailing(buyerId: BuyerId): AamvaAddress {
  return splitAddress(buyerId.address.confirmed ?? buyerId.address.read);
}
