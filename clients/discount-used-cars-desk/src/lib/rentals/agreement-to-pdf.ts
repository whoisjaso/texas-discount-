import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompletedLinkData } from "@/lib/documents/customerPortal";
import { checkHardshipEligibility } from "@/lib/rentals/hardship-eligibility";
import {
  applyBlankRentalIdentityFallback,
  extractRentalIdentityFromAgreement,
  resolvePriorRentalIdentity,
} from "@/lib/rentals/identity-history";
import { RENTAL_MAINTENANCE_POLICY } from "@/lib/rentals/maintenance-policy";

/**
 * Hydrate a `document_agreements` row into the `CompletedLinkData` shape
 * the PDF builder consumes. This is the bridge between
 *
 *   "rental I created in the admin / via /admin/documents/rental"
 * and
 *   "printable PDF that auto-populates renter + vehicle + Hardship A.3"
 *
 * Read order:
 *   1. `document_agreements` row (state, hardship_flag, weekly_rate,
 *      buyer_*, vehicle_id, customer_id, parent_agreement_id,
 *      loss_event_id, signature_svg, portal_data jsonb)
 *   2. JOIN `customers` (name/phone/email/language)
 *   3. JOIN `vehicles` for year/make/model/vin/license_plate/exterior_color/
 *      transmission/engine
 *   4. If hardship_flag=true:
 *        Use parent_agreement_id (renewal case) — load that row + its
 *        vehicle for the A.3 prior-vehicle reference. Fall back to
 *        loss_events.prior_agreement_id if no parent. If neither, A.3
 *        renders the generic acknowledgment text already supported by
 *        drawHardshipBridgeAddendumDiscount.
 *
 * Address + DL# live ONLY in portal_data.cd (the customers table predates
 * collecting them — see migration 16). If a renewal leaves those fields
 * blank, inherit the latest signed rental identity for the same customer.
 * Explicit new values always win.
 */

type Json = Record<string, unknown>;

interface AgreementRow {
  id: string;
  document_type: string;
  state: string | null;
  status: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  buyer_email: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  weekly_rate: number | null;
  hardship_flag: boolean | null;
  hardship_week1_split: unknown;
  loss_event_id: string | null;
  parent_agreement_id: string | null;
  signature_svg: string | null;
  signed_at: string | null;
  created_at: string;
  buyer_address: string | null;
  buyer_city: string | null;
  buyer_state: string | null;
  buyer_zip: string | null;
  buyer_license: string | null;
  buyer_license_state: string | null;
  buyer_id_photo: string | null;
  co_buyer_license: string | null;
  portal_data: Json | null;
  language: string | null;
  vehicle_description: string | null;
  vehicle_vin: string | null;
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  language: string | null;
}

interface VehicleRow {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  vin: string | null;
  license_plate: string | null;
  exterior_color: string | null;
  transmission: string | null;
  engine: string | null;
}

function modelDescriptor(v: VehicleRow | null): { description: string; vin: string } {
  if (!v) return { description: "", vin: "" };
  const trim = v.trim ? ` ${v.trim}` : "";
  return {
    description: `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}${trim}`.trim(),
    vin: v.vin ?? "",
  };
}

export async function hydrateAgreementForPdf(
  supabase: SupabaseClient,
  agreementId: string,
): Promise<CompletedLinkData | null> {
  const { data: agreement, error } = await supabase
    .from("document_agreements")
    .select(
      "id, document_type, state, status, buyer_name, buyer_phone, buyer_email, customer_id, vehicle_id, weekly_rate, hardship_flag, hardship_week1_split, loss_event_id, parent_agreement_id, signature_svg, signed_at, created_at, buyer_address, buyer_city, buyer_state, buyer_zip, buyer_license, buyer_license_state, buyer_id_photo, co_buyer_license, portal_data, language, vehicle_description, vehicle_vin",
    )
    .eq("id", agreementId)
    .single<AgreementRow>();

  if (error || !agreement) return null;
  if (agreement.document_type !== "rental") return null;

  // ── Customer (name/phone/email override portal_data) ──
  let customer: CustomerRow | null = null;
  if (agreement.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("id, name, phone, email, language")
      .eq("id", agreement.customer_id)
      .maybeSingle<CustomerRow>();
    customer = c;
  }

  // ── Vehicle (everything except mileage/fuel comes from here) ──
  let vehicle: VehicleRow | null = null;
  if (agreement.vehicle_id) {
    const { data: v } = await supabase
      .from("vehicles")
      .select("id, year, make, model, trim, vin, license_plate, exterior_color, transmission, engine")
      .eq("id", agreement.vehicle_id)
      .maybeSingle<VehicleRow>();
    vehicle = v;
  }

  // ── Hardship A.3 prior-vehicle resolution (parent first, loss event second) ──
  let priorVehicle: VehicleRow | null = null;
  let priorAgreementDate: string | null = null;
  if (agreement.hardship_flag) {
    let priorAgreementId: string | null = agreement.parent_agreement_id ?? null;
    if (!priorAgreementId && agreement.loss_event_id) {
      const { data: le } = await supabase
        .from("loss_events")
        .select("prior_agreement_id, incident_date")
        .eq("id", agreement.loss_event_id)
        .maybeSingle<{ prior_agreement_id: string | null; incident_date: string | null }>();
      priorAgreementId = le?.prior_agreement_id ?? null;
      priorAgreementDate = le?.incident_date ?? null;
    }
    if (priorAgreementId) {
      const { data: prior } = await supabase
        .from("document_agreements")
        .select("vehicle_id, created_at, signed_at")
        .eq("id", priorAgreementId)
        .maybeSingle<{ vehicle_id: string | null; created_at: string; signed_at: string | null }>();
      if (prior) {
        priorAgreementDate = priorAgreementDate ?? prior.signed_at ?? prior.created_at;
        if (prior.vehicle_id) {
          const { data: pv } = await supabase
            .from("vehicles")
            .select("id, year, make, model, trim, vin, license_plate, exterior_color, transmission, engine")
            .eq("id", prior.vehicle_id)
            .maybeSingle<VehicleRow>();
          priorVehicle = pv;
        }
      }
    }
  }

  // ── Build dealer-side data (dd) ──
  const portalD = (agreement.portal_data as Json | null)?.d as Json | undefined;
  const portalCd = (agreement.portal_data as Json | null)?.cd as Json | undefined;
  const priorDesc = modelDescriptor(priorVehicle);
  const portalHardshipDiscountPercent = Number(portalD?.hardshipDiscountPercent ?? 0);
  const portalHardshipDiscountWeeks = Number(portalD?.hardshipDiscountWeeks ?? 0);
  const hasPortalHardshipDiscount =
    portalHardshipDiscountPercent > 0 && portalHardshipDiscountWeeks > 0;
  const hasBridgeInstallmentSplit =
    Array.isArray(agreement.hardship_week1_split) ||
    Array.isArray(portalD?.hardshipWeek1Split);

  const dd: Record<string, unknown> = {
    // Vehicle
    vehicleYear: vehicle?.year ?? portalD?.vehicleYear ?? "",
    vehicleMake: vehicle?.make ?? portalD?.vehicleMake ?? "",
    vehicleModel: `${vehicle?.model ?? portalD?.vehicleModel ?? ""}${vehicle?.trim ? ` ${vehicle.trim}` : ""}`.trim(),
    vehicleVin: vehicle?.vin ?? portalD?.vehicleVin ?? agreement.vehicle_vin ?? "",
    vehiclePlate: vehicle?.license_plate ?? portalD?.vehiclePlate ?? "",
    vehicleColor: vehicle?.exterior_color ?? portalD?.vehicleColor ?? "",
    vehicleTransmission: vehicle?.transmission ?? portalD?.vehicleTransmission ?? "",
    vehicleEngine: vehicle?.engine ?? portalD?.vehicleEngine ?? "",
    vehicleConditionText: portalD?.vehicleConditionText ?? "",
    mileageOut: portalD?.mileageOut ?? "",
    fuelLevelOut: portalD?.fuelLevelOut ?? "1/2",

    // Rental terms
    rentalRate: agreement.weekly_rate ?? portalD?.rentalRate ?? 0,
    rentalPeriod: portalD?.rentalPeriod ?? "Weekly",
    rentalStartDate: portalD?.rentalStartDate ?? "",
    rentalEndDate: portalD?.rentalEndDate ?? "",
    securityDeposit: portalD?.securityDeposit ?? 0,
    mileageAllowance: portalD?.mileageAllowance ?? 0,
    excessMileageCharge: portalD?.excessMileageCharge ?? 0,
    insuranceFee: portalD?.insuranceFee ?? 0,
    additionalDriverFee: portalD?.additionalDriverFee ?? 0,
    tax: portalD?.tax ?? 0,
    dueAtSigning: portalD?.dueAtSigning ?? 0,

    // Hardship discount (preferred new mode — falls back to portalD if set there)
    hardshipDiscountPercent: hasPortalHardshipDiscount
      ? portalHardshipDiscountPercent
      : hasBridgeInstallmentSplit
        ? 0
        : (portalD?.hardshipDiscountPercent ?? 0),
    hardshipDiscountWeeks: hasPortalHardshipDiscount
      ? portalHardshipDiscountWeeks
      : hasBridgeInstallmentSplit
        ? 0
        : (portalD?.hardshipDiscountWeeks ?? 0),
    hardshipPriorVehicleDescription:
      priorDesc.description || (portalD?.hardshipPriorVehicleDescription as string | undefined) || "",
    hardshipPriorVehicleVin:
      priorDesc.vin || (portalD?.hardshipPriorVehicleVin as string | undefined) || "",
    hardshipPriorAgreementDate:
      priorAgreementDate ||
      (portalD?.hardshipPriorAgreementDate as string | undefined) ||
      "",

    // Legacy hardship-split mode (kept for backward compat)
    hardshipFlag: agreement.hardship_flag ?? false,
    hardshipWeek1Split: agreement.hardship_week1_split ?? null,
    maintenancePolicyRevision:
      portalD?.maintenancePolicyRevision ?? RENTAL_MAINTENANCE_POLICY.revision,
    maintenanceCheckIntervalDays:
      portalD?.maintenanceCheckIntervalDays ?? RENTAL_MAINTENANCE_POLICY.checkIntervalDays,
    oilChangeReimbursementCap:
      portalD?.oilChangeReimbursementCap ?? RENTAL_MAINTENANCE_POLICY.oilChangeReimbursementCap,
  };

  // ── Build customer-side data (cd) — address/DL only live in portal_data ──
  const agreementIdentity = extractRentalIdentityFromAgreement(agreement);
  const rawCd: Record<string, unknown> = {
    renterName: portalCd?.renterName ?? customer?.name ?? agreement.buyer_name ?? "",
    renterAddress: agreementIdentity.renterAddress ?? "",
    renterPhone: portalCd?.renterPhone ?? customer?.phone ?? agreement.buyer_phone ?? "",
    renterEmail: portalCd?.renterEmail ?? customer?.email ?? agreement.buyer_email ?? "",
    renterLicense: agreementIdentity.renterLicense ?? "",
    renterLicenseState: portalCd?.renterLicenseState ?? agreement.buyer_license_state ?? "",
    renterDob: portalCd?.renterDob ?? "",
    licenseClass: portalCd?.licenseClass ?? "",
    licenseIssueDate: portalCd?.licenseIssueDate ?? "",
    licenseExpirationDate: portalCd?.licenseExpirationDate ?? "",
    coRenterName: portalCd?.coRenterName ?? "",
    coRenterAddress: portalCd?.coRenterAddress ?? "",
    coRenterPhone: portalCd?.coRenterPhone ?? "",
    coRenterEmail: portalCd?.coRenterEmail ?? "",
    coRenterLicense: agreementIdentity.coRenterLicense ?? "",
    insuranceProvider: portalCd?.insuranceProvider ?? "",
    insurancePolicyNumber: portalCd?.insurancePolicyNumber ?? "",
    insuranceEffectiveDate: portalCd?.insuranceEffectiveDate ?? "",
    insuranceExpirationDate: portalCd?.insuranceExpirationDate ?? "",
    insuranceNamedInsured: portalCd?.insuranceNamedInsured ?? "",
    insuranceVehicleDescription: portalCd?.insuranceVehicleDescription ?? "",
    insuranceVehicleVin: portalCd?.insuranceVehicleVin ?? "",
    insuranceStatus: portalCd?.insuranceStatus ?? "",
    insuranceCompanyPhone: portalCd?.insuranceCompanyPhone ?? "",
    // 2026-05-31 D5 fix: previously dropped here; the data URL persists to
    // portal_data.cd.insuranceCardImage but was never carried into the PDF data.
    insuranceCardImage: portalCd?.insuranceCardImage ?? "",
    nextInsuranceVerificationDueDate: portalCd?.nextInsuranceVerificationDueDate ?? "",
    emergencyContactName: portalCd?.emergencyContactName ?? "",
    emergencyContactPhone: portalCd?.emergencyContactPhone ?? "",
    emergencyContactRelationship: portalCd?.emergencyContactRelationship ?? "",
    approvedDriverStatus: portalCd?.approvedDriverStatus ?? "",
    identityStatus: portalCd?.identityStatus ?? "",
    rentalAgreementSignatureStatus: portalCd?.rentalAgreementSignatureStatus ?? "",
    mileageIn: portalCd?.mileageIn ?? "",
    fuelLevelIn: portalCd?.fuelLevelIn ?? "",
  };
  const cd = applyBlankRentalIdentityFallback(
    rawCd,
    await resolvePriorRentalIdentity(supabase, {
      customerId: agreement.customer_id,
      buyerPhone: agreement.buyer_phone,
      excludeAgreementId: agreement.id,
      beforeCreatedAt: agreement.created_at,
      parentAgreementId: agreement.parent_agreement_id,
    }),
  );

  return {
    s: "rental",
    dd,
    cd,
    ds: portalD?.dealerSignature as string | undefined,
    dsd: portalD?.dealerSignatureDate as string | undefined,
    bs: (portalCd?.buyerSignature as string | undefined) ?? agreement.signature_svg ?? undefined,
    bsd: (portalCd?.buyerSignatureDate as string | undefined) ?? agreement.signed_at ?? undefined,
    bi: (portalCd?.idFrontImage as string | undefined) ?? agreement.buyer_id_photo ?? undefined,
  };
}

export function mergeLiveRentalAgreementPayload(
  live: CompletedLinkData,
  archived: CompletedLinkData | null,
  includeSignatureImages = true,
): CompletedLinkData {
  const merged: CompletedLinkData = {
    s: live.s,
    dd: { ...(archived?.dd ?? {}), ...live.dd },
    cd: { ...(archived?.cd ?? {}), ...live.cd },
    ack: archived?.ack,
    lang: live.lang ?? archived?.lang,
    bi: live.bi ?? archived?.bi,
  };

  if (includeSignatureImages) {
    merged.ds = live.ds ?? archived?.ds;
    merged.dsd = live.dsd ?? archived?.dsd;
    merged.bs = live.bs ?? archived?.bs;
    merged.bsd = live.bsd ?? archived?.bsd;
    merged.cs = live.cs ?? archived?.cs;
    merged.csd = live.csd ?? archived?.csd;
  }

  return merged;
}

/**
 * For a list of customer_ids, returns the set that currently qualifies
 * for the Hardship Bridge payment schedule under the Renter Support Policy:
 *   - has at least 1 verified, non-fault loss event
 *   - has not been granted a hardship-flagged agreement in the prior 12 months
 *
 * Used by /admin/rentals to surface the "Hardship eligible" badge column.
 */
export async function getHardshipEligibleCustomerIds(
  supabase: SupabaseClient,
  customerIds: string[],
): Promise<Set<string>> {
  if (customerIds.length === 0) return new Set();

  const eligible = new Set<string>();
  await Promise.all(
    customerIds.map(async (id) => {
      const verdict = await checkHardshipEligibility(id, supabase);
      if (verdict.eligible) eligible.add(id);
    }),
  );
  return eligible;
}
