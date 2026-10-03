import { NextRequest, NextResponse } from "next/server";
import { isValidVin, decodeVin } from "@/lib/nhtsa";
import { estimateEmptyWeight, specFromDecode } from "@/lib/vehicles/empty-weight/estimate";

export async function GET(request: NextRequest) {
  const vin = request.nextUrl.searchParams.get("vin");

  if (!vin) {
    return NextResponse.json(
      { error: "VIN parameter is required" },
      { status: 400 }
    );
  }

  if (!isValidVin(vin)) {
    return NextResponse.json(
      {
        error:
          "Invalid VIN format. Must be 17 alphanumeric characters (no I, O, or Q).",
      },
      { status: 400 }
    );
  }

  try {
    const result = await decodeVin(vin.toUpperCase());

    if (!result.make && !result.model) {
      return NextResponse.json(
        { error: "Could not decode this VIN. Please verify and try again." },
        { status: 404 }
      );
    }

    /*
      The empty weight, worked out when the VIN is decoded: an estimate with
      its source (EPA test weight less 300 lb first, Transport Canada as the
      cross-check, vPIC's own curb weight last). Shown on Start A Sale as an
      estimate and confirmed by a person on the 130-U; never box 11 by
      itself. Its failure is silent: the decode still answers.
    */
    const emptyWeightEstimate = await estimateEmptyWeight(specFromDecode(result), { network: true }).catch(
      () => null,
    );

    return NextResponse.json({ ...result, emptyWeightEstimate });
  } catch (err) {
    console.error("VIN decode error:", err);
    return NextResponse.json(
      { error: "Failed to reach NHTSA service. Please try again." },
      { status: 502 }
    );
  }
}
