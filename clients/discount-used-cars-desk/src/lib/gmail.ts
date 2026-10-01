/**
 * Gmail REST API client with OAuth2 token refresh.
 * Zero npm dependencies — uses raw fetch against Gmail API v1.
 * Read-only: never modifies, deletes, or labels emails.
 */

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// ============================================================
// Types
// ============================================================

export interface GmailMessage {
  id: string;
  sender: string;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

// Module-level token cache (survives across requests in same serverless instance)
let tokenCache: TokenCache | null = null;

// ============================================================
// Token Management
// ============================================================

function getCredentials() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail API not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN env vars."
    );
  }

  return { clientId, clientSecret, refreshToken };
}

async function refreshAccessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = getCredentials();

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const raw = await res.text();

    // Parse Google's error JSON for specific, actionable messages
    let message = `Gmail token refresh failed (${res.status}): ${raw}`;
    try {
      const parsed = JSON.parse(raw);
      const errorCode = parsed.error;

      if (errorCode === "invalid_client") {
        message =
          `Gmail OAuth client not recognized (${res.status}). ` +
          `GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET is wrong or the Google Cloud OAuth client was deleted. ` +
          `Verify Vercel env vars match your .env.local values, or recreate the OAuth client at https://console.cloud.google.com/apis/credentials`;
      } else if (errorCode === "invalid_grant") {
        message =
          `Gmail refresh token expired or revoked (${res.status}). ` +
          `This often happens when the Google Cloud OAuth consent screen is in "Testing" mode (tokens expire after 7 days). ` +
          `Re-authorize: npx tsx scripts/get-gmail-token.ts`;
      } else {
        message = `Gmail token refresh failed (${res.status}): ${parsed.error_description || errorCode || raw}`;
      }
    } catch {
      // Non-JSON response — keep the raw text message
    }

    throw new Error(message);
  }

  const data = await res.json();
  const accessToken: string = data.access_token;
  const expiresIn: number = data.expires_in || 3600;

  // Cache with 60s safety margin
  tokenCache = {
    accessToken,
    expiresAt: Date.now() + (expiresIn - 60) * 1000,
  };

  return accessToken;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }
  return refreshAccessToken();
}

/**
 * The same token, for the one other caller: the send transport in
 * `@/lib/email/gmail-transport`. Reading and sending share the OAuth client
 * and the refresh token; only the scope on that token decides which works.
 */
export async function getGmailAccessToken(): Promise<string> {
  return getAccessToken();
}

async function gmailFetch(
  path: string,
  retried = false
): Promise<Response> {
  const token = await getAccessToken();

  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });

  // If 401 and haven't retried, force token refresh and retry once
  if (res.status === 401 && !retried) {
    tokenCache = null;
    return gmailFetch(path, true);
  }

  return res;
}

// ============================================================
// Email Search
// ============================================================

/**
 * Search Gmail for messages matching a query string.
 * Uses Gmail search syntax: https://support.google.com/mail/answer/7190
 * Returns array of message IDs (newest first).
 */
export async function searchEmails(
  query: string,
  maxResults = 20
): Promise<string[]> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });

  const res = await gmailFetch(`/messages?${params}`);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail search failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const messages: Array<{ id: string }> = data.messages || [];
  return messages.map((m) => m.id);
}

// ============================================================
// Email Content
// ============================================================

/**
 * Decode base64url-encoded string (Gmail API format).
 * Gmail uses URL-safe base64: replace - with +, _ with /, then decode.
 */
function decodeBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function getHeader(
  headers: Array<{ name: string; value: string }>,
  name: string
): string {
  const header = headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value || "";
}

/**
 * Extract body content from Gmail message payload.
 * Handles both single-part and multipart messages.
 */
function extractBody(
  payload: {
    mimeType?: string;
    body?: { data?: string };
    parts?: Array<{
      mimeType?: string;
      body?: { data?: string };
      parts?: Array<{
        mimeType?: string;
        body?: { data?: string };
      }>;
    }>;
  }
): { text: string; html: string } {
  let text = "";
  let html = "";

  // Single-part message
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      html = decoded;
    } else {
      text = decoded;
    }
    return { text, html };
  }

  // Multipart message — recursively search parts
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        text = decodeBase64Url(part.body.data);
      } else if (part.mimeType === "text/html" && part.body?.data) {
        html = decodeBase64Url(part.body.data);
      } else if (part.parts) {
        // Nested multipart (e.g., multipart/alternative inside multipart/mixed)
        for (const subPart of part.parts) {
          if (subPart.mimeType === "text/plain" && subPart.body?.data) {
            text = decodeBase64Url(subPart.body.data);
          } else if (subPart.mimeType === "text/html" && subPart.body?.data) {
            html = decodeBase64Url(subPart.body.data);
          }
        }
      }
    }
  }

  return { text, html };
}

/**
 * Fetch full email content by message ID.
 * Returns sender, subject, date, and decoded body (text + HTML).
 */
export async function getEmailContent(
  messageId: string
): Promise<GmailMessage> {
  const res = await gmailFetch(`/messages/${messageId}?format=full`);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(
      `Gmail get message failed (${res.status}): ${err}`
    );
  }

  const data = await res.json();
  const headers = data.payload?.headers || [];
  const { text, html } = extractBody(data.payload || {});

  return {
    id: data.id,
    sender: getHeader(headers, "From"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    bodyText: text,
    bodyHtml: html,
  };
}

/**
 * Check if Gmail credentials are configured.
 * Returns false if any required env var is missing.
 */
export function isGmailConfigured(): boolean {
  return !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  );
}
