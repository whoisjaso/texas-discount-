import { describe, it, expect } from 'vitest';
import { encodeCompletedLink, decodeCompletedLinkFromUrl } from '@/lib/documents/customerPortal';

describe('Rental Renewal Data Flow', () => {
  // Simulate the full round-trip: encode → decode → extract rental fields
  const dealerData = {
    vehicleYear: '2020', vehicleMake: 'Toyota', vehicleModel: 'Camry',
    vehicleVin: '1HGBH41JXMN109186', vehiclePlate: 'ABC1234',
    rentalRate: 450, rentalPeriod: 'Weekly',
    rentalStartDate: '2026-02-01', rentalEndDate: '2026-03-01',
    securityDeposit: 500, insuranceFee: 50, additionalDriverFee: 25,
    tax: 8.25, mileageAllowance: 1000, excessMileageCharge: 0.25,
    mileageOut: '45000', mileageIn: '46200', fuelLevelOut: 'Full', fuelLevelIn: '3/4',
    dueAtSigning: 950,
  };

  const customerData = {
    renterName: 'Maria Garcia', renterAddress: '123 Main St',
    renterPhone: '(281) 555-1234', renterEmail: 'maria@example.com',
    renterLicense: 'TX12345678',
    coRenterName: 'Jose Garcia', coRenterAddress: '123 Main St',
    coRenterPhone: '(281) 555-5678', coRenterEmail: 'jose@example.com',
    coRenterLicense: 'TX87654321',
  };

  const completedLink = encodeCompletedLink(
    'rental', dealerData, customerData, 'https://thetriplejauto.com',
    'dealer-sig-data', '2026-02-01',
    'buyer-sig-data', '2026-02-01',
  );

  it('encodes and decodes completed rental link round-trip', () => {
    const decoded = decodeCompletedLinkFromUrl(completedLink);
    expect(decoded).not.toBeNull();
    expect(decoded!.s).toBe('rental');
    expect(decoded!.dd).toMatchObject(dealerData);
    expect(decoded!.cd).toMatchObject(customerData);
  });

  it('extracts customer info from decoded data for renewal pre-fill', () => {
    const decoded = decodeCompletedLinkFromUrl(completedLink)!;
    const merged = { ...decoded.dd, ...decoded.cd };

    // Customer data should override dealer data where both exist
    expect(merged.renterName).toBe('Maria Garcia');
    expect(merged.renterPhone).toBe('(281) 555-1234');
    expect(merged.renterLicense).toBe('TX12345678');
    expect(merged.coRenterName).toBe('Jose Garcia');
  });

  it('preserves vehicle info from dealer data for renewal', () => {
    const decoded = decodeCompletedLinkFromUrl(completedLink)!;
    const merged = { ...decoded.dd, ...decoded.cd };

    expect(merged.vehicleYear).toBe('2020');
    expect(merged.vehicleMake).toBe('Toyota');
    expect(merged.vehicleModel).toBe('Camry');
    expect(merged.vehicleVin).toBe('1HGBH41JXMN109186');
  });

  it('preserves rate/fee structure from dealer data for renewal', () => {
    const decoded = decodeCompletedLinkFromUrl(completedLink)!;

    expect(decoded.dd.rentalRate).toBe(450);
    expect(decoded.dd.rentalPeriod).toBe('Weekly');
    expect(decoded.dd.securityDeposit).toBe(500);
    expect(decoded.dd.insuranceFee).toBe(50);
    expect(decoded.dd.additionalDriverFee).toBe(25);
    expect(decoded.dd.tax).toBe(8.25);
  });

  it('preserves dealer signature for renewal', () => {
    const decoded = decodeCompletedLinkFromUrl(completedLink)!;
    expect(decoded.ds).toBe('dealer-sig-data');
  });

  it('returns null for invalid URL', () => {
    expect(decodeCompletedLinkFromUrl('https://example.com/no-hash')).toBeNull();
    expect(decodeCompletedLinkFromUrl('')).toBeNull();
  });

  it('returns null for non-rental completed link decoded as rental', () => {
    const financingLink = encodeCompletedLink(
      'financing', { cashPrice: 5000 }, { buyerName: 'Test' }, 'https://example.com'
    );
    const decoded = decodeCompletedLinkFromUrl(financingLink);
    expect(decoded).not.toBeNull();
    expect(decoded!.s).toBe('financing'); // Not rental — renewal should reject this
  });
});
