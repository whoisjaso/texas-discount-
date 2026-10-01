import * as normalise from "@/lib/documents/normalize";
import {
  BillOfSaleData,
  getSellerLienSummary,
} from './billOfSale';
import { brand } from "@/lib/dealership-config";

export interface Form130UData {
  applicationType: 'titleAndRegistration' | 'titleOnly' | 'registrationOnly' | 'nontitle';
  vin: string;
  year: string;
  make: string;
  bodyStyle: string;
  model: string;
  majorColor: string;
  minorColor: string;
  licensePlateNo: string;
  odometerReading: string;
  odometerBrand: 'A' | 'N' | 'X';
  emptyWeight: string;
  carryingCapacity: string;
  applicantType: 'Individual' | 'Business' | 'Government' | 'Trust' | 'Non-Profit';
  applicantIdNumber: string;
  applicantIdType: string;
  applicantIdState: string;
  applicantFirstName: string;
  applicantMiddleName: string;
  applicantLastName: string;
  applicantSuffix: string;
  applicantEntityName: string;
  coApplicantName: string;
  mailingAddress: string;
  mailingCity: string;
  mailingState: string;
  mailingZip: string;
  countyOfResidence: string;
  applicantDob: string;
  applicantPhone: string;
  applicantEmail: string;
  previousOwnerName: string;
  previousOwnerCity: string;
  previousOwnerState: string;
  vehicleLocationAddress: string;
  vehicleLocationCity: string;
  vehicleLocationState: string;
  vehicleLocationZip: string;
  vehicleLocationCounty: string;
  vehicleLocationSameAsMailing: boolean;
  lienholderName: string;
  lienholderAddress: string;
  lienholderCity: string;
  lienholderState: string;
  lienholderZip: string;
  lienDate: string;
  lienAmount: number;
  etitleLienholderId: string;
  hasLien: boolean;
  salesPrice: number;
  tradeInAllowance: number;
  taxRate: number;
  rebateOrIncentive: number;
  tradeInDescription: string;
  tradeInVin: string;
  saleDate: string;
  remarks: string;
}

export function calculateTax(data: Form130UData) {
  const netPrice = Math.max(0, data.salesPrice - data.tradeInAllowance - data.rebateOrIncentive);
  const taxDue = netPrice * (data.taxRate / 100);
  return { netPrice, taxDue };
}

export function prefillFromBillOfSale(bos: BillOfSaleData): Partial<Form130UData> {
  const sellerLien = getSellerLienSummary(bos);
  const odometerBrand: 'A' | 'N' | 'X' =
    bos.odometerStatus === 'actual' ? 'A' :
    bos.odometerStatus === 'exceeds' ? 'X' : 'N';
  // Normalised before the split, so a name typed in capitals reaches the form
  // written the way a name is written. Doing it here rather than at each field
  // means the split sees one consistent value.
  const nameParts = normalise.personName(bos.buyerName).split(/\s+/).filter(Boolean);
  let firstName = '', middleName = '', lastName = '';
  if (nameParts.length === 1) firstName = nameParts[0];
  else if (nameParts.length === 2) { firstName = nameParts[0]; lastName = nameParts[1]; }
  else if (nameParts.length >= 3) { firstName = nameParts[0]; middleName = nameParts.slice(1, -1).join(' '); lastName = nameParts[nameParts.length - 1]; }
  const lienRemarks = sellerLien.enabled
    ? `Seller lien balance: ${formatCurrency(sellerLien.amount)} for ${sellerLien.reason}.`
    : '';

  return {
    vin: normalise.vin(bos.vehicleVin), year: bos.vehicleYear,
    make: normalise.vehicleTerm(bos.vehicleMake), model: normalise.vehicleTerm(bos.vehicleModel),
    bodyStyle: normalise.vehicleTerm(bos.vehicleBodyStyle),
    majorColor: normalise.placeName(bos.vehicleColor),
    odometerReading: bos.odometerReading || bos.vehicleMileage, odometerBrand,
    applicantFirstName: firstName, applicantMiddleName: middleName, applicantLastName: lastName,
    applicantIdNumber: bos.buyerLicense, applicantIdType: 'DL',
    applicantIdState: normalise.stateCode(bos.buyerLicenseState),
    mailingAddress: normalise.streetAddress(bos.buyerAddress),
    mailingCity: normalise.placeName(bos.buyerCity),
    mailingState: normalise.stateCode(bos.buyerState), mailingZip: bos.buyerZip,
    applicantPhone: bos.buyerPhone, applicantEmail: bos.buyerEmail,
    coApplicantName: normalise.personName(bos.coBuyerName),
    previousOwnerName: normalise.personName(brand.legal),
    previousOwnerCity: 'Houston', previousOwnerState: 'TX',
    salesPrice: bos.salePrice, tradeInAllowance: bos.tradeInAllowance,
    tradeInDescription: normalise.vehicleTerm(bos.tradeInDescription),
    tradeInVin: normalise.vin(bos.tradeInVin), saleDate: bos.saleDate,
    hasLien: sellerLien.enabled,
    lienholderName: sellerLien.enabled ? normalise.personName(sellerLien.lienholderName) : '',
    lienholderAddress: sellerLien.enabled ? normalise.streetAddress(sellerLien.lienholderAddress) : '',
    lienholderCity: sellerLien.enabled ? normalise.placeName(sellerLien.lienholderCity) : '',
    lienholderState: sellerLien.enabled ? normalise.stateCode(sellerLien.lienholderState) : '',
    lienholderZip: sellerLien.enabled ? sellerLien.lienholderZip : '',
    lienDate: sellerLien.enabled ? sellerLien.lienDate : '',
    lienAmount: sellerLien.enabled ? sellerLien.amount : 0,
    remarks: lienRemarks,
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
