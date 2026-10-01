/* eslint-disable @next/next/no-img-element */
import { ContractData, calculatePayment, formatCurrency } from '@/lib/documents/finance';
import { addWeeks, addMonths, format } from 'date-fns';
import { SignatureData, DEALER_LICENSE } from '@/lib/documents/shared';
import SignatureLinePreview from '@/components/documents/SignatureLinePreview';
import { getDocStrings, type DocStrings } from '@/lib/documents/i18n';
import SmsConsentSection from '@/components/documents/SmsConsentSection';
import DocumentLetterhead from '@/components/documents/DocumentLetterhead';

interface Props {
  data: ContractData;
  signatures: SignatureData;
  copyLabel?: string;
  strings?: DocStrings;
  smsConsent?: boolean;
}

export default function ContractPreview({ data, signatures, copyLabel, strings: stringsProp, smsConsent }: Props) {
  const t = stringsProp || getDocStrings('en');
  const s = t.shared;
  const c = t.contract;
  const totalCashPrice =
    data.cashPrice + data.tax + data.titleFee + data.registrationFee + data.docFee;
  const amountFinanced = Math.max(0, totalCashPrice - data.downPayment);
  // The payment as agreed when the desk agreed the payment; otherwise the
  // equal one the rate and count produce. The last payment is the remainder.
  const paymentAmount =
    data.paymentAmount && data.paymentAmount > 0
      ? data.paymentAmount
      : calculatePayment(amountFinanced, data.apr, data.numberOfPayments, data.paymentFrequency);
  const lastPaymentAmount =
    data.lastPaymentAmount && data.lastPaymentAmount > 0 ? data.lastPaymentAmount : paymentAmount;
  const hasShorterLast = Math.abs(lastPaymentAmount - paymentAmount) >= 0.01;
  const totalOfPayments =
    data.numberOfPayments > 0 ? paymentAmount * (data.numberOfPayments - 1) + lastPaymentAmount : 0;
  const financeCharge = totalOfPayments - amountFinanced;
  const hasCoBuyer = Boolean(
    data.coBuyerName ||
    data.coBuyerAddress ||
    data.coBuyerPhone ||
    data.coBuyerEmail,
  );

  const generateSchedule = () => {
    if (!data.firstPaymentDate || data.numberOfPayments <= 0 || paymentAmount <= 0) return [];

    const schedule = [];
    let currentDate = new Date(data.firstPaymentDate);
    currentDate = new Date(currentDate.getTime() + currentDate.getTimezoneOffset() * 60000);

    for (let i = 1; i <= data.numberOfPayments; i++) {
      schedule.push({
        paymentNumber: i,
        date: format(currentDate, 'MM/dd/yyyy'),
        amount: i === data.numberOfPayments ? lastPaymentAmount : paymentAmount,
      });

      if (data.paymentFrequency === 'Weekly') {
        currentDate = addWeeks(currentDate, 1);
      } else if (data.paymentFrequency === 'Bi-weekly') {
        currentDate = addWeeks(currentDate, 2);
      } else if (data.paymentFrequency === 'Monthly') {
        currentDate = addMonths(currentDate, 1);
      }
    }
    return schedule;
  };

  /** Matches the bill of sale, so a packet reads with one date format. */
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${m}/${d}/${y}`;
  };

  const schedule = generateSchedule();
  const estimatedCompletionDate = schedule.length > 0 ? schedule[schedule.length - 1].date : 'N/A';

  return (
    <div className="doc-sheet p-10 md:p-16 max-w-5xl mx-auto relative print-doc">
      {/* Print copy label. Hidden on screen, shown in print */}
      {copyLabel && (
        <div className="print-copy-label text-center text-[10px] font-bold tracking-[0.3em] uppercase text-[color:var(--tj-muted)] pb-2 border-b border-dashed border-[#1a1a1a]/20 mb-4">
          {copyLabel}
        </div>
      )}

      <div className="relative z-10">
        <DocumentLetterhead
          title={c.title}
          subtitle={c.subtitle}
          reference={[
            ...(data.contractDate
              ? [{ label: s.date, value: formatDate(data.contractDate) }]
              : []),
            ...(data.stockNumber
              ? [{ label: s.stockNumber, value: data.stockNumber }]
              : []),
          ]}
        />

        {/* Parties */}
        <div className="grid grid-cols-2 gap-12 mb-10 print-section">
          <div className="p-6">
            <h3 className="doc-section-heading mb-4">{s.buyerInfo}</h3>
            <p className="font-[family-name:var(--font-display)] text-xl mb-1 min-h-[1.75rem]">{data.buyerName}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem]">{data.buyerAddress}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem]">{data.buyerPhone}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem]">{data.buyerEmail}</p>
          </div>
          <div className="p-6" data-mobile-empty={!hasCoBuyer ? 'true' : undefined}>
            <h3 className="doc-section-heading mb-4">{s.coBuyerInfo}</h3>
            <p className="font-[family-name:var(--font-display)] text-xl mb-1 min-h-[1.75rem]">{data.coBuyerName}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem]">{data.coBuyerAddress}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem]">{data.coBuyerPhone}</p>
            <p className="text-sm text-[color:var(--tj-ink)] min-h-[1.25rem]">{data.coBuyerEmail}</p>
          </div>
        </div>

        {/* Vehicle */}
        <div className="mb-10 print-section">
          <h3 className="doc-section-heading mb-2">{s.vehicleDescription}</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#ddd]">
                <th className="p-3 text-left font-semibold">{s.year}</th>
                <th className="p-3 text-left font-semibold">{s.make}</th>
                <th className="p-3 text-left font-semibold">{s.model}</th>
                <th className="p-3 text-left font-semibold">{s.mileage}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#1a1a1a]/10">
                <td className="p-3" data-label={s.year}>{data.vehicleYear}</td>
                <td className="p-3" data-label={s.make}>{data.vehicleMake}</td>
                <td className="p-3" data-label={s.model}>{data.vehicleModel}</td>
                <td className="p-3" data-label={s.mileage}>{data.vehicleMileage}</td>
              </tr>
            </tbody>
          </table>
          {/* Same treatment as the bill of sale, so a packet reads as one hand. */}
          <div className="doc-vin">
            <div>
              <span className="doc-vin-label">{s.vin}</span>
              <span className="doc-vin-value">{data.vehicleVin}</span>
            </div>
            {data.vehiclePlate && (
              <div className="doc-vin-secondary">
                <span className="doc-vin-label">{s.plate}</span>
                <span className="doc-vin-value">{data.vehiclePlate}</span>
              </div>
            )}
          </div>
        </div>

        {/* Truth in Lending */}
        <div className="mb-10 print-section">
          <h3 className="doc-section-heading mb-2">{c.tilTitle}</h3>
          {/* Regulation Z wants these four grouped and segregated. A rule does
              that on any printer; a background tint does it on none. */}
          <div className="doc-til">
            {[
              { term: c.apr, desc: c.aprDesc, figure: `${data.apr.toFixed(2)}%` },
              { term: c.financeCharge, desc: c.financeChargeDesc, figure: formatCurrency(financeCharge) },
              { term: c.amountFinanced, desc: c.amountFinancedDesc, figure: formatCurrency(amountFinanced) },
              { term: c.totalOfPayments, desc: c.totalOfPaymentsDesc, figure: formatCurrency(totalOfPayments) },
            ].map((cell) => (
              <div key={cell.term} className="doc-til-cell">
                <div>
                  <div className="doc-til-term">{cell.term}</div>
                  <div className="doc-til-desc">{cell.desc}</div>
                </div>
                <div className="doc-til-figure">{cell.figure}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Schedule Summary */}
        <div className="mb-10 print-section">
          <h3 className="doc-section-heading mb-2">{c.paymentSchedule}</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-y border-[#111111]">
                <th className="p-3 text-left font-semibold">{c.numberOfPayments}</th>
                <th className="p-3 text-left font-semibold">{c.amountOfPayments}</th>
                <th className="p-3 text-left font-semibold">{c.whenPaymentsDue}</th>
                <th className="p-3 text-left font-semibold">{c.estCompletionDate}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3" data-label={c.numberOfPayments}>{data.numberOfPayments}</td>
                <td className="p-3 font-bold" data-label={c.amountOfPayments}>
                  {formatCurrency(paymentAmount)}
                  {hasShorterLast ? (
                    <span className="block text-xs font-normal">
                      {c.finalPayment} {formatCurrency(lastPaymentAmount)}
                    </span>
                  ) : null}
                </td>
                <td className="p-3" data-label={c.whenPaymentsDue}>{data.paymentFrequency} {c.beginning} {data.firstPaymentDate ? format(new Date(data.firstPaymentDate + 'T12:00:00'), 'MM/dd/yyyy') : ''}</td>
                <td className="p-3 font-bold text-[#111111]" data-label={c.estCompletionDate}>{estimatedCompletionDate}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ═══ PRINT PAGE 2: Itemization, Policies & Disclosures ═══ */}
        <div className="print-page-group">

        {/* Itemization & Important Clauses */}
        <div className="grid grid-cols-2 gap-12 mb-12 print-section">
          <div>
            <h3 className="doc-section-heading mb-4">{c.itemization}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>{c.cashPriceVehicle}</span>
                <span>{formatCurrency(data.cashPrice)}</span>
              </div>
              <div className="flex justify-between text-[color:var(--tj-ink)]">
                <span>&nbsp;&nbsp;&nbsp;{c.salesTaxLine}</span>
                <span>{formatCurrency(data.tax)}</span>
              </div>
              <div className="flex justify-between text-[color:var(--tj-ink)]">
                <span>&nbsp;&nbsp;&nbsp;{c.titleFeeLine}</span>
                <span>{formatCurrency(data.titleFee)}</span>
              </div>
              <div className="flex justify-between text-[color:var(--tj-ink)]">
                <span>&nbsp;&nbsp;&nbsp;{c.docFeeLine}</span>
                <span>{formatCurrency(data.docFee)}</span>
              </div>
              <div className="flex justify-between text-[color:var(--tj-ink)]">
                <span>&nbsp;&nbsp;&nbsp;{c.regFeeLine}</span>
                <span>{formatCurrency(data.registrationFee)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-[#1a1a1a]/10 pt-2">
                <span>{c.totalCashPrice}</span>
                <span>{formatCurrency(totalCashPrice)}</span>
              </div>
              <div className="flex justify-between border-b border-[#1a1a1a]/20 pb-3">
                <span>{c.downPaymentLine}</span>
                <span className="text-[#8A3A1C]">- {formatCurrency(data.downPayment)}</span>
              </div>
              <div className="flex justify-between font-bold pt-1 text-lg font-[family-name:var(--font-display)]">
                <span>{c.amountFinancedLine}</span>
                <span>{formatCurrency(amountFinanced)}</span>
              </div>
            </div>
          </div>

          {/* The disclaimer stays bold: a warranty disclaimer must be
              conspicuous to disclaim anything. It no longer relies on a tint
              to be seen, because a tint does not print by default. */}
          <div className="space-y-6">
            <div className="doc-notice">
              <h3 className="doc-notice-title">{c.asIsTitle}</h3>
              <p className="doc-notice-body">
                <strong>{c.asIsText}</strong>
              </p>
            </div>
            <div className="doc-notice">
              <h3 className="doc-notice-title">{c.noRefundTitle}</h3>
              <p className="doc-notice-body">
                <strong>{c.noRefundText}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Total Due at Signing */}
        {data.dueAtSigning > 0 && (
          <div className="mb-10 print-section">
            <div className="bg-[#f5f2ed]/40 p-6 text-center rounded-sm">
              <h3 className="doc-section-heading mb-2">{s.totalDueAtSigning}</h3>
              <p className="text-4xl font-[family-name:var(--font-display)] font-bold text-[#111111]">{formatCurrency(data.dueAtSigning)}</p>
              <p className="text-xs text-[color:var(--tj-muted)] mt-2">{s.totalDueAtSigningDesc}</p>
            </div>
          </div>
        )}

        {/* Texas Mandatory Buyer Notice */}
        <div className="doc-notice doc-notice-key mb-8 print-section">
          <p className="doc-notice-body font-bold uppercase tracking-wider">
            {c.texasBuyerNotice}
          </p>
        </div>

        {/* GPS Tracking Device Disclosure & Consent */}
        <div className="doc-notice mb-8 print-section">
          <h3 className="doc-notice-title">{c.gpsTitle}</h3>
          <div className="doc-notice-body">
            <p>{c.gpsDisclosure}</p>
            <p>{c.gpsPurpose}</p>
            <p>{c.gpsConsent}</p>
            <p>{c.gpsStarterInterrupt}</p>
            <p>{c.gpsTampering}</p>
            <p>{c.gpsOwnership}</p>
            <p>{c.gpsNoCharge}</p>
          </div>
        </div>

        </div>{/* end PRINT PAGE 2 */}

        {/* ═══ PRINT PAGE 3: Comprehensive Terms ═══ */}
        <div className="print-page-group">

        {/* Comprehensive Terms */}
        <div className="mb-10 text-[10.5px] text-left space-y-2.5 text-[color:var(--tj-ink)] columns-2 gap-8">
          <p><strong>1. PROMISE TO PAY:</strong> Buyer promises to pay Holder the principal amount of {formatCurrency(amountFinanced)} plus interest at the Annual Percentage Rate of {data.apr.toFixed(2)}% until paid in full. Buyer will make payments according to the Payment Schedule above. Buyer&apos;s obligation to make payments is absolute and unconditional and shall not be subject to any set-off, counterclaim, or defense.</p>

          <p><strong>2. SECURITY INTEREST:</strong> Buyer grants Holder a purchase money security interest in the Vehicle described above and all accessions, accessories, and proceeds thereof. This security interest secures payment of all amounts owed under this Contract. Holder may file a financing statement (UCC-1) to perfect its security interest.</p>

          <p><strong>3. LATE CHARGES:</strong> If any installment payment remains unpaid for more than fifteen (15) days after its scheduled due date, Holder may collect a delinquency charge of five percent (5%) of the unpaid installment amount. Only one delinquency charge may be collected on any single installment regardless of how long the payment remains unpaid, in accordance with Texas Finance Code Section 348.107.</p>

          <p><strong>4. RETURNED PAYMENTS:</strong> A fee of $30.00 shall be assessed for any check, electronic payment, or other instrument returned or dishonored for any reason, including insufficient funds. Following a returned payment, Holder may require all future payments be made by cash, money order, or certified funds.</p>

          <p><strong>5. DEFAULT:</strong> Buyer shall be in default if: (a) Buyer fails to make any payment when due; (b) Buyer fails to maintain required insurance coverage; (c) Buyer violates any term of this Contract; (d) Buyer provides false or misleading information; (e) Buyer abandons the Vehicle; (f) Buyer tampers with or removes the GPS/starter interrupt device; (g) Buyer sells, transfers, or encumbers the Vehicle without Holder&apos;s written consent; (h) Buyer makes unauthorized modifications to the Vehicle; or (i) Holder believes in good faith that the prospect of Buyer&apos;s payment or performance is impaired.</p>

          <p><strong>6. ACCELERATION:</strong> Upon default, Holder may declare the entire unpaid balance of this Contract immediately due and payable. Upon acceleration, Buyer shall be entitled to a refund of the unearned portion of the finance charge as provided by Texas Finance Code Sections 348.120 or 348.121, as applicable.</p>

          <p><strong>7. RIGHT TO CURE:</strong> Upon default, Holder may, at its sole discretion, provide Buyer written notice of default and a period of not less than ten (10) days to cure such default. Holder is not required by Texas law to provide notice before exercising remedies, but may elect to do so. If Buyer fails to cure the default within the cure period (if any is provided), Holder may exercise all remedies available under this Contract and applicable law.</p>

          <p><strong>8. REPOSSESSION:</strong> Upon default or acceleration, Holder may take possession of the Vehicle wherever it may be found, without notice or demand, using peaceful means and without breach of the peace, as permitted by Chapter 9, Texas Business and Commerce Code, and Texas Finance Code Chapter 348. Buyer shall not hide, conceal, or refuse to surrender the Vehicle. Holder shall not enter any closed or locked structure to repossess the Vehicle and shall not use or threaten force. After repossession, Holder shall provide notice as required by law before disposing of the Vehicle. Buyer shall have the right to redeem the Vehicle before sale by paying the full unpaid balance plus all repossession costs, storage fees, and other lawful charges.</p>

          <p><strong>9. DEFICIENCY BALANCE:</strong> If the Vehicle is sold after repossession and the proceeds of the sale, after deducting all costs of repossession, storage, repair, and sale, are less than the unpaid balance owed under this Contract, Buyer shall remain liable for the deficiency balance. Holder shall send written notice to Buyer of the sale and any deficiency balance as required by applicable law.</p>

          <p><strong>10. PERSONAL PROPERTY AFTER REPOSSESSION:</strong> Any personal property found in the Vehicle after repossession will be handled in accordance with Texas Finance Code Section 348.407. Holder shall notify Buyer within fifteen (15) days of discovering personal property; Buyer has thirty-one (31) days to claim it.</p>

          <p><strong>11. INSURANCE:</strong> Buyer agrees to maintain at all times during the term of this Contract: (a) comprehensive and collision insurance on the Vehicle with Holder named as lienholder/loss payee; and (b) liability insurance meeting or exceeding Texas minimum requirements ($30,000 bodily injury per person, $60,000 bodily injury per accident, $25,000 property damage). Buyer shall provide proof of insurance prior to delivery and within five (5) days of any policy renewal or change. If Buyer fails to maintain insurance, Holder may purchase force-placed insurance at Buyer&apos;s expense or declare Buyer in default.</p>

          <p><strong>12. PREPAYMENT:</strong> Buyer may prepay this Contract in full at any time before the final installment is due without penalty. If Buyer prepays in full, Buyer is entitled to a refund credit of the unearned portion of the finance charge as computed under Texas Finance Code Section 348.120 or 348.121. Partial prepayments will be applied in accordance with this Contract and will not change the scheduled payment amounts or due dates unless Holder agrees in writing.</p>

          <p><strong>13. UNAUTHORIZED MODIFICATIONS:</strong> Buyer shall not make or permit any material alterations or modifications to the Vehicle without Holder&apos;s prior written consent, including but not limited to: engine or transmission modifications, suspension changes, aftermarket wheels or tires that differ from manufacturer specifications, exhaust modifications, body modifications, or removal of emissions equipment. Any unauthorized modification constitutes a default.</p>

          <p><strong>14. NO COOLING-OFF PERIOD:</strong> THERE IS NO COOLING-OFF PERIOD FOR THIS SALE. Under Texas law, once Buyer signs this Contract, Buyer is legally bound by its terms. Buyer does not have a right to return the Vehicle or cancel this Contract based on a change of mind, buyer&apos;s remorse, or dissatisfaction with the Vehicle. This sale is FINAL upon execution.</p>

          <p><strong>15. VEHICLE CONDITION ACKNOWLEDGMENT:</strong> Buyer acknowledges that: (a) Buyer has inspected the Vehicle or has had the opportunity to have the Vehicle inspected by an independent mechanic; (b) Buyer is purchasing the Vehicle based on Buyer&apos;s own inspection and judgment, not in reliance upon any oral representations by Seller; (c) the Vehicle is a used motor vehicle and may have undiscoverable defects; (d) ALL REPRESENTATIONS REGARDING THE VEHICLE ARE CONTAINED IN THIS CONTRACT. NO ORAL REPRESENTATIONS OR WARRANTIES HAVE BEEN MADE THAT ARE NOT CONTAINED HEREIN.</p>

          <p><strong>16. DOCUMENTARY FEE:</strong> A DOCUMENTARY FEE IS NOT AN OFFICIAL FEE. A DOCUMENTARY FEE IS NOT REQUIRED BY LAW BUT MAY BE CHARGED TO BUYERS FOR HANDLING DOCUMENTS RELATING TO THE SALE. A DOCUMENTARY FEE MAY NOT EXCEED A REASONABLE AMOUNT AGREED TO BY THE PARTIES.</p>

          <p><strong>17. PAYMENT RECORDS:</strong> Holder&apos;s records of payments received shall be presumed accurate unless Buyer provides written evidence demonstrating otherwise. Buyer shall retain all payment receipts. Payment disputes must be raised in writing within sixty (60) days of the disputed payment.</p>

          <p><strong>18. TOLL VIOLATIONS &amp; CITATIONS:</strong> Buyer is solely responsible for all toll charges, parking tickets, traffic citations, red-light camera violations, and any fines or penalties incurred during the term of this Contract. If Holder receives any such citation as the registered owner/lienholder, Buyer shall reimburse Holder for all costs incurred.</p>

          <p><strong>19. ATTORNEY FEES &amp; COLLECTION COSTS:</strong> If Holder refers this Contract to an attorney for collection or enforcement, Buyer agrees to pay reasonable attorney&apos;s fees and all costs of collection, to the extent permitted by Texas law.</p>

          <p><strong>20. GOVERNING LAW &amp; JURISDICTION:</strong> This Contract shall be governed by and construed in accordance with the laws of the State of Texas. Any dispute arising out of or related to this Contract shall be subject to the exclusive jurisdiction of the state and federal courts located in Harris County, Texas.</p>

          <p><strong>21. DISPUTE RESOLUTION:</strong> Prior to initiating any legal proceeding, the parties agree to attempt in good faith to resolve any dispute through informal negotiation for a period of thirty (30) days. If Buyer is a covered borrower under the Military Lending Act (10 U.S.C. 987), mandatory arbitration shall not apply.</p>

          <p><strong>22. ENTIRE AGREEMENT:</strong> This Contract, together with all addenda, riders, and disclosures signed by the parties (including the GPS Disclosure, FTC Buyers Guide, and Odometer Disclosure), constitutes the entire agreement between Buyer and Seller regarding the purchase and financing of the Vehicle. No modification shall be valid unless in writing and signed by both parties.</p>

          <p><strong>23. SEVERABILITY:</strong> If any provision of this Contract is found to be invalid, illegal, or unenforceable, such finding shall not affect the validity of the remaining provisions, which shall continue in full force and effect.</p>

          <p><strong>24. WAIVER:</strong> Holder&apos;s failure to enforce any term of this Contract shall not constitute a waiver of Holder&apos;s right to enforce that term or any other term at any time. Acceptance of late payments or partial payments shall not constitute a waiver of Holder&apos;s right to demand timely payment in full.</p>
        </div>

        </div>{/* end PRINT PAGE 3 */}

        {/* ═══ PRINT PAGE 4: ECOA, ID & Signatures ═══ */}
        <div className="print-page-group">

        {/* ECOA Notice */}
        <div className="doc-notice mb-8 text-[9px] text-left leading-relaxed print-section">
          {c.ecoaNotice}
        </div>

        {/* Customer ID Photo */}
        {signatures.buyerIdPhoto && (
          <div className="mb-10 p-4 flex items-center space-x-6">
            <img src={signatures.buyerIdPhoto} alt="Customer ID" className="h-28 object-contain rounded border border-[#1a1a1a]/10" />
            <div>
              <p className="doc-section-heading">{s.customerIdOnFile}</p>
              <p className="text-sm font-medium mt-1">{data.buyerName}</p>
            </div>
          </div>
        )}

        {/* SMS Consent */}
        <SmsConsentSection checked={smsConsent} strings={stringsProp} />

        {/* Signatures */}
        <div className="space-y-12 p-8 print-signatures">
          <div className="text-sm font-bold mb-8 text-center font-[family-name:var(--font-display)] text-lg">
            {c.signatureAgreement}
          </div>

          <div className="grid grid-cols-2 gap-16">
            <SignatureLinePreview label={s.buyerSignature} signatureImage={signatures.buyerSignature} signatureDate={signatures.buyerSignatureDate} printedName={data.buyerName} />
            <SignatureLinePreview label={s.coBuyerSignature} signatureImage={signatures.coBuyerSignature} signatureDate={signatures.coBuyerSignatureDate} printedName={data.coBuyerName} />
          </div>

          <div className="grid grid-cols-2 gap-16 mt-8">
            <SignatureLinePreview label={`${s.dealerRepSignature}. DL# ${DEALER_LICENSE}`} signatureImage={signatures.dealerSignature} signatureDate={signatures.dealerSignatureDate} />
          </div>
        </div>

        </div>{/* end PRINT PAGE 4 */}

        {/* Full Payment Schedule (Page Break for Print) */}
        {schedule.length > 0 && (
          <div className="mt-20 pt-12 border-t-2 border-[#1a1a1a] print-page-break">
            <h3 className="text-2xl font-[family-name:var(--font-display)] font-bold mb-8 text-center uppercase tracking-widest">{c.amortizationTitle}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-4 text-sm">
              {schedule.map((payment) => (
                <div key={payment.paymentNumber} className="border-b border-[#1a1a1a]/10 pb-2 flex justify-between items-end">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[color:var(--tj-muted)] uppercase tracking-wider">{c.payment} {payment.paymentNumber}</span>
                    <span className="font-medium">{payment.date}</span>
                  </div>
                  <span className="font-bold font-[family-name:var(--font-display)]">{formatCurrency(payment.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
