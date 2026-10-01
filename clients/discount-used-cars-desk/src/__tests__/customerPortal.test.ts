import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  encodeCustomerLink,
  decodeCustomerLink,
  encodeCompletedLink,
  decodeCompletedLink,
  generatePortalLink,
  saveAgreement,
  type CustomerSection,
} from '@/lib/documents/customerPortal';
import type { BillOfSaleData } from '@/lib/documents/billOfSale';

const mockBillOfSaleData: BillOfSaleData = {
  saleDate: '2026-03-15',
  stockNumber: 'STK001',
  vehicleYear: '2020',
  vehicleMake: 'Toyota',
  vehicleModel: 'Camry',
  vehicleTrim: 'SE',
  vehicleVin: '1HGBH41JXMN109186',
  vehiclePlate: 'ABC1234',
  vehicleColor: 'Black',
  vehicleBodyStyle: 'Sedan',
  vehicleMileage: '45000',
  odometerReading: '45000',
  odometerStatus: 'actual',
  salePrice: 5000,
  tradeInAllowance: 0,
  tradeInDescription: '',
  tradeInVin: '',
  tradeInPayoff: 0,
  tax: 325,
  titleFee: 33,
  docFee: 150,
  registrationFee: 75,
  otherFees: 0,
  otherFeesDescription: '',
  paymentMethod: 'Cash',
  paymentMethodOther: '',
  conditionType: 'as_is',
  warrantyDuration: '',
  warrantyDescription: '',
  buyerName: '',
  buyerAddress: '',
  buyerCity: '',
  buyerState: '',
  buyerZip: '',
  buyerPhone: '',
  buyerEmail: '',
  buyerLicense: '',
  buyerLicenseState: '',
  coBuyerName: '',
  coBuyerAddress: '',
  coBuyerCity: '',
  coBuyerState: '',
  coBuyerZip: '',
  coBuyerPhone: '',
  coBuyerEmail: '',
  coBuyerLicense: '',
  coBuyerLicenseState: '',
};

describe('encodeCustomerLink / decodeCustomerLink', () => {
  it('generates tokenized short portal links', () => {
    const link = generatePortalLink('https://thetriplejauto.com', 'abc-123', 'tok-456');
    expect(link).toContain('id=abc-123');
    expect(link).toContain('token=tok-456');
  });

  it('round-trips bill of sale data', () => {
    const link = encodeCustomerLink('billOfSale', mockBillOfSaleData, 'https://thetriplejauto.com');
    expect(link).toContain('https://thetriplejauto.com/documents/portal#customer/');

    const hash = '#customer/' + link.split('#customer/')[1];
    const decoded = decodeCustomerLink(hash);
    expect(decoded).not.toBeNull();
    expect(decoded!.s).toBe('billOfSale');
    expect(decoded!.d.vehicleVin).toBe('1HGBH41JXMN109186');
    expect(decoded!.d.salePrice).toBe(5000);
    expect(decoded!.d.vehicleYear).toBe('2020');
  });

  it('includes dealer signature when provided', () => {
    const link = encodeCustomerLink('billOfSale', mockBillOfSaleData, 'https://test.com', 'sig-data', '2026-03-15');
    const hash = '#customer/' + link.split('#customer/')[1];
    const decoded = decodeCustomerLink(hash);
    expect(decoded!.ds).toBe('sig-data');
    expect(decoded!.dd).toBe('2026-03-15');
  });

  it('excludes buyer-only fields from dealer link', () => {
    const link = encodeCustomerLink('billOfSale', mockBillOfSaleData, 'https://test.com');
    const hash = '#customer/' + link.split('#customer/')[1];
    const decoded = decodeCustomerLink(hash);
    expect(decoded!.d.buyerName).toBeUndefined();
    expect(decoded!.d.buyerPhone).toBeUndefined();
    expect(decoded!.d.buyerEmail).toBeUndefined();
  });

  it('returns null for invalid hash', () => {
    expect(decodeCustomerLink('#invalid/garbage')).toBeNull();
    expect(decodeCustomerLink('')).toBeNull();
    expect(decodeCustomerLink('#customer/')).toBeNull();
  });
});

describe('encodeCompletedLink / decodeCompletedLink', () => {
  it('round-trips with acknowledgments', () => {
    const dealerData = { vehicleVin: '1HGBH41JXMN109186', salePrice: 5000 };
    const customerData = { buyerName: 'John Doe', buyerPhone: '832-555-1234' };
    const acks = {
      inspected: true,
      asIs: true,
      receivedCopy: true,
      allSalesFinal: true,
      odometerInformed: true,
      responsibility: true,
      financingSeparate: false,
    };

    const link = encodeCompletedLink(
      'billOfSale', dealerData, customerData, 'https://test.com',
      'dealer-sig', '2026-03-15',
      'buyer-sig', '2026-03-15',
      undefined, undefined,
      undefined,
      acks,
    );

    expect(link).toContain('#completed/');
    const hash = '#completed/' + link.split('#completed/')[1];
    const decoded = decodeCompletedLink(hash);

    expect(decoded).not.toBeNull();
    expect(decoded!.s).toBe('billOfSale');
    expect(decoded!.dd.vehicleVin).toBe('1HGBH41JXMN109186');
    expect(decoded!.cd.buyerName).toBe('John Doe');
    expect(decoded!.ds).toBe('dealer-sig');
    expect(decoded!.bs).toBe('buyer-sig');
    expect(decoded!.ack).toBeDefined();
    expect(decoded!.ack!.inspected).toBe(true);
    expect(decoded!.ack!.financingSeparate).toBe(false);
  });

  it('returns null for invalid completed hash', () => {
    expect(decodeCompletedLink('#completed/')).toBeNull();
    expect(decodeCompletedLink('#customer/something')).toBeNull();
    expect(decodeCompletedLink('')).toBeNull();
  });

  it('omits signatures that exceed size limits', () => {
    // SIG_URL_LIMIT is 200_000 — signatures above that are omitted
    const hugeSig = 'x'.repeat(200_001);
    const link = encodeCompletedLink(
      'billOfSale', {}, {}, 'https://test.com',
      hugeSig, '2026-03-15',
    );
    const hash = '#completed/' + link.split('#completed/')[1];
    const decoded = decodeCompletedLink(hash);
    expect(decoded!.ds).toBeUndefined();
  });

  it('includes signatures under the size limit', () => {
    // 60K sig should be included now (was dropped at old 50K limit)
    const sig = 'x'.repeat(60_000);
    const link = encodeCompletedLink(
      'billOfSale', {}, {}, 'https://test.com',
      sig, '2026-03-15',
    );
    const hash = '#completed/' + link.split('#completed/')[1];
    const decoded = decodeCompletedLink(hash);
    expect(decoded!.ds).toBe(sig);
  });

  it('works for all document types', () => {
    const sections: CustomerSection[] = ['financing', 'rental', 'billOfSale', 'form130U'];
    for (const section of sections) {
      const link = encodeCompletedLink(section, { foo: 'bar' }, { baz: 'qux' }, 'https://test.com');
      const hash = '#completed/' + link.split('#completed/')[1];
      const decoded = decodeCompletedLink(hash);
      expect(decoded!.s).toBe(section);
    }
  });
});

describe('saveAgreement completion payload', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'agreement-1', signing_token: 'secure-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('sends raw completion evidence instead of a client-generated completed_link', async () => {
    const result = await saveAgreement({
      documentType: 'billOfSale',
      data: { buyerName: 'Jane Buyer' },
      status: 'completed',
      agreementId: 'agreement-1',
      signingToken: 'secure-token',
      buyerSignature: true,
      buyerSignatureData: 'buyer-signature',
      buyerSignatureDate: '2026-05-27',
      buyerIdPhoto: true,
      buyerIdPhotoData: 'data:image/png;base64,id-front',
      completedLink: 'https://evil.example/documents/portal#completed/attacker',
      acknowledgments: { smsConsent: true },
    });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));

    expect(result.success).toBe(true);
    expect(body.completed_link).toBeUndefined();
    expect(body.buyer_signature).toBe('buyer-signature');
    expect(body.buyer_signature_date).toBe('2026-05-27');
    expect(body.buyer_id_photo).toBe('data:image/png;base64,id-front');
    expect(body.acknowledgments.smsConsent).toBe(true);
  });
});
