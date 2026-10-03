"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/lib/admin/current-admin";
import { createClient } from "@/lib/supabase/server";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { getStaffSignature } from "@/lib/actions/staff-signature";
import { readPaperwork, writePaperwork } from "@/lib/sales/paperwork";
import { casMergeStepData } from "@/lib/sales/step-data-write";
import { hasTeamPermission } from "@/lib/operations/team";
import { resolveVehicleWeight } from "@/lib/vehicles/empty-weight/ensure";
import { box11 } from "@/lib/vehicles/empty-weight/rules";
import {
  EMPTY_WEIGHT_KEYS,
  emptyWeightContext,
  estimateBox11,
  estimateKindOf,
  readTypedWeight,
  weightPrompt,
} from "@/lib/vehicles/empty-weight/on-the-sale";

/**
 * Box 11, settled by a person.
 *
 * The only way an empty weight reaches the 130-U answers: the ordinary
 * answer action refuses `emptyWeight` and every `_emptyWeight*` key
 * (actions/paperwork.ts), so box 11 always arrives here with its source.
 *
 *   estimate   the person taps Confirm on the estimate the screen showed. The
 *              server works it out again and refuses when it is not the one
 *              shown, when the vehicle needs a document (a pickup, heavy
 *              duty, a bus, a cab-chassis, near 6,000 lb), or when a document
 *              figure is already on file. Recorded on the deal only: an
 *              estimate never becomes the vehicle's `weight_lbs`.
 *   typed      the person types the figure off a document and names it. The
 *              Texas rounding is applied here, not trusted from the screen. A
 *              figure that differs from a document already on file needs a
 *              reason, which is kept. A caller who may edit the vehicle also
 *              records it there, so the next sale of this car skips the
 *              question.
 *
 * Every write lands as `emptyWeight` plus the `_emptyWeight*` keys in one
 * version-checked step-data transform.
 */

export type ConfirmWeightInput =
  | { mode: "estimate"; shownBox11: number }
  | { mode: "typed"; reading: string; source: string; reason?: string };

export type ConfirmWeightCode =
  | "estimateMissing"
  | "estimateNeedsDocument"
  | "estimateChanged"
  | "documentOnFile"
  | "weightInvalid"
  | "weightSourceMissing"
  | "reasonRequired"
  | "saveFailed";

export type ConfirmWeightResult =
  | { ok: true; box11: number }
  | { ok: false; code?: ConfirmWeightCode; error: string };

const MESSAGES: Record<ConfirmWeightCode, string> = {
  estimateMissing: "There is no estimate for this vehicle. Type the figure from the title.",
  estimateNeedsDocument: "This vehicle needs the weight from a document: the title, the MCO or a weight certificate.",
  estimateChanged: "The estimate changed; look again.",
  documentOnFile: "A document figure is already on file. Type the new figure from a document to change it.",
  weightInvalid: "Type the weight in pounds, as it is printed.",
  weightSourceMissing: "Say which document the figure is from.",
  reasonRequired: "Say why it is different from the document on file.",
  saveFailed: "Could not save that. Try again.",
};

function refuse(code: ConfirmWeightCode): ConfirmWeightResult {
  return { ok: false, code, error: MESSAGES[code] };
}

export async function confirmEmptyWeight(dealId: string, input: ConfirmWeightInput): Promise<ConfirmWeightResult> {
  const access = await requireAdminActionPermission(["sales:manage", "paperwork:manage"]);
  if (!access.ok) return { ok: false, error: access.error };
  if (!dealId) return refuse("saveFailed");

  try {
    const sale = await getSaleDetail(dealId);
    if (!sale) return { ok: false, error: "That sale could not be found." };
    const answers = readPaperwork(sale.stepData, "form130U");
    // The server's own estimate, never the screen's: cached for the day, so
    // it is the one the screen was drawn from unless something changed.
    const estimate = await resolveVehicleWeight(sale.vehicle, { network: true, persist: false });
    const ctx = emptyWeightContext(sale.vehicle, estimate);
    const prompt = weightPrompt(ctx, answers);

    const held = await getStaffSignature().catch(() => null);
    const byName =
      held?.signerName || access.member?.full_name || access.member?.display_name || access.user?.email || "Unnamed staff account";
    const byId = access.member?.id ?? access.user?.id ?? "";
    const now = new Date().toISOString();

    let fields: Record<string, string>;
    let vehicleRecord: Record<string, unknown> | null = null;

    if (input.mode === "estimate") {
      if (!ctx.estimate) return refuse("estimateMissing");
      if (ctx.gate?.ok === "document") return refuse("estimateNeedsDocument");
      if (prompt.reasonRequiredAgainst !== null) return refuse("documentOnFile");
      const settled = estimateBox11(ctx.estimate, ctx.cls);
      if (settled.lbs !== Number(input.shownBox11)) return refuse("estimateChanged");
      const e = ctx.estimate;
      fields = {
        emptyWeight: String(settled.lbs),
        _emptyWeightSource: estimateKindOf(e),
        _emptyWeightFrom: "deal",
        _emptyWeightReading: String(e.curbLbs),
        _emptyWeightRule: settled.rule,
        _emptyWeightBy: byName,
        _emptyWeightById: byId,
        _emptyWeightAt: now,
        _emptyWeightReason: "",
        // The estimate as it was shown, so the record can say what was confirmed.
        _emptyWeightEstimate: JSON.stringify({
          source: e.source,
          curbLbs: e.curbLbs,
          lowLbs: e.lowLbs,
          highLbs: e.highLbs,
          confidence: e.confidence,
          cls: ctx.cls,
          epa: e.epa ? { yearUsed: e.epa.yearUsed, etwMedian: e.epa.etwMedian, models: e.epa.models, sourceUrls: e.epa.sourceUrls } : null,
          canada: e.canada ? { curbLbs: e.canada.curbLbs, lowLbs: e.canada.lowLbs, highLbs: e.canada.highLbs } : null,
          vpic: e.vpic ?? null,
          tableBuilt: e.table.built,
        }),
      };
    } else {
      const typed = readTypedWeight({ reading: input.reading, source: input.source });
      if (!typed.ok) return refuse(typed.code);
      const settled = box11(typed.reading, typed.source, ctx.cls);
      const reason = (input.reason ?? "").trim();
      const against = prompt.reasonRequiredAgainst;
      if (against !== null && settled.lbs !== against && reason.length < 3) return refuse("reasonRequired");
      fields = {
        emptyWeight: String(settled.lbs),
        _emptyWeightSource: typed.source,
        _emptyWeightFrom: "deal",
        _emptyWeightReading: String(typed.reading),
        _emptyWeightRule: settled.rule,
        _emptyWeightBy: byName,
        _emptyWeightById: byId,
        _emptyWeightAt: now,
        _emptyWeightReason: reason,
        _emptyWeightEstimate: "",
      };
      // Only a document goes on the vehicle, and only for a role that may
      // edit vehicles (the same rule row level security enforces).
      if (sale.vehicle?.id && (hasTeamPermission(access.role, "sales:manage") || hasTeamPermission(access.role, "inventory:manage"))) {
        vehicleRecord = {
          weight_lbs: settled.lbs,
          weight_source: typed.source,
          weight_reading_lbs: typed.reading,
          weight_rule: settled.rule,
          weight_confirmed_by: /^[0-9a-f-]{36}$/i.test(access.member?.id ?? "") ? access.member!.id : null,
          weight_confirmed_by_name: byName,
          weight_confirmed_at: now,
          weight_note: reason || null,
        };
      }
    }

    const supabase = await createClient();
    const merged = await casMergeStepData(supabase, dealId, (current) => {
      const next: Record<string, string> = { ...readPaperwork(current, "form130U") };
      for (const key of EMPTY_WEIGHT_KEYS) delete next[key];
      return writePaperwork(current, "form130U", { ...next, ...fields });
    });
    if (!merged.ok) return refuse("saveFailed");

    if (vehicleRecord && sale.vehicle?.id) {
      const { error } = await supabase.from("vehicles").update(vehicleRecord).eq("id", sale.vehicle.id);
      // The deal holds the sourced answer either way; the vehicle record is
      // the convenience for the next sale of this car.
      if (error) console.error("confirmEmptyWeight: vehicle record not written", error);
    }

    revalidatePath(`/admin/sales/${dealId}`);
    return { ok: true, box11: Number(fields.emptyWeight) };
  } catch (error) {
    console.error("confirmEmptyWeight failed:", error);
    return refuse("saveFailed");
  }
}
