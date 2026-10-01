import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDocumentPrefill } from "@/lib/admin/document-prefill";
import type { AamvaAddress, StoredName } from "@/lib/sales/buyer-id";
import {
  fillPowerOfAttorney,
  isEligibleForPlainPoa,
  VTR_271_RESTRICTION,
} from "@/lib/documents/powerOfAttorneyForm";

/**
 * Serve the official Texas Limited Power of Attorney (VTR-271), filled.
 *
 * Everything about the vehicle and the grantor comes from the deal record
 * when `dealId` is given, so the form matches what the sale actually says.
 * Individual query parameters override it for a one-off print from Templates.
 */

function param(req: NextRequest, key: string): string | undefined {
  return req.nextUrl.searchParams.get(key)?.trim() || undefined;
}

/**
 * Pull a legacy "City, County, State Zip" line back into its four parts.
 *
 * The form has always printed these as four separate boxes; this route used
 * to accept them as one string and hand that string to the filler, which
 * dropped the whole thing into the City box. New callers send the parts.
 * This is only for links and saved forms that still send the joined value,
 * and it gives up rather than guesses: a piece it cannot place is left out
 * of the boxes it is not sure about instead of shifting the others along.
 */
function splitCityLine(line: string | undefined): {
  city?: string;
  county?: string;
  state?: string;
  zip?: string;
} {
  const parts = (line ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return {};

  // The tail usually carries "TX 77004"; take the ZIP and the two-letter
  // state off it only when they actually look like a ZIP and a state.
  const tail = parts[parts.length - 1] ?? "";
  const match = tail.match(/^([A-Za-z]{2})?\s*(\d{5}(?:-\d{4})?)?$/);
  let state: string | undefined;
  let zip: string | undefined;
  if (match && (match[1] || match[2])) {
    state = match[1]?.toUpperCase();
    zip = match[2];
    parts.pop();
  }

  return { city: parts[0], county: parts[1], state, zip };
}

function filename(vin: string | undefined, name: string): string {
  const who = name.trim().split(/\s+/).pop() || "owner";
  const tail = vin ? vin.slice(-6).toUpperCase() : "form";
  return `VTR-271_${who}_${tail}.pdf`.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function GET(req: NextRequest) {
  const authError = await requireAdmin(req, "documents:manage");
  if (authError) return authError;

  const dealId = param(req, "dealId");
  const customerId = param(req, "customerId");

  let prefillVin: string | undefined;
  let prefillYear: string | undefined;
  let prefillMake: string | undefined;
  let prefillModel: string | undefined;
  let prefillBody: string | undefined;
  let prefillPlate: string | undefined;
  let prefillName: string | undefined;
  let prefillAddress: string | undefined;
  let prefillNameParts: StoredName | undefined;
  let prefillAddressParts: AamvaAddress | undefined;

  if (dealId || customerId) {
    try {
      const prefill = await getDocumentPrefill({ dealId, customerId });
      const v = prefill.vehiclePrefill;
      const b = prefill.buyerPrefill;
      prefillVin = v?.vin;
      prefillYear = v?.year;
      prefillMake = v?.make;
      prefillModel = v?.model;
      prefillBody = v?.bodyStyle;
      prefillPlate = v?.plate;
      prefillName = b?.name;
      prefillAddress = b?.address;
      // The boxes the form actually prints, when the deal holds them. Passing
      // these is what stops the filler inferring where the surname begins.
      prefillNameParts = b?.nameParts;
      prefillAddressParts = b?.addressParts;
    } catch (error) {
      console.error("[power-of-attorney] prefill failed:", error);
      return NextResponse.json(
        { error: "Could not load the deal for this power of attorney." },
        { status: 502 },
      );
    }
  }

  const vin = param(req, "vin") ?? prefillVin;
  const grantorName = param(req, "grantorName") ?? prefillName;

  /*
    The wrong instrument is refused, not printed. VTR-271 is invalid in a
    dealer transaction on a vehicle still subject to federal odometer
    disclosure; when the model year is KNOWN and the vehicle is not exempt,
    producing the form would hand a buyer an invalid document (review round
    4, finding 2). An unknown year still prints — the form page's own
    "Check This First" banner puts that judgment on a person.
  */
  const yearValue = Number(param(req, "year") ?? prefillYear);
  const eligible = isEligibleForPlainPoa(
    Number.isFinite(yearValue) ? yearValue : null,
    new Date().getFullYear(),
  );
  if (eligible === false) {
    return NextResponse.json({ error: VTR_271_RESTRICTION }, { status: 409 });
  }

  if (!vin) {
    return NextResponse.json(
      { error: "A VIN is required. The form is invalid without it." },
      { status: 400 },
    );
  }
  if (!grantorName) {
    return NextResponse.json(
      { error: "The owner's name is required to grant a power of attorney." },
      { status: 400 },
    );
  }

  try {
    const pdfBytes = await fillPowerOfAttorney({
      vin,
      year: param(req, "year") ?? prefillYear,
      make: param(req, "make") ?? prefillMake,
      model: param(req, "model") ?? prefillModel,
      bodyStyle: param(req, "bodyStyle") ?? prefillBody,
      licensePlate: param(req, "plate") ?? prefillPlate,
      titleDocumentNumber: param(req, "titleDocumentNumber"),
      grantorName,
      grantorNameParts: prefillNameParts,
      grantorAddress: param(req, "grantorAddress") ?? prefillAddress,
      /*
        Four boxes, four values. The form prints City / County / State / Zip
        as separate boxes, so they travel separately rather than as one line
        that the filler would have to guess its way back out of. `legacy`
        covers callers still sending the old joined `grantorCity`.
      */
      ...(() => {
        const legacy = splitCityLine(param(req, "grantorCity"));
        const held = prefillAddressParts;
        return {
          grantorCity:
            param(req, "grantorCityName") ?? held?.city ?? legacy.city,
          grantorCounty:
            param(req, "grantorCounty") ?? held?.county ?? legacy.county,
          grantorState:
            param(req, "grantorState") ?? held?.state ?? legacy.state,
          grantorZip: param(req, "grantorZip") ?? held?.postal ?? legacy.zip,
        };
      })(),
      // Left blank unless asked for: the grantor dates it when they sign.
      executedDate: param(req, "executedDate"),
    });

    // inline for the corridor's preview tab; attachment stays the default
    // so existing Save links keep saving.
    const disposition = param(req, "disposition") === "inline" ? "inline" : "attachment";
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `${disposition}; filename="${filename(vin, grantorName)}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    console.error("[power-of-attorney] PDF generation failed:", error);
    return NextResponse.json(
      { error: "Power of attorney generation failed." },
      { status: 500 },
    );
  }
}
