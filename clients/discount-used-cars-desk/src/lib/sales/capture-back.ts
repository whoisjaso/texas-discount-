/**
 * The way back from the phone's capture screen to the sale it serves.
 *
 * When the desk's own phone opens the capture page, the licence step puts a
 * `back` query param on the link naming the guide step it came from, so the
 * capture screen can offer "Back To The Sale" instead of dead-ending. The
 * buyer's phone, arriving by QR code, never carries one: a customer's phone
 * has no business being pointed into the admin.
 *
 * A query param is attacker-writable, and rendering one as an href is how an
 * open redirect is born. So the value has to prove it is a path inside this
 * site's sale guide before it is ever rendered: an absolute URL, a protocol
 * relative `//host`, or any other shape is ignored outright, never repaired.
 */
const GUIDE_STEP_PATH = /^\/admin\/sales\/[A-Za-z0-9-]+\/guide(\/|$)/;

/** The validated same-origin guide path, or null for anything else. */
export function safeBackPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return GUIDE_STEP_PATH.test(value) ? value : null;
}
