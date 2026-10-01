/* eslint-disable @next/next/no-img-element */
import { RentalData, calculateRentalTotal, calculateRentalDuration, generateRentalSchedule, formatCurrency } from '@/lib/documents/rental';
import { format } from 'date-fns';
import { SignatureData, DEALER_LICENSE, isRenderableImageSrc } from '@/lib/documents/shared';
import SignatureLinePreview from '@/components/documents/SignatureLinePreview';
import { getDocStrings, type DocStrings } from '@/lib/documents/i18n';
import SmsConsentSection from '@/components/documents/SmsConsentSection';
import { calculateDailyRentalRate } from '@/lib/rentals/early-return';
import { brand, dealership, factOr } from "@/lib/dealership-config";
import BrandLogo from "@/components/site/shared/BrandLogo";

interface Props {
  data: RentalData;
  signatures: SignatureData;
  copyLabel?: string; // When provided, renders single copy with this label (for PDF generation)
  strings?: DocStrings;
  smsConsent?: boolean;
}

interface RentalTrackingRow {
  paymentNumber: string;
  dueDate: string;
  rental: number;
  program: string;
  tax: number;
  amountDue: number;
  balanceAfter: string;
}

function MiniFact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-widest text-[color:var(--tj-muted)]">{label}</div>
      <div className={`mt-1 break-words text-sm font-semibold text-[color:var(--tj-ink)] ${mono ? 'font-mono uppercase' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function formatInsuranceStatus(value?: string): string {
  const text = (value ?? '').trim();
  if (!text) return 'Not submitted';
  return text
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function addWeeks(dateStr: string, weeks: number): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export default function RentalPreview({ data, signatures, copyLabel, strings: stringsProp, smsConsent }: Props) {
  const totals = calculateRentalTotal(data);
  const duration = calculateRentalDuration(data.rentalStartDate, data.rentalEndDate, data.rentalPeriod);
  const schedule = generateRentalSchedule(data);
  const periodLabel = data.rentalPeriod === 'Daily' ? 'Day(s)' : data.rentalPeriod === 'Weekly' ? 'Week(s)' : 'Month(s)';
  const periodSingular = data.rentalPeriod === 'Daily' ? 'day' : data.rentalPeriod === 'Weekly' ? 'week' : 'month';
  const perPeriodAmount = schedule.length > 0 ? schedule[0].amountDue : 0;

  const t = stringsProp || getDocStrings('en');
  const s = t.shared;
  const r = t.rental;
  const hasAdditionalDriver = Boolean(
    data.coRenterName ||
    data.coRenterAddress ||
    data.coRenterPhone ||
    data.coRenterEmail ||
    data.coRenterLicense,
  );
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return '';
    return format(date, 'MM/dd/yyyy');
  };
  const standardRate = Number(data.rentalRate) || 0;
  const hardshipPercent = Number(data.hardshipDiscountPercent) || 0;
  const hardshipWeeks = Math.max(0, Number(data.hardshipDiscountWeeks) || 0);
  const hasHardshipDiscount =
    data.rentalPeriod === 'Weekly' &&
    standardRate > 0 &&
    hardshipPercent > 0 &&
    hardshipWeeks > 0;
  const hardshipDiscount = hasHardshipDiscount
    ? roundMoney(standardRate * (hardshipPercent / 100))
    : 0;
  const hardshipRate = hasHardshipDiscount
    ? roundMoney(standardRate - hardshipDiscount)
    : standardRate;
  const hardshipWeekLabel = hardshipWeeks > 1 ? `Weeks 1 & ${hardshipWeeks}` : 'Week 1';
  const weekOneSubtotal = hardshipRate + (Number(data.insuranceFee) || 0) + (Number(data.additionalDriverFee) || 0);
  const weekOneTax = roundMoney(weekOneSubtotal * ((Number(data.tax) || 0) / 100));
  const computedDueAtSigning = roundMoney(weekOneSubtotal + weekOneTax + (Number(data.securityDeposit) || 0));
  const dueAtSigning = Number(data.dueAtSigning) > 0 ? Number(data.dueAtSigning) : computedDueAtSigning;
  const standardResumeDate = addWeeks(data.rentalStartDate, hardshipWeeks);
  const representativeName = data.representativeName?.trim() || factOr(dealership.signer.name, 'authorised signer');
  const representativeLicense = data.representativeLicense?.trim() || DEALER_LICENSE;
  const maintenanceIntervalDays = Number(data.maintenanceCheckIntervalDays) || 14;
  const oilChangeCap = Number(data.oilChangeReimbursementCap) || 75;
  const earlyReturnDailyRate = calculateDailyRentalRate(data.rentalRate, data.rentalPeriod);
  const earlyReturnExampleAmount = roundMoney(earlyReturnDailyRate * 2);
  const insuranceStatusLabel = formatInsuranceStatus(data.insuranceStatus);
  const insurancePeriod = [formatDate(data.insuranceEffectiveDate), formatDate(data.insuranceExpirationDate)]
    .filter(Boolean)
    .join(' - ');
  const hasInsuranceProfile = Boolean(
    data.insuranceProvider ||
      data.insurancePolicyNumber ||
      data.insuranceEffectiveDate ||
      data.insuranceExpirationDate ||
      data.insuranceNamedInsured ||
      data.insuranceVehicleVin,
  );

  const hardshipPaymentRows = hasHardshipDiscount
    ? [
        ...Array.from({ length: hardshipWeeks }, (_, index) => ({
          week: `Week ${index + 1}`,
          date: formatDate(addWeeks(data.rentalStartDate, index)),
          standard: standardRate,
          discount: hardshipDiscount,
          due: hardshipRate,
          program: `Hardship Discount ${hardshipPercent}% Off`,
        })),
        {
          week: `Week ${hardshipWeeks + 1} ->`,
          date: `${formatDate(standardResumeDate)} forward`,
          standard: standardRate,
          discount: 0,
          due: standardRate,
          program: 'Standard Rate Resumes',
        },
      ]
    : [];

  const trackingRows: RentalTrackingRow[] = hasHardshipDiscount
    ? Array.from({ length: 6 }, (_, index) => {
        const isHardshipWeek = index < hardshipWeeks;
        const rental = isHardshipWeek ? hardshipRate : standardRate;
        const tax = roundMoney(rental * ((Number(data.tax) || 0) / 100));
        return {
          paymentNumber: String(index + 1),
          dueDate: addWeeks(data.rentalStartDate, index),
          rental,
          program: isHardshipWeek ? `Hardship Discount (${hardshipPercent}%)` : 'Standard Rate',
          tax,
          amountDue: roundMoney(rental + tax),
          balanceAfter: '-',
        };
      })
    : schedule.map((payment) => ({
        paymentNumber: String(payment.paymentNumber),
        dueDate: payment.dueDate,
        rental: payment.rental,
        program: 'Standard Rate',
        tax: payment.tax,
        amountDue: payment.amountDue,
        balanceAfter: formatCurrency(payment.balanceAfter),
      }));

  const renderContract = (copyLabel: string) => (
    <div className="rental-print-doc bg-white p-10 md:p-16 text-[#1a1a1a] font-sans max-w-5xl mx-auto relative print-doc">
      {/* Print copy label. Hidden on screen, shown in print */}
      <div className="print-copy-label text-center text-[10px] font-bold tracking-[0.3em] uppercase text-[color:var(--tj-muted)] pb-2 border-b border-dashed border-[#1a1a1a]/20 mb-4">
        {copyLabel}
      </div>

      {/* Watermark / Background Logo */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none overflow-hidden print-no-watermark">
        <div className="font-serif font-bold text-[400px] leading-none">JJJ</div>
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex justify-between items-end border-b border-[#e5e5e5] pb-8 mb-10 print-section">
          <div className="flex items-center space-x-6">
            <div className="w-24 h-24 border-2 border-[#b89b5e] p-1 rounded-full overflow-hidden flex items-center justify-center bg-white">
              <BrandLogo size={96} className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-4xl font-serif font-bold uppercase tracking-widest mb-2 text-[#1a1a1a]">{r.title}</h1>
              <p className="text-xs tracking-widest uppercase text-[color:var(--tj-muted)] font-semibold">{r.subtitle}</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-serif font-semibold text-[#b89b5e]">{factOr(dealership.legalName, "dealer legal name")}</h2>
            <p className="text-xs text-[color:var(--tj-ink)] mt-1">
              {dealership.address.street}, {dealership.address.locality},{" "}
              {dealership.address.region} {dealership.address.postalCode}
            </p>
            <p className="text-xs text-[color:var(--tj-ink)]">
              {dealership.phone.display}
            </p>
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-12 mb-10 print-section">
          <div className="p-6">
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--tj-muted)] mb-4">{r.renterInfo}</h3>
            <p className="font-serif text-xl mb-1 min-h-[1.75rem]">{data.renterName}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem]">{data.renterAddress}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem]">{data.renterPhone}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem]">{data.renterEmail}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem] mt-2 font-mono uppercase">
              {s.driverLicense} {data.renterLicense}{data.renterLicenseState ? ` (${data.renterLicenseState})` : ''}
            </p>
            {(data.renterDob || data.licenseClass || data.licenseIssueDate || data.licenseExpirationDate) && (
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-[color:var(--tj-ink)]">
                {data.renterDob && <MiniFact label="DOB" value={formatDate(data.renterDob)} />}
                {data.licenseClass && <MiniFact label="Class" value={data.licenseClass} />}
                {data.licenseIssueDate && <MiniFact label="DL Issued" value={formatDate(data.licenseIssueDate)} />}
                {data.licenseExpirationDate && <MiniFact label="DL Expires" value={formatDate(data.licenseExpirationDate)} />}
              </div>
            )}
          </div>
          <div className="p-6" data-mobile-empty={!hasAdditionalDriver ? 'true' : undefined}>
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--tj-muted)] mb-4">{r.additionalDriver}</h3>
            <p className="font-serif text-xl mb-1 min-h-[1.75rem]">{data.coRenterName}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem]">{data.coRenterAddress}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem]">{data.coRenterPhone}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem]">{data.coRenterEmail}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem] mt-2 font-mono uppercase">{s.driverLicense} {data.coRenterLicense}</p>
          </div>
        </div>

        {/* Vehicle */}
        <div className="mb-10 print-section">
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--tj-muted)] mb-2">{s.vehicleDescription}</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#ddd]">
                <th className="p-3 text-left font-semibold">{s.year}</th>
                <th className="p-3 text-left font-semibold">{s.make}</th>
                <th className="p-3 text-left font-semibold">{s.model}</th>
                <th className="p-3 text-left font-semibold">{s.vin}</th>
                <th className="p-3 text-left font-semibold">{s.plate}</th>
                <th className="p-3 text-left font-semibold">{r.miOut}</th>
                <th className="p-3 text-left font-semibold">{r.miIn}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#1a1a1a]/10">
                <td className="p-3" data-label={s.year}>{data.vehicleYear}</td>
                <td className="p-3" data-label={s.make}>{data.vehicleMake}</td>
                <td className="p-3" data-label={s.model}>{data.vehicleModel}</td>
                <td className="p-3 uppercase font-mono text-xs" data-label={s.vin}>{data.vehicleVin}</td>
                <td className="p-3 uppercase font-mono text-xs" data-label={s.plate}>{data.vehiclePlate}</td>
                <td className="p-3" data-label={r.miOut}>{data.mileageOut}</td>
                <td className="p-3" data-label={r.miIn}>{data.mileageIn}</td>
              </tr>
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-8 mt-4">
            <div className="flex items-center space-x-4 text-sm">
              <span className="text-[color:var(--tj-muted)] font-semibold text-[10px] tracking-widest uppercase">{r.fuelOut}</span>
              <span className="font-medium">{data.fuelLevelOut}</span>
            </div>
            <div className="flex items-center space-x-4 text-sm">
              <span className="text-[color:var(--tj-muted)] font-semibold text-[10px] tracking-widest uppercase">{r.fuelIn}</span>
              <span className="font-medium">{data.fuelLevelIn}</span>
            </div>
          </div>
          {(data.vehicleColor || data.vehicleTransmission || data.vehicleEngine) && (
            <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
              {data.vehicleColor && (
                <div>
                  <div className="text-[color:var(--tj-muted)] font-semibold text-[10px] tracking-widest uppercase">Color</div>
                  <div className="font-medium">{data.vehicleColor}</div>
                </div>
              )}
              {data.vehicleTransmission && (
                <div>
                  <div className="text-[color:var(--tj-muted)] font-semibold text-[10px] tracking-widest uppercase">Transmission</div>
                  <div className="font-medium">{data.vehicleTransmission}</div>
                </div>
              )}
              {data.vehicleEngine && (
                <div>
                  <div className="text-[color:var(--tj-muted)] font-semibold text-[10px] tracking-widest uppercase">Engine</div>
                  <div className="font-medium">{data.vehicleEngine}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Insurance Profile */}
        {hasInsuranceProfile && (
          <div className="mb-10 print-section">
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--tj-muted)] mb-2">
              Insurance on file
            </h3>
            <div className="grid grid-cols-2 gap-3 rounded-sm border border-[#b89b5e]/35 bg-[#fbf7ed] p-4 text-sm md:grid-cols-4">
              <MiniFact label="Provider" value={data.insuranceProvider || 'Not saved'} />
              <MiniFact label="Policy #" value={data.insurancePolicyNumber || 'Not saved'} mono />
              <MiniFact label="Policy Period" value={insurancePeriod || 'Not saved'} />
              <MiniFact label="Status" value={insuranceStatusLabel} />
              <MiniFact label="Named Insured" value={data.insuranceNamedInsured || data.renterName || 'Not saved'} />
              <MiniFact label="Covered Vehicle" value={data.insuranceVehicleDescription || `${data.vehicleYear} ${data.vehicleMake} ${data.vehicleModel}`} />
              <MiniFact label="Covered VIN" value={data.insuranceVehicleVin || 'Not saved'} mono />
              <MiniFact label="Next Recheck" value={formatDate(data.nextInsuranceVerificationDueDate) || 'Not scheduled'} />
            </div>
            {/* 2026-05-31 D5 fix: render the uploaded insurance proof image.
                Previously this image was captured by the portal, persisted to
                portal_data.cd.insuranceCardImage, then dropped. Never reached
                the contract PDF. Now hydrated via agreement-to-pdf.ts. */}
            {data.insuranceCardImage && (
              <div className="mt-4 print-section">
                <h4 className="text-[9px] font-bold tracking-widest uppercase text-[color:var(--tj-muted)] mb-2">
                  Insurance Card (Uploaded)
                </h4>
                {isRenderableImageSrc(data.insuranceCardImage) ? (
                  <img
                    src={data.insuranceCardImage}
                    alt="Insurance card"
                    className="max-w-full rounded-sm border border-[#b89b5e]/35 bg-white"
                    style={{ maxHeight: 320, objectFit: 'contain' }}
                  />
                ) : (
                  <p className="inline-block rounded-sm border border-[#b89b5e]/35 bg-[#b89b5e]/5 px-3 py-1.5 text-xs font-semibold text-[color:var(--tj-ink)]">
                    Insurance proof on file with {brand.full}.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rental Summary Boxes (mirrors Truth in Lending) */}
        <div className="mb-10 print-section">
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--tj-muted)] mb-2">{r.rentalSummary}</h3>
          <div className="grid grid-cols-4 gap-3">
            <div className="p-4 flex flex-col justify-between bg-[#f8f8f8] rounded-sm">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1">Standard Rate</div>
                <div className="text-[10px] text-[color:var(--tj-muted)] leading-tight">Weekly rental rate under this Agreement.</div>
              </div>
              <div className="text-2xl font-serif font-bold mt-6">{formatCurrency(standardRate)} / {data.rentalPeriod === 'Weekly' ? 'wk' : periodSingular}</div>
            </div>
            <div className={`p-4 flex flex-col justify-between rounded-sm ${hasHardshipDiscount ? 'bg-[#b89b5e]/10 border border-[#b89b5e]/40' : 'bg-[#f8f8f8]'}`}>
              <div>
                <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${hasHardshipDiscount ? 'text-[#8a6b24]' : ''}`}>
                  {hasHardshipDiscount ? 'Hardship Rate' : r.securityDeposit}
                </div>
                <div className="text-[10px] text-[color:var(--tj-muted)] leading-tight">
                  {hasHardshipDiscount ? `${hardshipPercent}% Hardship Discount - ${hardshipWeekLabel} only.` : r.securityDepositDesc}
                </div>
              </div>
              <div className="text-2xl font-serif font-bold mt-6">{hasHardshipDiscount ? `${formatCurrency(hardshipRate)} / wk` : formatCurrency(data.securityDeposit)}</div>
            </div>
            <div className="p-4 flex flex-col justify-between bg-[#f8f8f8] rounded-sm">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1">Rental Type</div>
                <div className="text-[10px] text-[color:var(--tj-muted)] leading-tight">Continuous weekly rental. Renews every 7 days.</div>
              </div>
              <div className="text-2xl font-serif font-bold mt-6">{hasHardshipDiscount ? 'Open Weekly' : `${duration} ${periodLabel}`}</div>
            </div>
            <div className="p-4 flex flex-col justify-between bg-[#f8f8f8] rounded-sm">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1">{s.totalDueAtSigning}</div>
                <div className="text-[10px] text-[color:var(--tj-muted)] leading-tight">{hasHardshipDiscount ? 'Week 1 at discounted Hardship Rate.' : r.totalDueAtSigningDesc}</div>
              </div>
              <div className="text-2xl font-serif font-bold mt-6">{formatCurrency(dueAtSigning)}</div>
            </div>
          </div>
        </div>

        {/* Payment Schedule Summary (mirrors Payment Schedule in Financing) */}
        <div className="mb-10 print-section">
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--tj-muted)] mb-2">{r.paymentSchedule}</h3>
          {hasHardshipDiscount ? (
            <>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#f5f5f5] border-b border-[#ddd]">
                    <th className="p-3 text-left font-semibold">Week</th>
                    <th className="p-3 text-left font-semibold">Billing Date</th>
                    <th className="p-3 text-right font-semibold">Standard</th>
                    <th className="p-3 text-right font-semibold">Discount</th>
                    <th className="p-3 text-right font-semibold">Amount Due</th>
                    <th className="p-3 text-left font-semibold">Program</th>
                  </tr>
                </thead>
                <tbody>
                  {hardshipPaymentRows.map((row) => (
                    <tr key={`${row.week}-${row.date}`} className={`border-b border-[#1a1a1a]/10 ${row.discount > 0 ? 'bg-[#b89b5e]/5' : ''}`}>
                      <td className="p-3 font-semibold" data-label="Week">{row.week}</td>
                      <td className="p-3" data-label="Billing Date">{row.date}</td>
                      <td className="p-3 text-right" data-label="Standard">{formatCurrency(row.standard)}</td>
                      <td className={`p-3 text-right ${row.discount > 0 ? 'text-[#8a6b24] font-semibold' : 'text-[color:var(--tj-muted)]'}`} data-label="Discount">
                        {row.discount > 0 ? `- ${formatCurrency(row.discount)}` : '-'}
                      </td>
                      <td className="p-3 text-right font-bold" data-label="Amount Due">{formatCurrency(row.due)}</td>
                      <td className="p-3" data-label="Program">{row.program}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-[color:var(--tj-muted)] mt-3 italic">
                This is an open-ended weekly rental. Payments continue each week at the Standard Rate of {formatCurrency(standardRate)} until either party terminates the Agreement in writing.
              </p>
            </>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#f5f5f5] border-b border-[#ddd]">
                  <th className="p-3 text-left font-semibold">{r.numberOfPayments}</th>
                  <th className="p-3 text-left font-semibold">{r.amountPerDay.replace('day', periodSingular)}</th>
                  <th className="p-3 text-left font-semibold">{r.whenPaymentsDue}</th>
                  <th className="p-3 text-left font-semibold">{r.pickupDate}</th>
                  <th className="p-3 text-left font-semibold">{r.returnDate}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-3" data-label={r.numberOfPayments}>{duration}</td>
                  <td className="p-3 font-bold" data-label={r.amountPerDay.replace('day', periodSingular)}>{formatCurrency(perPeriodAmount)}</td>
                  <td className="p-3" data-label={r.whenPaymentsDue}>{data.rentalPeriod} {r.beginning} {formatDate(data.rentalStartDate)}</td>
                  <td className="p-3" data-label={r.pickupDate}>{formatDate(data.rentalStartDate)}</td>
                  <td className="p-3 font-bold text-[#b89b5e]" data-label={r.returnDate}>{formatDate(data.rentalEndDate)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* ═══ PRINT PAGE 2: Itemization, Policies & Disclosures ═══ */}
        <div className="mb-10 grid gap-3 rounded-sm border border-[#b89b5e]/35 bg-[#b89b5e]/10 p-4 text-sm text-[#1a1a1a] print-section md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#8a6b24]">
              Early return balance
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[color:var(--tj-ink)]">
              If Renter cancels or returns the Vehicle before the paid-through return date,
              Renter remains responsible for the unused days in that paid rental period.
            </p>
          </div>
          <div className="rounded-sm bg-[color:var(--tj-plane)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--tj-muted)]">
              Daily calculation
            </div>
            <div className="mt-1 font-serif text-2xl font-bold">
              {formatCurrency(earlyReturnDailyRate)} / day
            </div>
            <p className="mt-1 text-[11px] text-[color:var(--tj-muted)]">
              Example: 2 days early = {formatCurrency(earlyReturnExampleAmount)}.
            </p>
          </div>
        </div>

        <div className="print-page-group">

        {/* Itemization & Policies (mirrors Itemization & Important Clauses) */}
        <div className="grid grid-cols-2 gap-12 mb-12 print-section">
          <div>
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--tj-muted)] mb-4">{r.itemization}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>1. Weekly Rental - Standard Rate</span>
                <span>{formatCurrency(standardRate)}</span>
              </div>
              {hasHardshipDiscount && (
                <div className="flex justify-between text-[#8a6b24] font-semibold">
                  <span>2. Hardship Discount (-{hardshipPercent}%) - {hardshipWeekLabel} only</span>
                  <span>- {formatCurrency(hardshipDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-[color:var(--tj-ink)]">
                <span>&nbsp;&nbsp;&nbsp;a. {r.insuranceFee}</span>
                <span>{formatCurrency(data.insuranceFee)}</span>
              </div>
              <div className="flex justify-between text-[color:var(--tj-ink)]">
                <span>&nbsp;&nbsp;&nbsp;b. {r.additionalDriverFee}</span>
                <span>{formatCurrency(data.additionalDriverFee)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-[#1a1a1a]/10 pt-2">
                <span>{hasHardshipDiscount ? '3.' : '2.'} Subtotal (Week 1)</span>
                <span>{formatCurrency(weekOneSubtotal)}</span>
              </div>
              <div className="flex justify-between text-[color:var(--tj-ink)]">
                <span>&nbsp;&nbsp;&nbsp;{s.salesTax} ({data.tax}%)</span>
                <span>{formatCurrency(weekOneTax)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-[#1a1a1a]/10 pt-2">
                <span>{hasHardshipDiscount ? '4.' : '3.'} {r.securityDepositRefundable}</span>
                <span>{formatCurrency(data.securityDeposit)}</span>
              </div>
              <div className="flex justify-between font-bold pt-1 text-lg font-serif">
                <span>{hasHardshipDiscount ? '5.' : '4.'} {s.totalDueAtSigning}</span>
                <span>{formatCurrency(dueAtSigning)}</span>
              </div>
              {hasHardshipDiscount && (
                <p className="text-xs text-[color:var(--tj-muted)] italic border-t border-[#1a1a1a]/10 pt-3">
                  {hardshipWeeks > 1 ? `Week 2 (${formatDate(addWeeks(data.rentalStartDate, 1))}) will be billed at the same Hardship-discounted rate of ${formatCurrency(hardshipRate)}. ` : ''}Week {hardshipWeeks + 1} forward reverts to the Standard Rate of {formatCurrency(standardRate)} per week.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="p-5 bg-[#f8f8f8] rounded-sm">
              <h3 className="font-serif font-bold text-lg uppercase tracking-widest mb-2 text-center">{r.vehicleConditionTitle}</h3>
              <p className="text-xs text-left leading-relaxed">
                {data.vehicleConditionText || r.vehicleConditionText}
              </p>
            </div>
            <div className="p-5 bg-[#8A3A1C]/30 rounded-sm">
              <h3 className="font-serif font-bold text-lg uppercase tracking-widest mb-2 text-center text-[#8A3A1C]">{r.mileagePolicyTitle}</h3>
              <p className="text-xs text-left leading-relaxed text-[#8A3A1C]">
                <strong>MILEAGE ALLOWANCE:</strong> {data.mileageAllowance > 0 ? `${data.mileageAllowance} miles per ${data.rentalPeriod === 'Daily' ? 'day' : data.rentalPeriod === 'Weekly' ? 'week' : 'month'}` : r.mileageUnlimited}. {data.excessMileageCharge > 0 ? `Excess mileage will be charged at ${formatCurrency(data.excessMileageCharge)} ${r.mileagePerMile}` : ''} {r.fuelPolicy}
              </p>
            </div>
          </div>
        </div>

        {/* GPS Tracking Device Disclosure & Consent */}
        <div className="mb-8 p-5 bg-[#8A3A1C]/30 rounded-sm print-section">
          <h3 className="font-serif font-bold text-sm uppercase tracking-widest mb-3 text-center text-[#8A3A1C]">{r.gpsTitle}</h3>
          <div className="text-[10px] text-left leading-relaxed space-y-2 text-[#8A3A1C]">
            <p>{r.gpsDisclosure}</p>
            <p>{r.gpsConsent}</p>
            <p>{r.gpsTampering}</p>
          </div>
        </div>

        </div>{/* end PRINT PAGE 2 */}

        {/* ═══ PRINT PAGE 3: Comprehensive Terms ═══ */}
        <div className="print-page-group">

        {/* Comprehensive Terms */}
        <div className="mb-10 text-[10.5px] text-left space-y-2.5 text-[color:var(--tj-ink)] columns-2 gap-8">
          <p>
            <strong>1. RENTAL AGREEMENT:</strong> Renter agrees to rent the Vehicle described above from ${brand.legal} (&ldquo;Owner&rdquo;) {hasHardshipDiscount ? 'on a continuous weekly basis' : `for the period of ${formatDate(data.rentalStartDate)} through ${formatDate(data.rentalEndDate)}`} commencing {formatDate(data.rentalStartDate)}. The Standard Rate is {formatCurrency(standardRate)} per {data.rentalPeriod === 'Daily' ? 'day' : data.rentalPeriod === 'Weekly' ? 'week' : 'month'}.
            {hasHardshipDiscount && <> Pursuant to the attached Hardship Bridge Program Addendum, a {hardshipPercent}% Hardship Discount is applied to {hardshipWeekLabel}, reducing the weekly rate to {formatCurrency(hardshipRate)} for that limited discount period only. The Standard Rate of {formatCurrency(standardRate)} per week resumes automatically beginning Week {hardshipWeeks + 1} (billing date {formatDate(standardResumeDate)}) and continues each week thereafter until either party terminates this Agreement in writing.</>} The Vehicle is and remains the property of Owner at all times during the rental period.
          </p>

          <p><strong>2. AUTHORIZED DRIVERS:</strong> Only the Renter and any additional authorized drivers listed in this Agreement may operate the Vehicle. All drivers must possess a valid, unrestricted driver&apos;s license issued by a U.S. state. Unauthorized use by any person voids all coverage and constitutes a material breach. Renter is responsible for the actions of all authorized drivers.</p>

          <p><strong>3. INSURANCE:</strong> Renter represents and warrants that Renter maintains, at minimum, automobile liability insurance meeting Texas mandatory minimum requirements ($30,000 bodily injury per person, $60,000 bodily injury per accident, $25,000 property damage) and comprehensive and collision coverage on the Vehicle during the entire rental period. Renter shall provide proof of insurance prior to taking possession. If Renter&apos;s insurance does not provide primary coverage for the rental Vehicle, Renter is personally liable for all damages, losses, and liabilities arising from the use and operation of the Vehicle. Customer must maintain active insurance coverage during the entire rental period. Failure to maintain insurance may result in rental termination, vehicle recovery, and additional fees.</p>

          <p><strong>4. VEHICLE CONDITION:</strong> At the time of delivery, Owner and Renter shall jointly inspect the Vehicle and document its condition on the attached Vehicle Condition Report, including all existing damage, scratches, dents, mechanical condition, tire condition, and mileage. Renter acknowledges receiving the Vehicle in the condition described. Upon return, the Vehicle shall be inspected and any new damage not reflected on the original report shall be the sole responsibility of the Renter. If Renter is not present at the return inspection, Owner&apos;s determination of damage shall be presumed accurate absent clear and convincing evidence to the contrary.</p>

          <p><strong>5. PROHIBITED USE:</strong> The Vehicle shall NOT be used for any of the following purposes, and any such use shall constitute a material breach: (a) by any unauthorized person; (b) by any person under the influence of alcohol, drugs, or any intoxicant; (c) for any illegal purpose, including transporting controlled substances; (d) for commercial purposes, ride-sharing (Uber, Lyft, etc.), delivery services, or hire unless expressly authorized in writing; (e) on unpaved roads, off-road, racing, speed contests, or any competition; (f) to tow or push any vehicle, trailer, or object; (g) outside the State of Texas without prior written consent; (h) by any person who does not possess a valid driver&apos;s license; (i) in a reckless or negligent manner; (j) while overloaded beyond manufacturer&apos;s recommended capacity; (k) in violation of any traffic law.</p>

          <p><strong>6. LATE RETURN:</strong> If the Vehicle is not returned by 5:00 PM on the agreed return date, additional charges will be assessed at the applicable daily rate of {formatCurrency(data.rentalRate / (data.rentalPeriod === 'Daily' ? 1 : data.rentalPeriod === 'Weekly' ? 7 : 30))} plus a late fee of $50.00 per day. Failure to return the Vehicle within forty-eight (48) hours of the agreed return date may be reported to law enforcement as unauthorized use of a motor vehicle.</p>

          <p><strong>7. LATE PAYMENT:</strong> If any rental payment is not received by 5:00 PM on the due date, a late fee of $25.00 per day shall be assessed until payment is received. A fee of $30.00 shall be assessed for any check, electronic payment, or other instrument returned or dishonored for any reason. Following a returned payment, Owner may require all future payments be made by cash, money order, or certified funds.{hasHardshipDiscount && <> Late payment or default during {hardshipWeekLabel} automatically forfeits the Hardship Discount for the remaining discounted week, and the full Standard Rate of {formatCurrency(standardRate)} per week becomes immediately due and payable, as set forth in the Addendum below.</>}</p>

          <p><strong>8. ACCIDENT &amp; THEFT REPORTING:</strong> In the event of any accident, collision, theft, vandalism, or damage to the Vehicle, Renter must: (a) immediately contact local law enforcement and obtain a police report; (b) notify Owner within twenty-four (24) hours by phone at {dealership.phone.display} and in writing within forty-eight (48) hours; (c) not admit fault or liability to any third party; (d) cooperate fully with Owner, Owner&apos;s insurance carrier, and law enforcement in any investigation; (e) provide copies of the police report and all related documentation. Failure to comply with these reporting requirements may result in Renter&apos;s assumption of full liability for all damages and losses.</p>

          <p><strong>9. TOWING &amp; IMPOUND:</strong> If the Vehicle is towed, impounded, or seized by any governmental authority due to Renter&apos;s actions, negligence, or violation of law, Renter shall be solely responsible for all towing fees, impound fees, storage fees, administrative charges, and any fines or penalties. Renter shall notify Owner immediately. Owner reserves the right to recover the Vehicle from any impound facility, and Renter shall reimburse Owner for all costs incurred within five (5) days of demand.</p>

          <p><strong>10. TOLL VIOLATIONS &amp; CITATIONS:</strong> Renter is solely responsible for all toll charges, parking tickets, traffic citations, red-light camera violations, and any other fines or penalties incurred during the rental period. If Owner receives any such citation as the registered owner, Renter shall pay such amount plus an administrative fee of $25.00 per occurrence.</p>

          <p><strong>11. MAINTENANCE, CHECKUPS &amp; REIMBURSEMENT:</strong> Renter shall maintain the Vehicle in good operating condition, including proper fluid levels, tire pressure, and immediate notice of warning lights. Owner may require a vehicle check every {maintenanceIntervalDays} days to verify oil level, tire condition, mileage, warning lights, cleanliness, and damage. Renter shall not authorize mechanical work without Owner&apos;s prior written approval except when continued operation would be unsafe. Emergency oil changes may be reimbursed up to {formatCurrency(oilChangeCap)} only with itemized receipt, odometer photo, and proof the service occurred during the rental period. Amounts above {formatCurrency(oilChangeCap)}, add-ons, unapproved repairs, and tire punctures, road hazard damage, curb damage, or tire replacement are Renter&apos;s responsibility unless Owner determines in writing that the condition existed before delivery.</p>

          <p><strong>12. SMOKING &amp; PET POLICY:</strong> Smoking of any kind (including cigarettes, cigars, e-cigarettes, and vaping devices) is strictly PROHIBITED in the Vehicle. Pets are NOT permitted in the Vehicle unless expressly authorized in writing by Owner. If evidence of smoking or unauthorized pet use is discovered, Renter shall be charged a cleaning/restoration fee of $300.00 in addition to any actual repair or restoration costs.</p>

          <p><strong>13. KEY REPLACEMENT:</strong> Renter is responsible for all keys, key fobs, and remote devices provided with the Vehicle. Lost, stolen, or damaged keys must be reported immediately. Renter shall be charged the actual cost of key replacement, reprogramming, and any related locksmith services.</p>

          <p><strong>14. VEHICLE BREAKDOWN:</strong> If the Vehicle experiences a mechanical breakdown due to no fault of the Renter, Renter shall immediately notify Owner. Owner will, at its option, arrange for repair or provide a substitute vehicle. Renter shall NOT attempt repairs or have repairs performed by any third party without Owner&apos;s prior written consent. If the breakdown is caused by Renter&apos;s misuse or neglect, all repair costs, towing costs, and related expenses shall be Renter&apos;s responsibility.</p>

          <p><strong>15. OWNER&apos;S RIGHT TO RECOVER VEHICLE:</strong> The Vehicle is and remains the property of Owner at all times. If Renter defaults under this Agreement, Owner may immediately terminate this Agreement and take possession of the Vehicle without prior notice or demand, wherever the Vehicle may be found, without liability for trespass or damages, provided Owner does not breach the peace. If the Vehicle is not returned within twenty-four (24) hours of demand, Owner may report the Vehicle as stolen to law enforcement.</p>

          <p><strong>16. RIGHT TO INSPECT:</strong> Owner reserves the right to inspect the Vehicle at any reasonable time during the rental period upon twenty-four (24) hours&apos; notice. Owner may inspect the Vehicle without notice if Owner has a reasonable belief that the Vehicle is being used in violation of this Agreement or is at risk of damage or loss.</p>

          <p><strong>17. EARLY TERMINATION, EARLY RETURN &amp; DEFAULT:</strong> Renter may terminate this Agreement early only by returning the Vehicle, returning all keys and equipment, and paying all amounts owed. If Renter cancels or returns the Vehicle before the paid-through return date for the current rental period, Renter remains responsible for an Early Return Balance equal to the remaining unused days multiplied by the applicable daily rental rate. For this Agreement, the daily rental rate is {formatCurrency(earlyReturnDailyRate)} per day. Example: returning two (2) days before the paid-through return date creates an Early Return Balance of {formatCurrency(earlyReturnExampleAmount)}, plus any unpaid fees, damage, fuel, tolls, citations, cleaning, recovery, or other charges owed under this Agreement. Renter shall be in default if: (a) Renter fails to pay any amount when due; (b) Renter violates any term of this Agreement; (c) Renter fails to maintain required insurance; (d) Renter provides false information; (e) Renter abandons the Vehicle; (f) Renter is arrested while operating the Vehicle. Upon default, Owner may terminate this Agreement immediately, take possession of the Vehicle, and Renter shall be liable for all unpaid rental charges, damage, and costs of recovery.</p>

          <p><strong>18. PERSONAL PROPERTY:</strong> Owner assumes no responsibility for loss of or damage to any personal property left in or on the Vehicle. Renter should remove all personal belongings before returning the Vehicle. Personal property not claimed within thirty (30) days of return may be disposed of at Owner&apos;s discretion.</p>

          <p><strong>19. INDEMNIFICATION:</strong> Renter agrees to indemnify, defend, and hold harmless Owner, its owners, officers, employees, and agents from and against any and all claims, demands, losses, damages, liabilities, costs, and expenses (including reasonable attorney&apos;s fees) arising out of or related to: (a) Renter&apos;s use, operation, or possession of the Vehicle; (b) any accident, injury, or damage involving the Vehicle during the rental period; (c) any violation of law by Renter; (d) any breach of this Agreement. THIS INDEMNIFICATION INCLUDES CLAIMS ARISING FROM RENTER&apos;S OWN NEGLIGENCE BUT DOES NOT APPLY TO CLAIMS ARISING SOLELY FROM OWNER&apos;S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT.</p>

          <p><strong>20. GOVERNING LAW &amp; JURISDICTION:</strong> This Agreement shall be governed by and construed in accordance with the laws of the State of Texas. Any dispute shall be subject to the exclusive jurisdiction of the state and federal courts located in Harris County, Texas.</p>

          <p><strong>21. ENTIRE AGREEMENT:</strong> This Agreement, together with all addenda and disclosures signed by the parties (including the GPS Disclosure and Vehicle Condition Report), constitutes the entire agreement. No modification shall be valid unless in writing and signed by both parties.</p>

          <p><strong>22. SEVERABILITY:</strong> If any provision of this Agreement is found invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.</p>

          <p><strong>23. WAIVER:</strong> Owner&apos;s failure to enforce any term at any time shall not constitute a waiver of Owner&apos;s right to enforce that term or any other term. Acceptance of late payments shall not constitute a modification of this Agreement.</p>

          <p><strong>24. SECURITY DEPOSIT:</strong> The security deposit of {formatCurrency(data.securityDeposit)} shall be held by Owner for the duration of the rental period. The deposit will be refunded within fourteen (14) days of Vehicle return, less any deductions for: (a) unpaid rental charges or fees; (b) damage to the Vehicle beyond normal wear and tear; (c) excessive cleaning required; (d) missing keys, accessories, or equipment; (e) fuel replacement to restore tank to delivery level; (f) toll violations or traffic citations received after return. Owner will provide an itemized statement of any deductions.</p>
        </div>

        </div>{/* end PRINT PAGE 3 */}

        {hasHardshipDiscount && (
          <div className="print-page-group print-page-break">
            <div className="mb-10 print-section">
              <div className="mb-6 inline-flex bg-[#b89b5e] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[color:var(--tj-ink)]">
                Addendum A - Hardship Bridge Program
              </div>
              <h3 className="font-serif text-3xl font-bold uppercase tracking-widest text-[#1a1a1a]">
                Hardship Bridge Program Addendum
              </h3>
              <p className="mt-3 max-w-3xl text-sm italic leading-relaxed text-[color:var(--tj-muted)]">
                Authorized modification to the standard weekly rental rate, offered on equal terms to all renters who satisfy the eligibility criteria below. This Addendum is incorporated into and forms part of the Vehicle Rental Agreement above.
              </p>
            </div>

            <div className="mb-8 grid grid-cols-3 gap-4 print-section">
              <div className="bg-[#f8f8f8] p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--tj-muted)]">Week 1</div>
                <div className="mt-2 font-serif text-2xl font-bold">{formatCurrency(hardshipRate)}</div>
                <div className="mt-1 text-xs text-[color:var(--tj-muted)]">{formatDate(data.rentalStartDate)}</div>
              </div>
              <div className="bg-[#f8f8f8] p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--tj-muted)]">Week 2</div>
                <div className="mt-2 font-serif text-2xl font-bold">{formatCurrency(hardshipRate)}</div>
                <div className="mt-1 text-xs text-[color:var(--tj-muted)]">{formatDate(addWeeks(data.rentalStartDate, 1))}</div>
              </div>
              <div className="border border-[#b89b5e]/40 bg-[#b89b5e]/10 p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#8a6b24]">Week {hardshipWeeks + 1} Forward</div>
                <div className="mt-2 font-serif text-2xl font-bold">{formatCurrency(standardRate)}</div>
                <div className="mt-1 text-xs text-[color:var(--tj-muted)]">{formatDate(standardResumeDate)} forward</div>
              </div>
            </div>

            <div className="mb-8 text-[10.5px] leading-relaxed text-[color:var(--tj-ink)] columns-2 gap-8">
              <p><strong>A.1 - PURPOSE AND AUTHORITY:</strong> {brand.legal} (&ldquo;Owner&rdquo;) is committed to supporting active renters who experience a verifiable loss-of-vehicle event through no fault of their own. This Addendum establishes the Hardship Bridge Program, a standardized rental rate accommodation offered to every qualifying renter on equal terms.</p>
              <p><strong>A.2 - ELIGIBILITY CRITERIA:</strong> Renter has an active rental history with Owner in good standing; has experienced a verifiable loss-of-vehicle event outside Renter&apos;s fault; has provided documentation such as a police report, accident report, insurance claim number, or internal incident record; has cooperated in good faith with Owner&apos;s recovery, claim, or inspection process; and maintains an active payment method.</p>
              <p><strong>A.3 - QUALIFYING LOSS EVENT:</strong> This Agreement is entered into following the total loss or extended out-of-service event affecting the prior rental unit{data.hardshipPriorVehicleDescription ? ` (${data.hardshipPriorVehicleDescription}${data.hardshipPriorVehicleVin ? `, VIN ${data.hardshipPriorVehicleVin}` : ''})` : ''}{data.hardshipPriorAgreementDate ? ` operated under the preceding rental agreement dated ${formatDate(data.hardshipPriorAgreementDate)}` : ''}. Renter was not at fault for the loss event.</p>
              <p><strong>A.4 - HARDSHIP DISCOUNT TERMS:</strong> The Standard Rate for the Vehicle is {formatCurrency(standardRate)} per week. Owner grants Renter a {hardshipPercent}% Hardship Discount applied to {hardshipWeekLabel} only, reducing the weekly rate to {formatCurrency(hardshipRate)} for that limited discount period. Beginning Week {hardshipWeeks + 1}, the Standard Rate resumes automatically without further notice.</p>
              <p><strong>A.5 - PAYMENT TERMS:</strong> All payments are due weekly on the billing dates stated in the Payment Schedule above. This is a continuous weekly rental. The rental does not terminate at the end of the Hardship Discount period.</p>
              <p><strong>A.6 - DEFAULT; FORFEITURE:</strong> If Renter fails to timely pay any weekly installment during the discount period, or otherwise defaults under the Agreement, the Hardship Discount is immediately forfeited. The weekly rate reverts to the Standard Rate, any discount already extended may become immediately due, and Owner may exercise all rights under the Agreement including vehicle recovery.</p>
              <p><strong>A.7 - CLAIMS AND SETTLEMENTS:</strong> Nothing in this Addendum conditions Renter&apos;s payment obligations on the timing or outcome of any insurance claim, injury claim, or third-party settlement arising from the prior loss event.</p>
              <p><strong>A.8 - NO ADMISSION OF LIABILITY:</strong> This accommodation is a commercial courtesy made in the ordinary course of business and is not an admission of fault, liability, or responsibility by Owner.</p>
              <p><strong>A.9 - LIMITED DURATION:</strong> The Hardship Discount is personal to the Renter named above, applies only to the stated weeks, and is not assignable or transferable.</p>
              <p><strong>A.10 - ACKNOWLEDGMENT:</strong> By initialing and signing below, Renter acknowledges the Standard Rate, the limited discount period, the automatic Standard Rate resumption date, and the default consequences stated in this Addendum.</p>
            </div>

            <div className="grid grid-cols-2 gap-12 print-section">
              <div className="p-4">
                <div className="h-10 border-b border-[#1a1a1a]"></div>
                <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-[color:var(--tj-muted)]">
                  Renter Initials - {data.renterName}
                </div>
              </div>
              <div className="p-4">
                <div className="h-10 border-b border-[#1a1a1a]"></div>
                <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-[color:var(--tj-muted)]">
                  Date
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PRINT PAGE 4: ID & Signatures ═══ */}
        <div className="print-page-group">

        {/* Customer ID Photo */}
        {signatures.buyerIdPhoto && (
          <div className="mb-10 p-4 flex items-center space-x-6">
            {isRenderableImageSrc(signatures.buyerIdPhoto) ? (
              <img src={signatures.buyerIdPhoto} alt="Customer ID" className="h-28 object-contain rounded border border-[#1a1a1a]/10" />
            ) : (
              <p className="rounded-sm border border-[#b89b5e]/35 bg-[#b89b5e]/5 px-3 py-1.5 text-xs font-semibold text-[color:var(--tj-ink)]">
                ID on file with {brand.full}.
              </p>
            )}
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--tj-muted)]">{s.customerIdOnFile}</p>
              <p className="text-sm font-medium mt-1">{data.renterName}</p>
            </div>
          </div>
        )}

        {/* SMS Consent */}
        <SmsConsentSection checked={smsConsent} strings={stringsProp} />

        {/* Signatures */}
        <div className="space-y-12 p-8 print-signatures">
          <div className="text-sm font-bold mb-8 text-center font-serif text-lg">
            {r.signatureAgreement}
          </div>

          <div className="grid grid-cols-2 gap-16">
            <SignatureLinePreview label={r.renterSignature} signatureImage={signatures.buyerSignature} signatureDate={signatures.buyerSignatureDate} printedName={data.renterName} />
            <SignatureLinePreview label={r.additionalDriverSignature} signatureImage={signatures.coBuyerSignature} signatureDate={signatures.coBuyerSignatureDate} printedName={data.coRenterName} />
          </div>

          <div className="grid grid-cols-2 gap-16 mt-8">
            <SignatureLinePreview
              label={`${s.dealerRepSignature} - ${s.driverLicense} ${representativeLicense}`}
              signatureImage={signatures.dealerSignature}
              signatureDate={signatures.dealerSignatureDate}
              printedName={representativeName}
            />
          </div>
        </div>

        </div>{/* end PRINT PAGE 4 */}

        {/* Full Payment Tracking Schedule (Page Break for Print) */}
        {trackingRows.length > 0 && (
          <div className="mt-20 pt-12 border-t-2 border-[#1a1a1a] print-page-break">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-serif font-bold uppercase tracking-widest">{r.paymentTracking}</h3>
              <p className="text-xs text-[color:var(--tj-muted)] mt-2 tracking-wider uppercase">
                {data.renterName && <span className="font-semibold">{data.renterName}</span>}
                {data.renterName && ' · '}
                {data.vehicleYear} {data.vehicleMake} {data.vehicleModel}
                {data.vehicleVin && <span className="font-mono ml-2">({data.vehicleVin})</span>}
              </p>
              <p className="text-xs text-[color:var(--tj-muted)] mt-1">
                {hasHardshipDiscount
                  ? `Continuous weekly rental - Standard Rate ${formatCurrency(standardRate)}/wk - ${hardshipPercent}% Hardship Discount applied ${hardshipWeekLabel} - Commences ${formatDate(data.rentalStartDate)}`
                  : `${formatCurrency(perPeriodAmount)} / ${periodSingular} - ${duration} payments - ${formatDate(data.rentalStartDate)} - ${formatDate(data.rentalEndDate)}`}
              </p>
            </div>

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#1a1a1a] text-[color:var(--tj-white)]">
                  <th className="p-3 text-left font-semibold text-[10px] tracking-wider uppercase w-10">#</th>
                  <th className="p-3 text-left font-semibold text-[10px] tracking-wider uppercase">{r.dueDate}</th>
                  <th className="p-3 text-right font-semibold text-[10px] tracking-wider uppercase">{r.rental}</th>
                  <th className="p-3 text-left font-semibold text-[10px] tracking-wider uppercase">Program</th>
                  <th className="p-3 text-right font-semibold text-[10px] tracking-wider uppercase">{r.tax}</th>
                  <th className="p-3 text-right font-semibold text-[10px] tracking-wider uppercase">{r.amountDue}</th>
                  <th className="p-3 text-right font-semibold text-[10px] tracking-wider uppercase">{r.balance}</th>
                  <th className="p-3 text-center font-semibold text-[10px] tracking-wider uppercase" style={{ minWidth: '100px' }}>{r.datePaid}</th>
                  <th className="p-3 text-center font-semibold text-[10px] tracking-wider uppercase" style={{ minWidth: '80px' }}>{r.method}</th>
                  <th className="p-3 text-center font-semibold text-[10px] tracking-wider uppercase" style={{ minWidth: '60px' }}>{r.initials}</th>
                </tr>
              </thead>
              <tbody>
                {data.securityDeposit > 0 && (
                  <tr className="border-b border-[#1a1a1a]/20 bg-[#b89b5e]/5">
                    <td className="p-3 font-bold text-[#b89b5e]" data-label="#">-</td>
                    <td className="p-3 font-medium" data-label={r.dueDate}>{formatDate(data.rentalStartDate)}</td>
                    <td className="p-3 text-right text-[color:var(--tj-muted)]" data-label={r.rental}>-</td>
                    <td className="p-3 text-left text-[color:var(--tj-ink)]" data-label="Program">Security Deposit</td>
                    <td className="p-3 text-right text-[color:var(--tj-muted)]" data-label={r.tax}>-</td>
                    <td className="p-3 text-right font-bold" data-label={r.amountDue}>{formatCurrency(data.securityDeposit)}</td>
                    <td className="p-3 text-right text-[color:var(--tj-muted)] text-[10px] uppercase tracking-wider" data-label={r.balance}>{r.deposit}</td>
                    <td className="p-3 border-b border-dashed border-[#1a1a1a]/30" data-label={r.datePaid}></td>
                    <td className="p-3 border-b border-dashed border-[#1a1a1a]/30" data-label={r.method}></td>
                    <td className="p-3 border-b border-dashed border-[#1a1a1a]/30" data-label={r.initials}></td>
                  </tr>
                )}
                {trackingRows.map((payment, idx) => (
                  <tr key={`${payment.paymentNumber}-${payment.dueDate}`} className={`border-b border-[#1a1a1a]/10 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f5f2ed]/20'}`}>
                    <td className="p-3 font-bold text-[color:var(--tj-muted)]" data-label="#">{payment.paymentNumber}</td>
                    <td className="p-3 font-medium" data-label={r.dueDate}>{formatDate(payment.dueDate)}</td>
                    <td className="p-3 text-right" data-label={r.rental}>{formatCurrency(payment.rental)}</td>
                    <td className="p-3 text-left text-[11px]" data-label="Program">{payment.program}</td>
                    <td className="p-3 text-right" data-label={r.tax}>{formatCurrency(payment.tax)}</td>
                    <td className="p-3 text-right font-bold font-serif" data-label={r.amountDue}>{formatCurrency(payment.amountDue)}</td>
                    <td className="p-3 text-right font-serif" data-label={r.balance}>{payment.balanceAfter}</td>
                    <td className="p-3 border-b border-dashed border-[#1a1a1a]/30" data-label={r.datePaid}></td>
                    <td className="p-3 border-b border-dashed border-[#1a1a1a]/30" data-label={r.method}></td>
                    <td className="p-3 border-b border-dashed border-[#1a1a1a]/30" data-label={r.initials}></td>
                  </tr>
                ))}
                {hasHardshipDiscount && (
                  <tr className="border-b border-[#1a1a1a]/10 bg-[#f8f8f8]">
                    <td className="p-3 font-bold text-[color:var(--tj-muted)]">...</td>
                    <td className="p-3 font-medium">continues weekly</td>
                    <td className="p-3 text-right">{formatCurrency(standardRate)}</td>
                    <td className="p-3" colSpan={7}>Continuous weekly rental at Standard Rate until terminated in writing by either party.</td>
                  </tr>
                )}
                {/* Totals row */}
                <tr className="bg-[#1a1a1a] text-[color:var(--tj-white)] font-bold">
                  <td className="p-3" colSpan={5}>
                    <span className="text-[10px] tracking-widest uppercase">{hasHardshipDiscount ? 'Open weekly schedule' : r.total}</span>
                  </td>
                  <td className="p-3 text-right font-serif">{hasHardshipDiscount ? `${formatCurrency(standardRate)} / wk` : formatCurrency(totals.grandTotal)}</td>
                  <td className="p-3 text-right font-serif">{hasHardshipDiscount ? '-' : formatCurrency(0)}</td>
                  <td className="p-3" colSpan={3}></td>
                </tr>
              </tbody>
            </table>

            {/* Legend / Notes */}
            <div className="mt-6 grid grid-cols-2 gap-8 text-[10px] text-[color:var(--tj-muted)]">
              <div>
                <p className="font-bold uppercase tracking-widest mb-1">{r.paymentMethods}</p>
                <p>{Object.entries(dealership.payments).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") || "Payment methods confirmed at the office."}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-widest mb-1">{r.notes}</p>
                <p>{hasHardshipDiscount ? `Late payments are subject to a $25.00/day late fee. Late payment during ${hardshipWeekLabel} automatically forfeits the ${hardshipPercent}% Hardship Discount. Week ${hardshipWeeks + 1} forward is billed at the Standard Rate of ${formatCurrency(standardRate)}/week on a continuous weekly basis until terminated in writing.` : r.latePaymentNote} Early returns before the paid-through return date are billed at {formatCurrency(earlyReturnDailyRate)} per unused day. Security deposit of {formatCurrency(data.securityDeposit)} is refundable upon vehicle return in satisfactory condition.</p>
              </div>
            </div>

            {/* Owner & Renter copy acknowledgment */}
            <div className="mt-10 grid grid-cols-2 gap-16">
              <div className="p-6">
                <h4 className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--tj-muted)] mb-4">{r.ownerCopy}</h4>
                <div className="border-b border-[#1a1a1a] h-8 mb-2"></div>
                <div className="flex justify-between text-[10px] uppercase tracking-widest font-semibold">
                  <span>{s.dealerRepSignature}</span>
                  <span>{s.date}</span>
                </div>
              </div>
              <div className="p-6">
                <h4 className="text-[10px] font-bold tracking-widest uppercase text-[color:var(--tj-muted)] mb-4">{r.renterCopy}</h4>
                <div className="border-b border-[#1a1a1a] h-8 mb-2"></div>
                <div className="flex justify-between text-[10px] uppercase tracking-widest font-semibold">
                  <span>{r.renterSignature}</span>
                  <span>{s.date}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Single-copy mode for PDF generation
  if (copyLabel) {
    return renderContract(copyLabel);
  }

  // Default: dual-copy for screen + print
  return (
    <>
      {/* ═══ RENTER'S COPY (visible on screen + print) ═══ */}
      {renderContract(s.renterCopy)}

      {/* ═══ DEALER'S COPY (print-only. Hidden on screen) ═══ */}
      <div className="print-only-copy">
        {renderContract(s.dealerCopy)}
      </div>
    </>
  );
}
