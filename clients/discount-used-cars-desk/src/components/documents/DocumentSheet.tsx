import { factOr } from "@/lib/dealership-config";
import { type CompletedLinkData } from '@/lib/documents/customerPortal';
import BillOfSalePreview, { type BuyerAcknowledgments } from '@/components/documents/BillOfSalePreview';
import ContractPreview from '@/components/documents/ContractPreview';
import RentalPreview from '@/components/documents/RentalPreview';
import Form130UPreview from '@/components/documents/Form130UPreview';
import VehicleResponsibilityDocument from '@/components/documents/VehicleResponsibilityDocument';
import InsuranceAcknowledgmentDocument from '@/components/documents/InsuranceAcknowledgmentDocument';
import RebuiltDisclosureDocument from '@/components/documents/RebuiltDisclosureDocument';
import OfficialRebuiltDisclosureDocument from '@/components/documents/OfficialRebuiltDisclosureDocument';
import { officialRebuiltDataFromLink } from '@/lib/documents/official-rebuilt-disclosure';
import SalvageSaleDocument from '@/components/documents/SalvageSaleDocument';
import { TEXAS_TAX_RATE, type BillOfSaleData } from '@/lib/documents/billOfSale';
import { dealership } from '@/lib/dealership-config';
import type { ContractData } from '@/lib/documents/finance';
import type { Form130UData } from '@/lib/documents/form130U';
import type { RentalData } from '@/lib/documents/rental';
import type { SignatureData } from '@/lib/documents/shared';
import {
  idDocumentType,
  passportIssuerName,
  readIdKind,
  type IdDocumentKind,
} from '@/lib/forms/id-document';

/**
 * One filed document, drawn from its completed link.
 *
 * This is the switch the PDF renderer has always run, lifted out of the
 * internal render route so a second reader can draw the same sheet: the
 * signing ceremony shows the buyer the very page that will print, from the
 * same payload, through the same components. A ceremony that rendered its
 * own approximation would be asking for a signature on something else.
 *
 * Server component. No auth here: the route that calls it owns the token
 * check, and the ceremony page owns its own.
 */

/** Every section this component knows how to draw. */
export const KNOWN_SECTIONS: ReadonlySet<string> = new Set([
  'billOfSale',
  'financing',
  'rental',
  'form130U',
  'vehicleResponsibility',
  'insuranceAcknowledgment',
  'rebuiltDisclosure',
  'salvageBillOfSale',
  'towAwayAcknowledgment',
  'buyerResponsibilityStatement',
]);

/** What box 15 of the HTML 130-U prints for each kind of photo ID. */
function idTypeLabel(kind: IdDocumentKind): string {
  switch (kind) {
    case 'passport':
      return 'Passport';
    case 'militaryId':
      return 'Military ID';
    case 'stateIdCard':
      return 'ID Card';
    case 'other':
      return 'Other';
    default:
      return 'DL';
  }
}

export function buildDocData(decoded: CompletedLinkData) {
  return { ...decoded.dd, ...decoded.cd } as Record<string, unknown>;
}

export function buildSignatures(decoded: CompletedLinkData, includeSignatureImages: boolean): SignatureData {
  return {
    dealerSignature: includeSignatureImages ? decoded.ds || '' : '',
    dealerSignatureDate: includeSignatureImages ? decoded.dsd || '' : '',
    buyerSignature: includeSignatureImages ? decoded.bs || '' : '',
    buyerSignatureDate: includeSignatureImages ? decoded.bsd || '' : '',
    coBuyerSignature: includeSignatureImages ? decoded.cs || '' : '',
    coBuyerSignatureDate: includeSignatureImages ? decoded.csd || '' : '',
    buyerIdPhoto: decoded.bi || '',
  };
}

export function DocumentSheet({
  decoded,
  includeSignatureImages = true,
  includeIdImagery = true,
  copyLabel,
}: {
  decoded: CompletedLinkData;
  includeSignatureImages?: boolean;
  includeIdImagery?: boolean;
  copyLabel?: string;
}) {
  const docData = buildDocData(decoded);
  const signatures = buildSignatures(decoded, includeSignatureImages);
  if (!includeIdImagery) {
    signatures.buyerIdPhoto = '';
    const record = docData as Record<string, unknown>;
    delete record.buyerIdFrontImage;
    delete record.buyerIdBackImage;
  }

  // Render the appropriate preview component
  switch (decoded.s) {
    case 'billOfSale':
      return (
        <BillOfSalePreview
          data={docData as unknown as BillOfSaleData}
          signatures={signatures}
          acknowledgments={decoded.ack as unknown as BuyerAcknowledgments}
          copyLabel={copyLabel}
          // The sale's own answers for Still To Do. Without this the block
          // printed its unanswered state, which named the buyer as the one
          // registering the car on every sale, filed by us or not.
          outstanding={
            docData.outstanding && typeof docData.outstanding === 'object'
              ? (docData.outstanding as {
                  registrationByDealer?: boolean;
                  insuranceShown?: boolean;
                  inspectionByDealer?: boolean;
                  inspectionDone?: boolean;
                })
              : undefined
          }
        />
      );
    case 'financing':
      return (
        <ContractPreview
          data={docData as unknown as ContractData}
          signatures={signatures}
          copyLabel={copyLabel}
        />
      );
    case 'rental':
      // For rental PDFs, render a single copy (not dual-copy)
      return (
        <RentalPreview
          data={docData as unknown as RentalData}
          signatures={signatures}
          copyLabel={copyLabel}
        />
      );
    case 'form130U':
      // The HTML rendering of the title application, for a screen. What
      // files and prints is the state's own PDF, filled by `render130U`
      // from the same payload; the packet's Open and Save buttons go there.
      return (
        <Form130UPreview
          data={form130UFromPayload(docData) as unknown as Form130UData}
          signatures={signatures}
        />
      );
    case 'vehicleResponsibility': {
      // The designed sheet, the same one the corridor's preview tab draws.
      // Corridor filings of this type used to have no section at all and
      // printed as a plain record sheet.
      const ack = acknowledgmentFacts(docData);
      return (
        <VehicleResponsibilityDocument
          language={ack.language}
          data={{
            ...ack.data,
            quotedRegistrationAmount: Number(docData.quotedRegistrationAmount) || 0,
          }}
          buyerSignature={signatures.buyerSignature || null}
          buyerSignatureDate={signatures.buyerSignatureDate || null}
          dealerSignature={signatures.dealerSignature || null}
          dealerSignatureDate={signatures.dealerSignatureDate || null}
        />
      );
    }
    case 'insuranceAcknowledgment': {
      const ack = acknowledgmentFacts(docData);
      return (
        <InsuranceAcknowledgmentDocument
          language={ack.language}
          data={ack.data}
          buyerSignature={signatures.buyerSignature || null}
          buyerSignatureDate={signatures.buyerSignatureDate || null}
          dealerSignature={signatures.dealerSignature || null}
          dealerSignatureDate={signatures.dealerSignatureDate || null}
        />
      );
    }
    case 'rebuiltDisclosure': {
      const ack = acknowledgmentFacts(docData);
      const official = officialRebuiltDataFromLink(decoded, includeSignatureImages);
      if (official) return <OfficialRebuiltDisclosureDocument data={official} />;
      // Stored documents without the explicit format marker keep the paper
      // the purchaser originally reviewed and signed.
      return (
        <RebuiltDisclosureDocument
          language={ack.language}
          data={ack.data}
          buyerSignature={signatures.buyerSignature || null}
          buyerSignatureDate={signatures.buyerSignatureDate || null}
          dealerSignature={signatures.dealerSignature || null}
          dealerSignatureDate={signatures.dealerSignatureDate || null}
        />
      );
    }
    case 'salvageBillOfSale':
    case 'towAwayAcknowledgment':
    case 'buyerResponsibilityStatement': {
      // The tow-away packet: the same facts as an acknowledgment, plus the
      // money and the salvage facts the corridor filed with it.
      const ack = acknowledgmentFacts(docData);
      const text = (value: unknown): string => (typeof value === 'string' ? value : '');
      const num = (value: unknown): number => (Number.isFinite(Number(value)) ? Number(value) : 0);
      const status = text(docData.odometerStatus);
      const leaving = text(docData.howLeaving);
      return (
        <SalvageSaleDocument
          sheet={decoded.s}
          language={ack.language}
          data={{
            ...ack.data,
            vehicleMileage: text(docData.vehicleMileage),
            odometerStatus: status === 'exceeds' || status === 'not_actual' || status === 'actual' ? status : '',
            salePrice: num(docData.salePrice),
            tax: num(docData.tax),
            titleFee: num(docData.titleFee),
            docFee: num(docData.docFee),
            total: num(docData.total),
            amountPaidToday: num(docData.amountPaidToday),
            paymentMethod: text(docData.paymentMethod),
            howLeaving: leaving === 'towTruck' || leaving === 'trailer' || leaving === 'flatbed' ? leaving : '',
            salvageLicense: text(docData.salvageLicense),
            titleOriginState: text(docData.titleOriginState),
          }}
          buyerSignature={signatures.buyerSignature || null}
          buyerSignatureDate={signatures.buyerSignatureDate || null}
          dealerSignature={signatures.dealerSignature || null}
          dealerSignatureDate={signatures.dealerSignatureDate || null}
        />
      );
    }
    default:
      return null;
  }
}

/**
 * The corridor's 130-U payload, in the boxes the HTML form reads.
 *
 * The corridor writes its title application in the bill of sale's
 * vocabulary (`vehicleVin`, `buyerAddress`, `buyerLicense`) with the money
 * figures already worked out, because the state PDF filler reads that
 * vocabulary. The HTML form reads the customer portal's (`vin`,
 * `mailingAddress`, `applicantIdNumber`, a tax rate to multiply by), so a
 * corridor-filed 130-U drew on screen with no VIN, no address, a $0.00
 * price and "$NaN" for the tax. A portal-filed payload already has these
 * keys and keeps them: its own values are spread last.
 */
function form130UFromPayload(docData: Record<string, unknown>): Record<string, unknown> {
  const text = (value: unknown): string =>
    typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  const num = (value: unknown): number => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const status = text(docData.odometerStatus);
  const lienEnabled = Boolean(docData.hasLien) || Boolean(docData.sellerLienEnabled);
  const fromCorridor = {
    vin: text(docData.vehicleVin),
    year: text(docData.vehicleYear),
    make: text(docData.vehicleMake),
    model: text(docData.vehicleModel),
    bodyStyle: text(docData.vehicleBodyStyle),
    majorColor: text(docData.vehicleColor),
    licensePlateNo: text(docData.vehiclePlate),
    odometerReading: text(docData.odometerReading) || text(docData.vehicleMileage),
    odometerBrand: status === 'not_actual' ? 'N' : status === 'exceeds' ? 'X' : 'A',
    applicantIdNumber: text(docData.buyerLicense),
    // Box 15 names the kind the desk recorded, and the issuer beside it is
    // a state for a licence and a country for a passport.
    applicantIdType: docData.buyerLicense ? idTypeLabel(readIdKind(docData.buyerIdKind)) : '',
    applicantIdState: idDocumentType(readIdKind(docData.buyerIdKind)).needsCountry
      ? passportIssuerName(text(docData.buyerLicenseState))
      : text(docData.buyerLicenseState),
    mailingAddress: text(docData.buyerAddress),
    mailingCity: text(docData.buyerCity),
    mailingState: text(docData.buyerState),
    mailingZip: text(docData.buyerZip),
    applicantPhone: text(docData.buyerPhone),
    applicantEmail: text(docData.buyerEmail),
    previousOwnerName: factOr(dealership.legalName, "dealer legal name"),
    previousOwnerCity: dealership.address.locality,
    previousOwnerState: dealership.address.region,
    salesPrice: num(docData.salesPrice ?? docData.salePrice),
    tradeInAllowance: num(docData.tradeInAllowance),
    rebateOrIncentive: 0,
    taxRate: TEXAS_TAX_RATE * 100,
    hasLien: lienEnabled,
    lienAmount: num(docData.lienAmount ?? docData.sellerLienAmount),
    lienDate: text(docData.lienDate ?? docData.sellerLienDate),
    lienholderName: text(docData.lienholderName ?? docData.sellerLienholderName),
    lienholderAddress: text(docData.lienholderAddress ?? docData.sellerLienholderAddress),
    lienholderCity: text(docData.lienholderCity ?? docData.sellerLienholderCity),
    lienholderState: text(docData.lienholderState ?? docData.sellerLienholderState),
    lienholderZip: text(docData.lienholderZip ?? docData.sellerLienholderZip),
  };
  return { ...fromCorridor, ...docData };
}

/** The buyer and vehicle facts every desk-signed acknowledgment is drawn from. */
/**
 * A phone number the way a person writes one.
 *
 * The record stores E.164 ("+17135550190"), which is right for dialling
 * and wrong for paper: the acknowledgment sheets printed it raw. A US
 * number prints as (713) 555-0190; anything else prints as stored.
 */
function printedPhone(value: string): string {
  const match = value.match(/^\+?1?(\d{3})(\d{3})(\d{4})$/);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : value;
}

function acknowledgmentFacts(docData: Record<string, unknown>) {
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  return {
    language: (docData.language === 'es' ? 'es' : 'en') as 'en' | 'es',
    data: {
      buyerName: text(docData.buyerName),
      buyerIdNumber: text(docData.buyerIdNumber),
      buyerPhone: printedPhone(text(docData.buyerPhone)),
      buyerAddress: text(docData.buyerAddress),
      vehicleDescription: text(docData.vehicleDescription),
      // The parts, when the row carries them: the rebuilt disclosure prints
      // the year and make on their own lines, as the state's form does.
      vehicleYear: text(docData.vehicleYear),
      vehicleMake: text(docData.vehicleMake),
      vehicleModel: text(docData.vehicleModel),
      vin: text(docData.vin),
      saleDate: text(docData.saleDate),
    },
  };
}
