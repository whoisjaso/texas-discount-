import { getGmailAccessToken } from "@/lib/gmail";

/**
 * Sending through the dealership's own Gmail.
 *
 * The owner's word: mail to the team and to buyers goes out from one of the
 * dealership's Gmail addresses. The Gmail API takes a raw RFC 822 message,
 * base64url-encoded, on the same OAuth client the lead pipeline already
 * reads with; the only new thing is the `gmail.send` scope on the token
 * (re-run scripts/get-gmail-token.ts to grant it) and GMAIL_SEND_FROM, the
 * address the token belongs to.
 *
 * Nothing here logs a body or an address. `sendEmail` owns the outbox
 * claim; this module only builds the bytes and posts them.
 */

const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export type GmailMessageInput = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
    /** An inline picture the HTML refers to as `cid:<contentId>`. */
    contentId?: string;
    inline?: boolean;
  }>;
};

/** RFC 2047 for a header that may carry an accent. ASCII passes through untouched. */
export function encodeHeaderWord(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** A display-name address, with the name encoded when it needs to be. */
function encodeAddress(address: string): string {
  const match = address.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return address.trim();
  const name = match[1].replace(/^"|"$/g, "");
  return name ? `${encodeHeaderWord(name)} <${match[2]}>` : match[2];
}

/** Base64 in 76-column lines, the way a MIME body is carried safely. */
function base64Body(content: Buffer | string): string {
  const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  return raw.toString("base64").replace(/(.{76})/g, "$1\r\n");
}

function boundary(seed: string): string {
  return `=_tj_${seed}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The message as bytes, base64url-encoded for the API's `raw` field.
 *
 * multipart/alternative carries the plain text first and the HTML second,
 * so a client that reads only one reads the better one it can. With
 * attachments the alternative sits inside multipart/mixed.
 */
export function buildRawMessage(input: GmailMessageInput, now: Date = new Date()): string {
  const alt = boundary("alt");
  const headers = [
    `From: ${encodeAddress(input.from)}`,
    `To: ${encodeAddress(input.to)}`,
    ...(input.replyTo ? [`Reply-To: ${encodeAddress(input.replyTo)}`] : []),
    `Subject: ${encodeHeaderWord(input.subject)}`,
    `Date: ${now.toUTCString()}`,
    "MIME-Version: 1.0",
  ];

  const alternative = [
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(input.text),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(input.html),
    `--${alt}--`,
  ].join("\r\n");

  /*
    Inline pictures (the monogram and the wordmark) sit with the HTML in a
    multipart/related part, each carrying the Content-ID the HTML names.
    Files to open (a PDF) sit beside that in multipart/mixed. A message with
    neither is the alternative alone.
  */
  const inlineParts = (input.attachments ?? []).filter((file) => file.inline && file.contentId);
  const fileParts = (input.attachments ?? []).filter((file) => !(file.inline && file.contentId));

  let body: string;
  let bodyType: string;
  if (inlineParts.length > 0) {
    const rel = boundary("rel");
    const pictures = inlineParts
      .map((file) =>
        [
          `--${rel}`,
          `Content-Type: ${file.contentType ?? "image/png"}; name="${file.filename}"`,
          "Content-Transfer-Encoding: base64",
          `Content-ID: <${file.contentId}>`,
          `Content-Disposition: inline; filename="${file.filename}"`,
          "",
          base64Body(file.content),
        ].join("\r\n"),
      )
      .join("\r\n");
    body = [
      `--${rel}`,
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      alternative,
      pictures,
      `--${rel}--`,
    ].join("\r\n");
    bodyType = `multipart/related; type="multipart/alternative"; boundary="${rel}"`;
  } else {
    body = alternative;
    bodyType = `multipart/alternative; boundary="${alt}"`;
  }

  let message: string;
  if (fileParts.length > 0) {
    const mixed = boundary("mix");
    const parts = fileParts
      .map((file) =>
        [
          `--${mixed}`,
          `Content-Type: ${file.contentType ?? "application/octet-stream"}; name="${file.filename}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${file.filename}"`,
          "",
          base64Body(file.content),
        ].join("\r\n"),
      )
      .join("\r\n");
    message = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      "",
      `--${mixed}`,
      `Content-Type: ${bodyType}`,
      "",
      body,
      parts,
      `--${mixed}--`,
      "",
    ].join("\r\n");
  } else {
    message = [...headers, `Content-Type: ${bodyType}`, "", body, ""].join("\r\n");
  }

  return Buffer.from(message, "utf8").toString("base64url");
}

/** Whether the Gmail transport is configured to send at all. */
export function gmailSendFrom(): string | null {
  const from = process.env.GMAIL_SEND_FROM?.trim();
  return from && from.includes("@") ? from : null;
}

/** Hand the message to Gmail. Resolves with the message id or throws with the API's reason. */
export async function sendViaGmail(input: GmailMessageInput): Promise<{ id: string }> {
  const token = await getGmailAccessToken();
  const res = await fetch(SEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: buildRawMessage(input) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // 403 with insufficientPermissions is the token minted on the read-only
    // scope: the fix is the script, not the code, so say so.
    const scope = /insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(detail)
      ? " The Gmail token lacks the gmail.send scope; re-run scripts/get-gmail-token.ts."
      : "";
    throw new Error(`Gmail send failed (${res.status}).${scope}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("Gmail send returned no message id.");
  return { id: data.id };
}
