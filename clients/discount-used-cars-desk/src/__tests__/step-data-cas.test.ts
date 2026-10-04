import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { casMergeStepData, type StepDataBlob } from "@/lib/sales/step-data-write";

/**
 * Step data has one writer: the version-checked merge.
 *
 * Two tabs answering the same document, a corridor answer racing the
 * scanner's delayed OCR — every one of those used to be a silent lost
 * update, because each writer read the whole blob, merged in JavaScript,
 * and wrote the whole blob back. The CAS closes it: a write applies only
 * at the version it read, and a conflict re-reads and rebuilds.
 */

describe("no whole-blob step_data writes outside the one writer", () => {
  const ROOTS = ["src/lib/actions", "src/app/api", "src/lib/admin", "src/lib/sales"];

  function* files(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const at = join(dir, entry.name);
      if (entry.isDirectory()) yield* files(at);
      else if (/\.tsx?$/.test(entry.name)) yield at;
    }
  }

  it("forbids .update({ step_data everywhere except step-data-write.ts and the guarded legacy advance", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of files(root)) {
        if (file.replaceAll("\\", "/").endsWith("lib/sales/step-data-write.ts")) continue;
        const source = readFileSync(file, "utf8");
        // Anchored to syntax per the house rule: an update whose payload
        // opens with step_data, or carries a step_data property.
        const direct = /\.update\(\s*\{[\s\S]{0,200}?step_data\s*:/.test(source);
        if (!direct) continue;
        /*
          The one allowed remainder: the retired pipeline's completeStep
          advances step_data + current_step + status in one row write,
          serialized by its own `.eq("current_step", step)` compare-and-set.
          Anything else is an offender.
        */
        const isLegacyAdvance =
          file.replaceAll("\\", "/").endsWith("lib/actions/deals.ts") &&
          source.includes('.eq("current_step", step)');
        if (!isLegacyAdvance) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

type Row = { step_data: StepDataBlob; step_version: number };

/** A fake client precise enough to exercise the retry loop. */
function fakeClient(row: Row, hooks?: { onRead?: () => void }) {
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            hooks?.onRead?.();
            return { data: { ...row, step_data: { ...row.step_data } }, error: null };
          },
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: async (
      _fn: string,
      args: { p_patch: StepDataBlob; p_expected_version?: number },
    ) => {
      if (
        args.p_expected_version !== undefined &&
        args.p_expected_version !== row.step_version
      ) {
        return { data: null, error: null }; // conflict
      }
      row.step_data = { ...row.step_data, ...args.p_patch };
      row.step_version += 1;
      return { data: row.step_version, error: null };
    },
  };
  return client as unknown as Parameters<typeof casMergeStepData>[0];
}

describe("casMergeStepData", () => {
  it("merges and returns the new version", async () => {
    const row: Row = { step_data: { money: { amount: "5" } }, step_version: 3 };
    const result = await casMergeStepData(fakeClient(row), "d1", (current) => ({
      ...current,
      funding: { type: "cash" },
    }));
    expect(result).toMatchObject({ ok: true, version: 4 });
    expect(row.step_data).toEqual({ money: { amount: "5" }, funding: { type: "cash" } });
  });

  it("retries on a version conflict and merges into the OTHER writer's result", async () => {
    const row: Row = { step_data: {}, step_version: 0 };
    let interfered = false;
    const client = fakeClient(row, {
      onRead: () => {
        // A competing writer lands between our first read and our merge.
        if (!interfered) {
          interfered = true;
          row.step_data = { ...row.step_data, buyerId: { image: "x.jpg" } };
          row.step_version += 1;
        }
      },
    });
    const result = await casMergeStepData(client, "d1", (current) => ({
      ...current,
      paperwork: { billOfSale: { tradeIn: "no" } },
    }));
    expect(result.ok).toBe(true);
    // Both writes survive: the interferer's licence image and ours.
    expect(row.step_data).toEqual({
      buyerId: { image: "x.jpg" },
      paperwork: { billOfSale: { tradeIn: "no" } },
    });
  });

  it("gives up after exhausting retries under permanent contention", async () => {
    const row: Row = { step_data: {}, step_version: 0 };
    const client = fakeClient(row);
    // Somebody wins the race every single time: the merge always answers
    // null, which is the conflict signal.
    (client as unknown as { rpc: () => Promise<{ data: null; error: null }> }).rpc =
      async () => ({ data: null, error: null });
    const result = await casMergeStepData(client, "d1", (current) => ({ ...current, k: 1 }));
    expect(result).toEqual({ ok: false, error: "conflict-exhausted" });
  });

  it("treats a null patch as nothing-to-do", async () => {
    const row: Row = { step_data: { a: 1 }, step_version: 7 };
    const rpc = vi.fn();
    const client = fakeClient(row);
    (client as unknown as { rpc: typeof rpc }).rpc = rpc;
    const result = await casMergeStepData(client, "d1", () => null);
    expect(result).toMatchObject({ ok: true, version: 7 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a missing deal as not-found", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    } as unknown as Parameters<typeof casMergeStepData>[0];
    const result = await casMergeStepData(client, "gone", (c) => c);
    expect(result).toEqual({ ok: false, error: "not-found" });
  });
});
