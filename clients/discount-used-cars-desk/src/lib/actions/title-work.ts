"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { isTitlePathStepKey, titlePathProgress, type TitleWorkRow } from "@/lib/vehicles/title-path";
import { readVtr61, stepReadiness, vtr61Missing, type Vtr61Data } from "@/lib/vehicles/title-work-evidence";
import { setVehicleTitleStatus } from "@/lib/actions/title-status";

/**
 * Walking a salvage car to a rebuilt title, one step at a time.
 *
 * Each step done is a row in `vehicle_title_work` with who and when, so the
 * car is never in a drawer with nobody sure where it got to. The last step,
 * the county issuing the title, is the one that changes the car: it becomes
 * `rebuilt_salvage` through the same verification the title-status screen
 * records, and from then on every sale carries the rebuilt disclosure.
 *
 * A tick is refused until the step's proof is on its row (see
 * `title-work-evidence.ts`): the salvage title scan before "in hand", the
 * parts receipts or the no-parts statement before "repairs finished", the
 * form's own facts before the VTR-61. That is the brief's rule, the packet
 * complete by design rather than by memory, applied where the memory
 * would otherwise be.
 */

export type TitleWorkResult = { success: true } | { success: false; error: string };

async function loadRows(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  vehicleId: string,
): Promise<TitleWorkRow[]> {
  const { data } = await supabase
    .from("vehicle_title_work")
    .select("step, completed_at, note, data, files")
    .eq("vehicle_id", vehicleId);
  return (data ?? []) as TitleWorkRow[];
}

function revalidate(vehicleId: string) {
  revalidatePath(`/admin/inventory/${vehicleId}/title-work`);
  revalidatePath("/admin/inventory/title-status");
}

export async function setTitleWorkStep(input: {
  vehicleId: string;
  step: string;
  done: boolean;
  note?: string;
}): Promise<TitleWorkResult> {
  const gate = await requireAdminActionPermission("inventory:manage");
  if (!gate.ok) return { success: false, error: gate.error };

  const vehicleId = input.vehicleId?.trim();
  if (!vehicleId) return { success: false, error: "No vehicle named." };
  if (!isTitlePathStepKey(input.step)) return { success: false, error: "That is not a step on the path." };
  if (input.step === "received") {
    return { success: false, error: "The title's arrival is recorded with Rebuilt Title Received, so the car changes with it." };
  }

  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not signed in." };

    if (input.done) {
      const readiness = stepReadiness(input.step, await loadRows(supabase, vehicleId));
      if (!readiness.ok) {
        return { success: false, error: `Not yet. This step still needs ${readiness.missing.join("; ")}.` };
      }
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("vehicle_title_work").upsert(
      {
        vehicle_id: vehicleId,
        step: input.step,
        completed_at: input.done ? now : null,
        completed_by: input.done ? user.id : null,
        note: input.note?.trim() || null,
        updated_at: now,
      },
      { onConflict: "vehicle_id,step" },
    );
    if (error) return { success: false, error: `Could not save that step: ${error.message}` };

    revalidate(vehicleId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save that step." };
  }
}

/**
 * The VTR-61's facts, saved on its row.
 *
 * Saving is not ticking: an incomplete form saves so the desk can come
 * back to it, and the tick is what checks completeness. What is refused
 * here is only a shape the form cannot hold.
 */
export async function saveVtr61Data(input: { vehicleId: string; data: Vtr61Data }): Promise<
  TitleWorkResult & { missing?: string[] }
> {
  const gate = await requireAdminActionPermission("inventory:manage");
  if (!gate.ok) return { success: false, error: gate.error };
  const vehicleId = input.vehicleId?.trim();
  if (!vehicleId) return { success: false, error: "No vehicle named." };

  const data = readVtr61(input.data);
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not signed in." };

    const { data: existing } = await supabase
      .from("vehicle_title_work")
      .select("completed_at, completed_by, note, files")
      .eq("vehicle_id", vehicleId)
      .eq("step", "vtr61")
      .maybeSingle();
    const now = new Date().toISOString();
    const missing = vtr61Missing(data);
    const { error } = await supabase.from("vehicle_title_work").upsert(
      {
        vehicle_id: vehicleId,
        step: "vtr61",
        data,
        updated_at: now,
        // A form that stops being complete after a tick is un-ticked: the
        // record cannot say "VTR-61 done" over a form with a part missing.
        ...(existing
          ? missing.length > 0
            ? { completed_at: null, completed_by: null }
            : {}
          : { completed_at: null, completed_by: null, note: null, files: [] }),
      },
      { onConflict: "vehicle_id,step" },
    );
    if (error) return { success: false, error: `Could not save the VTR-61: ${error.message}` };

    revalidate(vehicleId);
    return { success: true, missing };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save the VTR-61." };
  }
}

/** Take one file off a step's row. The object stays in the bucket as a record. */
export async function removeTitleWorkFile(input: { vehicleId: string; step: string; path: string }): Promise<TitleWorkResult> {
  const gate = await requireAdminActionPermission("inventory:manage");
  if (!gate.ok) return { success: false, error: gate.error };
  const vehicleId = input.vehicleId?.trim();
  if (!vehicleId || !isTitlePathStepKey(input.step)) return { success: false, error: "No step named." };
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { readFiles } = await import("@/lib/vehicles/title-work-evidence");
    const { data: existing } = await supabase
      .from("vehicle_title_work")
      .select("files")
      .eq("vehicle_id", vehicleId)
      .eq("step", input.step)
      .maybeSingle();
    const files = readFiles((existing as { files?: unknown } | null)?.files).filter((file) => file.path !== input.path);
    const { error } = await supabase
      .from("vehicle_title_work")
      .update({ files, updated_at: new Date().toISOString() })
      .eq("vehicle_id", vehicleId)
      .eq("step", input.step);
    if (error) return { success: false, error: `Could not remove that file: ${error.message}` };
    revalidate(vehicleId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not remove that file." };
  }
}

/**
 * The county issued the rebuilt salvage title. The step is recorded and
 * the car's verified title status becomes rebuilt_salvage, which is what
 * lets Start Sale accept it and what makes the sale disclose it.
 */
export async function receiveRebuiltTitle(input: {
  vehicleId: string;
  note?: string;
}): Promise<TitleWorkResult> {
  const gate = await requireAdminActionPermission("inventory:manage");
  if (!gate.ok) return { success: false, error: gate.error };

  const vehicleId = input.vehicleId?.trim();
  if (!vehicleId) return { success: false, error: "No vehicle named." };

  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not signed in." };

    const progress = titlePathProgress(await loadRows(supabase, vehicleId));
    if (!progress.readyToReceive) {
      return {
        success: false,
        error: `Not yet: ${progress.next?.label ?? "a step"} is still open. The title cannot have arrived before the packet was filed.`,
      };
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("vehicle_title_work").upsert(
      {
        vehicle_id: vehicleId,
        step: "received",
        completed_at: now,
        completed_by: user.id,
        note: input.note?.trim() || null,
        updated_at: now,
      },
      { onConflict: "vehicle_id,step" },
    );
    if (error) return { success: false, error: `Could not record the title: ${error.message}` };

    const marked = await setVehicleTitleStatus({
      vehicleId,
      status: "rebuilt_salvage",
      evidence: "Rebuilt salvage title received from the county (title work)",
    });
    if (!marked.success) return { success: false, error: marked.error };

    revalidate(vehicleId);
    revalidatePath("/admin/inventory");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not record the title." };
  }
}
