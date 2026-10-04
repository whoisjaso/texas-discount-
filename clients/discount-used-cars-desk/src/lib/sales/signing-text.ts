export const SIGNING_TEXT_CONSENT = "The buyer asked us to text a link to review and sign this sale's paperwork. (v1, 2026-09-08)";

export type SigningTextStatus = "pending" | "accepted" | "delivered" | "failed" | "unknown";
export type SigningTextResult =
  | { ok: true; id: string; status: SigningTextStatus; reused: boolean; expiresAt: string }
  | { ok: false; code: string };

export type SigningTextClaim = {
  id: string; recipient_phone: string; status: SigningTextStatus;
  created_at: string; expires_at: string;
};

/** A stalled request is uncertain, never proof that a text was sent. */
export function existingSigningText(
  row: SigningTextClaim, phone: string, resend: boolean, now: number,
): SigningTextResult | null {
  const pending = row.status === "pending";
  if (pending && now - Date.parse(row.created_at) < 60_000) {
    return { ok: true, id: row.id, status: "pending", reused: true, expiresAt: row.expires_at };
  }
  if (row.recipient_phone !== phone || Date.parse(row.expires_at) <= now) return null;
  if (resend) return null;
  return { ok: true, id: row.id, status: pending ? "unknown" : row.status, reused: true, expiresAt: row.expires_at };
}

export function signingTextMessage(dealer: string, language: string, url: string): string {
  return language === "es"
    ? `${dealer}: Revise y firme sus documentos: ${url} El enlace vence en 20 minutos. Responda STOP para dejar de recibir mensajes.`
    : `${dealer}: Review and sign your paperwork: ${url} This link expires in 20 minutes. Reply STOP to opt out.`;
}
