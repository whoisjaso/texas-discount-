import { describe, it, expect } from 'vitest';
import { type CustomerSection } from '@/lib/documents/customerPortal';

// Test the wizard step building logic (extracted for testability)
interface FieldGroup {
  label: string;
  fields: string[];
  optional?: boolean;
}

interface WizardStep {
  id: string;
  label: string;
  type: 'welcome' | 'fields' | 'id-upload' | 'acknowledgments' | 'review' | 'sign' | 'complete';
  group?: FieldGroup;
}

const fieldGroups: Record<CustomerSection, FieldGroup[]> = {
  financing: [
    { label: 'Your Information', fields: ['buyerName', 'buyerAddress', 'buyerPhone', 'buyerEmail'] },
    { label: 'Co-Buyer / Co-Signer', fields: ['coBuyerName', 'coBuyerAddress', 'coBuyerPhone', 'coBuyerEmail'], optional: true },
  ],
  rental: [
    { label: 'Your Information', fields: ['renterName', 'renterAddress', 'renterPhone', 'renterEmail', 'renterLicense'] },
    { label: 'Co-Renter', fields: ['coRenterName', 'coRenterAddress', 'coRenterPhone', 'coRenterEmail', 'coRenterLicense'], optional: true },
    { label: 'Vehicle Return', fields: ['mileageIn', 'fuelLevelIn'] },
  ],
  billOfSale: [
    { label: 'Your Information', fields: ['buyerName', 'buyerAddress', 'buyerCity', 'buyerState', 'buyerZip', 'buyerPhone', 'buyerEmail', 'buyerLicense', 'buyerLicenseState'] },
    { label: 'Co-Buyer', fields: ['coBuyerName', 'coBuyerAddress', 'coBuyerCity', 'coBuyerState', 'coBuyerZip', 'coBuyerPhone', 'coBuyerEmail', 'coBuyerLicense', 'coBuyerLicenseState'], optional: true },
  ],
  form130U: [
    { label: 'Personal Information', fields: ['applicantType', 'applicantFirstName', 'applicantMiddleName', 'applicantLastName', 'applicantSuffix', 'applicantEntityName', 'coApplicantName', 'applicantIdNumber', 'applicantIdType', 'applicantIdState', 'applicantDob', 'applicantPhone'] },
    { label: 'Address', fields: ['applicantEmail', 'mailingAddress', 'mailingCity', 'mailingState', 'mailingZip', 'countyOfResidence', 'vehicleLocationSameAsMailing', 'vehicleLocationAddress', 'vehicleLocationCity', 'vehicleLocationState', 'vehicleLocationZip', 'vehicleLocationCounty'] },
    { label: 'Lienholder', fields: ['hasLien', 'lienholderName', 'lienholderAddress', 'lienholderCity', 'lienholderState', 'lienholderZip'], optional: true },
  ],
};

function buildSteps(section: CustomerSection): WizardStep[] {
  const steps: WizardStep[] = [{ id: 'welcome', label: 'Welcome', type: 'welcome' }];
  for (const group of fieldGroups[section]) {
    steps.push({ id: `fields-${group.label}`, label: group.label, type: 'fields', group });
  }
  steps.push({ id: 'id-upload', label: 'Photo ID', type: 'id-upload' });
  steps.push({ id: 'acknowledgments', label: section === 'billOfSale' ? 'Final Checks' : 'Text Updates', type: 'acknowledgments' });
  steps.push({ id: 'review', label: 'Review', type: 'review' });
  steps.push({ id: 'sign', label: 'Sign', type: 'sign' });
  steps.push({ id: 'complete', label: 'Complete', type: 'complete' });
  return steps;
}

describe('Wizard step building', () => {
  it('builds correct steps for financing (8 steps)', () => {
    const steps = buildSteps('financing');
    expect(steps).toHaveLength(8);
    expect(steps[0].type).toBe('welcome');
    expect(steps[1].type).toBe('fields');
    expect(steps[1].label).toBe('Your Information');
    expect(steps[2].type).toBe('fields');
    expect(steps[2].group?.optional).toBe(true);
    expect(steps[3].type).toBe('id-upload');
    expect(steps[4].type).toBe('acknowledgments');
    expect(steps[5].type).toBe('review');
    expect(steps[6].type).toBe('sign');
    expect(steps[7].type).toBe('complete');
  });

  it('builds correct steps for rental (9 steps)', () => {
    const steps = buildSteps('rental');
    expect(steps).toHaveLength(9);
    expect(steps[0].type).toBe('welcome');
    expect(steps[1].label).toBe('Your Information');
    expect(steps[2].group?.optional).toBe(true);
    expect(steps[3].label).toBe('Vehicle Return');
    expect(steps[3].group?.fields).toContain('mileageIn');
    expect(steps[7].type).toBe('sign');
    expect(steps[8].type).toBe('complete');
  });

  it('builds correct steps for billOfSale with acknowledgments (8 steps)', () => {
    const steps = buildSteps('billOfSale');
    expect(steps).toHaveLength(8);
    const ackStep = steps.find(s => s.type === 'acknowledgments');
    expect(ackStep).toBeDefined();
    expect(ackStep!.label).toBe('Final Checks');
    // Review should be immediately before signature.
    const signIdx = steps.findIndex(s => s.type === 'sign');
    const ackIdx = steps.findIndex(s => s.type === 'acknowledgments');
    const reviewIdx = steps.findIndex(s => s.type === 'review');
    expect(ackIdx).toBeLessThan(reviewIdx);
    expect(reviewIdx).toBe(signIdx - 1);
  });

  it('builds correct steps for form130U (9 steps)', () => {
    const steps = buildSteps('form130U');
    expect(steps).toHaveLength(9);
    expect(steps[1].label).toBe('Personal Information');
    expect(steps[2].label).toBe('Address');
    expect(steps[3].label).toBe('Lienholder');
    expect(steps[3].group?.optional).toBe(true);
  });

  it('includes text-update consent for non-billOfSale types', () => {
    for (const section of ['financing', 'rental', 'form130U'] as CustomerSection[]) {
      const steps = buildSteps(section);
      const ackStep = steps.find(s => s.type === 'acknowledgments');
      expect(ackStep?.label).toBe('Text Updates');
    }
  });

  it('does not include video or explainer steps', () => {
    for (const section of ['financing', 'rental', 'billOfSale', 'form130U'] as CustomerSection[]) {
      const steps = buildSteps(section);
      const videoIdx = steps.findIndex(s => s.id === 'explainer' || s.label === 'Video');
      const reviewIdx = steps.findIndex(s => s.type === 'review');
      const signIdx = steps.findIndex(s => s.type === 'sign');
      expect(videoIdx).toBe(-1);
      expect(reviewIdx).toBe(signIdx - 1);
    }
  });

  it('always starts with welcome and ends with complete', () => {
    for (const section of ['financing', 'rental', 'billOfSale', 'form130U'] as CustomerSection[]) {
      const steps = buildSteps(section);
      expect(steps[0].type).toBe('welcome');
      expect(steps[steps.length - 1].type).toBe('complete');
    }
  });

  it('marks co-buyer/co-renter/lienholder groups as optional', () => {
    const financingSteps = buildSteps('financing');
    const coBuyerStep = financingSteps.find(s => s.label === 'Co-Buyer / Co-Signer');
    expect(coBuyerStep?.group?.optional).toBe(true);

    const rentalSteps = buildSteps('rental');
    const coRenterStep = rentalSteps.find(s => s.label === 'Co-Renter');
    expect(coRenterStep?.group?.optional).toBe(true);

    const form130USteps = buildSteps('form130U');
    const lienStep = form130USteps.find(s => s.label === 'Lienholder');
    expect(lienStep?.group?.optional).toBe(true);
  });

  it('billOfSale co-buyer has 9 fields', () => {
    const steps = buildSteps('billOfSale');
    const coBuyerStep = steps.find(s => s.label === 'Co-Buyer');
    expect(coBuyerStep?.group?.fields).toHaveLength(9);
    expect(coBuyerStep?.group?.optional).toBe(true);
  });
});

describe('Field label formatting', () => {
  function fieldLabel(field: string): string {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .replace(/co /i, 'Co-')
      .trim();
  }

  it('converts camelCase to Title Case', () => {
    expect(fieldLabel('buyerName')).toBe('Buyer Name');
    expect(fieldLabel('buyerAddress')).toBe('Buyer Address');
    expect(fieldLabel('vehicleYear')).toBe('Vehicle Year');
  });

  it('handles co-buyer prefix', () => {
    expect(fieldLabel('coBuyerName')).toBe('Co-Buyer Name');
    expect(fieldLabel('coRenterPhone')).toBe('Co-Renter Phone');
  });

  it('handles single word fields', () => {
    expect(fieldLabel('email')).toBe('Email');
  });
});
