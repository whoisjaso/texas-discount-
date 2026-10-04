/**
 * What a promise to pay means, and what it is worth.
 *
 * The owner asked to build the things that make a customer more likely to
 * actually pay, and the industry's own answer to what works is not subtle:
 * a June 2026 panel of auto-lending leaders rated promise-to-pay capture
 * 4.5 out of 5, the single highest-scoring use of AI in auto lending, ahead
 * of onboarding calls, reminders and omnichannel outreach. Proactive contact
 * before a due date cuts late payments by up to thirty per cent.
 *
 * ## Why a promise is not just a note
 *
 * A promise changes what we DO. It holds the escalation ladder, it puts the
 * customer on a list the desk works on the day it comes due, and kept or
 * broken it builds a record that is the only real leverage a lot this size
 * has. None of that works if a promise is a free-text note somebody typed.
 *
 * ## The rule that decides everything below
 *
 * A promise is a commitment, not a payment. So this module is careful in one
 * direction only: it will not mark a promise kept unless money actually
 * arrived. Marking a promise kept on someone's word would produce a record
 * that says everybody keeps their promises, which is worth nothing to
 * anybody and would be discovered as worthless at the worst moment.
 */

/**
 * How long after the promised day before it counts as broken.
 *
 * Not zero. A payment promised Friday and made Friday night posts Saturday;
 * an ACH initiated Friday settles the next business day. Calling that broken
 * at one minute past midnight would mark honest customers as breakers and
 * make the whole record useless.
 *
 * Two days covers a weekend, which is when most of these promises land,
 * because most of them are made against a Friday payday.
 */
export const GRACE_DAYS = 2;

/**
 * How far ahead a promise may be made.
 *
 * Somebody promising to pay in four months is not making a promise, they are
 * ending the conversation. Capturing it would hold the ladder for a third of
 * a year on the strength of one text message.
 */
export const FURTHEST_PROMISE_DAYS = 45;

export type PromiseStatus = "open" | "kept" | "broken" | "cancelled";

export type PaymentPromise = {
  id: string;
  customerId: string;
  installmentId: string | null;
  amountCents: number;
  /** ISO date, the day they said they would pay. */
  promisedFor: string;
  /** Their words, never ours. */
  quote: string;
  source: "sms" | "desk" | "portal";
  capturedBy: string;
  confidence: number | null;
  status: PromiseStatus;
  createdAt: string;
};

/** A payment that landed, for deciding whether a promise was kept. */
export type Settlement = {
  /** ISO date the money arrived. */
  receivedOn: string;
  amountCents: number;
};

const day = (iso: string): number => {
  const parsed = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed) ? NaN : parsed;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one ISO date to another, positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  const a = day(from);
  const b = day(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / DAY_MS);
}

/**
 * The last day a promise can be kept without being late.
 *
 * Exported because the desk screen and the escalation ladder both need to
 * agree on it, and two copies of a date rule become two different rules.
 */
export function graceEndsOn(promisedFor: string): string {
  const end = day(promisedFor) + GRACE_DAYS * DAY_MS;
  return new Date(end).toISOString().slice(0, 10);
}

export type PromiseOutcome =
  | { status: "kept"; paidOn: string }
  | { status: "broken"; daysLate: number }
  | { status: "open"; daysUntil: number };

/**
 * Where a promise stands today, given what has actually been paid.
 *
 * `payments` are everything received from this customer since the promise was
 * made. The test is deliberately generous about the AMOUNT: a customer who
 * promised 300 and sent 250 kept their word as far as this record is
 * concerned, because the thing being measured is whether they are somebody
 * who does what they say, not whether they are good at arithmetic under
 * pressure. The shortfall is still owed and the ledger still says so.
 */
export function outcome(
  promise: Pick<PaymentPromise, "promisedFor" | "amountCents">,
  payments: Settlement[],
  today: string,
): PromiseOutcome {
  const deadline = graceEndsOn(promise.promisedFor);

  // Anything that arrived on or before the grace deadline counts toward it.
  const paid = payments
    .filter((payment) => daysBetween(payment.receivedOn, deadline) >= 0)
    .sort((a, b) => day(a.receivedOn) - day(b.receivedOn));

  const total = paid.reduce((sum, payment) => sum + payment.amountCents, 0);

  /*
    Kept at three quarters, not at the full amount.

    A promise is about the person, not the invoice. Somebody who said 300 and
    found 240 did the thing they said they would do; a record that calls that
    broken would put most of the honest customers on the same list as the
    people who never intended to pay, and then the list means nothing.
  */
  if (total >= Math.round(promise.amountCents * 0.75) && paid.length > 0) {
    return { status: "kept", paidOn: paid[paid.length - 1].receivedOn };
  }

  const past = daysBetween(deadline, today);
  if (past > 0) return { status: "broken", daysLate: past };

  return { status: "open", daysUntil: daysBetween(today, promise.promisedFor) };
}

/**
 * Whether an open promise should hold the escalation ladder.
 *
 * This is the behaviour change that makes capture worth anything. Without it
 * a customer who promised Friday gets a firm overdue notice on Wednesday,
 * learns the messages are automatic, and stops reading them — and the
 * cheapest collection channel we own is gone.
 *
 * The hold ends when the grace period does, not when the promised day does,
 * so a Friday payment posting Saturday is not chased on Saturday morning.
 */
export function holdsReminders(
  promise: Pick<PaymentPromise, "status" | "promisedFor">,
  today: string,
): boolean {
  if (promise.status !== "open") return false;
  return daysBetween(graceEndsOn(promise.promisedFor), today) <= 0;
}

/**
 * Whether a promised date is one we are willing to record.
 *
 * Refuses the past, because a promise to have paid yesterday is a dispute
 * about whether they did, not a promise. Refuses the far future for the
 * reason in FURTHEST_PROMISE_DAYS.
 */
export function isUsableDate(promisedFor: string, today: string): boolean {
  const ahead = daysBetween(today, promisedFor);
  if (Number.isNaN(ahead)) return false;
  return ahead >= 0 && ahead <= FURTHEST_PROMISE_DAYS;
}

export type Standing = {
  made: number;
  kept: number;
  broken: number;
  /** Null until there is a settled promise; a rate off nothing is not a rate. */
  keptRate: number | null;
};

/**
 * What this customer's promises are worth, as a number.
 *
 * The leverage the owner asked for, and the honest form of it. A customer who
 * has kept four of five is somebody whose word can carry a payment plan. One
 * who has broken three straight is somebody the desk should be calling rather
 * than texting. Open promises are not counted either way, because an
 * unfinished promise is not evidence yet.
 */
export function standing(promises: Pick<PaymentPromise, "status">[]): Standing {
  const kept = promises.filter((entry) => entry.status === "kept").length;
  const broken = promises.filter((entry) => entry.status === "broken").length;
  const settled = kept + broken;
  return {
    made: promises.filter((entry) => entry.status !== "cancelled").length,
    kept,
    broken,
    keptRate: settled === 0 ? null : kept / settled,
  };
}
