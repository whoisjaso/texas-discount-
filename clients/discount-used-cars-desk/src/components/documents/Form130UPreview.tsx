/* eslint-disable @next/next/no-img-element */
import { Form130UData, calculateTax, formatCurrency } from '@/lib/documents/form130U';
import { format } from 'date-fns';
import { SignatureData } from '@/lib/documents/shared';
import { getDocStrings, type DocLocale } from '@/lib/documents/i18n';
import { DEALER } from '@/lib/fill-130u/field-mapping';
import { brand } from "@/lib/dealership-config";

interface Props {
  data: Form130UData;
  signatures: SignatureData;
  locale?: DocLocale;
}

const CB = ({ checked }: { checked: boolean }) => (
  <span className="inline-block w-[11px] h-[11px] border border-black mr-1 align-middle text-center leading-[11px] text-[8px] font-bold"
    style={{ fontFamily: 'Arial, sans-serif' }}>
    {checked ? 'X' : '\u00A0'}
  </span>
);

export default function Form130UPreview({ data, signatures, locale }: Props) {
  const tax = calculateTax(data);

  /**
   * A date, as typed on the form or as stamped by a signature.
   *
   * Form dates arrive as YYYY-MM-DD and want a noon anchor so the day does
   * not slip across a timezone. Signature dates arrive as full ISO
   * timestamps from the pad, and appending noon to one of those produced an
   * invalid date that threw on the render route the moment a buyer signed
   * the 130-U on screen. Anything unparseable prints as given rather than
   * taking the page down.
   */
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parsed = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
    if (Number.isNaN(parsed.getTime())) return dateStr;
    return format(parsed, 'MM/dd/yyyy');
  };

  const applicantFullName = data.applicantType === 'Individual'
    ? [data.applicantFirstName, data.applicantMiddleName, data.applicantLastName, data.applicantSuffix].filter(Boolean).join(' ')
    : data.applicantEntityName;

  const vehicleLocationFull = data.vehicleLocationSameAsMailing
    ? [data.mailingAddress, data.mailingCity, data.mailingState, data.mailingZip].filter(Boolean).join(', ')
    : [data.vehicleLocationAddress, data.vehicleLocationCity, data.vehicleLocationState, data.vehicleLocationZip].filter(Boolean).join(', ');

  const vehicleLocationCounty = data.vehicleLocationSameAsMailing
    ? data.countyOfResidence
    : data.vehicleLocationCounty;

  // Styles for government form
  const cellClass = "border border-black px-1.5 py-1";
  const labelClass = "text-[8.5px] text-[#444444] uppercase tracking-[0.04em] leading-tight block";
  const valueClass = "text-[11px] font-medium leading-tight mt-0.5 min-h-[14px]";
  const sectionHeaderClass = "bg-[color:var(--tj-surface)] text-white text-[8px] font-bold uppercase tracking-wider px-2 py-1";

  return (
    <div className="bg-white text-[color:var(--tj-ink)] max-w-[8.5in] mx-auto relative print:m-0 print-doc"
      style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', padding: '0.3in 0.4in' }}>

      {/* === HEADER === */}
      <div className="flex items-start justify-between border-b-2 border-black pb-2 mb-2">
        <div className="flex items-center space-x-3">
          <div className="text-center leading-tight">
            <div className="text-[9px] font-bold">STATE OF TEXAS</div>
            <div className="text-[8px] text-[color:var(--tj-muted)]">Texas Department of</div>
            <div className="text-[8px] text-[color:var(--tj-muted)]">Motor Vehicles</div>
          </div>
        </div>
        <div className="text-center flex-1 px-4">
          <div className="text-[14px] font-bold tracking-wide">APPLICATION FOR TEXAS TITLE</div>
          <div className="text-[14px] font-bold tracking-wide">AND/OR REGISTRATION</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold">Form 130-U</div>
          <div className="text-[7px] text-[color:var(--tj-muted)]">(Rev. 02/23)</div>
          {data.saleDate && <div className="text-[8px] mt-1">Date: {formatDate(data.saleDate)}</div>}
        </div>
      </div>

      {/* === SPANISH INSTRUCTION HEADER === */}
      {locale === 'es' && (
        <div className="border-2 border-[#46526B] bg-[#46526B]/6 rounded px-3 py-2 mb-2">
          <div className="text-[10px] font-bold text-[#46526B] uppercase tracking-wider mb-1">
            {getDocStrings('es').form130U.spanishHeaderTitle}
          </div>
          <p className="text-[9px] text-[#46526B] leading-relaxed">
            {getDocStrings('es').form130U.spanishHeader}
          </p>
        </div>
      )}

      {/* === APPLICATION TYPE === */}
      <div className="border border-black mb-2">
        <div className={sectionHeaderClass}>Applying For</div>
        <div className="px-2 py-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[9px]">
          <label className="flex items-center">
            <CB checked={data.applicationType === 'titleAndRegistration'} />
            <span>Title and Registration</span>
          </label>
          <label className="flex items-center">
            <CB checked={data.applicationType === 'titleOnly'} />
            <span>Title Only</span>
          </label>
          <label className="flex items-center">
            <CB checked={data.applicationType === 'registrationOnly'} />
            <span>Registration Purposes Only</span>
          </label>
          <label className="flex items-center">
            <CB checked={data.applicationType === 'nontitle'} />
            <span>Nontitle Registration</span>
          </label>
        </div>
      </div>

      {/* === VEHICLE DESCRIPTION (Fields 1-12) === */}
      <div className="border border-black mb-2">
        <div className={sectionHeaderClass}>Vehicle Description</div>
        <table className="w-full border-collapse">
          <tbody>
            {/* Row 1: VIN */}
            <tr>
              <td colSpan={6} className={cellClass}>
                <span className={labelClass}>1. Vehicle Identification Number (VIN)</span>
                <div className={`${valueClass} font-mono tracking-[0.15em] uppercase text-[12px]`}>{data.vin}</div>
              </td>
            </tr>
            {/* Row 2: Year, Make, Body Style, Model, Major Color, Minor Color */}
            <tr>
              <td className={cellClass} style={{ width: '12%' }}>
                <span className={labelClass}>2. Year</span>
                <div className={valueClass}>{data.year}</div>
              </td>
              <td className={cellClass} style={{ width: '16%' }}>
                <span className={labelClass}>3. Make</span>
                <div className={valueClass}>{data.make}</div>
              </td>
              <td className={cellClass} style={{ width: '16%' }}>
                <span className={labelClass}>4. Body Style</span>
                <div className={valueClass}>{data.bodyStyle}</div>
              </td>
              <td className={cellClass} style={{ width: '20%' }}>
                <span className={labelClass}>5. Model</span>
                <div className={valueClass}>{data.model}</div>
              </td>
              <td className={cellClass} style={{ width: '18%' }}>
                <span className={labelClass}>6. Major Color</span>
                <div className={valueClass}>{data.majorColor}</div>
              </td>
              <td className={cellClass} style={{ width: '18%' }}>
                <span className={labelClass}>7. Minor Color</span>
                <div className={valueClass}>{data.minorColor}</div>
              </td>
            </tr>
            {/* Row 3: License Plate, Odometer, Brand, Empty Wt, Carrying Cap */}
            <tr>
              <td colSpan={2} className={cellClass}>
                <span className={labelClass}>8. Texas License Plate No.</span>
                <div className={`${valueClass} uppercase`}>{data.licensePlateNo}</div>
              </td>
              <td className={cellClass}>
                <span className={labelClass}>9. Odometer Reading</span>
                <div className={`${valueClass} font-mono`}>{data.odometerReading}</div>
              </td>
              <td className={cellClass}>
                <span className={labelClass}>10. Odometer Brand</span>
                <div className={valueClass}>
                  <span className="text-[8px]">
                    <CB checked={data.odometerBrand === 'A'} /><span className="mr-1">Actual</span>
                    <CB checked={data.odometerBrand === 'N'} /><span className="mr-1">Not Actual</span>
                    <CB checked={data.odometerBrand === 'X'} /><span>Exempt</span>
                  </span>
                </div>
              </td>
              <td className={cellClass}>
                <span className={labelClass}>11. Empty Wt (lbs)</span>
                <div className={valueClass}>{data.emptyWeight}</div>
              </td>
              <td className={cellClass}>
                <span className={labelClass}>12. Carrying Cap (lbs)</span>
                <div className={valueClass}>{data.carryingCapacity}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* === APPLICANT / OWNER INFORMATION (Fields 14-21) === */}
      <div className="border border-black mb-2">
        <div className={sectionHeaderClass}>Applicant / Owner Information</div>
        <table className="w-full border-collapse">
          <tbody>
            {/* Row 1: Applicant Type, ID Number, ID Type, ID State */}
            <tr>
              <td colSpan={2} className={cellClass}>
                <span className={labelClass}>14. Applicant Type</span>
                <div className={valueClass}>
                  <span className="text-[8px]">
                    <CB checked={data.applicantType === 'Individual'} /><span className="mr-1">Individual</span>
                    <CB checked={data.applicantType === 'Business'} /><span className="mr-1">Business</span>
                    <CB checked={data.applicantType === 'Government'} /><span className="mr-1">Government</span>
                    <CB checked={data.applicantType === 'Trust'} /><span className="mr-1">Trust</span>
                    <CB checked={data.applicantType === 'Non-Profit'} /><span>Non-Profit</span>
                  </span>
                </div>
              </td>
              <td className={cellClass}>
                <span className={labelClass}>Photo ID No. / FEIN</span>
                <div className={`${valueClass} font-mono uppercase`}>{data.applicantIdNumber}</div>
              </td>
              <td className={cellClass}>
                <span className={labelClass}>15. ID Type</span>
                <div className={valueClass}>{data.applicantIdType}</div>
              </td>
              <td className={cellClass}>
                <span className={labelClass}>State</span>
                <div className={`${valueClass} uppercase`}>{data.applicantIdState}</div>
              </td>
            </tr>
            {/* Row 2: Name */}
            <tr>
              {data.applicantType === 'Individual' ? (
                <>
                  <td className={cellClass}>
                    <span className={labelClass}>16. First Name</span>
                    <div className={valueClass}>{data.applicantFirstName}</div>
                  </td>
                  <td className={cellClass}>
                    <span className={labelClass}>Middle Name</span>
                    <div className={valueClass}>{data.applicantMiddleName}</div>
                  </td>
                  <td colSpan={2} className={cellClass}>
                    <span className={labelClass}>Last Name</span>
                    <div className={valueClass}>{data.applicantLastName}</div>
                  </td>
                  <td className={cellClass}>
                    <span className={labelClass}>Suffix</span>
                    <div className={valueClass}>{data.applicantSuffix}</div>
                  </td>
                </>
              ) : (
                <td colSpan={5} className={cellClass}>
                  <span className={labelClass}>16. Entity / Organization Name</span>
                  <div className={valueClass}>{data.applicantEntityName}</div>
                </td>
              )}
            </tr>
            {/* Row 3: Co-Applicant */}
            <tr>
              <td colSpan={5} className={cellClass}>
                <span className={labelClass}>17. Additional Applicant / Co-Owner Name</span>
                <div className={valueClass}>{data.coApplicantName}</div>
              </td>
            </tr>
            {/* Row 4: Mailing Address */}
            <tr>
              <td colSpan={2} className={cellClass}>
                <span className={labelClass}>18. Mailing Address</span>
                <div className={valueClass}>{data.mailingAddress}</div>
              </td>
              <td className={cellClass}>
                <span className={labelClass}>City</span>
                <div className={valueClass}>{data.mailingCity}</div>
              </td>
              <td className={cellClass}>
                <span className={labelClass}>State</span>
                <div className={`${valueClass} uppercase`}>{data.mailingState}</div>
              </td>
              <td className={cellClass}>
                <span className={labelClass}>ZIP</span>
                <div className={valueClass}>{data.mailingZip}</div>
              </td>
            </tr>
            {/* Row 5: County, DOB, Phone */}
            <tr>
              <td colSpan={2} className={cellClass}>
                <span className={labelClass}>19. County of Residence</span>
                <div className={valueClass}>{data.countyOfResidence}</div>
              </td>
              <td className={cellClass}>
                <span className={labelClass}>20. Date of Birth</span>
                <div className={valueClass}>{formatDate(data.applicantDob)}</div>
              </td>
              <td colSpan={2} className={cellClass}>
                <span className={labelClass}>21. Phone Number</span>
                <div className={valueClass}>{data.applicantPhone}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* === PREVIOUS OWNER / SELLER (Field 22) === */}
      <div className="border border-black mb-2">
        <div className={sectionHeaderClass}>Previous Owner / Seller</div>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td colSpan={3} className={cellClass} style={{ width: '50%' }}>
                <span className={labelClass}>22. Name of Previous Owner / Seller / Donor / Trader</span>
                <div className={valueClass}>{data.previousOwnerName}</div>
              </td>
              <td className={cellClass} style={{ width: '30%' }}>
                <span className={labelClass}>City</span>
                <div className={valueClass}>{data.previousOwnerCity}</div>
              </td>
              <td className={cellClass} style={{ width: '20%' }}>
                <span className={labelClass}>State</span>
                <div className={`${valueClass} uppercase`}>{data.previousOwnerState}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* === VEHICLE LOCATION (Field 23) === */}
      <div className="border border-black mb-2">
        <div className={sectionHeaderClass}>Vehicle Location Address (if different from mailing)</div>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={cellClass} style={{ width: '35%' }}>
                <span className={labelClass}>23. Street Address</span>
                <div className={valueClass}>{data.vehicleLocationSameAsMailing ? 'SAME AS MAILING ADDRESS' : data.vehicleLocationAddress}</div>
              </td>
              <td className={cellClass} style={{ width: '20%' }}>
                <span className={labelClass}>City</span>
                <div className={valueClass}>{!data.vehicleLocationSameAsMailing ? data.vehicleLocationCity : ''}</div>
              </td>
              <td className={cellClass} style={{ width: '10%' }}>
                <span className={labelClass}>State</span>
                <div className={`${valueClass} uppercase`}>{!data.vehicleLocationSameAsMailing ? data.vehicleLocationState : ''}</div>
              </td>
              <td className={cellClass} style={{ width: '15%' }}>
                <span className={labelClass}>ZIP</span>
                <div className={valueClass}>{!data.vehicleLocationSameAsMailing ? data.vehicleLocationZip : ''}</div>
              </td>
              <td className={cellClass} style={{ width: '20%' }}>
                <span className={labelClass}>County</span>
                <div className={valueClass}>{vehicleLocationCounty}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* === MOTOR VEHICLE TAX STATEMENT === */}
      <div className="border border-black mb-2">
        <div className={sectionHeaderClass}>Motor Vehicle Sales / Use Tax Statement</div>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={`${cellClass} text-right`} style={{ width: '70%' }}>
                <span className="text-[9px]">(a) Sales Price of Motor Vehicle</span>
              </td>
              <td className={`${cellClass} text-right`} style={{ width: '30%' }}>
                <span className="text-[11px] font-bold">{formatCurrency(data.salesPrice)}</span>
              </td>
            </tr>
            <tr>
              <td className={`${cellClass} text-right`}>
                <span className="text-[9px]">(b) Less: Trade-In Allowance</span>
              </td>
              <td className={`${cellClass} text-right`}>
                <span className="text-[11px] font-bold">({formatCurrency(data.tradeInAllowance)})</span>
              </td>
            </tr>
            {data.rebateOrIncentive > 0 && (
              <tr>
                <td className={`${cellClass} text-right`}>
                  <span className="text-[9px]">Less: Rebate / Incentive</span>
                </td>
                <td className={`${cellClass} text-right`}>
                  <span className="text-[11px] font-bold">({formatCurrency(data.rebateOrIncentive)})</span>
                </td>
              </tr>
            )}
            <tr className="bg-[color:var(--tj-surface)]">
              <td className={`${cellClass} text-right`}>
                <span className="text-[9px] font-bold">(c) Net Taxable Amount (a minus b)</span>
              </td>
              <td className={`${cellClass} text-right`}>
                <span className="text-[11px] font-bold">{formatCurrency(tax.netPrice)}</span>
              </td>
            </tr>
            <tr>
              <td className={`${cellClass} text-right`}>
                <span className="text-[9px]">(d) Tax Rate</span>
              </td>
              <td className={`${cellClass} text-right`}>
                <span className="text-[11px] font-bold">{data.taxRate}%</span>
              </td>
            </tr>
            <tr className="bg-[color:var(--tj-surface)]">
              <td className={`${cellClass} text-right border-t-2 border-black`}>
                <span className="text-[9px] font-bold">(e) Motor Vehicle Tax Due (c x d)</span>
              </td>
              <td className={`${cellClass} text-right border-t-2 border-black`}>
                <span className="text-[13px] font-bold">{formatCurrency(tax.taxDue)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* === TRADE-IN (Field 36) === */}
      {(data.tradeInDescription || data.tradeInVin) && (
        <div className="border border-black mb-2">
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className={cellClass} style={{ width: '60%' }}>
                  <span className={labelClass}>36. Trade-In Vehicle Description</span>
                  <div className={valueClass}>{data.tradeInDescription}</div>
                </td>
                <td className={cellClass} style={{ width: '40%' }}>
                  <span className={labelClass}>Trade-In VIN</span>
                  <div className={`${valueClass} font-mono uppercase`}>{data.tradeInVin}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* === FIRST LIENHOLDER (Field 34) === */}
      <div className="border border-black mb-2">
        <div className={sectionHeaderClass}>First Lienholder</div>
        <table className="w-full border-collapse">
          <tbody>
            {data.hasLien ? (
              <>
                <tr>
                  <td className={cellClass}>
                    <span className={labelClass}>33. First Lien Date</span>
                    <div className={valueClass}>{formatDate(data.lienDate)}</div>
                  </td>
                  <td className={cellClass}>
                    <span className={labelClass}>Balance Secured</span>
                    <div className={valueClass}>{data.lienAmount ? formatCurrency(data.lienAmount) : ''}</div>
                  </td>
                  <td colSpan={3} className={cellClass}>
                    <span className={labelClass}>32. eTitle Lienholder ID</span>
                    <div className={valueClass}>{data.etitleLienholderId}</div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className={cellClass}>
                    <span className={labelClass}>34. Lienholder Name</span>
                    <div className={valueClass}>{data.lienholderName}</div>
                  </td>
                  <td colSpan={3} className={cellClass}>
                    <span className={labelClass}>Address</span>
                    <div className={valueClass}>{data.lienholderAddress}</div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className={cellClass}>
                    <span className={labelClass}>City</span>
                    <div className={valueClass}>{data.lienholderCity}</div>
                  </td>
                  <td className={cellClass}>
                    <span className={labelClass}>State</span>
                    <div className={`${valueClass} uppercase`}>{data.lienholderState}</div>
                  </td>
                  <td colSpan={2} className={cellClass}>
                    <span className={labelClass}>ZIP</span>
                    <div className={valueClass}>{data.lienholderZip}</div>
                  </td>
                </tr>
              </>
            ) : (
              <tr>
                <td colSpan={5} className={cellClass}>
                  <span className={labelClass}>34. Lienholder</span>
                  <div className={`${valueClass} font-bold uppercase`}>NONE</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* === REMARKS === */}
      {data.remarks && (
        <div className="border border-black mb-2">
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className={cellClass}>
                  <span className={labelClass}>Remarks</span>
                  <div className={valueClass}>{data.remarks}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* === CERTIFICATION & SIGNATURES === */}
      <div className="border-2 border-black mb-2 mt-3 print-section">
        <div className="bg-black text-white text-[8px] font-bold uppercase tracking-wider px-2 py-1.5 text-center">
          Certification
        </div>
        <div className="px-3 py-2">
          <p className="text-[8px] leading-relaxed text-left">
            I (we) certify under penalty of perjury that all facts stated in this application are true and correct. I (we) understand that
            it is a third-degree felony to sign this application knowing any part of it is false. I (we) authorize the Texas Department
            of Motor Vehicles to process this application and issue a Texas Certificate of Title and/or registration as indicated.
          </p>
        </div>

        {/* Customer ID Photo */}
        {signatures.buyerIdPhoto && (
          <div className="px-3 py-2 border-t border-black flex items-center space-x-4">
            <img src={signatures.buyerIdPhoto} alt="Applicant ID" className="h-16 object-contain border border-[color:var(--tj-line)]" />
            <div>
              <span className="text-[7px] text-[color:var(--tj-muted)] uppercase block">Applicant Photo ID on File</span>
              <span className="text-[10px] font-medium">{applicantFullName}</span>
            </div>
          </div>
        )}

        {/* Signature Lines */}
        <div className="grid grid-cols-2 gap-0">
          {/* Seller/Dealer */}
          <div className="border-t border-r border-black px-3 py-2">
            <span className="text-[7px] text-[color:var(--tj-muted)] uppercase block mb-1">Seller / Donor / Trader Signature</span>
            <div className="border-b border-black h-10 mb-1 relative flex items-end">
              {signatures.dealerSignature && (
                <img src={signatures.dealerSignature} alt="Dealer Signature" className="h-9 max-w-[160px] object-contain absolute bottom-0 left-1" />
              )}
              {signatures.dealerSignatureDate && (
                <span className="absolute bottom-0 right-0 text-[8px]">{formatDate(signatures.dealerSignatureDate)}</span>
              )}
            </div>
            <div className="flex justify-between text-[7px] text-[color:var(--tj-muted)] uppercase">
              <span>{DEALER.name} ({DEALER.gdn})</span>
              <span>Date</span>
            </div>
          </div>
          {/* Applicant/Owner */}
          <div className="border-t border-black px-3 py-2">
            <span className="text-[7px] text-[color:var(--tj-muted)] uppercase block mb-1">Applicant / Owner Signature</span>
            <div className="border-b border-black h-10 mb-1 relative flex items-end">
              {signatures.buyerSignature && (
                <img src={signatures.buyerSignature} alt="Applicant Signature" className="h-9 max-w-[160px] object-contain absolute bottom-0 left-1" />
              )}
              {signatures.buyerSignatureDate && (
                <span className="absolute bottom-0 right-0 text-[8px]">{formatDate(signatures.buyerSignatureDate)}</span>
              )}
            </div>
            <div className="flex justify-between text-[7px] text-[color:var(--tj-muted)] uppercase">
              <span>{applicantFullName}</span>
              <span>Date</span>
            </div>
          </div>
        </div>

        {/* Co-Applicant signature */}
        {data.coApplicantName && (
          <div className="grid grid-cols-2 gap-0">
            <div className="border-t border-r border-black px-3 py-2">
              <span className="text-[7px] text-[color:var(--tj-muted)] uppercase block mb-1">Printed Name of Seller</span>
              <div className="border-b border-black h-8 mb-1 flex items-end px-1">
                <span className="text-[10px]">{brand.legal}</span>
              </div>
              <div className="flex justify-between text-[7px] text-[color:var(--tj-muted)] uppercase">
                <span>Name</span>
                <span>Title</span>
              </div>
            </div>
            <div className="border-t border-black px-3 py-2">
              <span className="text-[7px] text-[color:var(--tj-muted)] uppercase block mb-1">Co-Applicant / Co-Owner Signature</span>
              <div className="border-b border-black h-8 mb-1 relative flex items-end">
                {signatures.coBuyerSignature && (
                  <img src={signatures.coBuyerSignature} alt="Co-Applicant" className="h-7 max-w-[160px] object-contain absolute bottom-0 left-1" />
                )}
                {signatures.coBuyerSignatureDate && (
                  <span className="absolute bottom-0 right-0 text-[8px]">{formatDate(signatures.coBuyerSignatureDate)}</span>
                )}
              </div>
              <div className="flex justify-between text-[7px] text-[color:var(--tj-muted)] uppercase">
                <span>{data.coApplicantName}</span>
                <span>Date</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* === COUNTY USE ONLY === */}
      <div className="border border-black">
        <div className="bg-[color:var(--tj-surface)] text-[7px] font-bold uppercase tracking-wider px-2 py-1 text-center text-[color:var(--tj-muted)]">
          For County Tax Assessor-Collector Use Only
        </div>
        <div className="grid grid-cols-4 gap-0">
          <div className={`${cellClass} min-h-[35px]`}>
            <span className="text-[7px] text-[#444444] uppercase">Receipt No.</span>
          </div>
          <div className={`${cellClass} min-h-[35px]`}>
            <span className="text-[7px] text-[#444444] uppercase">Date Processed</span>
          </div>
          <div className={`${cellClass} min-h-[35px]`}>
            <span className="text-[7px] text-[#444444] uppercase">Fees Collected</span>
          </div>
          <div className={`${cellClass} min-h-[35px]`}>
            <span className="text-[7px] text-[#444444] uppercase">Clerk Initials</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-2 text-[7px] text-[#444444]">
        Form 130-U (Rev. 02/23) &mdash; Texas Department of Motor Vehicles &mdash; www.txdmv.gov
      </div>
    </div>
  );
}
