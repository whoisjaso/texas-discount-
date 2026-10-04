import { randomUUID } from 'node:crypto';

const DEFAULT_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours per spec.

export function generateSigningToken(): string {
  return randomUUID();
}

export function computeSigningTokenExpiresAt(
  ttlMs: number = DEFAULT_TTL_MS,
  from: Date = new Date(),
): string {
  return new Date(from.getTime() + ttlMs).toISOString();
}

export function buildRentalPortalUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/rental/${token}`;
}

export function buildRentalDriverPortalUrl(baseUrl: string, token: string): string {
  return `${buildRentalPortalUrl(baseUrl, token)}?driver=1`;
}

export function isTokenExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return true;
  return t < Date.now();
}
