import { describe, it, expect } from 'vitest';
import { extractCustomerColumns } from '@/lib/documents/customer-columns';

describe('extractCustomerColumns', () => {
  it('maps Bill of Sale fields (buyerAddress, buyerLicense, coBuyerName)', () => {
    const result = extractCustomerColumns({
      buyerAddress: '123 Main St',
      buyerCity: 'Houston',
      buyerState: 'TX',
      buyerZip: '77001',
      buyerLicense: 'DL123456',
      buyerLicenseState: 'TX',
      coBuyerName: 'Jane Doe',
      coBuyerEmail: 'jane@example.com',
      coBuyerPhone: '555-1234',
      coBuyerAddress: '456 Oak Ave',
      coBuyerCity: 'Dallas',
      coBuyerState: 'TX',
      coBuyerZip: '75001',
      coBuyerLicense: 'DL789012',
      coBuyerLicenseState: 'TX',
    });

    expect(result).toEqual({
      buyer_address: '123 Main St',
      buyer_city: 'Houston',
      buyer_state: 'TX',
      buyer_zip: '77001',
      buyer_license: 'DL123456',
      buyer_license_state: 'TX',
      co_buyer_name: 'Jane Doe',
      co_buyer_email: 'jane@example.com',
      co_buyer_phone: '555-1234',
      co_buyer_address: '456 Oak Ave',
      co_buyer_city: 'Dallas',
      co_buyer_state: 'TX',
      co_buyer_zip: '75001',
      co_buyer_license: 'DL789012',
      co_buyer_license_state: 'TX',
    });
  });

  it('maps Rental fields (renterAddress, renterLicense, coRenterName)', () => {
    const result = extractCustomerColumns({
      renterAddress: '789 Elm St',
      renterCity: 'Austin',
      renterState: 'TX',
      renterZip: '73301',
      renterLicense: 'DL555555',
      renterLicenseState: 'TX',
      coRenterName: 'Bob Smith',
      coRenterEmail: 'bob@example.com',
      coRenterPhone: '555-5678',
      coRenterAddress: '321 Pine Rd',
      coRenterCity: 'Plano',
      coRenterState: 'TX',
      coRenterZip: '75024',
      coRenterLicense: 'DL444444',
      coRenterLicenseState: 'TX',
    });

    expect(result).toEqual({
      buyer_address: '789 Elm St',
      buyer_city: 'Austin',
      buyer_state: 'TX',
      buyer_zip: '73301',
      buyer_license: 'DL555555',
      buyer_license_state: 'TX',
      co_buyer_name: 'Bob Smith',
      co_buyer_email: 'bob@example.com',
      co_buyer_phone: '555-5678',
      co_buyer_address: '321 Pine Rd',
      co_buyer_city: 'Plano',
      co_buyer_state: 'TX',
      co_buyer_zip: '75024',
      co_buyer_license: 'DL444444',
      co_buyer_license_state: 'TX',
    });
  });

  it('maps Form 130-U fields (mailingAddress, applicantIdNumber, coApplicantName)', () => {
    const result = extractCustomerColumns({
      mailingAddress: '100 Capitol Ave',
      mailingCity: 'San Antonio',
      mailingState: 'TX',
      mailingZip: '78201',
      applicantIdNumber: 'ID999888',
      applicantIdState: 'TX',
      coApplicantName: 'Co-Applicant LLC',
    });

    expect(result).toEqual({
      buyer_address: '100 Capitol Ave',
      buyer_city: 'San Antonio',
      buyer_state: 'TX',
      buyer_zip: '78201',
      buyer_license: 'ID999888',
      buyer_license_state: 'TX',
      co_buyer_name: 'Co-Applicant LLC',
      co_buyer_email: null,
      co_buyer_phone: null,
      co_buyer_address: null,
      co_buyer_city: null,
      co_buyer_state: null,
      co_buyer_zip: null,
      co_buyer_license: null,
      co_buyer_license_state: null,
    });
  });

  it('returns all nulls when no recognized fields are present', () => {
    const result = extractCustomerColumns({ randomField: 'value' });

    expect(result).toEqual({
      buyer_address: null,
      buyer_city: null,
      buyer_state: null,
      buyer_zip: null,
      buyer_license: null,
      buyer_license_state: null,
      co_buyer_name: null,
      co_buyer_email: null,
      co_buyer_phone: null,
      co_buyer_address: null,
      co_buyer_city: null,
      co_buyer_state: null,
      co_buyer_zip: null,
      co_buyer_license: null,
      co_buyer_license_state: null,
    });
  });

  it('prefers snake_case over camelCase (for pre-normalized data)', () => {
    const result = extractCustomerColumns({
      buyer_address: 'Pre-normalized',
      buyerAddress: 'Should be ignored',
    });

    expect(result.buyer_address).toBe('Pre-normalized');
  });
});
