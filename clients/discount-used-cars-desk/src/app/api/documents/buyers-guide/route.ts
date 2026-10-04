import { buyersGuideSaleProblem } from "@/lib/documents/buyers-guide-sale";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  buildBuyersGuideFilename,
  generateBuyersGuidePdf,
  windowCopyOf,
  type BuyersGuideLanguage,
  type BuyersGuideVehicleInput,
} from "@/lib/documents/buyersGuide";
import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { getVehicleById } from "@/lib/supabase/queries/vehicles";
import type { Vehicle } from "@/types/database";
import { getSaleDetail } from "@/lib/admin/sale-desk";
import { buyersGuideInputFor, buyersGuideVehicleGaps } from "@/lib/documents/buyers-guide-input";

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

/*
  The vehicle row wins when there is one: a guide hanging on a car states
  that car's record, and a typed URL value never overrules it. Query
  values only fill a box the row leaves empty, and stand alone for a guide
  printed without a vehicle (the templates section).
*/
function mergeVehicleInput(
  vehicle: BuyersGuideVehicleInput,
  req: NextRequest,
  fromRow: boolean,
): BuyersGuideVehicleInput {
  const pick = (key: keyof BuyersGuideVehicleInput) => {
    const row = vehicle[key];
    const typed = textParam(req, key);
    const held = row === null || row === undefined || String(row).trim() === "" ? undefined : row;
    return fromRow ? (held ?? typed) : (typed ?? held);
  };
  return {
    year: pick("year"),
    make: pick("make") as string | undefined,
    model: pick("model") as string | undefined,
    vin: pick("vin") as string | undefined,
    stockNumber: pick("stockNumber") as string | undefined,
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

  const vehicleInput = mergeVehicleInput(vehicleFromRecord(vehicle), req, Boolean(vehicle));
  /*
    A guide for a car on record states the whole car: a blank VIN, year,
    make or model on a federal window form is refused by name rather than
    printed (the form tells the buyer to use the VIN for recall checks).
  */
  if (vehicle) {
    const gaps = buyersGuideVehicleGaps(vehicleInput);
    if (gaps.length > 0) {
      return NextResponse.json(
        { error: `The vehicle record has no ${gaps.join(", ")}. Add it to the car before printing its Buyers Guide.`, missing: gaps },
        { status: 400 },
      );
    }
  }
  // The FTC Used Car Rule requires the Spanish Buyers Guide when the sale is
  // conducted in Spanish — lang=es serves the official Spanish form.
  const language: BuyersGuideLanguage = textParam(req, "lang") === "es" ? "es" : "en";
  // Printed for a sale: the sale's warranty answer marks its boxes.
  const dealId = textParam(req, "dealId");
  let sale: Awaited<ReturnType<typeof getSaleDetail>> = null;
  let readFailed = false;
  if (dealId) {
    try {
      sale = await getSaleDetail(dealId);
    } catch (error) {
      console.error("[buyers-guide] sale read failed:", error);
      readFailed = true;
    }
  }
  const saleProblem = buyersGuideSaleProblem({ dealId, vehicleId, sale, readFailed });
  if (saleProblem) {
    return NextResponse.json(
      { error: saleProblem.error, ...(saleProblem.missing ? { missing: saleProblem.missing } : {}) },
      { status: saleProblem.status },
    );
  }

  try {
    const full = await generateBuyersGuidePdf(
      buyersGuideInputFor(vehicleInput, sale, language, textParam(req, "contact") ?? "Sales Office"),
    );
    // The window copy: the filled front and the back, without the FTC's
    // alternate front this desk never sells under.
    const pdfBytes = textParam(req, "copy") === "window" ? await windowCopyOf(full) : full;
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
