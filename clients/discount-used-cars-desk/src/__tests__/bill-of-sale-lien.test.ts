import { describe, expect, it } from 'vitest';
import {
  type BillOfSaleData,
  DEFAULT_SELLER_LIEN_REASON,
  DEFAULT_SELLER_LIENHOLDER,
  getSellerLienSummary,
} from '@/lib/documents/billOfSale';
import { prefillFromBillOfSale } from '@/lib/documents/form130U';
import { dealership, factOr } from "@/lib/dealership-config";

const baseBillOfSale: BillOfSaleData = {
  saleDate: '2026-04-26',
  stockNumber: 'STK-LIEN',
  buyerName: 'John Buyer',
  buyerAddress: '100 Main Street',
  buyerCity: 'Houston',
  buyerState: 'TX',
  buyerZip: '77075',
  buyerPhone: '832-555-0100',
  buyerEmail: 'buyer@example.com',
  buyerLicense: 'TX123456',
  buyerLicenseState: 'TX',
  coBuyerName: '',
  coBuyerAddress: '',
  coBuyerCity: '',
  coBuyerState: '',
  coBuyerZip: '',
  coBuyerPhone: '',
  coBuyerEmail: '',
  coBuyerLicense: '',
  coBuyerLicenseState: '',
  vehicleYear: '2014',
  vehicleMake: 'Toyota',
  vehicleModel: 'Camry',
  vehicleTrim: 'LE',
  vehicleVin: '4T1BF1FK0EU123456',
  vehiclePlate: 'ABC1234',
  vehicleColor: 'White',
  vehicleBodyStyle: 'Sedan',
  vehicleMileage: '125000',
  odometerReading: '125000',
  odometerStatus: 'actual',
  salePrice: 2000,
  tradeInAllowance: 0,
  tradeInDescription: '',
  tradeInVin: '',
  tradeInPayoff: 0,
  tax: 125,
  titleFee: 33,
  docFee: 150,
  registrationFee: 500,
  otherFees: 0,
  otherFeesDescription: '',
  paymentMethod: 'Cash',
  paymentMethodOther: '',
  conditionType: 'as_is',
  warrantyDuration: '',
  warrantyDescription: '',
};

describe('bill of sale seller lien sync', () => {
  it('keeps the lien disabled until an actual amount is owed', () => {
    const summary = getSellerLienSummary({
      ...baseBillOfSale,
      sellerLienEnabled: true,
      sellerLienAmount: 0,
    });

    expect(summary.enabled).toBe(false);
  });

  it('prefills 130-U first lienholder fields from the bill of sale lien', () => {
    const prefilled = prefillFromBillOfSale({
      ...baseBillOfSale,
      sellerLienEnabled: true,
      sellerLienAmount: 500,
      sellerLienReason: DEFAULT_SELLER_LIEN_REASON,
      sellerLienDate: '2026-04-26',
      sellerLienDueDate: '2026-05-03',
      sellerLienholderName: DEFAULT_SELLER_LIENHOLDER.name,
      sellerLienholderAddress: DEFAULT_SELLER_LIENHOLDER.address,
      sellerLienholderCity: DEFAULT_SELLER_LIENHOLDER.city,
      sellerLienholderState: DEFAULT_SELLER_LIENHOLDER.state,
      sellerLienholderZip: DEFAULT_SELLER_LIENHOLDER.zip,
    });

    expect(prefilled.hasLien).toBe(true);
    expect(prefilled.lienAmount).toBe(500);
    expect(prefilled.lienDate).toBe('2026-04-26');
    // Asserted against the config rather than a literal. These used to be
    // spelled out here, and the bill of sale said "8774 Almeda Genoa Road"
    // while every other surface said "Rd" — the exact drift the single source
    // of truth exists to stop. Pinning the literal here would have kept the
    // two apart. It also means a fork does not have to edit this test.
    expect(prefilled.lienholderName).toBe(factOr(dealership.legalName, "dealer legal name"));
    expect(prefilled.lienholderAddress).toBe(dealership.address.street);
    expect(prefilled.remarks).toContain('Seller lien balance: $500.00');
  });
});
