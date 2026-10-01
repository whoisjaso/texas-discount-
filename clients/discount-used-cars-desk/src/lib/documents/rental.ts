export interface RentalData {
  renterName: string;
  renterAddress: string;
  renterPhone: string;
  renterEmail: string;
  renterLicense: string;
  renterLicenseState?: string;
  renterDob?: string;
  licenseClass?: string;
  licenseIssueDate?: string;
  licenseExpirationDate?: string;
  coRenterName: string;
  coRenterAddress: string;
  coRenterPhone: string;
  coRenterEmail: string;
  coRenterLicense: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleVin: string;
  vehiclePlate: string;
  vehicleColor?: string;
  vehicleTransmission?: string;
  vehicleEngine?: string;
  vehicleConditionText?: string;
  mileageOut: string;
  mileageIn: string;
  fuelLevelOut: string;
  fuelLevelIn: string;
  rentalRate: number;
  rentalPeriod: 'Daily' | 'Weekly' | 'Monthly';
  rentalStartDate: string;
  rentalEndDate: string;
  securityDeposit: number;
  mileageAllowance: number;
  excessMileageCharge: number;
  insuranceFee: number;
  additionalDriverFee: number;
  tax: number;
  dueAtSigning: number;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceEffectiveDate?: string;
  insuranceExpirationDate?: string;
  insuranceNamedInsured?: string;
  insuranceVehicleDescription?: string;
  insuranceVehicleVin?: string;
  insuranceStatus?: string;
  insuranceCompanyPhone?: string;
  insuranceCardImage?: string;
  nextInsuranceVerificationDueDate?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  approvedDriverStatus?: string;
  identityStatus?: string;
  rentalAgreementSignatureStatus?: string;
  // ── Hardship Discount (percent off, applied to first N weeks) ──
  hardshipDiscountPercent?: number;     // e.g. 20 for 20% off
  hardshipDiscountWeeks?: number;       // e.g. 2 (Weeks 1 & 2)
  hardshipPriorVehicleDescription?: string; // e.g. "2017 Hyundai Elantra"
  hardshipPriorVehicleVin?: string;
  hardshipPriorAgreementDate?: string;  // ISO date
  // ── Triple J Representative ──
  representativeName?: string;          // defaults to the configured authorised signer
  representativeLicense?: string;       // defaults to the dealership config licence
  // Maintenance protocol controls
  maintenancePolicyRevision?: string;
  maintenanceCheckIntervalDays?: number;
  oilChangeReimbursementCap?: number;
}

export function calculateHardshipDiscount(data: Pick<RentalData, 'rentalRate' | 'hardshipDiscountPercent'>): number {
  const rate = Number(data.rentalRate) || 0;
  const pct = Number(data.hardshipDiscountPercent) || 0;
  if (!rate || !pct) return 0;
  return Math.round(rate * (pct / 100) * 100) / 100;
}

export function discountedWeeklyRate(data: Pick<RentalData, 'rentalRate' | 'hardshipDiscountPercent'>): number {
  const rate = Number(data.rentalRate) || 0;
  const discount = calculateHardshipDiscount(data);
  return Math.max(0, rate - discount);
}

export function calculateRentalDuration(
  startDate: string,
  endDate: string,
  period: 'Daily' | 'Weekly' | 'Monthly'
): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (period === 'Daily') return diffDays;
  if (period === 'Weekly') return Math.ceil(diffDays / 7);
  if (period === 'Monthly') return Math.ceil(diffDays / 30);
  return 0;
}

export function calculateRentalTotal(data: RentalData) {
  const duration = calculateRentalDuration(data.rentalStartDate, data.rentalEndDate, data.rentalPeriod);
  const baseRental = data.rentalRate * duration;
  const insuranceTotal = data.insuranceFee * duration;
  const additionalDriverTotal = data.additionalDriverFee * duration;
  const subtotal = baseRental + insuranceTotal + additionalDriverTotal;
  const taxAmount = subtotal * (data.tax / 100);
  const grandTotal = subtotal + taxAmount;
  const totalDue = grandTotal + data.securityDeposit;
  return { duration, baseRental, insuranceTotal, additionalDriverTotal, subtotal, taxAmount, grandTotal, totalDue };
}

export interface RentalPayment {
  paymentNumber: number;
  dueDate: string;
  rental: number;
  insurance: number;
  additionalDriver: number;
  tax: number;
  amountDue: number;
  balanceAfter: number;
}

export function generateRentalSchedule(data: RentalData): RentalPayment[] {
  const duration = calculateRentalDuration(data.rentalStartDate, data.rentalEndDate, data.rentalPeriod);
  if (!data.rentalStartDate || duration <= 0) return [];
  const totals = calculateRentalTotal(data);
  const perPeriodRental = data.rentalRate;
  const perPeriodInsurance = data.insuranceFee;
  const perPeriodAdditionalDriver = data.additionalDriverFee;
  const perPeriodSubtotal = perPeriodRental + perPeriodInsurance + perPeriodAdditionalDriver;
  const perPeriodTax = perPeriodSubtotal * (data.tax / 100);
  const perPeriodTotal = perPeriodSubtotal + perPeriodTax;
  let totalOwed = totals.grandTotal;
  const schedule: RentalPayment[] = [];
  const currentDate = new Date(data.rentalStartDate + 'T12:00:00');
  for (let i = 1; i <= duration; i++) {
    const balanceAfter = Math.max(0, totalOwed - perPeriodTotal);
    schedule.push({
      paymentNumber: i,
      dueDate: currentDate.toISOString().split('T')[0],
      rental: perPeriodRental,
      insurance: perPeriodInsurance,
      additionalDriver: perPeriodAdditionalDriver,
      tax: perPeriodTax,
      amountDue: perPeriodTotal,
      balanceAfter,
    });
    totalOwed = balanceAfter;
    if (data.rentalPeriod === 'Daily') currentDate.setDate(currentDate.getDate() + 1);
    else if (data.rentalPeriod === 'Weekly') currentDate.setDate(currentDate.getDate() + 7);
    else if (data.rentalPeriod === 'Monthly') currentDate.setMonth(currentDate.getMonth() + 1);
  }
  return schedule;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
