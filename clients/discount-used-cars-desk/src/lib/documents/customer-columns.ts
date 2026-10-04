// Normalize customer data fields across document types into DB columns.
export function extractCustomerColumns(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const cols: Record<string, unknown> = {};

  cols.buyer_address =
    body.buyer_address || body.buyerAddress || body.renterAddress || body.mailingAddress || null;
  cols.buyer_city =
    body.buyer_city || body.buyerCity || body.renterCity || body.mailingCity || null;
  cols.buyer_state =
    body.buyer_state || body.buyerState || body.renterState || body.mailingState || null;
  cols.buyer_zip =
    body.buyer_zip || body.buyerZip || body.renterZip || body.mailingZip || null;

  cols.buyer_license =
    body.buyer_license || body.buyerLicense || body.renterLicense || body.applicantIdNumber || null;
  cols.buyer_license_state =
    body.buyer_license_state ||
    body.buyerLicenseState ||
    body.renterLicenseState ||
    body.applicantIdState ||
    null;

  cols.co_buyer_name =
    body.co_buyer_name || body.coBuyerName || body.coRenterName || body.coApplicantName || null;
  cols.co_buyer_email =
    body.co_buyer_email || body.coBuyerEmail || body.coRenterEmail || null;
  cols.co_buyer_phone =
    body.co_buyer_phone || body.coBuyerPhone || body.coRenterPhone || null;
  cols.co_buyer_address =
    body.co_buyer_address || body.coBuyerAddress || body.coRenterAddress || null;
  cols.co_buyer_city =
    body.co_buyer_city || body.coBuyerCity || body.coRenterCity || null;
  cols.co_buyer_state =
    body.co_buyer_state || body.coBuyerState || body.coRenterState || null;
  cols.co_buyer_zip =
    body.co_buyer_zip || body.coBuyerZip || body.coRenterZip || null;
  cols.co_buyer_license =
    body.co_buyer_license || body.coBuyerLicense || body.coRenterLicense || null;
  cols.co_buyer_license_state =
    body.co_buyer_license_state || body.coBuyerLicenseState || body.coRenterLicenseState || null;

  return cols;
}
