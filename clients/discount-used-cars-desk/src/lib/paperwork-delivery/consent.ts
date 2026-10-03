/**
 * The consent wording the send screen's checkbox stands for, versioned by
 * content: its SHA-256 is recorded on the invite, so a later rewording is a
 * new version by construction. Lives outside the server action because a
 * "use server" module may export only async functions.
 */
export const CONSENT_WORDING =
  "The buyer asked us to text them a link to their paperwork. (v1, 2026-08-27)";
