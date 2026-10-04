/**
 * Telnyx SMS provider — sendSMS function replacing Twilio.
 * Uses raw fetch to Telnyx REST API (no SDK dependency).
 *
 * OUTBOUND FLOW:
 *   sendSMS(to, body)
 *     ├── check env vars (graceful degradation if missing)
 *     ├── POST https://api.telnyx.com/v2/messages
 *     └── return { success, messageId?, error? }
 *
 * Env vars required:
 *   TELNYX_API_KEY
 *   TELNYX_PHONE_NUMBER  (E.164, e.g. "+18337771824")
 *   TELNYX_MESSAGING_PROFILE_ID  (UUID from Telnyx portal)
 */

/**
 * Normalize a US phone number to E.164 format (+1XXXXXXXXXX).
 * Throws on non-US or invalid numbers.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Already E.164 with country code
  if (phone.startsWith("+1") && digits.length === 11) return `+${digits}`;
  throw new Error(`Invalid US phone number: ${phone}`);
}

export async function sendSMS(
  to: string,
  body: string,
  options: { timeoutMs?: number } = {},
): Promise<{ success: boolean; messageId?: string; error?: string; uncertain?: boolean }> {
  const apiKey = process.env.TELNYX_API_KEY;
  const fromNumber = process.env.TELNYX_PHONE_NUMBER;
  const profileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

  if (!apiKey || !fromNumber || !profileId) {
    return { success: false, error: "Telnyx not configured. Missing env vars." };
  }

  // Normalise here, not at each call site, because the call sites forget.
  // `customers.phone` holds whatever the desk typed: "+1 832-273-6126" is a
  // real row, and Telnyx answered it with "The 'to' address should be a
  // single valid number" while the daily run recorded a failure and moved on.
  // A customer silently receiving no reminders is the worst kind of failure,
  // so a bad number is refused here, by name, before it costs a send.
  //
  // Idempotent for anything already E.164, so every caller that was already
  // correct is unaffected.
  let recipient: string;
  try {
    recipient = normalizePhone(to);
  } catch {
    console.error("Telnyx SMS error: recipient is not a valid US number");
    return { success: false, error: "Recipient is not a valid US phone number." };
  }

  try {
    const response = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      ...(options.timeoutMs ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromNumber,
        to: recipient,
        text: body,
        messaging_profile_id: profileId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg =
        errorData?.errors?.[0]?.detail || `Telnyx API error: ${response.status}`;
      console.error("Telnyx SMS error:", errorMsg);
      return { success: false, error: errorMsg, uncertain: response.status >= 500 };
    }

    const data = await response.json();
    if (!data?.data?.id) return { success: false, uncertain: true, error: "Provider response did not confirm a message ID." };
    return { success: true, messageId: data.data.id };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown Telnyx error";
    console.error("Telnyx SMS error:", errorMessage);
    return { success: false, error: errorMessage, uncertain: true };
  }
}

/**
 * Reconcile a receipt whose webhook arrived before the send claim acquired
 * its provider ID. A GET never sends another message. Only a matching
 * outbound message and recipient can establish a terminal delivery result.
 * https://developers.telnyx.com/api-reference/messages/retrieve-a-message
 */
export async function getSMSDeliveryStatus(
  messageId: string,
  recipientPhone: string,
  options: { timeoutMs?: number } = {},
): Promise<"delivered" | "failed" | null> {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey || !messageId.trim()) return null;
  try {
    const response = await fetch(`https://api.telnyx.com/v2/messages/${encodeURIComponent(messageId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const { data } = await response.json();
    if (data?.id !== messageId || data?.direction !== "outbound" || !Array.isArray(data?.to)) return null;
    const recipient = data.to.find((entry: { phone_number?: unknown }) =>
      typeof entry?.phone_number === "string" && normalizePhone(entry.phone_number) === normalizePhone(recipientPhone),
    );
    if (recipient?.status === "delivered") return "delivered";
    if (["sending_failed", "delivery_failed", "expired"].includes(recipient?.status)) return "failed";
    return null;
  } catch {
    // No response, malformed data or an unconfirmed status changes nothing.
    return null;
  }
}
