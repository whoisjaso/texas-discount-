import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one way step_data gets written.
 *
 * Every corridor answer — money, funding, plate, paperwork, the licence,
 * the language — lives under its own key of one JSONB blob on the deal.
 * For most of this product's life each writer read the whole blob, merged
 * its key in JavaScript, and wrote the whole blob back; two of them doing
 * that at once silently kept one and lost the other. Two tabs on the same
 * document, an answer racing the scanner's delayed OCR: real losses, found
 * in review (round 3, finding 10).
 *
 * So: compare-and-swap. The deal carries a monotonic `step_version`; the
 * database-side merge applies only if the version is still what the caller
 * read, and returns the new version — or NULL, which means somebody else
 * wrote first. On NULL this helper re-reads and rebuilds the patch from
 * the fresh blob, so the retried write merges into what actually happened
 * rather than replaying a stale view.
 *
 * The patch builder receives the CURRENT blob each attempt and returns
 * only the top-level keys it is changing. Returning null aborts cleanly
 * ("nothing to do once I saw the fresh state").
 *
 * A guard test forbids `.update({ step_data` everywhere outside this file:
 * the discipline holds because it cannot be forgotten.
 */

export type StepDataBlob = Record<string, unknown>;

export type StepDataMergeResult =
  | { ok: true; version: number; stepData: StepDataBlob }
  | { ok: false; error: "not-found" | "conflict-exhausted" | "write-failed" };

const MAX_ATTEMPTS = 4;

function asBlob(value: unknown): StepDataBlob {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as StepDataBlob)
    : {};
}

export async function casMergeStepData(
  supabase: SupabaseClient,
  dealId: string,
  buildPatch: (current: StepDataBlob) => StepDataBlob | null,
  options?: { language?: "en" | "es" },
): Promise<StepDataMergeResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, error: readError } = await supabase
      .from("deals")
      .select("step_data, step_version")
      .eq("id", dealId)
      .maybeSingle();
    if (readError) return { ok: false, error: "write-failed" };
    if (!data) return { ok: false, error: "not-found" };

    const row = data as { step_data?: unknown; step_version?: unknown };
    const current = asBlob(row.step_data);
    const patch = buildPatch(current);
    if (patch === null) {
      // Fresh state says there is nothing to change. That is a success.
      return { ok: true, version: Number(row.step_version ?? 0), stepData: current };
    }

    /**
     * A schema without the CAS column (the mock client in preview mode,
     * or a database the migration has not reached) reports step_version
     * as undefined. There the merge runs unconditionally — exactly the
     * pre-CAS behaviour that schema actually supports — instead of
     * pretending a version check happened.
     */
    const versioned = row.step_version !== undefined && row.step_version !== null;

    // A client with no rpc at all (the preview mock, hand-built fakes in
    // tests) is the same case as an rpc that errors: the plain write below
    // is what that client actually supports.
    const rpcResult =
      typeof supabase.rpc === "function"
        ? await supabase
            .rpc("merge_deal_step_data", {
              p_deal_id: dealId,
              p_patch: patch,
              p_language: options?.language ?? null,
              ...(versioned ? { p_expected_version: Number(row.step_version) } : {}),
            })
            .then(
              (r) => r as { data: unknown; error: unknown },
              (thrown) => ({ data: null, error: thrown }),
            )
        : { data: null, error: new Error("no rpc on this client") };
    const { data: merged, error: rpcError } = rpcResult;

    if (rpcError) {
      /**
       * The mock client in local preview has no RPCs at all. That one
       * environment falls back to the plain write the mock supports; a
       * real database never takes this branch, and the guard test pins
       * this file as the only home the fallback is allowed to have.
       */
      const { error: writeError } = await supabase
        .from("deals")
        .update({
          step_data: { ...current, ...patch },
          ...(options?.language ? { language: options.language } : {}),
        })
        .eq("id", dealId);
      if (writeError) return { ok: false, error: "write-failed" };
      return { ok: true, version: 0, stepData: { ...current, ...patch } };
    }

    if (merged !== null && merged !== undefined) {
      return {
        ok: true,
        version: Number(merged),
        stepData: { ...current, ...patch },
      };
    }
    // NULL: somebody else wrote between our read and our merge. Go again
    // from their result.
  }
  return { ok: false, error: "conflict-exhausted" };
}
