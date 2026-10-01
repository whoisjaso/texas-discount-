import { NextRequest, NextResponse } from "next/server";
import { isValidVin, decodeVin } from "@/lib/nhtsa";

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

    return NextResponse.json(result);
  } catch (err) {
    console.error("VIN decode error:", err);
    return NextResponse.json(
      { error: "Failed to reach NHTSA service. Please try again." },
      { status: 502 }
    );
  }
}
