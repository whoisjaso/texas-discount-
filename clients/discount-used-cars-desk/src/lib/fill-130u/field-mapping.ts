import { factOr } from "@/lib/dealership-config";
/**
 * 130-U PDF AcroForm Field Mapping
 *
 * Maps agreement + vehicle data to the exact AcroForm field IDs
 * discovered from the official TxDMV Form 130-U PDF.
 *
 * Field IDs verified via scripts/discover-130u-fields.mjs
 */

import { dealership } from '@/lib/dealership-config';
import {
  form130UIdBox,
  idDocumentType,
  passportIssuerName,
  readIdKind,
  type IdDocumentKind,
} from '@/lib/forms/id-document';

const idKindOf = (d: AgreementData): IdDocumentKind => readIdKind(d.buyer_id_kind);
const idBoxFor = (d: AgreementData) => form130UIdBox(idKindOf(d));

// ── Data shape pulled from agreement + vehicle tables ────────────────

export interface AgreementData {
  // Vehicle
  vin: string;
  year: string;
  make: string;
  model: string;
  body_style: string;
  major_color: string;
  minor_color?: string;
  odometer: string;
  odometer_brand?: 'A' | 'N' | 'X'; // Actual, Not Actual, Exceeds
  empty_weight?: string;
  carrying_capacity?: string;
  tx_plate_no?: string;

  // Buyer
  buyer_first_name: string;
  buyer_middle_name?: string;
  buyer_last_name: string;
  buyer_suffix?: string;
  /** The complete entity name; separate from an individual's name parts. */
  buyer_entity_name?: string;
  buyer_address: string;
  buyer_city: string;
  buyer_state: string;
  buyer_zip: string;
  buyer_county: string;
  buyer_phone?: string;
  buyer_email?: string;
  buyer_dl_number?: string;
  /** The issuer: a state code for a licence or ID card, a country code for a passport. */
  buyer_dl_state?: string;
  /** Which of the form's photo ID boxes to tick. Absent means a licence. */
  buyer_id_kind?: IdDocumentKind;

  // Co-buyer / additional applicant
  co_buyer_name?: string;

  // Sale
  sale_price: number;
  sale_date?: string;
  /** Explicitly false for standalone registration/title work without a purchase. */
  is_purchase?: boolean;
  trade_in_amount?: number;
  trade_in_description?: string;
  trade_in_vin?: string;
  rebate_amount?: number;
  applying_for: 'title_and_registration' | 'title_only' | 'registration_only' | 'nontitle';
  applicant_type: 'individual' | 'business' | 'government' | 'trust' | 'non_profit';

  // Standalone forms can identify a previous owner other than the dealer.
  // Undefined preserves the sale corridor's dealership defaults.
  previous_owner_name?: string;
  previous_owner_city?: string;
  previous_owner_state?: string;
  vehicle_location_address?: string;
  vehicle_location_city?: string;
  vehicle_location_state?: string;
  vehicle_location_zip?: string;

  // Lien (BHPH deals)
  has_lien?: boolean;
  lien_date?: string;
  lien_amount?: number;
  etitle_lienholder_id?: string;
  lienholder_name?: string;
  lienholder_address?: string;
  lienholder_city?: string;
  lienholder_state?: string;
  lienholder_zip?: string;
}

export const APPLICANT_NAME_FIELD_ID = '16 Applicant First Name or Entity Name Middle Name Last Name Suffix if any';
export const ADDITIONAL_APPLICANT_NAME_FIELD_ID = '17 Additional Applicant First Name if applicable Middle Name Last Name Suffix if any';
export const APPLICANT_ADDRESS_FIELD_ID = '18 Applicant Mailing Address City State Zip';
export const PREVIOUS_OWNER_FIELD_ID = '20 Previous Owner Name or Entity Name City State';
export const FIRST_LIENHOLDER_FIELD_ID = '34 First Lienholder Name if any Mailing Address City State Zip';

// ── Dealer constants, derived from the one dealership config ─────────

export const DEALER = {
  name: factOr(dealership.legalName, "dealer legal name"),
  address: dealership.address.street,
  city: dealership.address.locality,
  state: dealership.address.region,
  zip: dealership.address.postalCode,
  gdn: factOr(dealership.license, "dealer licence (GDN)"),
  phone: dealership.phone.display,
} as const;

const DEALER_PREVIOUS_OWNER = `${DEALER.name}, ${DEALER.city}, ${DEALER.state}`;

// ── Currency formatting ──────────────────────────────────────────────

function fmt(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '';
  return amount.toFixed(2);
}

function fmtDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return value;
}

function lienholderNameAndAddress(data: AgreementData): string | undefined {
  if (!data.has_lien) return undefined;

  const name = data.lienholder_name || DEALER.name;
  /*
    The dealership's address completes the dealership's own lien and no
    other. A bank-funded sale names the lender and deliberately leaves its
    address for webDEALER, where the lender record lives; filling the gap
    with our own street put the bank's name over the dealership's address
    on a filed state form. A lienholder box with a name and no address is
    one a clerk completes; one with the wrong address is one a clerk
    trusts.
  */
  const ours = name === DEALER.name;
  const address = data.lienholder_address || (ours ? DEALER.address : '');
  const city = data.lienholder_city || (ours ? DEALER.city : '');
  const state = data.lienholder_state || (ours ? DEALER.state : '');
  const zip = data.lienholder_zip || (ours ? DEALER.zip : '');

  const place = [address, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return place ? `${name}, ${place}` : name;
}

// ── Field mapping entry types ────────────────────────────────────────

interface TextFieldMapping {
  fieldId: string;
  type: 'text';
  getValue: (data: AgreementData) => string | undefined;
}

interface CheckboxFieldMapping {
  fieldId: string;
  type: 'checkbox';
  getValue: (data: AgreementData) => boolean;
}

export type FieldMapping = TextFieldMapping | CheckboxFieldMapping;

// ── Field mapping array ──────────────────────────────────────────────
// Field IDs are EXACT names from the 130-U PDF AcroForm

export const FIELD_MAPPINGS: FieldMapping[] = [
  // ═══════════════════════════════════════════════════════════════════
  // APPLICATION TYPE CHECKBOXES
  // ═══════════════════════════════════════════════════════════════════
  {
    fieldId: 'Title  Registration',
    type: 'checkbox',
    getValue: (d) => d.applying_for === 'title_and_registration',
  },
  {
    fieldId: 'Title Only',
    type: 'checkbox',
    getValue: (d) => d.applying_for === 'title_only',
  },
  {
    fieldId: 'Registration Purposes Only',
    type: 'checkbox',
    getValue: (d) => d.applying_for === 'registration_only',
  },
  {
    fieldId: 'Nontitle Registration',
    type: 'checkbox',
    getValue: (d) => d.applying_for === 'nontitle',
  },

  // ═══════════════════════════════════════════════════════════════════
  // VEHICLE DESCRIPTION (Fields 1-12)
  // ═══════════════════════════════════════════════════════════════════
  {
    fieldId: '1 Vehicle Identification Number',
    type: 'text',
    getValue: (d) => d.vin,
  },
  {
    fieldId: '2 Year',
    type: 'text',
    getValue: (d) => d.year,
  },
  {
    fieldId: '3 Make',
    type: 'text',
    getValue: (d) => d.make,
  },
  {
    fieldId: '4 Body Style',
    type: 'text',
    getValue: (d) => d.body_style,
  },
  {
    fieldId: '5 Model',
    type: 'text',
    getValue: (d) => d.model,
  },
  {
    fieldId: '6 Major Color',
    type: 'text',
    getValue: (d) => d.major_color,
  },
  {
    fieldId: '7 Minor Color',
    type: 'text',
    getValue: (d) => d.minor_color,
  },
  {
    fieldId: '8 Texas License Plate No',
    type: 'text',
    getValue: (d) => d.tx_plate_no,
  },
  {
    fieldId: '9 Odometer Reading no tenths',
    type: 'text',
    getValue: (d) => d.odometer,
  },
  {
    fieldId: '11 Empty Weight',
    type: 'text',
    getValue: (d) => d.empty_weight,
  },
  {
    fieldId: '12 Carrying Capacity if any',
    type: 'text',
    getValue: (d) => d.carrying_capacity,
  },

  // Odometer brand checkboxes
  {
    fieldId: 'Not Actual',
    type: 'checkbox',
    getValue: (d) => d.odometer_brand === 'N',
  },
  {
    fieldId: 'Exceeds Mechanical Limits',
    type: 'checkbox',
    getValue: (d) => d.odometer_brand === 'X',
  },

  // ═══════════════════════════════════════════════════════════════════
  // APPLICANT TYPE (Field 13)
  // ═══════════════════════════════════════════════════════════════════
  {
    fieldId: 'Individual',
    type: 'checkbox',
    getValue: (d) => d.applicant_type === 'individual',
  },
  {
    fieldId: 'Business',
    type: 'checkbox',
    getValue: (d) => d.applicant_type === 'business',
  },
  {
    fieldId: 'Government',
    type: 'checkbox',
    getValue: (d) => d.applicant_type === 'government',
  },
  {
    fieldId: 'Trust',
    type: 'checkbox',
    getValue: (d) => d.applicant_type === 'trust',
  },
  {
    fieldId: 'NonProfit',
    type: 'checkbox',
    getValue: (d) => d.applicant_type === 'non_profit',
  },

  // ═══════════════════════════════════════════════════════════════════
  // APPLICANT ID (Fields 14-15)
  // ═══════════════════════════════════════════════════════════════════
  {
    fieldId: '14 Applicant Photo ID Number or FEINEIN',
    type: 'text',
    getValue: (d) => d.buyer_dl_number,
  },
  /*
    Box 15 lists the kinds of photo ID the state accepts and asks which one
    was presented. Every number used to tick the licence box, so a buyer who
    brought a passport was filed as holding a Texas licence with a passport
    number in it, and the "issued by" line beside the passport box stayed
    blank. Each box now answers to the kind the desk recorded, and the state
    line is written only for a document a state issued.
  */
  {
    fieldId: 'U.S. Driver License/ID Card',
    type: 'checkbox',
    getValue: (d) => d.applicant_type === 'individual' && !!d.buyer_dl_number && idBoxFor(d) === 'U.S. Driver License/ID Card',
  },
  {
    fieldId: 'Passport',
    type: 'checkbox',
    getValue: (d) => d.applicant_type === 'individual' && !!d.buyer_dl_number && idBoxFor(d) === 'Passport',
  },
  {
    fieldId: 'Passport Issued',
    type: 'text',
    getValue: (d) =>
      d.applicant_type === 'individual' && !!d.buyer_dl_number && idBoxFor(d) === 'Passport' ? passportIssuerName(d.buyer_dl_state) : undefined,
  },
  {
    fieldId: 'US Military ID',
    type: 'checkbox',
    getValue: (d) => d.applicant_type === 'individual' && !!d.buyer_dl_number && idBoxFor(d) === 'US Military ID',
  },
  {
    fieldId: 'State of ID/DL',
    type: 'text',
    getValue: (d) => (d.applicant_type === 'individual' && idDocumentType(idKindOf(d)).needsState ? d.buyer_dl_state : undefined),
  },

  // ═══════════════════════════════════════════════════════════════════
  // APPLICANT INFO (Fields 16-19)
  // ═══════════════════════════════════════════════════════════════════
  {
    fieldId: APPLICANT_NAME_FIELD_ID,
    type: 'text',
    // The official PDF exposes this visual four-column row as one text field.
    // fill-pdf.ts paints the parts at the actual printed column centers.
    getValue: () => undefined,
  },
  {
    fieldId: ADDITIONAL_APPLICANT_NAME_FIELD_ID,
    type: 'text',
    getValue: () => undefined,
  },
  {
    fieldId: '18 Applicant Mailing Address City State Zip',
    type: 'text',
    getValue: (d) =>
      `${d.buyer_address}, ${d.buyer_city}, ${d.buyer_state} ${d.buyer_zip}`,
  },
  {
    fieldId: '19 Applicant County of Residence',
    type: 'text',
    getValue: (d) => d.buyer_county,
  },

  // ═══════════════════════════════════════════════════════════════════
  // PREVIOUS OWNER (Field 20) & DEALER GDN (Field 21)
  // ═══════════════════════════════════════════════════════════════════
  {
    fieldId: '20 Previous Owner Name or Entity Name City State',
    type: 'text',
    getValue: (d) => d.previous_owner_name === undefined
      ? DEALER_PREVIOUS_OWNER
      : [d.previous_owner_name, d.previous_owner_city, d.previous_owner_state].filter(Boolean).join(', '),
  },
  {
    fieldId: '21 Dealer GDN if applicable',
    type: 'text',
    getValue: () => DEALER.gdn,
  },

  // ═══════════════════════════════════════════════════════════════════
  // CONTACT INFO (Fields 25-26)
  // ═══════════════════════════════════════════════════════════════════
  {
    fieldId: '25 Applicant Phone Number optional',
    type: 'text',
    getValue: (d) => d.buyer_phone,
  },
  {
    fieldId: '26 Email optional',
    type: 'text',
    getValue: (d) => d.buyer_email,
  },
  {
    fieldId: 'Yes Provide Email in 26',
    type: 'checkbox',
    getValue: (d) => !!d.buyer_email,
  },
  {
    fieldId: '29 Vehicle Location Address if different City State Zip',
    type: 'text',
    getValue: (d) => [d.vehicle_location_address, d.vehicle_location_city,
      [d.vehicle_location_state, d.vehicle_location_zip].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ') || undefined,
  },

  // LIEN INFO (Fields 30-34)
  {
    fieldId: '32 CertifiedeTitle Lienholder ID Number if any',
    type: 'text',
    getValue: (d) => d.has_lien ? d.etitle_lienholder_id : undefined,
  },
  {
    fieldId: '33 First Lien Date if any',
    type: 'text',
    getValue: (d) => d.has_lien ? fmtDate(d.lien_date || d.sale_date) : undefined,
  },
  {
    fieldId: '34 First Lienholder Name if any Mailing Address City State Zip',
    type: 'text',
    getValue: lienholderNameAndAddress,
  },
  // SECTION 35 (Motor Vehicle Tax Statement) — left blank for tax office

  // ═══════════════════════════════════════════════════════════════════
  // TRADE-IN (Field 36)
  // ═══════════════════════════════════════════════════════════════════
  {
    fieldId: 'Trade-in (if any)',
    type: 'checkbox',
    getValue: (d) => (d.trade_in_amount ?? 0) > 0,
  },
  {
    fieldId: '36 TradeIn if any Year Make Vehicle Identification Number',
    type: 'text',
    getValue: (d) => [d.trade_in_description, d.trade_in_vin].filter(Boolean).join('   ') || undefined,
  },

  // ═══════════════════════════════════════════════════════════════════
  // SALES AND USE TAX COMPUTATION (Field 38)
  // ═══════════════════════════════════════════════════════════════════
  {
    fieldId: 'Rebate Amount',
    type: 'text',
    getValue: (d) => d.rebate_amount ? fmt(d.rebate_amount) : undefined,
  },
  {
    fieldId: 'Sales Price Minus Rebate Amount',
    type: 'text',
    getValue: (d) => d.is_purchase === false ? undefined : fmt(d.sale_price - (d.rebate_amount ?? 0)),
  },
  {
    fieldId: 'Trade In Amount',
    type: 'text',
    getValue: (d) => d.trade_in_amount ? fmt(d.trade_in_amount) : undefined,
  },
  /*
    Boxes 38(d), 38(e) and 38(h), the taxable amount, the 6.25% tax on it
    and the amount of tax and penalty due, are left for the county. The
    owner's instruction: the dealer does not fill them. The tax office
    computes them from (a) through (c) at filing, and a figure we wrote
    there is one a clerk trusts rather than checks.
  */

  // ═══════════════════════════════════════════════════════════════════
  // SELLER / APPLICANT SIGNATURE NAMES + DATES
  // ═══════════════════════════════════════════════════════════════════
  {
    fieldId: 'Seller  Name',
    type: 'text',
    getValue: () => DEALER.name,
  },
  {
    fieldId: 'Date',
    type: 'text',
    getValue: (d) => d.is_purchase === false ? undefined : fmtDate(d.sale_date) || new Date().toLocaleDateString('en-US'),
  },
  {
    fieldId: 'Applicant Owner',
    type: 'text',
    getValue: (d) => {
      if (d.applicant_type !== 'individual' && d.buyer_entity_name) return d.buyer_entity_name;
      const parts = [d.buyer_first_name, d.buyer_middle_name, d.buyer_last_name].filter(Boolean);
      return parts.join(' ');
    },
  },
  {
    fieldId: 'Date_2',
    type: 'text',
    getValue: (d) => d.is_purchase === false ? undefined : fmtDate(d.sale_date) || new Date().toLocaleDateString('en-US'),
  },
  {
    fieldId: 'Additional Applicant',
    type: 'text',
    getValue: (d) => d.co_buyer_name,
  },
  {
    fieldId: 'Date_3',
    type: 'text',
    getValue: (d) => d.co_buyer_name ? (fmtDate(d.sale_date) || new Date().toLocaleDateString('en-US')) : undefined,
  },
];
