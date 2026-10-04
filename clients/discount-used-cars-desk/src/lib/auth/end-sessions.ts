/**
 * End every auth session an account started before a password reset
 * (owner's decision 10/02/2026; migration 20261002000000, end_sessions_before).
 *
 * The desk's own cutoff (password-reset-cutoff.ts) refuses those sessions at
 * every page, action and API route; this ends them at the source, so their
 * refresh tokens stop working against the database too. Service role only.
 * Best effort: a failure (the migration not yet applied, the network) is
 * logged and the reset goes ahead, because the desk's cutoff and the
 * database's own amr check still hold.
 */
type RpcClient = {
  rpc?: (name: string, args: Record<string, unknown>) => PromiseLike<{ error?: unknown }>;
};

export async function endSessionsBefore(service: unknown, userId: string | null | undefined, at: string): Promise<void> {
  if (!userId) return;
  try {
    const rpc = (service as RpcClient | null)?.rpc;
    if (typeof rpc !== "function") return;
    const result = await rpc.call(service, "end_sessions_before", { p_user: userId, p_at: at });
    if (result?.error) console.warn("[reset] Older sessions could not be ended:", result.error);
  } catch (error) {
    console.warn("[reset] Older sessions could not be ended:", error);
  }
}
