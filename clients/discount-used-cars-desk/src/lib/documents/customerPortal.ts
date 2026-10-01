import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { ContractData } from './finance';
import { RentalData } from './rental';
import { BillOfSaleData } from './billOfSale';
import { Form130UData } from './form130U';

// Max character length for a single signature data URL embedded in the hash fragment.
// PNG data URLs from a fullscreen 2x-DPR canvas can be 40-70K+ characters.
// Browser fragment limits are ~2MB, so 200K per signature is safe with lz-string compression.
const SIG_URL_LIMIT = 200_000;

/**
 * Which document a payload draws.
 *
 * The three acknowledgments are corridor documents with no customer-portal
 * half: the buyer signs them at the desk. They carry the same encoded shape
 * so the packet's one PDF route, one render route and one print path draw
 * them the way they draw a bill of sale. Before they were sections, a
 * corridor-filed Vehicle Responsibility printed as a generic "as filed"
 * sheet, and the other two could not be filed at all.
 */
export type CustomerSection = 'financing' | 'rental' | 'billOfSale' | 'form130U';

/** Signed at the desk only. Never sent to a customer's phone to complete. */
export type AcknowledgmentSection =
  | 'vehicleResponsibility'
  | 'insuranceAcknowledgment'
  | 'rebuiltDisclosure'
  | 'salvageBillOfSale'
  | 'towAwayAcknowledgment'
  | 'buyerResponsibilityStatement';

/** Everything a completed link can draw. */
export type DocumentSection = CustomerSection | AcknowledgmentSection;

/** Whether a section has a customer-portal half (a wizard, an amount due). */
export function isCustomerSection(section: DocumentSection): section is CustomerSection {
  return (
    section === 'financing' ||
    section === 'rental' ||
    section === 'billOfSale' ||
    section === 'form130U'
  );
}

/** The facts every desk-signed acknowledgment is drawn from. */
const ACKNOWLEDGMENT_DEALER_FIELDS = [
  'vehicleDescription', 'vin', 'saleDate', 'quotedRegistrationAmount', 'language',
];
/**
 * The tow-away sheets carry the sale's money and the salvage facts as well:
 * the price and the tax on the salvage bill of sale, the odometer, how the
 * car leaves, and the dealership's salvage licence when it holds one.
 */
const TOW_AWAY_DEALER_FIELDS = [
  ...ACKNOWLEDGMENT_DEALER_FIELDS,
  'vehicleYear', 'vehicleMake', 'vehicleModel', 'vehicleMileage', 'odometerStatus',
  'salePrice', 'tax', 'titleFee', 'docFee', 'total', 'amountPaidToday', 'paymentMethod',
  'howLeaving', 'salvageLicense', 'titleOriginState',
];
const ACKNOWLEDGMENT_CUSTOMER_FIELDS = ['buyerName', 'buyerIdNumber', 'buyerPhone', 'buyerAddress'];

export interface CustomerLinkData {
  s: CustomerSection;
  d: Record<string, unknown>;
  cd?: Record<string, unknown>;
  ds?: string;
  dd?: string;
  st?: string;  // signing token for short portal links
  aid?: string;  // agreement ID for linking admin→customer records
  abn?: string;  // admin buyer name (takes priority over customer-entered name)
  lang?: 'en' | 'es';  // document language
}

const dealerFields: Record<DocumentSection, string[]> = {
  financing: [
    'vehicleYear', 'vehicleMake', 'vehicleModel', 'vehicleVin', 'vehiclePlate', 'vehicleMileage',
    'cashPrice', 'downPayment', 'tax', 'titleFee', 'docFee',
    'apr', 'numberOfPayments', 'paymentFrequency', 'firstPaymentDate', 'dueAtSigning',
  ],
  rental: [
    'vehicleYear', 'vehicleMake', 'vehicleModel', 'vehicleVin', 'vehiclePlate',
    'vehicleColor', 'vehicleTransmission', 'vehicleEngine',
    'vehicleConditionText',
    'mileageOut', 'fuelLevelOut', 'rentalRate', 'rentalPeriod', 'rentalStartDate', 'rentalEndDate',
    'securityDeposit', 'mileageAllowance', 'excessMileageCharge',
    'insuranceFee', 'additionalDriverFee', 'tax', 'dueAtSigning',
    'hardshipDiscountPercent', 'hardshipDiscountWeeks',
    'hardshipPriorVehicleDescription', 'hardshipPriorVehicleVin', 'hardshipPriorAgreementDate',
    'representativeName', 'representativeLicense',
  ],
  billOfSale: [
    'saleDate', 'stockNumber',
    'vehicleYear', 'vehicleMake', 'vehicleModel', 'vehicleTrim',
    'vehicleVin', 'vehiclePlate', 'vehicleColor', 'vehicleBodyStyle', 'vehicleMileage',
    'odometerReading', 'odometerStatus',
    'salePrice', 'tradeInAllowance', 'tradeInDescription', 'tradeInVin', 'tradeInPayoff',
    'tax', 'titleFee', 'docFee', 'registrationFee', 'otherFees', 'otherFeesDescription',
    'paymentMethod', 'paymentMethodOther', 'conditionType', 'warrantyDuration', 'warrantyDescription',
    'sellerLienEnabled', 'sellerLienAmount', 'sellerLienReason', 'sellerLienDate', 'sellerLienDueDate',
    'sellerLienholderName', 'sellerLienholderAddress', 'sellerLienholderCity', 'sellerLienholderState', 'sellerLienholderZip',
  ],
  form130U: [
    'applicationType', 'vin', 'year', 'make', 'bodyStyle', 'model',
    'majorColor', 'minorColor', 'licensePlateNo', 'odometerReading', 'odometerBrand',
    'emptyWeight', 'carryingCapacity',
    'previousOwnerName', 'previousOwnerCity', 'previousOwnerState',
    'salesPrice', 'tradeInAllowance', 'taxRate', 'rebateOrIncentive',
    'tradeInDescription', 'tradeInVin', 'saleDate', 'remarks',
    'hasLien', 'lienDate', 'lienAmount', 'etitleLienholderId',
    'lienholderName', 'lienholderAddress', 'lienholderCity', 'lienholderState', 'lienholderZip',
  ],
  vehicleResponsibility: ACKNOWLEDGMENT_DEALER_FIELDS,
  insuranceAcknowledgment: ACKNOWLEDGMENT_DEALER_FIELDS,
  rebuiltDisclosure: [...ACKNOWLEDGMENT_DEALER_FIELDS, 'vehicleYear', 'vehicleMake', 'vehicleModel', 'officialForm'],
  salvageBillOfSale: TOW_AWAY_DEALER_FIELDS,
  towAwayAcknowledgment: TOW_AWAY_DEALER_FIELDS,
  buyerResponsibilityStatement: TOW_AWAY_DEALER_FIELDS,
};

export const customerFields: Record<DocumentSection, string[]> = {
  vehicleResponsibility: ACKNOWLEDGMENT_CUSTOMER_FIELDS,
  insuranceAcknowledgment: ACKNOWLEDGMENT_CUSTOMER_FIELDS,
  rebuiltDisclosure: ACKNOWLEDGMENT_CUSTOMER_FIELDS,
  salvageBillOfSale: ACKNOWLEDGMENT_CUSTOMER_FIELDS,
  towAwayAcknowledgment: ACKNOWLEDGMENT_CUSTOMER_FIELDS,
  buyerResponsibilityStatement: ACKNOWLEDGMENT_CUSTOMER_FIELDS,
  financing: ['buyerName', 'buyerAddress', 'buyerPhone', 'buyerEmail', 'coBuyerName', 'coBuyerAddress', 'coBuyerPhone', 'coBuyerEmail'],
  rental: [
    'renterName', 'renterAddress', 'renterPhone', 'renterEmail',
    'renterLicense', 'renterLicenseState', 'renterDob', 'licenseClass', 'licenseIssueDate',
    'licenseExpirationDate', 'idFrontImage', 'idBackImage',
    'insuranceProvider', 'insurancePolicyNumber', 'insuranceEffectiveDate',
    'insuranceExpirationDate', 'insuranceNamedInsured',
    'insuranceVehicleDescription', 'insuranceVehicleVin',
    'insuranceCardImage', 'insuranceCompanyPhone',
    'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelationship',
    'approvedDriverStatus', 'identityStatus', 'rentalAgreementSignatureStatus',
    'smsConsentAccepted', 'contractTermsAccepted',
    'activeInsuranceAcknowledged', 'gpsTamperAcknowledged',
    'lateFeeAcknowledged', 'recoveryAcknowledged',
    'coRenterName', 'coRenterAddress', 'coRenterPhone', 'coRenterEmail',
    'coRenterLicense', 'mileageIn', 'fuelLevelIn',
  ],
  billOfSale: [
    'buyerName', 'buyerAddress', 'buyerCity', 'buyerState', 'buyerZip',
    'buyerPhone', 'buyerEmail', 'buyerLicense', 'buyerLicenseState',
    'buyerIdFrontImage', 'buyerIdBackImage',
    'smsConsentAccepted', 'smsConsentAcceptedAt', 'smsConsentPhone',
    'smsConsentLanguageVersion', 'contractTermsAccepted', 'contractTermsAcceptedAt',
    'coBuyerName', 'coBuyerAddress', 'coBuyerCity', 'coBuyerState', 'coBuyerZip',
    'coBuyerPhone', 'coBuyerEmail', 'coBuyerLicense', 'coBuyerLicenseState',
  ],
  form130U: ['applicantType', 'applicantIdNumber', 'applicantIdType', 'applicantIdState', 'applicantFirstName', 'applicantMiddleName', 'applicantLastName', 'applicantSuffix', 'applicantEntityName', 'coApplicantName', 'mailingAddress', 'mailingCity', 'mailingState', 'mailingZip', 'countyOfResidence', 'applicantDob', 'applicantPhone', 'applicantEmail', 'vehicleLocationAddress', 'vehicleLocationCity', 'vehicleLocationState', 'vehicleLocationZip', 'vehicleLocationCounty', 'vehicleLocationSameAsMailing', 'hasLien', 'lienDate', 'lienAmount', 'etitleLienholderId', 'lienholderName', 'lienholderAddress', 'lienholderCity', 'lienholderState', 'lienholderZip'],
};

// Build the CustomerLinkData payload without encoding it (used for portal_data storage)
export function buildCustomerLinkPayload(
  section: CustomerSection,
  data: ContractData | RentalData | BillOfSaleData | Form130UData,
  dealerSignature?: string,
  dealerSignatureDate?: string,
  agreementId?: string,
  adminBuyerName?: string,
): CustomerLinkData {
  const fields = dealerFields[section];
  const dealerData: Record<string, unknown> = {};
  for (const key of fields) {
    dealerData[key] = (data as unknown as Record<string, unknown>)[key];
  }
  const payload: CustomerLinkData = { s: section, d: dealerData };
  const source = data as unknown as Record<string, unknown>;
  const seededCustomerData: Record<string, unknown> = {};
  for (const key of customerFields[section]) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      seededCustomerData[key] = value;
    }
  }
  if (Object.keys(seededCustomerData).length > 0) {
    payload.cd = seededCustomerData;
  }
  if (dealerSignature) {
    // For DB storage, no size limit — only limit for URL encoding
    payload.ds = dealerSignature;
    payload.dd = dealerSignatureDate;
  }
  if (agreementId) payload.aid = agreementId;
  if (adminBuyerName) payload.abn = adminBuyerName;
  return payload;
}

export function encodeCustomerLink(
  section: CustomerSection,
  data: ContractData | RentalData | BillOfSaleData | Form130UData,
  baseUrl: string,
  dealerSignature?: string,
  dealerSignatureDate?: string,
  agreementId?: string,
  adminBuyerName?: string,
): string {
  const payload = buildCustomerLinkPayload(section, data, dealerSignature, dealerSignatureDate, agreementId, adminBuyerName);
  // For URL encoding, enforce signature size limit
  if (payload.ds && payload.ds.length >= SIG_URL_LIMIT) {
    console.warn(`[customerPortal] Dealer signature too large for URL (${payload.ds.length} chars > ${SIG_URL_LIMIT}). Signature omitted from link.`);
    delete payload.ds;
    delete payload.dd;
  }
  const json = JSON.stringify(payload);
  const compressed = compressToEncodedURIComponent(json);
  return `${baseUrl}/documents/portal#customer/${compressed}`;
}

export function decodeCustomerLink(hash: string): CustomerLinkData | null {
  try {
    const prefix = '#customer/';
    if (!hash.startsWith(prefix)) return null;
    const compressed = hash.slice(prefix.length);
    const json = decompressFromEncodedURIComponent(compressed);
    if (!json) return null;
    return JSON.parse(json) as CustomerLinkData;
  } catch { return null; }
}

export interface CompletedLinkData {
  s: DocumentSection;
  dd: Record<string, unknown>;
  cd: Record<string, unknown>;
  ds?: string;
  dsd?: string;
  bs?: string;
  bsd?: string;
  cs?: string;
  csd?: string;
  bi?: string;
  ack?: Record<string, boolean>;
  lang?: 'en' | 'es';
}

export function encodeCompletedLink(
  section: DocumentSection,
  dealerData: Record<string, unknown>,
  customerData: Record<string, unknown>,
  baseUrl: string,
  dealerSignature?: string,
  dealerSignatureDate?: string,
  buyerSignature?: string,
  buyerSignatureDate?: string,
  coBuyerSignature?: string,
  coBuyerSignatureDate?: string,
  buyerIdPhoto?: string,
  acknowledgments?: Record<string, boolean>,
): string {
  const payload: CompletedLinkData = { s: section, dd: dealerData, cd: customerData };
  if (dealerSignature) {
    if (dealerSignature.length < SIG_URL_LIMIT) { payload.ds = dealerSignature; payload.dsd = dealerSignatureDate; }
    else console.warn(`[customerPortal] Dealer signature too large for URL (${dealerSignature.length} chars). Omitted.`);
  }
  if (buyerSignature) {
    if (buyerSignature.length < SIG_URL_LIMIT) { payload.bs = buyerSignature; payload.bsd = buyerSignatureDate; }
    else console.warn(`[customerPortal] Buyer signature too large for URL (${buyerSignature.length} chars). Omitted.`);
  }
  if (coBuyerSignature) {
    if (coBuyerSignature.length < SIG_URL_LIMIT) { payload.cs = coBuyerSignature; payload.csd = coBuyerSignatureDate; }
    else console.warn(`[customerPortal] Co-buyer signature too large for URL (${coBuyerSignature.length} chars). Omitted.`);
  }
  // Embed a smaller thumbnail in the URL; full-res photo is stored in DB separately
  if (buyerIdPhoto) { payload.bi = buyerIdPhoto; }
  if (acknowledgments) { payload.ack = acknowledgments; }
  const json = JSON.stringify(payload);
  const compressed = compressToEncodedURIComponent(json);
  return `${baseUrl}/documents/portal#completed/${compressed}`;
}

export function decodeCompletedLink(hash: string): CompletedLinkData | null {
  try {
    const prefix = '#completed/';
    if (!hash.startsWith(prefix)) return null;
    const compressed = hash.slice(prefix.length);
    const json = decompressFromEncodedURIComponent(compressed);
    if (!json) return null;
    return JSON.parse(json) as CompletedLinkData;
  } catch { return null; }
}

// ============================================================
// Decode a completed_link URL string (used by admin to view docs)
// ============================================================
export function decodeCompletedLinkFromUrl(url: string): CompletedLinkData | null {
  try {
    const hashIndex = url.indexOf('#completed/');
    if (hashIndex === -1) return null;
    return decodeCompletedLink(url.slice(hashIndex));
  } catch { return null; }
}

// ============================================================
// Shared agreement save helper (used by both admin and customer)
// ============================================================

export interface SaveAgreementParams {
  documentType: CustomerSection;
  data: Record<string, unknown>;
  status: 'pending' | 'completed';
  dealerSignature?: boolean;
  buyerSignature?: boolean;
  coBuyerSignature?: boolean;
  buyerSignatureData?: string;
  buyerSignatureDate?: string;
  coBuyerSignatureData?: string;
  coBuyerSignatureDate?: string;
  buyerIdPhoto?: boolean;
  buyerIdPhotoData?: string;
  acknowledgments?: Record<string, boolean>;
  completedLink?: string;
  signingToken?: string;
  agreementId?: string;  // for updating existing record
  customerId?: string;
  dealId?: string;  // links this document to its paperwork deal
  portalData?: CustomerLinkData;  // stored in DB for short portal links
  language?: 'en' | 'es';  // document language
}

export interface SaveAgreementResult {
  success: boolean;
  error?: string;
  id?: string;
  signingToken?: string;
}

export async function saveAgreement(params: SaveAgreementParams): Promise<SaveAgreementResult> {
  const { data, documentType, status } = params;
  try {
    // If we have an agreement ID, complete the existing record
    if (params.agreementId && status === 'completed') {
      const res = await fetch('/api/documents/agreements/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: params.agreementId,
          signing_token: params.signingToken,
          buyer_name: data.buyerName || data.renterName || null,
          buyer_email: data.buyerEmail || data.renterEmail || data.applicantEmail || null,
          buyer_phone: data.buyerPhone || data.renterPhone || data.applicantPhone || null,
          // Pass all customer data fields for extraction into individual columns
          ...data,
          acknowledgments: params.acknowledgments || {},
          has_buyer_signature: params.buyerSignature || false,
          has_cobuyer_signature: params.coBuyerSignature || false,
          has_dealer_signature: params.dealerSignature || false,
          buyer_signature: params.buyerSignatureData || null,
          buyer_signature_date: params.buyerSignatureDate || null,
          cobuyer_signature: params.coBuyerSignatureData || null,
          cobuyer_signature_date: params.coBuyerSignatureDate || null,
          has_buyer_id: params.buyerIdPhoto || false,
          buyer_id_photo: params.buyerIdPhotoData || null,
          customer_id: params.customerId || null,
          language: params.language || 'en',
        }),
      });
      if (!res.ok) return { success: false, error: `Server error: ${res.status}` };
      const result = await res.json();
      return {
        success: true,
        id: result?.id || params.agreementId,
        signingToken: result?.signing_token || params.signingToken,
      };
    }

    // Otherwise create a new record (admin sending)
    const res = await fetch('/api/documents/agreements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_type: documentType,
        buyer_name: data.buyerName || data.renterName || null,
        buyer_email: data.buyerEmail || data.renterEmail || null,
        buyer_phone: data.buyerPhone || data.renterPhone || null,
        vehicle_description: [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(' ') || null,
        vehicle_vin: (data.vehicleVin || data.vin || '') as string || null,
        customer_id: params.customerId || null,
        deal_id: params.dealId || null,
        status,
        acknowledgments: params.acknowledgments || {},
        has_buyer_signature: params.buyerSignature || false,
        has_cobuyer_signature: params.coBuyerSignature || false,
        has_dealer_signature: params.dealerSignature || false,
        has_buyer_id: params.buyerIdPhoto || false,
        completed_link: params.completedLink || null,
        portal_data: params.portalData || null,
        language: params.language || 'en',
      }),
    });
    if (!res.ok) return { success: false, error: `Server error: ${res.status}` };
    const result = await res.json();
    return {
      success: true,
      id: result?.id || undefined,
      signingToken: result?.signing_token || undefined,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ============================================================
// Short portal link generators
// ============================================================

export function generatePortalLink(
  baseUrl: string,
  agreementId: string,
  signingToken?: string,
  language?: string | null,
): string {
  const params = new URLSearchParams({ id: agreementId });
  if (signingToken) params.set('token', signingToken);
  // Spanish-speaking customers get the Spanish portal without having to find
  // a toggle — the language stored on the agreement/customer drives the link.
  if (language === 'es') params.set('lang', 'es');
  return `${baseUrl}/documents/portal?${params.toString()}`;
}

export function generateCompletedPortalLink(
  baseUrl: string,
  agreementId: string,
  signingToken?: string,
  language?: string | null,
): string {
  const params = new URLSearchParams({ id: agreementId, view: 'completed' });
  if (signingToken) params.set('token', signingToken);
  if (language === 'es') params.set('lang', 'es');
  return `${baseUrl}/documents/portal?${params.toString()}`;
}

// Compress image client-side before storing in DB (full resolution)
export async function compressIdPhoto(dataUrl: string, maxWidth = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // fallback to original
    img.src = dataUrl;
  });
}

// Compress image to smaller size for URL embedding (thumbnail)
export async function compressIdPhotoForUrl(dataUrl: string): Promise<string> {
  return compressIdPhoto(dataUrl, 400, 0.6);
}
