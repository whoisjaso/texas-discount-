import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  buildBuyersGuideFilename,
  generateBuyersGuidePdf,
  type BuyersGuideLanguage,
  type BuyersGuideVehicleInput,
} from "@/lib/documents/buyersGuide";
import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { getVehicleById } from "@/lib/supabase/queries/vehicles";
import type { Vehicle } from "@/types/database";

function textParam(req: NextRequest, key: string): string | undefined {
  const value = req.nextUrl.searchParams.get(key)?.trim();
  return value || undefined;
}

function vehicleFromRecord(vehicle: Vehicle | null): BuyersGuideVehicleInput {
  if (!vehicle) return {};
  return {
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    vin: vehicle.vin,
    stockNumber: vehicle.stockNumber,
  };
}

function mergeVehicleInput(
  vehicle: BuyersGuideVehicleInput,
  req: NextRequest,
): BuyersGuideVehicleInput {
  return {
    year: textParam(req, "year") ?? vehicle.year,
    make: textParam(req, "make") ?? vehicle.make,
    model: textParam(req, "model") ?? vehicle.model,
    vin: textParam(req, "vin") ?? vehicle.vin,
    stockNumber: textParam(req, "stockNumber") ?? vehicle.stockNumber,
  };
}

export async function GET(req: NextRequest) {
  const authError = await requireAdmin(req, "documents:manage");
  if (authError) return authError;

  const vehicleId = textParam(req, "vehicleId");
  let vehicle: Vehicle | null = null;

  if (vehicleId) {
    const supabase = await createAdminDataClient();
    vehicle = await getVehicleById(supabase, vehicleId);
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }
  }

  const vehicleInput = mergeVehicleInput(vehicleFromRecord(vehicle), req);
  // The FTC Used Car Rule requires the Spanish Buyers Guide when the sale is
  // conducted in Spanish — lang=es serves the official Spanish form.
  const language: BuyersGuideLanguage = textParam(req, "lang") === "es" ? "es" : "en";

  try {
    const pdfBytes = await generateBuyersGuidePdf({
      vehicle: vehicleInput,
      dealer: {
        contact: textParam(req, "contact") ?? "Sales Office",
      },
      language,
    });
    const filename = buildBuyersGuideFilename(vehicleInput, language);

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    console.error("[buyers-guide] PDF generation failed:", error);
    return NextResponse.json({ error: "Buyer guide PDF generation failed" }, { status: 500 });
  }
}
