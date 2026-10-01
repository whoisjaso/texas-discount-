/**
 * Making typed input look right on a printed document.
 *
 * Somebody at the desk types fast, with caps lock on, in a hurry, with a
 * customer waiting. What they type is not what should appear on a title
 * application. "TRIPLE J AUTO" is the dealership's name, not a shout, and a
 * form that reproduces the shouting looks like it was filled in by an amateur
 * at exactly the moment it is being read by a county clerk.
 *
 * So every value is normalised on the way onto the page rather than being
 * policed on the way into the box. Typing is not the place to make somebody
 * careful; the document is the place to be correct.
 *
 * The reason this is a set of named functions rather than one `titleCase` is
 * that the right answer differs by field, and getting it wrong is worse than
 * doing nothing:
 *
 *   a VIN must stay uppercase        "1hgcm82633a004352" is not a VIN
 *   a plate must stay uppercase      plates are issued in caps
 *   a state is two capitals          "Tx" is not a state
 *   a name is Title Case             but McDonald and O'Brien are not Mcdonald
 *   an address is Title Case         except NE, SW, PO Box, and unit letters
 *
 * Nothing here corrects spelling or spacing. If a person types their name
 * wrong, that is theirs to fix: silently rewriting what somebody entered on a
 * legal instrument is a worse failure than reproducing it.
 */

/** Words inside a name that stay lowercase unless they lead. */
const NAME_PARTICLES = new Set([
  "de", "del", "de la", "della", "di", "da", "dos", "das",
  "van", "von", "der", "den", "ter", "ten",
  "la", "le", "du", "of", "y", "e",
]);

/** Generational and professional suffixes, and how they are written. */
const SUFFIXES = new Map([
  ["jr", "Jr"], ["jr.", "Jr."], ["sr", "Sr"], ["sr.", "Sr."],
  ["ii", "II"], ["iii", "III"], ["iv", "IV"], ["v", "V"],
  ["md", "MD"], ["dds", "DDS"], ["phd", "PhD"], ["esq", "Esq"],
]);

/**
 * Business entity suffixes, which are initials rather than words.
 *
 * Caught by a test rather than by reading: "Triple J Auto Investment LLC"
 * became "... Llc", which is the registered name of no company anywhere. A
 * legal entity's name on a title application has to be the name it is
 * registered under.
 */
const ENTITY_SUFFIXES = new Map(
  [
    "LLC", "L.L.C.", "INC", "INC.", "LLP", "LP", "PLLC", "PC", "PA",
    "CO", "CO.", "CORP", "CORP.", "LTD", "LTD.", "DBA", "NA", "N.A.",
  ].map((code) => [code.toLowerCase(), code]),
);

/** Street directionals, which are capitals on a mailing address. */
const DIRECTIONALS = new Set([
  "n", "s", "e", "w", "ne", "nw", "se", "sw",
]);

/** Address words that are written as capitals rather than title case. */
const ADDRESS_CAPS = new Set(["po", "pobox", "rr", "hc", "us", "sr", "fm", "cr"]);

/**
 * Capitalises one word, respecting the ways real names are written.
 *
 * Mc and Mac get an internal capital, but only where that is actually the
 * convention: "Mac" alone is a name, and "Machado" is not "MacHado", so the
 * rule requires a following consonant cluster of reasonable length. This will
 * still be wrong for somebody occasionally, which is why every value is shown
 * on screen before it prints.
 */
function capitaliseWord(word: string): string {
  if (word.length === 0) return word;

  const lower = word.toLowerCase();

  // Hyphenated and slashed compounds capitalise on both sides.
  if (/[-/]/.test(word)) {
    return word
      .split(/([-/])/)
      .map((part) => (part === "-" || part === "/" ? part : capitaliseWord(part)))
      .join("");
  }

  // O'Brien, D'Angelo. Only when what follows the apostrophe is a real chunk,
  // so a possessive or a contraction is left alone.
  const irish = /^(o|d|l)'(\w{2,})$/i.exec(lower);
  if (irish) {
    return `${irish[1].toUpperCase()}'${capitaliseWord(irish[2])}`;
  }

  if (/^mc[a-z]{3,}$/.test(lower)) {
    return `Mc${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
  }
  if (/^mac[a-z]{4,}$/.test(lower) && !/^mac(hi|ha|ke|ci|ro|on|au)/.test(lower)) {
    return `Mac${lower.charAt(3).toUpperCase()}${lower.slice(4)}`;
  }

  // A single letter is an initial and keeps its capital: the J in Triple J.
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

/**
 * A person's or business's name.
 *
 * "TRIPLE J AUTO" becomes "Triple J Auto". "john q. sample" becomes
 * "John Q. Sample".
 */
export function personName(value: string | null | undefined): string {
  if (!value) return "";
  // A "[Not set: …]" marker is printed exactly as written, never re-cased.
  if (/^\[Not set: /.test(value)) return value;
  const parts = words(value);

  return parts
    .map((word, index) => {
      const lower = word.toLowerCase();

      // An entity suffix is initials wherever it appears.
      const entity = ENTITY_SUFFIXES.get(lower);
      if (entity && index > 0) return entity;

      const suffix = SUFFIXES.get(lower);
      // Never at the front: "Vy" is a first name, "V" as a suffix is not.
      if (suffix && index > 0) return suffix;

      // An initial with a full stop keeps both: "Q." not "q.".
      if (/^[a-z]\.$/i.test(word)) return word.toUpperCase();

      if (index > 0 && NAME_PARTICLES.has(lower)) return lower;

      return capitaliseWord(word);
    })
    .join(" ");
}

/**
 * A street address.
 *
 * Directionals and route prefixes stay capitals, because "123 Ne Main St" reads
 * as a typo and "PO Box" is not "Po Box". A unit that is a bare letter or a
 * number with a trailing letter keeps its capital: Apt 4B, not Apt 4b.
 */
export function streetAddress(value: string | null | undefined): string {
  if (!value) return "";

  return words(value)
    .map((word) => {
      const bare = word.replace(/[.,]/g, "").toLowerCase();

      if (DIRECTIONALS.has(bare)) return bare.toUpperCase();
      if (ADDRESS_CAPS.has(bare)) return bare.toUpperCase();

      // 4B, 12A: a number carrying a unit letter.
      if (/^\d+[a-z]$/i.test(word)) return word.toUpperCase();
      // Ordinals stay lowercase: 1st, 2nd, 3rd, 4th.
      if (/^\d+(st|nd|rd|th)$/i.test(word)) return word.toLowerCase();
      // A pure number is a number.
      if (/^\d+$/.test(word)) return word;

      return capitaliseWord(word);
    })
    .join(" ");
}

/** A city or county. Same rules as a name, without suffixes. */
export function placeName(value: string | null | undefined): string {
  if (!value) return "";
  return words(value)
    .map((word, index) =>
      index > 0 && NAME_PARTICLES.has(word.toLowerCase())
        ? word.toLowerCase()
        : capitaliseWord(word),
    )
    .join(" ");
}

/** A two-letter state. Anything else is passed through untouched. */
export function stateCode(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  return /^[a-z]{2}$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}

/**
 * A VIN. Always capitals, always without the spaces people type into them.
 *
 * Never partially corrected: a VIN has no I, O or Q by standard, but silently
 * turning a typed O into a zero on a title application is exactly the kind of
 * helpfulness that produces a rejected filing nobody can explain.
 */
export function vin(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, "").toUpperCase();
}

/** A licence plate. Capitals, and the hyphen people type is kept. */
export function plate(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * A make or model.
 *
 * Marques and trim codes are written the way the manufacturer writes them, so
 * a small dictionary beats a rule here. Anything not in it is title cased,
 * which is right for Ford, Toyota, Chevrolet and almost everything else.
 */
const MARQUE = new Map(
  [
    "BMW", "GMC", "RAM", "MINI", "FIAT", "KIA", "MG", "BYD",
    "AMG", "GTI", "GLI", "STI", "WRX", "SRT", "GT", "GTS", "RS", "SS",
    "LX", "EX", "SE", "SEL", "LE", "XLE", "XSE", "LT", "LTZ", "XLT",
    "SV", "SR", "SL", "S", "ES", "IS", "GS", "LS", "NX", "RX", "TX",
    "CX", "MX", "QX", "FX", "EQS", "EQE", "GLA", "GLB", "GLC", "GLE",
    "GLS", "CLA", "CLS", "TRD", "AWD", "FWD", "RWD", "4WD", "EV", "PHEV",
    "SD", "4D", "2D", "CV", "UT", "PK",
  ].map((code) => [code.toLowerCase(), code]),
);

export function vehicleTerm(value: string | null | undefined): string {
  if (!value) return "";
  return words(value)
    .map((word) => {
      const known = MARQUE.get(word.toLowerCase());
      if (known) return known;
      // F-150, CX-5, X5: a letter-number designation stays capitals.
      if (/^[a-z]{1,3}-?\d+[a-z]*$/i.test(word)) return word.toUpperCase();
      return capitaliseWord(word);
    })
    .join(" ");
}

/**
 * A whole address line, city, state and postcode together.
 *
 * Split on commas so each piece gets the rule that suits it, because the state
 * needs capitals and the city does not.
 */
export function addressLine(value: string | null | undefined): string {
  if (!value) return "";
  const pieces = value.split(",").map((piece) => piece.trim()).filter(Boolean);
  if (pieces.length <= 1) return streetAddress(value);

  return pieces
    .map((piece, index) => {
      if (index === 0) return streetAddress(piece);
      // A trailing "TX 78701" carries both a state and a postcode.
      const tail = /^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(piece);
      if (tail) return `${tail[1].toUpperCase()} ${tail[2]}`;
      if (/^\d{5}(-\d{4})?$/.test(piece)) return piece;
      if (/^[A-Za-z]{2}$/.test(piece)) return piece.toUpperCase();
      return placeName(piece);
    })
    .join(", ");
}
