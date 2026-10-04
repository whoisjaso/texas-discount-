/**
 * The lists behind the type-ahead on vehicle fields.
 *
 * Type F and see the makes beginning with F; type FO and see Ford. This is not
 * cleverness for its own sake: a make typed by hand arrives as FORD, ford,
 * Frod, and "Ford " with a trailing space, and every one of those becomes a
 * separate value in the database that no report can group.
 *
 * These are real manufacturer names, not invented data. The list is
 * deliberately the makes a Texas independent lot actually takes in, ordered
 * alphabetically because that is how somebody scans a list they are not
 * searching. It is not exhaustive, and it does not need to be: the field
 * accepts anything typed, so an unlisted make is one keystroke away rather
 * than a wall.
 */

export const VEHICLE_MAKES: readonly string[] = [
  "Acura",
  "Alfa Romeo",
  "Aston Martin",
  "Audi",
  "Bentley",
  "BMW",
  "Buick",
  "Cadillac",
  "Chevrolet",
  "Chrysler",
  "Dodge",
  "Ferrari",
  "FIAT",
  "Ford",
  "Genesis",
  "GMC",
  "Honda",
  "Hyundai",
  "INFINITI",
  "Jaguar",
  "Jeep",
  "Kia",
  "Lamborghini",
  "Land Rover",
  "Lexus",
  "Lincoln",
  "Lucid",
  "Maserati",
  "Mazda",
  "McLaren",
  "Mercedes-Benz",
  "Mercury",
  "MINI",
  "Mitsubishi",
  "Nissan",
  "Polestar",
  "Pontiac",
  "Porsche",
  "RAM",
  "Rivian",
  "Rolls-Royce",
  "Saab",
  "Saturn",
  "Scion",
  "Subaru",
  "Suzuki",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo",
] as const;

/** Body styles as the Texas forms want them, with the code the DMV uses. */
export const BODY_STYLES: readonly string[] = [
  "2 Door",
  "4 Door",
  "Convertible",
  "Coupe",
  "Hatchback",
  "Minivan",
  "Pickup",
  "Sedan",
  "Sport Utility",
  "Van",
  "Wagon",
] as const;

/**
 * Paint colours, as a car is described rather than as paint is sold.
 *
 * The 130-U wants the vehicle's colour, and what belongs in that box is the
 * everyday word. A dealer writes "Silver", never "Ingot Silver Metallic", so
 * this is the short list somebody picks from in one tap instead of typing a
 * manufacturer's marketing name that no state form wants.
 */
export const VEHICLE_COLORS: readonly string[] = [
  "Black",
  "White",
  "Silver",
  "Gray",
  "Blue",
  "Red",
  "Green",
  "Brown",
  "Beige",
  "Gold",
  "Orange",
  "Yellow",
  "Purple",
  "Maroon",
  "Tan",
] as const;

/**
 * Interior colours. Shorter on purpose: an interior is one of a handful of
 * shades, and the long list is the one nobody reads to the bottom of.
 */
export const INTERIOR_COLORS: readonly string[] = [
  "Black",
  "Gray",
  "Tan",
  "Beige",
  "Brown",
  "White",
  "Red",
  "Blue",
] as const;

/**
 * Model years, newest first.
 *
 * Newest first because a lot sells recent cars far more often than old ones, so
 * the common case is at the top of the list rather than the bottom of a scroll.
 * The floor is 2000: older than that is rare enough that typing it is fine, and
 * a list running back to the 1980s is a list nobody scrolls.
 *
 * The top of the range is next year, not this one, because dealers take in
 * next-model-year cars before the calendar catches up.
 */
export const MODEL_YEAR_FLOOR = 2000;

export function modelYears(now: number): string[] {
  const newest = now + 1;
  const years: string[] = [];
  for (let year = newest; year >= MODEL_YEAR_FLOOR; year -= 1) {
    years.push(String(year));
  }
  return years;
}

/**
 * Ranks options against what has been typed so far.
 *
 * Prefix matches come first and in list order, then matches on a later word
 * ("Rover" finding Land Rover), then anything else containing the text. Typing
 * "f" should put Ferrari, FIAT and Ford above Alfa Romeo, because somebody
 * typing a make is almost always typing its first letter.
 *
 * Case and punctuation are ignored on both sides, so "mercedes benz" finds
 * "Mercedes-Benz" and nobody has to know where the hyphen goes.
 */
export function rankSuggestions(
  options: readonly string[],
  query: string,
  limit = 8,
): string[] {
  const needle = normalise(query);
  if (needle.length === 0) return options.slice(0, limit);

  const tight = needle.replace(/ /g, "");

  const prefix: string[] = [];
  const wordStart: string[] = [];
  const contains: string[] = [];

  for (const option of options) {
    const hay = normalise(option);
    // Compared with the separators taken out as well, so somebody who types
    // "mercedesbenz" and somebody who types "mercedes benz" both find the car.
    const hayTight = hay.replace(/ /g, "");

    if (hay.startsWith(needle) || hayTight.startsWith(tight)) {
      prefix.push(option);
      continue;
    }
    if (hay.split(" ").some((word) => word.startsWith(needle))) {
      wordStart.push(option);
      continue;
    }
    // A bare substring match is only useful once there is enough typed to mean
    // something. At one or two letters it is noise: pressing F should offer
    // Ford, not Alfa Romeo because the word happens to contain an f.
    if (needle.length >= 3 && (hay.includes(needle) || hayTight.includes(tight))) {
      contains.push(option);
    }
  }

  return [...prefix, ...wordStart, ...contains].slice(0, limit);
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Texas counties, for the box the 130-U asks for.
 *
 * The full 254 is a list nobody scrolls, so this is the Houston region a
 * Harris-County lot actually sells into, offered as suggestions on a field
 * that still accepts anything typed. A buyer from Lubbock is one keystroke
 * away rather than unrepresentable.
 */
export const TEXAS_COUNTIES: readonly string[] = [
  "Harris",
  "Fort Bend",
  "Montgomery",
  "Brazoria",
  "Galveston",
  "Liberty",
  "Waller",
  "Chambers",
  "Austin",
  "Walker",
  "San Jacinto",
  "Wharton",
  "Matagorda",
  "Colorado",
  "Grimes",
  "Jefferson",
] as const;
