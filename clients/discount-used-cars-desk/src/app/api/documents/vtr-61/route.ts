import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fillVtr61 } from "@/lib/fill-vtr61/fill-pdf";
import { createServiceClient } from "@/lib/supabase/service";
import { readVtr61 } from "@/lib/vehicles/title-work-evidence";
import { getTemplateSteps, validateTemplateStep, toVtr61Request, type TemplateValues } from "@/lib/documents/template-workflow";

/** Standalone preparation reads answers only; it never creates a sale or title-work row. */
export async function POST(req: NextRequest) {
  const authError = await requireAdmin(req, "documents:manage");
  if (authError) return authError;
  let values: TemplateValues;
  try {
    const input: unknown = await req.json();
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length > 100 || Object.values(input).some(v => typeof v !== "string" || v.length > 2000)) throw new Error("Invalid answers");
    values = input as TemplateValues;
  } catch { return NextResponse.json({ error: "Check the form answers." }, { status: 400 }); }
  const errors = getTemplateSteps("rebuilt-vehicle-statement", values).flatMap(step => Object.values(validateTemplateStep(step, values)));
  if (errors.length) return NextResponse.json({ error: errors[0] }, { status: 400 });
  try {
    const bytes = await fillVtr61(toVtr61Request(values));
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="VTR-61.pdf"', "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The VTR-61 could not be prepared. Try again." }, { status: 500 });
  }
}

/**
 * GET /api/documents/vtr-61?vehicleId=...
 *
 * The Rebuilt Vehicle Statement for one car, filled from inventory, the
 * dealership, and the title work's own record of the rebuild (the date,
 * the rebuilder, the work, the component parts), returned to print and
 * sign in ink. Read by anyone who reads inventory; the title-work screen
 * links here. The query parameters override the record for a one-off.
 */
export async function GET(req: NextRequest) {
  const authError = await requireAdmin(req, "inventory:read");
  if (authError) return authError;

  const url = new URL(req.url);
  const vehicleId = url.searchParams.get("vehicleId")?.trim();
  if (!vehicleId) return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("vehicles").select("*").eq("id", vehicleId).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  const vehicle = data as Record<string, unknown>;

  const text = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
  const vin = text(vehicle.vin);
  if (!vin) return NextResponse.json({ error: "This vehicle has no VIN on file." }, { status: 400 });

  // The rebuild's own record, when the title work has one.
  const { data: row } = await supabase
    .from("vehicle_title_work")
    .select("data")
    .eq("vehicle_id", vehicleId)
    .eq("step", "vtr61")
    .maybeSingle();
  const record = readVtr61((row as { data?: unknown } | null)?.data);

  try {
    const bytes = await fillVtr61({
      vin,
      year: text(vehicle.year),
      make: text(vehicle.make),
      model: text(vehicle.model),
      bodyStyle: text(vehicle.body_style) || text(vehicle.body_type) || text(vehicle.category),
      rebuilderName: url.searchParams.get("rebuilder") ?? record.rebuilderName,
      dateWorkCompleted: url.searchParams.get("completed") ?? record.dateWorkCompleted,
      workPerformed: url.searchParams.get("work") ?? record.workPerformed,
      parts: record.noPartsUsed ? [] : record.parts,
      laborStatement: record.noPartsUsed ? record.laborStatement : "",
    });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="VTR-61_${vin.slice(-6)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[vtr-61] fill failed:", err);
    return NextResponse.json({ error: "The VTR-61 could not be filled." }, { status: 500 });
  }
}
