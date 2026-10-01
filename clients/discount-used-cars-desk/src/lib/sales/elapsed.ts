/**
 * How long a sale took.
 *
 * The owner's reason for wanting this is competition between the people on the
 * floor, and that reason is what makes the design decisions rather than the
 * arithmetic. A number people are measured by has to be one they would accept
 * as fair, or they stop trusting the board and start gaming the clock.
 *
 * ## Where the clock starts
 *
 * At the pick-a-vehicle screen, not at the deal row. The row is written at the
 * end of intake, several minutes of real work later, so timing from it credits
 * nobody for the part of the sale that happens first.
 *
 * ## The overnight problem, which is the whole of the difficulty
 *
 * A sale started at five and finished at nine the next morning did not take
 * sixteen hours. It took twenty minutes, twice, with a night in between.
 * Nothing in the data distinguishes that from a genuinely slow sale, and
 * pretending otherwise would put a sixteen hour entry against somebody's name.
 *
 * So: the raw elapsed time is always the truth and is always shown. But a sale
 * that ran past `FAIR_COMPARISON_LIMIT_MS` is EXCLUDED from averages and
 * marked as such, because an average that silently carries one overnight sale
 * is worse than useless, it is actively misleading about everybody in it.
 * The board says how many it set aside rather than hiding the exclusion.
 */

/** Anything longer than this was almost certainly interrupted, not worked. */
export const FAIR_COMPARISON_LIMIT_MS = 4 * 60 * 60 * 1000;

/** A start older than this is a browser tab left open, not a sale in progress. */
export const STALE_START_MS = 12 * 60 * 60 * 1000;

/**
 * What the server is willing to record as a start.
 *
 * The moment happens in a browser, before any row exists, so the browser is
 * what reports it. That means a number people are ranked on arrives over the
 * wire, and it has to be checked rather than trusted.
 *
 * The realistic failure is a device whose clock is wrong, not a salesperson
 * editing a request payload — but the two look identical here and the same
 * rule handles both. Every rejection lands on NULL, which reads as "nobody
 * timed this sale": off the board, shown as a dash, counted against nobody.
 *
 * In particular a start in the FUTURE is refused rather than pulled back to
 * now. Clamping it would hand whoever sent it a zero-second sale and the top
 * of the leaderboard, which is precisely the thing this is here to prevent.
 * Refusing costs them a row and costs nobody else anything.
 */
export function stampStart(reported: string | null | undefined, now: number): string | null {
  if (!reported) return null;
  const started = Date.parse(reported);
  if (Number.isNaN(started)) return null;
  if (started > now) return null;
  if (now - started > STALE_START_MS) return null;
  return new Date(started).toISOString();
}

export type Sale = {
  /** When the pick-a-vehicle screen opened. Null on a deal nobody timed. */
  startedAt: string | null;
  /** When the sale was completed. Null while it is still running. */
  completedAt: string | null;
  /** Who was working it. */
  personId: string | null;
  personName: string;
};

export type Timing = {
  ms: number;
  /** Whether this one belongs in an average people are compared on. */
  comparable: boolean;
  running: boolean;
};

/**
 * The time on the clock.
 *
 * Null when nothing started it, which a caller renders as a dash rather than
 * a zero: an untimed sale is not a fast sale.
 *
 * `now` is a parameter so this is testable and so a server render and the
 * client tick it hands over to cannot disagree about what time it is.
 */
export function timing(sale: Sale, now: number): Timing | null {
  if (!sale.startedAt) return null;
  const started = Date.parse(sale.startedAt);
  if (Number.isNaN(started)) return null;

  const ended = sale.completedAt ? Date.parse(sale.completedAt) : now;
  if (Number.isNaN(ended)) return null;

  // A clock that runs backwards is a clock somebody's device disagreed about,
  // and a negative duration on a board is worse than an absent one.
  const ms = Math.max(0, ended - started);
  return {
    ms,
    comparable: Boolean(sale.completedAt) && ms <= FAIR_COMPARISON_LIMIT_MS,
    running: !sale.completedAt,
  };
}

/**
 * The clock, as a person reads it.
 *
 * Seconds only under a minute, because a sale measured in seconds has not
 * really started and the ticking digit is the only thing saying the clock is
 * live. Hours appear only once there are hours, so the common case is two
 * numbers wide and does not jump about as it counts.
 */
export function readClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

/**
 * A finished duration, as a board prints it.
 *
 * `readClock` above is for a clock that is RUNNING: it shows seconds because
 * the moving digit is the only thing telling you the thing is live. A figure
 * on a board is not moving, so its seconds are two characters of noise on
 * every row, and the eye reads "23m" faster than it reads "23m 00s".
 *
 * Rounded to the nearest minute rather than truncated, so a sale of 89 seconds
 * reads 1m instead of the same 1m a sale of 61 seconds reads. Under a minute
 * it says so in seconds rather than rounding to "0m", which would put a sale
 * on the board that appears to have taken no time.
 */
export function readSpan(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;

  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export type Standing = {
  personId: string | null;
  personName: string;
  /** Every completed sale, however long it took. */
  sales: number;
  /** The ones an average may be built on. */
  counted: number;
  /** Set aside as interrupted, and said out loud rather than hidden. */
  setAside: number;
  /** Middle time of the counted sales, or null when there are none. */
  medianMs: number | null;
  /** Best counted time, which is the one worth chasing. */
  bestMs: number | null;
};

/**
 * The board.
 *
 * MEDIAN, not mean. One nightmare sale involving a lienholder on hold should
 * not decide somebody's month, and the median is the number that answers "how
 * long does this person usually take", which is the question actually being
 * asked. With an even count it takes the lower of the two middles rather than
 * averaging them, so every figure on the board is a time that genuinely
 * happened rather than a computed one that never did.
 *
 * Sorted by median ascending, fastest first, with people who have no counted
 * sales last: they are not slow, they are unmeasured, and ranking them as slow
 * would be the first unfairness anybody noticed.
 */
export function standings(sales: Sale[], now: number): Standing[] {
  const byPerson = new Map<string, { name: string; id: string | null; all: number[]; counted: number[] }>();

  for (const sale of sales) {
    const measured = timing(sale, now);
    if (!measured || measured.running) continue;

    const key = sale.personId ?? `name:${sale.personName}`;
    const entry = byPerson.get(key) ?? { name: sale.personName, id: sale.personId, all: [], counted: [] };
    entry.all.push(measured.ms);
    if (measured.comparable) entry.counted.push(measured.ms);
    byPerson.set(key, entry);
  }

  const board: Standing[] = [];
  for (const entry of byPerson.values()) {
    const sorted = [...entry.counted].sort((a, b) => a - b);
    board.push({
      personId: entry.id,
      personName: entry.name,
      sales: entry.all.length,
      counted: sorted.length,
      setAside: entry.all.length - sorted.length,
      medianMs: sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null,
      bestMs: sorted.length ? sorted[0] : null,
    });
  }

  return board.sort((a, b) => {
    if (a.medianMs === null && b.medianMs === null) return a.personName.localeCompare(b.personName);
    if (a.medianMs === null) return 1;
    if (b.medianMs === null) return -1;
    return a.medianMs - b.medianMs;
  });
}
