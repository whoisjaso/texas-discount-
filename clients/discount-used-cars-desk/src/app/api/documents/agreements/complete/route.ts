import { NextRequest, NextResponse } from 'next/server';
import { notifyOwnerDocumentSigned } from '@/lib/notifications/owner';
import { extractCustomerColumns } from '@/lib/documents/customer-columns';
import {
  customerFields,
  encodeCompletedLink,
  type CustomerSection,
} from '@/lib/documents/customerPortal';
import { spanishEsignBlocked } from '@/lib/legal/spanish-esign';
import { createServiceClient } from '@/lib/supabase/service';
import { parseValidDateOfBirth } from '@/lib/customers/dob';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function documentTypeToCustomerSection(value: string | null | undefined): CustomerSection | null {
  if (
    value === 'financing' ||
    value === 'rental' ||
    value === 'billOfSale' ||
    value === 'form130U'
  ) {
    return value;
  }
  return null;
}

function preferredNameField(section: CustomerSection): string {
  return section === 'rental' ? 'renterName' : 'buyerName';
}

// Date of birth captured on signed documents (130-U applicantDob, rental
// renterDob) flows back to the customer record so birthday/occasion messaging
// can run off customers.date_of_birth.
function extractDateOfBirth(body: Record<string, unknown>): string | null {
  return (
    parseValidDateOfBirth(body.applicantDob) ||
    parseValidDateOfBirth(body.renterDob) ||
    parseValidDateOfBirth(body.buyerDob)
  );
}

function buildCompletedCustomerData({
  body,
  buyerName,
  customerProfileData,
  existingCustomerData,
  section,
}: {
  body: Record<string, unknown>;
  buyerName: string | null;
  customerProfileData: Record<string, unknown>;
  existingCustomerData: Record<string, unknown>;
  section: CustomerSection;
}): Record<string, unknown> {
  const completedCustomerData: Record<string, unknown> = {
    ...existingCustomerData,
  };

  for (const field of customerFields[section] ?? []) {
    const value = body[field];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      completedCustomerData[field] = value;
    }
  }

  for (const [field, value] of Object.entries(customerProfileData)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      completedCustomerData[field] = value;
    }
  }

  if (buyerName) {
    completedCustomerData[preferredNameField(section)] = buyerName;
  }

  return completedCustomerData;
}

// ============================================================
// POST — Public endpoint for customers to complete an agreement
// Updates an existing pending record to completed status
// ============================================================

// Normalize customer data fields across document types into DB columns
// Bill of Sale:  buyerAddress, buyerLicense, coBuyerName, etc.
// Rental:        renterAddress → buyer_address, renterLicense → buyer_license, etc.
// Financing:     buyerAddress, coBuyerName, etc.
// Form 130-U:    mailingAddress → buyer_address, applicantIdNumber → buyer_license, etc.
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const body = (await req.json()) as Record<string, unknown>;

  if (!body.id) {
    return NextResponse.json({ error: 'Missing agreement id' }, { status: 400 });
  }

  // Verify the agreement exists and is available for signing.
  const { data: existing, error: fetchError } = await supabase
    .from('document_agreements')
    .select('id, status, buyer_name, document_type, vehicle_description, parent_agreement_id, portal_data, customer_id, expires_at, deleted_at, signing_token, signing_token_expires_at, language, vehicles(year,make,model)')
    .eq('id', body.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
  }

  if (existing.deleted_at) {
    return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
  }

  const now = Date.now();
  if (existing.expires_at && new Date(existing.expires_at).getTime() <= now) {
    return NextResponse.json({ error: 'Agreement link expired' }, { status: 410 });
  }

  const suppliedSigningToken = body.signing_token || body.token || null;
  if (!existing.signing_token) {
    return NextResponse.json({ error: 'Signing token required' }, { status: 401 });
  }

  if (existing.signing_token) {
    if (!suppliedSigningToken || suppliedSigningToken !== existing.signing_token) {
      return NextResponse.json({ error: 'Invalid signing token' }, { status: 401 });
    }
    if (
      existing.signing_token_expires_at &&
      new Date(existing.signing_token_expires_at).getTime() <= now
    ) {
      return NextResponse.json({ error: 'Signing token expired' }, { status: 410 });
    }
  }

  // Name priority: if admin already set buyer_name, keep it; otherwise use customer's
  const buyerName =
    existing.buyer_name ||
    stringValue(body.buyer_name) ||
    stringValue(body.buyerName) ||
    null;
  const completedAt = new Date().toISOString();
  const wasAlreadyComplete =
    existing.status === 'completed' || existing.status === 'finalized';

  if (wasAlreadyComplete) {
    return NextResponse.json({
      id: existing.id,
      status: existing.status,
      alreadyComplete: true,
    });
  }

  // Extract normalized customer data columns
  const customerColumns = extractCustomerColumns(body);
  const section = documentTypeToCustomerSection(existing.document_type);
  if (!section) {
    return NextResponse.json({ error: 'Unsupported document type' }, { status: 400 });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null;
  const userAgent = req.headers.get('user-agent');
  const portalData = { ...asRecord(existing.portal_data) };
  const existingCustomerData =
    portalData.cd && typeof portalData.cd === 'object' && !Array.isArray(portalData.cd)
      ? { ...(portalData.cd as Record<string, unknown>) }
      : {};
  const buyerSignature =
    stringValue(body.buyer_signature) || stringValue(body.buyerSignature);
  const coBuyerSignature =
    stringValue(body.cobuyer_signature) ||
    stringValue(body.co_buyer_signature) ||
    stringValue(body.coBuyerSignature);
  const buyerSignatureDate =
    stringValue(body.buyer_signature_date) ||
    stringValue(body.buyerSignatureDate) ||
    completedAt.slice(0, 10);
  const coBuyerSignatureDate =
    stringValue(body.cobuyer_signature_date) ||
    stringValue(body.co_buyer_signature_date) ||
    stringValue(body.coBuyerSignatureDate) ||
    undefined;

  if (!buyerSignature) {
    return NextResponse.json({ error: 'Buyer signature required' }, { status: 400 });
  }

  /**
   * The shared Spanish e-sign guard, on the STORED agreement language.
   *
   * The corridor's finalize action calls the same guard, so neither signing
   * path can drift from the other, and `body.language` deliberately plays no
   * part here: a caller-supplied language on a public endpoint is a claim,
   * not a record. COMPLIANCE_REVIEW.md §10.1 blocks live Spanish e-sign
   * until the Spanish legal copy is reviewed; print-and-ink stays open.
   */
  if (spanishEsignBlocked((existing as { language?: string | null }).language, buyerSignature)) {
    return NextResponse.json(
      {
        error:
          'Spanish e-signing is not available yet. Print the document and sign in ink.',
        code: 'spanishEsignBlocked',
      },
      { status: 403 },
    );
  }

  const acknowledgments = asRecord(body.acknowledgments);
  const customerProfileData = {
    ...existingCustomerData,
    buyerName: buyerName || body.buyerName || null,
    buyerPhone: body.buyerPhone || body.buyer_phone || null,
    buyerEmail: body.buyerEmail || body.buyer_email || null,
    buyerAddress: body.buyerAddress || body.buyer_address || null,
    buyerCity: body.buyerCity || body.buyer_city || null,
    buyerState: body.buyerState || body.buyer_state || null,
    buyerZip: body.buyerZip || body.buyer_zip || null,
    buyerLicense: body.buyerLicense || body.buyer_license || null,
    buyerLicenseState: body.buyerLicenseState || body.buyer_license_state || null,
    buyerIdFrontImage: body.buyerIdFrontImage || null,
    buyerIdBackImage: body.buyerIdBackImage || null,
    smsConsentAccepted: body.smsConsentAccepted || String(!!acknowledgments.smsConsent),
    smsConsentAcceptedAt: body.smsConsentAcceptedAt || completedAt,
    smsConsentPhone: body.smsConsentPhone || body.buyerPhone || body.buyer_phone || null,
    smsConsentLanguageVersion: body.smsConsentLanguageVersion || 'dealership-sms-consent-v1',
    contractTermsAccepted: body.contractTermsAccepted || 'true',
    contractTermsAcceptedAt: body.contractTermsAcceptedAt || completedAt,
  };
  const completedCustomerData = buildCompletedCustomerData({
    body,
    buyerName,
    customerProfileData,
    existingCustomerData,
    section,
  });
  const dealerData = asRecord(portalData.d);
  const dealerSignature = stringValue(portalData.ds);
  const dealerSignatureDate = stringValue(portalData.dd);
  const buyerIdPhotoForCompletedLink =
    stringValue(body.buyer_id_photo) ||
    stringValue(completedCustomerData.buyerIdFrontImage) ||
    stringValue(completedCustomerData.idFrontImage);
  const completedLink = encodeCompletedLink(
    section,
    dealerData,
    completedCustomerData,
    process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin,
    dealerSignature,
    dealerSignatureDate,
    buyerSignature,
    buyerSignatureDate,
    coBuyerSignature,
    coBuyerSignatureDate,
    buyerIdPhotoForCompletedLink,
    acknowledgments as Record<string, boolean>,
  );

  portalData.cd = customerProfileData;
  portalData.saleWorkflow = {
    mode: existing.document_type === 'billOfSale' ? 'dealership_sale' : existing.document_type,
    status: existing.document_type === 'billOfSale' ? 'ready_for_admin_review' : 'completed',
    completedAt,
    checklist: {
      buyerInfoComplete: Boolean(customerProfileData.buyerName && customerProfileData.buyerPhone && customerProfileData.buyerEmail),
      addressComplete: Boolean(customerProfileData.buyerAddress && customerProfileData.buyerCity && customerProfileData.buyerState && customerProfileData.buyerZip),
      dlNumberComplete: Boolean(customerProfileData.buyerLicense && customerProfileData.buyerLicenseState),
      idUploaded: Boolean(body.has_buyer_id && (body.buyer_id_photo || customerProfileData.buyerIdFrontImage) && customerProfileData.buyerIdBackImage),
      vehicleVinVerified: Boolean(body.vehicleVin || body.vehicle_vin || portalData.d),
      odometerReadingConfirmed: Boolean(body.odometerReading || body.vehicleMileage || body.vehicle_mileage),
      feesTaxConfirmed: Boolean(body.salePrice || body.tax || body.titleFee || body.registrationFee || body.docFee),
      buyerAcknowledgementAccepted: Boolean(acknowledgments.buyerAcknowledgment),
      asIsNoWarrantyAccepted: Boolean(acknowledgments.asIsNoWarranty),
      noRefundPolicyAccepted: Boolean(acknowledgments.noRefundPolicy),
      smsConsentAccepted: Boolean(acknowledgments.smsConsent),
      signatureCompleted: Boolean(buyerSignature),
      pdfPacketGenerated: false,
      buyerPlateReceiptStored: existing.document_type === 'billOfSale',
      dealerCopyStored: existing.document_type === 'billOfSale',
    },
  };
  portalData.smsConsent = {
    accepted: Boolean(acknowledgments.smsConsent),
    acceptedAt: body.smsConsentAcceptedAt || completedAt,
    phone: body.smsConsentPhone || body.buyerPhone || body.buyer_phone || null,
    ip,
    userAgent,
    languageVersion: body.smsConsentLanguageVersion || 'dealership-sms-consent-v1',
  };
  portalData.contractTerms = {
    billOfSaleTermsAccepted: Boolean(acknowledgments.billOfSaleTerms),
    asIsNoWarrantyAccepted: Boolean(acknowledgments.asIsNoWarranty),
    noRefundPolicyAccepted: Boolean(acknowledgments.noRefundPolicy),
    odometerDisclosureAccepted: Boolean(acknowledgments.odometerDisclosure),
    buyerAcknowledgmentAccepted: Boolean(acknowledgments.buyerAcknowledgment),
    acceptedAt: body.contractTermsAcceptedAt || completedAt,
  };

  const updates: Record<string, unknown> = {
    status: 'completed',
    completed_at: completedAt,
    // NULL expires_at = never expires. Completed/finalized docs are archival
    // and must remain accessible to the customer indefinitely so they can
    // re-download their signed copy at any time.
    expires_at: null,
    buyer_name: buyerName,
    buyer_email: body.buyer_email || null,
    buyer_phone: body.buyer_phone || null,
    acknowledgments: body.acknowledgments || {},
    has_buyer_signature: Boolean(buyerSignature),
    has_cobuyer_signature: Boolean(coBuyerSignature),
    has_dealer_signature: Boolean(dealerSignature),
    has_buyer_id: body.has_buyer_id || false,
    completed_link: completedLink,
    portal_data: portalData,
    state: 'completed',
    signed_at: completedAt,
    signed_ip: ip,
    ...customerColumns,
  };

  // The agreement's language is a stored fact set when the row was
  // created, and the Spanish e-sign guard above just checked it. A public
  // caller rewriting it after the check would let the next reader of this
  // row believe a language nobody verified — so caller-supplied language
  // is deliberately ignored here.

  // Store ID photo if provided
  if (body.buyer_id_photo) {
    updates.buyer_id_photo = body.buyer_id_photo;
  }

  const { data, error } = await supabase
    .from('document_agreements')
    .update(updates)
    .eq('id', body.id)
    .eq('status', 'pending')
    .select('id, status, signing_token')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Agreement is not pending or is no longer available for signing' },
      { status: 409 },
    );
  }

  if (existing.customer_id) {
    const { data: customerRow, error: customerFetchError } = await supabase
      .from('customers')
      .select('profile_data')
      .eq('id', existing.customer_id)
      .maybeSingle();

    if (customerFetchError) {
      console.warn('[documents/complete] Customer profile fetch failed:', customerFetchError.message);
    }

    const priorProfile =
      customerRow?.profile_data && typeof customerRow.profile_data === 'object' && !Array.isArray(customerRow.profile_data)
        ? (customerRow.profile_data as Record<string, unknown>)
        : {};
    const updatePayload: Record<string, unknown> = {
      profile_data: {
        ...priorProfile,
        dealership: {
          ...(priorProfile.dealership && typeof priorProfile.dealership === 'object' && !Array.isArray(priorProfile.dealership)
            ? priorProfile.dealership
            : {}),
          lastSaleAgreementId: existing.id,
          lastSaleCompletedAt: completedAt,
          buyerProfile: customerProfileData,
        },
      },
    };
    if (buyerName) updatePayload.name = buyerName;
    if (body.buyerEmail || body.buyer_email) updatePayload.email = body.buyerEmail || body.buyer_email;
    const dateOfBirth = extractDateOfBirth(body);
    if (dateOfBirth) updatePayload.date_of_birth = dateOfBirth;

    const { error: customerError } = await supabase
      .from('customers')
      .update(updatePayload)
      .eq('id', existing.customer_id);

    if (customerError) {
      console.warn('[documents/complete] Customer profile sync failed:', customerError.message);
    }
  }

  if (!wasAlreadyComplete) {
    const notifyResult = await notifyOwnerDocumentSigned(supabase, {
      agreementId: existing.id,
      customerName: buyerName,
      vehicleDescription:
        existing.vehicle_description || body.vehicle_description || null,
      signedAt: completedAt,
      isRenewal:
        existing.document_type === 'rental' && !!existing.parent_agreement_id,
      vehicle: Array.isArray(existing.vehicles)
        ? existing.vehicles[0]
        : existing.vehicles,
    });

    if (!notifyResult.ok) {
      console.error('[documents/complete] Owner notification failed:', notifyResult.error);
    }
  }

  return NextResponse.json(data);
}
