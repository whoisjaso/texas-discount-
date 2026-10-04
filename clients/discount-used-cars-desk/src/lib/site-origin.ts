/** Normalize the origin; only explicit aliases may change another hostname. */
export function normalizeSiteOrigin(value: string, identity?: { canonicalOrigin: string; aliases: readonly string[] }): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("The site URL must be an HTTP(S) origin without credentials.");
  }
  if (identity) {
    const canonical = new URL(identity.canonicalOrigin);
    if (url.hostname === canonical.hostname || identity.aliases.includes(url.hostname)) return canonical.origin;
  }
  return url.origin;
}
