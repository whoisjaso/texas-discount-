import { type AgreementData, DEALER } from "@/lib/fill-130u/field-mapping";
import type { CompletedLinkData } from "@/lib/documents/customerPortal";
import { readIdKind } from "@/lib/forms/id-document";
import { codeCase, fieldCase, vinCase } from "@/lib/documents/presentation-case";

/**
 * A filed agreement row, read into what the state form's fields want.
 *
 * Pure on purpose: the filler that calls it lives beside a database client
 * and a server action, which no unit test can import. Everything that
 * decides what goes in a box on the 130-U is here, where a test can hand it
 * a payload and read the boxes back.
 */

// ── Helper: split "First Middle Last" into parts ─────────────────────

export function splitName(fullName: string): { first: string; middle: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], middle: '', last: '' };
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] };
  return {
    first: parts[0],
    middle: parts.slice(1, -1).join(' '),
    last: parts[parts.length - 1],
  };
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * Build the form's data from the decoded completed link, the agreement row,
 * and the vehicle row the VIN found (or null).
 */
export function buildAgreementData(
  decoded: CompletedLinkData,
  agreement: Record<string, unknown>,
  vehicle: Record<string, unknown> | null,
): AgreementData {
  const dd = decoded.dd as Record<string, unknown>; // dealer data
  /*
    The customer half, over the dealer half, as one record.

    The customer portal writes the document in two halves: what the dealer
    typed and what the customer filled in from the link. The sale corridor
    writes the whole document as dealer data and leaves the customer half
    empty, because the buyer is standing at the desk. Reading the applicant's
    address, county, licence number and phone from the customer half alone
    fell through to agreement columns the corridor never sets, and filed a
    state form whose applicant had a name, a signature, and nothing else in
    boxes 14 through 25.
  */
  const cd = {
    ...dd,
    ...(decoded.cd as Record<string, unknown>),
  };
  const section = decoded.s;

  // Buyer name — try customer data first, then agreement columns
  const rawBuyerName =
    (cd.buyerName as string) ||
    (cd.renterName as string) ||
    [cd.applicantFirstName, cd.applicantMiddleName, cd.applicantLastName].filter(Boolean).join(' ') ||
    (agreement.buyer_name as string) ||
    '';

  const nameParts = splitName(rawBuyerName);

  // For form130U section, use customer data directly for names
  const buyerFirst = fieldCase((cd.applicantFirstName as string) || nameParts.first);
  const buyerMiddle = fieldCase((cd.applicantMiddleName as string) || nameParts.middle);
  const buyerLast = fieldCase((cd.applicantLastName as string) || nameParts.last);

  // Address — customer data → agreement columns
  const buyerAddress = fieldCase((cd.buyerAddress as string) || (cd.renterAddress as string) || (cd.mailingAddress as string) || (agreement.buyer_address as string) || '');
  const buyerCity = fieldCase((cd.buyerCity as string) || (cd.renterCity as string) || (cd.mailingCity as string) || (agreement.buyer_city as string) || '');
  const buyerState = codeCase((cd.buyerState as string) || (cd.renterState as string) || (cd.mailingState as string) || (agreement.buyer_state as string) || 'TX');
  const buyerZip = (cd.buyerZip as string) || (cd.renterZip as string) || (cd.mailingZip as string) || (agreement.buyer_zip as string) || '';
  const buyerCounty = fieldCase((cd.countyOfResidence as string) || '');

  // Vehicle info — dealer data → vehicle table
  // Cased for the paper once more here, because this builder also serves
  // rows the customer portal wrote, which never passed through the corridor.
  const vin = vinCase((dd.vehicleVin as string) || (dd.vin as string) || (agreement.vehicle_vin as string) || (vehicle?.vin as string) || '');
  const year = (dd.vehicleYear as string) || (dd.year as string) || (vehicle?.year?.toString()) || '';
  const make = fieldCase((dd.vehicleMake as string) || (dd.make as string) || (vehicle?.make as string) || '');
  const model = fieldCase((dd.vehicleModel as string) || (dd.model as string) || (vehicle?.model as string) || '');
  const bodyStyle = fieldCase((dd.vehicleBodyStyle as string) || (dd.bodyStyle as string) || (vehicle?.body_style as string) || '');
  const majorColor = fieldCase((dd.vehicleColor as string) || (dd.majorColor as string) || (vehicle?.exterior_color as string) || '');
  const minorColor = fieldCase((dd.minorColor as string) || '');
  const odometer = (dd.odometerReading as string) || (dd.vehicleMileage as string) || (vehicle?.mileage?.toString()) || '';

  // Odometer brand
  const odometerStatus = (dd.odometerStatus as string) || (dd.odometerBrand as string) || 'A';
  const odometerBrand: 'A' | 'N' | 'X' =
    odometerStatus === 'not_actual' || odometerStatus === 'N' ? 'N' :
    odometerStatus === 'exceeds' || odometerStatus === 'X' ? 'X' : 'A';

  // Sale info
  const salePrice = Number(dd.salePrice ?? dd.salesPrice ?? 0);
  const tradeInAmount = Number(dd.tradeInAllowance ?? dd.tradeInAmount ?? 0);
  const tradeInDescription = (dd.tradeInDescription as string) || '';
  const rebateAmount = Number(dd.rebateOrIncentive ?? 0);
  const saleDate = (dd.saleDate as string) || '';

  // Lien info -- bill of sale seller-lien fields flow into the 130-U.
  const lienAmount = Number(dd.sellerLienAmount ?? cd.sellerLienAmount ?? dd.lienAmount ?? cd.lienAmount ?? 0);
  const hasLien = Boolean(
    asBoolean(dd.sellerLienEnabled) ||
    asBoolean(cd.sellerLienEnabled) ||
    asBoolean(dd.hasLien) ||
    asBoolean(cd.hasLien) ||
    lienAmount > 0,
  );
  const lienDate = (dd.sellerLienDate as string) || (cd.sellerLienDate as string) || (dd.lienDate as string) || (cd.lienDate as string) || saleDate;
  const lienholderName = (dd.sellerLienholderName as string) || (cd.sellerLienholderName as string) || (dd.lienholderName as string) || (cd.lienholderName as string) || DEALER.name;
  /*
    The dealership's address completes the dealership's own lien and no
    other. A bank-funded sale names the lender and leaves its address for
    webDEALER, where the lender record lives; defaulting the blanks to our
    own street here drew the bank's name over the dealership's address in
    box 34 of a filed state form. Blank boxes are ones a clerk completes;
    wrong ones are ones a clerk trusts.
  */
  const ours = lienholderName === DEALER.name;
  const lienholderAddress = (dd.sellerLienholderAddress as string) || (cd.sellerLienholderAddress as string) || (dd.lienholderAddress as string) || (cd.lienholderAddress as string) || (ours ? DEALER.address : '');
  const lienholderCity = (dd.sellerLienholderCity as string) || (cd.sellerLienholderCity as string) || (dd.lienholderCity as string) || (cd.lienholderCity as string) || (ours ? DEALER.city : '');
  const lienholderState = (dd.sellerLienholderState as string) || (cd.sellerLienholderState as string) || (dd.lienholderState as string) || (cd.lienholderState as string) || (ours ? DEALER.state : '');
  const lienholderZip = (dd.sellerLienholderZip as string) || (cd.sellerLienholderZip as string) || (dd.lienholderZip as string) || (cd.lienholderZip as string) || (ours ? DEALER.zip : '');

  // DL info
  const buyerDl = (cd.buyerLicense as string) || (cd.renterLicense as string) || (cd.applicantIdNumber as string) || (agreement.buyer_license as string) || '';
  const buyerDlState = (cd.buyerLicenseState as string) || (cd.renterLicenseState as string) || (cd.applicantIdState as string) || (agreement.buyer_license_state as string) || '';
  // A record that never said what kind of document it was is a licence,
  // which is the only kind anything filed before the question existed.
  const buyerIdKind = readIdKind(cd.buyerIdKind);

  // Co-buyer
  const coBuyerName = (cd.coBuyerName as string) || (cd.coRenterName as string) || (cd.coApplicantName as string) || (agreement.co_buyer_name as string) || '';

  // Application type
  const applyingFor: AgreementData['applying_for'] =
    section === 'form130U'
      ? ((dd.applicationType as string) === 'titleOnly' ? 'title_only'
        : (dd.applicationType as string) === 'registrationOnly' ? 'registration_only'
        : 'title_and_registration')
      : 'title_and_registration'; // default for bill of sale / financing

  const applicantType: AgreementData['applicant_type'] =
    (cd.applicantType as string)?.toLowerCase() === 'business' ? 'business' : 'individual';

  return {
    vin,
    year,
    make,
    model,
    body_style: bodyStyle,
    major_color: majorColor,
    minor_color: minorColor || undefined,
    odometer,
    odometer_brand: odometerBrand,
    empty_weight: (dd.emptyWeight as string) || (vehicle?.weight_lbs?.toString()) || undefined,
    carrying_capacity: (dd.carryingCapacity as string) || undefined,
    tx_plate_no: codeCase((dd.vehiclePlate as string) || (dd.licensePlateNo as string) || (vehicle?.license_plate as string) || '') || undefined,
    buyer_first_name: buyerFirst,
    buyer_middle_name: buyerMiddle || undefined,
    buyer_last_name: buyerLast,
    buyer_address: buyerAddress,
    buyer_city: buyerCity,
    buyer_state: buyerState,
    buyer_zip: buyerZip,
    buyer_county: buyerCounty,
    buyer_phone: (cd.buyerPhone as string) || (cd.renterPhone as string) || (cd.applicantPhone as string) || (agreement.buyer_phone as string) || undefined,
    buyer_email: (cd.buyerEmail as string) || (cd.renterEmail as string) || (cd.applicantEmail as string) || (agreement.buyer_email as string) || undefined,
    buyer_dl_number: codeCase(buyerDl) || undefined,
    buyer_dl_state: codeCase(buyerDlState) || undefined,
    buyer_id_kind: buyerIdKind,
    co_buyer_name: coBuyerName || undefined,
    sale_price: salePrice,
    sale_date: saleDate || undefined,
    trade_in_amount: tradeInAmount || undefined,
    trade_in_description: tradeInDescription || undefined,
    rebate_amount: rebateAmount || undefined,
    applying_for: applyingFor,
    applicant_type: applicantType,
    has_lien: hasLien,
    lien_date: hasLien ? lienDate : undefined,
    lien_amount: hasLien ? lienAmount || undefined : undefined,
    etitle_lienholder_id: hasLien ? ((dd.etitleLienholderId as string) || (cd.etitleLienholderId as string) || undefined) : undefined,
    lienholder_name: hasLien ? lienholderName : undefined,
    lienholder_address: hasLien ? lienholderAddress : undefined,
    lienholder_city: hasLien ? lienholderCity : undefined,
    lienholder_state: hasLien ? lienholderState : undefined,
    lienholder_zip: hasLien ? lienholderZip : undefined,
  };
}
