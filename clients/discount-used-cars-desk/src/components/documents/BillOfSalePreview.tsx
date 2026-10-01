/* eslint-disable @next/next/no-img-element */
import { format } from 'date-fns';
import DocumentLetterhead from '@/components/documents/DocumentLetterhead';
import SignatureLinePreview from '@/components/documents/SignatureLinePreview';
import { chicagoDateKey } from '@/lib/customers/recurring-dates';
import { brand } from '@/lib/dealership-config';
import { toTitleCaseDisplay } from '@/lib/display/title-case';
import {
  BillOfSaleData,
  DEFAULT_SELLER_LIEN_REASON,
  calculateBillOfSale,
  formatCurrency,
  getSellerLienSummary,
  getTitleLienSummary,
} from '@/lib/documents/billOfSale';
import { getDocStrings, type DocStrings } from '@/lib/documents/i18n';
import { idDocumentType, passportIssuerName, readIdKind } from '@/lib/forms/id-document';
import {
  SignatureData,
  DEALER_ADDRESS,
  DEALER_LICENSE,
  DEALER_NAME,
  DEALER_PHONE,
  DEALER_WEBSITE,
  isRenderableImageSrc,
} from '@/lib/documents/shared';
import { BALANCE_OWED_REASON } from '@/lib/sales/money';

export interface BuyerAcknowledgments {
  inspected: boolean;
  asIs: boolean;
  receivedCopy: boolean;
  allSalesFinal: boolean;
  odometerInformed: boolean;
  responsibility: boolean;
  noOutsidePromises: boolean;
  riskOfLoss: boolean;
  insuranceEffective: boolean;
  texasLawVenue: boolean;
  billOfSaleTerms: boolean;
  asIsNoWarranty: boolean;
  noRefundPolicy: boolean;
  odometerDisclosure: boolean;
  buyerAcknowledgment: boolean;
  financingSeparate: boolean;
}

export const emptyAcknowledgments: BuyerAcknowledgments = {
  inspected: false,
  asIs: false,
  receivedCopy: false,
  allSalesFinal: false,
  odometerInformed: false,
  responsibility: false,
  noOutsidePromises: false,
  riskOfLoss: false,
  insuranceEffective: false,
  texasLawVenue: false,
  billOfSaleTerms: false,
  asIsNoWarranty: false,
  noRefundPolicy: false,
  odometerDisclosure: false,
  buyerAcknowledgment: false,
  financingSeparate: false,
};

function renderLegalClause(text: string) {
  const separator = text.indexOf(':');
  if (separator < 0) return text;

  return (
    <>
      <strong>{text.slice(0, separator + 1)}</strong>
      {text.slice(separator + 1)}
    </>
  );
}

interface Props {
  data: BillOfSaleData;
  signatures: SignatureData;
  acknowledgments?: BuyerAcknowledgments;
  copyLabel?: string;
  strings?: DocStrings;
  smsConsent?: boolean;
  /**
   * What the buyer still has to do after they drive away.
   *
   * Driven by the sale's own answers: who is registering the car, whether
   * insurance was shown at the desk, and who is taking it for inspection.
   * Absent means the corridor has not asked yet, and the page shows the
   * items as open rather than inventing a status nobody gave.
   */
  outstanding?: {
    registrationByDealer?: boolean;
    insuranceShown?: boolean;
    inspectionByDealer?: boolean;
    inspectionDone?: boolean;
  };
}

export default function BillOfSalePreview({
  data,
  signatures,
  acknowledgments,
  copyLabel,
  strings: stringsProp,
  outstanding,
}: Props) {
  const t = stringsProp || getDocStrings('en');
  const s = t.shared;
  const b = t.billOfSale;
  const calc = calculateBillOfSale(data);
  const sellerLien = getSellerLienSummary(data);
  const titleLien = getTitleLienSummary(data);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return format(new Date(`${dateStr}T12:00:00`), 'MM/dd/yyyy');
  };

  /*
    What the ID line calls the number and its issuer. A record from before
    the kind was asked is a licence, so the line reads as it always has;
    a passport is named as one, with its country written out, because
    "DL# A12345678, State: MX" is a wrong description of a real document.
  */
  const buyerIdKind = readIdKind(data.buyerIdKind);
  const buyerIdLabel =
    buyerIdKind === 'passport' ? s.passport : buyerIdKind === 'militaryId' ? s.militaryId : s.driverLicense;
  const buyerIssuerLabel = idDocumentType(buyerIdKind).needsCountry ? s.issuedBy : s.state;
  const buyerIssuer = idDocumentType(buyerIdKind).needsCountry
    ? passportIssuerName(data.buyerLicenseState)
    : data.buyerLicenseState;

  const buyerFullAddress = [
    data.buyerAddress,
    data.buyerCity,
    data.buyerState,
    data.buyerZip,
  ]
    .filter(Boolean)
    .join(', ');
  const coBuyerFullAddress = [
    data.coBuyerAddress,
    data.coBuyerCity,
    data.coBuyerState,
    data.coBuyerZip,
  ]
    .filter(Boolean)
    .join(', ');
  const paymentDisplay =
    data.paymentMethod === 'Other'
      ? data.paymentMethodOther
      : data.paymentMethod;
  const dataRecord = data as BillOfSaleData & { buyerIdBackImage?: string };
  const buyerIdBackImage = dataRecord.buyerIdBackImage || '';
  const hasCoBuyer = Boolean(
    data.coBuyerName ||
      coBuyerFullAddress ||
      data.coBuyerPhone ||
      data.coBuyerEmail ||
      data.coBuyerLicense ||
      data.coBuyerLicenseState,
  );
  const odometerLabel =
    !data.odometerStatus
      ? '________________________'
      : data.odometerStatus === 'actual'
      ? b.odometerActualLabel
      : data.odometerStatus === 'exceeds'
        ? b.odometerExceedsLabel
        : b.odometerDiscrepancyLabel;
  const today = chicagoDateKey();
  const sellerLienReason =
    sellerLien.reason === DEFAULT_SELLER_LIEN_REASON
      ? b.defaultSellerLienReason
      : sellerLien.reason === BALANCE_OWED_REASON
        ? b.buyerBalanceSellerLienReason
        : sellerLien.reason;

  /**
   * The errands, as a list somebody can actually work through.
   *
   * Each row says what it is, who owns it, and whether it is still open.
   * `owed` is what turns a row red, and it is only ever true when the
   * answer says the buyer is carrying that item out of here. Nothing is
   * guessed: an unanswered question reads as open, which is honest, and a
   * dealer-handled item says so plainly so nobody chases it twice.
   */
  /*
    Registration is the dealer's unless the sale recorded otherwise.

    Texas puts the filing on the dealer (Transportation Code 501.0234, via
    webDEALER since HB 718), and the corridor's default says the same. This
    row used to read an ABSENT answer as the buyer's errand and printed
    "You are registering this vehicle yourself at the county tax office.
    Yours to do" on every sale, including the ones where we had just signed
    the 130-U as the filer. A bill of sale that says the buyer files when
    the dealer is legally the filer is a dealer disclaiming its duty in the
    buyer's own hand. Only an explicit "buyer files" prints that wording.

    Insurance and the inspection are the buyer's errands only when the sale
    says so. Unanswered, they are left off: a question nobody asked is not
    something the buyer owes.
  */
  const registrationByDealer = outstanding?.registrationByDealer !== false;
  const outstandingItems: Array<{
    key: string;
    label: string;
    note: string;
    status: string;
    owed: boolean;
    done: boolean;
  }> = [
    {
      key: "registration",
      label: b.outstandingRegistration,
      note: registrationByDealer
        ? b.outstandingRegistrationDealer
        : b.outstandingRegistrationBuyer,
      status: registrationByDealer ? b.outstandingWeHandle : b.outstandingYours,
      owed: !registrationByDealer,
      // We are doing it, so it is not the buyer's errand: ticked.
      done: registrationByDealer,
    },
    ...(outstanding?.insuranceShown === undefined
      ? []
      : [
          {
            key: "insurance",
            label: b.outstandingInsurance,
            note: outstanding.insuranceShown
              ? b.outstandingInsuranceOnFile
              : b.outstandingInsuranceOwed,
            status: outstanding.insuranceShown ? b.outstandingOnFile : b.outstandingBringIt,
            owed: outstanding.insuranceShown !== true,
            done: outstanding.insuranceShown === true,
          },
        ]),
    ...(outstanding?.inspectionByDealer === undefined && outstanding?.inspectionDone === undefined
      ? []
      : [
          {
            key: "inspection",
            label: b.outstandingInspection,
            note: outstanding.inspectionDone
              ? b.outstandingInspectionDone
              : outstanding.inspectionByDealer
                ? b.outstandingInspectionDealer
                : b.outstandingInspectionBuyer,
            status: outstanding.inspectionDone
              ? b.outstandingOnFile
              : outstanding.inspectionByDealer
                ? b.outstandingWeHandle
                : b.outstandingYours,
            owed: !outstanding.inspectionDone && outstanding.inspectionByDealer !== true,
            // Either it has passed, or we are the ones taking it. Both are
            // settled as far as the buyer walking out of here is concerned.
            done: outstanding.inspectionDone === true || outstanding.inspectionByDealer === true,
          },
        ]),
  ];

  const acknowledgmentItems: Array<
    [keyof BuyerAcknowledgments, string]
  > = [
    ['inspected', b.ackInspected],
    [
      'asIs',
      data.conditionType === 'as_is' ? b.ackAsIs : b.ackAsIsWarranty,
    ],
    ['receivedCopy', b.ackReceivedCopy],
    ['allSalesFinal', b.ackAllSalesFinal],
    ['odometerInformed', b.ackOdometer],
    ['responsibility', b.ackResponsibility],
    ['noOutsidePromises', b.ackNoOutsidePromises],
    ['riskOfLoss', b.ackRiskOfLoss],
    ['insuranceEffective', b.ackInsuranceEffective],
    ['texasLawVenue', b.ackTexasLawVenue],
    ['billOfSaleTerms', b.ackBillOfSaleTerms],
    ['asIsNoWarranty', b.ackAsIsNoWarranty],
    ['noRefundPolicy', b.ackNoRefundPolicy],
    ['odometerDisclosure', b.ackOdometerDisclosure],
    ['buyerAcknowledgment', b.ackBuyerAcknowledgment],
  ];

  if (data.paymentMethod === 'Financing') {
    acknowledgmentItems.push(['financingSeparate', b.ackFinancingSeparate]);
  }

  return (
    <div className="doc-sheet bos-print p-6 md:p-10 max-w-5xl mx-auto relative print-doc">
      {copyLabel && (
        <div className="print-copy-label bos-copy-label text-center pb-2 border-b border-dashed mb-4">
          {copyLabel}
        </div>
      )}

      <div className="relative z-10">
        <section className="bos-page" data-bos-page="transaction">
          <DocumentLetterhead
            title={toTitleCaseDisplay(b.title)}
            subtitle={toTitleCaseDisplay(b.subtitle)}
            reference={[
              { label: s.date, value: formatDate(data.saleDate) },
              ...(data.stockNumber
                ? [{ label: s.stockNumber, value: data.stockNumber }]
                : []),
            ]}
          />

          <section className="bos-section bos-seller">
            <h2 className="bos-section-heading">{s.sellerDealer}</h2>
            <div className="bos-seller-grid">
              <div>
                <p className="doc-field-value font-semibold">{DEALER_NAME}</p>
                <p className="doc-field-value">{DEALER_ADDRESS}</p>
              </div>
              <div>
                <p className="doc-field-value">{DEALER_PHONE}</p>
                <p className="doc-field-value">{DEALER_WEBSITE}</p>
              </div>
              <div>
                <p className="bos-field-label">{s.dealerLicense}</p>
                <p className="doc-field-value font-mono">{DEALER_LICENSE}</p>
              </div>
            </div>
          </section>

          <div className="bos-section bos-party-grid">
            <section>
              <h2 className="bos-section-heading">{s.buyerInfo}</h2>
              <p className="bos-party-name">{data.buyerName}</p>
              <p className="bos-party-detail">{buyerFullAddress}</p>
              <p className="bos-party-detail">{data.buyerPhone}</p>
              <p className="bos-party-detail">{data.buyerEmail}</p>
              <div className="bos-party-meta">
                <span className="font-mono">
                  {buyerIdLabel} {data.buyerLicense}
                </span>
                {data.buyerLicenseState && (
                  <span>
                    {buyerIssuerLabel}: {buyerIssuer}
                  </span>
                )}
              </div>
            </section>
            <section data-mobile-empty={!hasCoBuyer ? 'true' : undefined}>
              <h2 className="bos-section-heading">{s.coBuyerInfo}</h2>
              <p className="bos-party-name">{data.coBuyerName}</p>
              <p className="bos-party-detail">{coBuyerFullAddress}</p>
              <p className="bos-party-detail">{data.coBuyerPhone}</p>
              <p className="bos-party-detail">{data.coBuyerEmail}</p>
              <div className="bos-party-meta">
                <span className="font-mono">
                  {s.driverLicense} {data.coBuyerLicense}
                </span>
                {data.coBuyerLicenseState && (
                  <span>
                    {s.state}: {data.coBuyerLicenseState}
                  </span>
                )}
              </div>
            </section>
          </div>

          {(signatures.buyerIdPhoto || buyerIdBackImage) && (
            <section className="bos-section bos-id-row">
              <div className="bos-id-images">
                {signatures.buyerIdPhoto &&
                  (isRenderableImageSrc(signatures.buyerIdPhoto) ? (
                    <img
                      src={signatures.buyerIdPhoto}
                      alt={s.customerIdOnFile}
                      className="bos-id-image"
                    />
                  ) : (
                    <p className="bos-id-on-file">
                      {s.customerIdOnFile}: {brand.full}.
                    </p>
                  ))}
                {buyerIdBackImage &&
                  isRenderableImageSrc(buyerIdBackImage) && (
                    <img
                      src={buyerIdBackImage}
                      alt={s.customerIdOnFile}
                      className="bos-id-image"
                    />
                  )}
              </div>
              <div>
                <h2 className="bos-section-heading">{s.customerIdOnFile}</h2>
                <p className="font-semibold">{data.buyerName}</p>
                {data.buyerLicense && (
                  <p className="bos-party-detail font-mono">
                    {buyerIdLabel} {data.buyerLicense} ·{' '}
                    {buyerIssuer}
                  </p>
                )}
              </div>
            </section>
          )}

          <section className="bos-section bos-vehicle">
            <h2 className="bos-section-heading">{s.vehicleDescription}</h2>
            <table className="bos-vehicle-table w-full border-collapse">
              <thead>
                <tr>
                  <th>{s.year}</th>
                  <th>{s.make}</th>
                  <th>{s.model}</th>
                  <th>{s.trim}</th>
                  <th>{s.color}</th>
                  <th>{s.body}</th>
                  <th>{s.mileage}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label={s.year}>{data.vehicleYear}</td>
                  <td data-label={s.make}>{data.vehicleMake}</td>
                  <td data-label={s.model}>{data.vehicleModel}</td>
                  <td data-label={s.trim}>{data.vehicleTrim}</td>
                  <td data-label={s.color}>{data.vehicleColor}</td>
                  <td data-label={s.body}>{data.vehicleBodyStyle}</td>
                  <td data-label={s.mileage} className="font-mono">
                    {data.odometerReading || data.vehicleMileage}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="doc-vin">
              <div>
                <span className="doc-vin-label">{s.vin}</span>
                <span className="doc-vin-value">{data.vehicleVin}</span>
              </div>
              {data.vehiclePlate && (
                <div className="doc-vin-secondary">
                  <span className="doc-vin-label">{s.licensePlate}</span>
                  <span className="doc-vin-value">{data.vehiclePlate}</span>
                </div>
              )}
            </div>
          </section>

          <div className="bos-reckoning-wrap print-section">
            <dl className="doc-reckoning">
              <div className="doc-reckoning-row">
                <dt>{b.vehiclePrice}</dt>
                <dd>{formatCurrency(data.salePrice)}</dd>
              </div>
              <div className="doc-reckoning-row">
                <dt>{b.netTradeIn}</dt>
                <dd>{formatCurrency(calc.netTradeIn)}</dd>
              </div>
              <div className="doc-reckoning-row">
                <dt>{b.feesTax}</dt>
                <dd>{formatCurrency(calc.feesSubtotal)}</dd>
              </div>
              <div className="doc-reckoning-total">
                <dt>{s.totalDue}</dt>
                <dd className="bos-live-figure">
                  {formatCurrency(calc.totalDue)}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="bos-page" data-bos-page="sale-details">
          {(data.tradeInDescription || data.tradeInVin) && (
            <section className="bos-trade print-section">
              <h2 className="bos-section-heading">{b.tradeInVehicle}</h2>
              <div className="bos-trade-grid">
                <div>
                  <span className="bos-field-label">{b.tradeInDesc}</span>
                  <p className="font-medium">{data.tradeInDescription}</p>
                </div>
                <div>
                  <span className="bos-field-label">{s.vin}</span>
                  <p className="font-mono">{data.tradeInVin}</p>
                </div>
                <div>
                  <span className="bos-field-label">
                    {b.tradeInAllowancePayoff}
                  </span>
                  <p className="font-medium font-mono">
                    {formatCurrency(data.tradeInAllowance)} /{' '}
                    {formatCurrency(data.tradeInPayoff)}
                  </p>
                </div>
              </div>
            </section>
          )}

          <div className="bos-finance-grid print-section">
            <section>
              <h2 className="bos-section-heading">{b.itemization}</h2>
              <div className="bos-itemization">
                <div className="bos-money-row">
                  <span>{b.vehicleSalePrice}</span>
                  <span>{formatCurrency(data.salePrice)}</span>
                </div>
                {(data.tradeInAllowance > 0 || data.tradeInPayoff > 0) && (
                  <>
                    <div className="bos-money-row bos-money-detail">
                      <span>{b.tradeInAllowance}</span>
                      <span>- {formatCurrency(data.tradeInAllowance)}</span>
                    </div>
                    <div className="bos-money-row bos-money-detail">
                      <span>{b.tradeInPayoff}</span>
                      <span>+ {formatCurrency(data.tradeInPayoff)}</span>
                    </div>
                    <div className="bos-money-row bos-money-detail">
                      <span>{b.netTradeInCredit}</span>
                      <span>- {formatCurrency(calc.netTradeIn)}</span>
                    </div>
                  </>
                )}
                <div className="bos-money-row bos-money-subtotal">
                  <span>{b.balanceAfterTrade}</span>
                  <span>{formatCurrency(calc.balanceAfterTrade)}</span>
                </div>
                <div className="bos-money-row bos-money-detail">
                  <span>{b.salesTaxLine}</span>
                  <span>{formatCurrency(data.tax)}</span>
                </div>
                <div className="bos-money-row bos-money-detail">
                  <span>{b.titleFeeLine}</span>
                  <span>{formatCurrency(data.titleFee)}</span>
                </div>
                <div className="bos-money-row bos-money-detail">
                  <span>{b.docFeeLine}</span>
                  <span>{formatCurrency(data.docFee)}</span>
                </div>
                <div className="bos-money-row bos-money-detail">
                  <span>{b.regFeeLine}</span>
                  <span>{formatCurrency(data.registrationFee)}</span>
                </div>
                {data.otherFees > 0 && (
                  <div className="bos-money-row bos-money-detail">
                    <span>
                      e. {data.otherFeesDescription || s.otherFees}
                    </span>
                    <span>{formatCurrency(data.otherFees)}</span>
                  </div>
                )}
                <div className="bos-money-row bos-money-total">
                  <span>{b.totalAmountDue}</span>
                  <span>{formatCurrency(calc.totalDue)}</span>
                </div>
                {sellerLien.enabled && (
                  <div className="bos-money-row bos-lien-figure">
                    <span>{b.sellerLienBalanceLine}</span>
                    <span>{formatCurrency(sellerLien.amount)}</span>
                  </div>
                )}
                <div className="bos-money-row bos-payment-method">
                  <span>{s.paymentMethod}</span>
                  <span>{paymentDisplay}</span>
                </div>
              </div>
            </section>

            <section className="bos-condition">
              {data.conditionType === 'as_is' ? (
                <>
                  <div className="doc-notice">
                    <h2 className="bos-notice-title">{b.asIsTitle}</h2>
                    <p className="doc-notice-body">
                      <strong>{b.asIsText}</strong>
                    </p>
                  </div>
                  <div className="doc-notice">
                    <h2 className="bos-notice-title">{b.noRefundTitle}</h2>
                    <p className="doc-notice-body">
                      <strong>{b.noRefundText}</strong>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="doc-notice">
                    <h2 className="bos-notice-title">
                      {b.limitedWarrantyTitle}
                    </h2>
                    <div className="doc-notice-body">
                      <p>
                        <strong>{b.warrantyPeriod}</strong>{' '}
                        {data.warrantyDuration || '_______________'}
                      </p>
                      <p>
                        <strong>{b.warrantyCoverage}</strong>{' '}
                        {data.warrantyDescription || b.warrantySeparateDoc}
                      </p>
                    </div>
                  </div>
                  <div className="doc-notice">
                    <h2 className="bos-notice-title">{b.noRefundTitle}</h2>
                    <p className="doc-notice-body">
                      <strong>{b.noRefundText}</strong>
                    </p>
                  </div>
                </>
              )}
            </section>
          </div>

          <section className="bos-odometer doc-notice doc-notice-key print-section">
            <h2 className="bos-major-heading">{b.odometerTitle}</h2>
            <p className="doc-notice-body">
              {b.odometerIntro}{' '}
              <strong className="font-mono">
                {data.odometerReading || '___________'}
              </strong>{' '}
              {b.odometerMiles} <strong>{odometerLabel}</strong>.
            </p>
            <div className="bos-odometer-facts">
              <div>
                <span className="bos-field-label">{b.odometerReading}</span>
                <p className="font-mono font-bold">
                  {data.odometerReading || ''}
                </p>
              </div>
              <div>
                <span className="bos-field-label">{b.odometerStatus}</span>
                <p
                  className={
                    data.odometerStatus === 'not_actual'
                      ? 'font-bold bos-odometer-alert'
                      : 'font-bold'
                  }
                >
                  {data.odometerStatus === 'actual'
                    ? b.odometerActual
                    : data.odometerStatus === 'exceeds'
                      ? b.odometerExceeds
                      : b.odometerDiscrepancy}
                </p>
              </div>
              <div>
                <span className="bos-field-label">{b.ackVehicle}</span>
                <p className="font-medium">
                  {data.vehicleYear} {data.vehicleMake} {data.vehicleModel}
                </p>
              </div>
            </div>
          </section>
        </section>

        <section className="bos-page" data-bos-page="obligations">
          {sellerLien.enabled && (
            <section className="bos-lien print-section">
              <div className="bos-lien-heading">
                <div>
                  <h2 className="bos-major-heading">{b.sellerLienTitle}</h2>
                  <p className="bos-helper">{b.sellerLienDescription}</p>
                </div>
                <div className="bos-lien-total">
                  <span className="bos-field-label">{b.securedBalance}</span>
                  <strong>{formatCurrency(sellerLien.amount)}</strong>
                </div>
              </div>
              <div className="bos-lien-facts">
                <div className="bos-lienholder">
                  <span className="bos-field-label">{b.lienholder}</span>
                  <p className="font-semibold">{sellerLien.lienholderName}</p>
                  <p>{sellerLien.lienholderAddress}</p>
                  <p>
                    {sellerLien.lienholderCity}, {sellerLien.lienholderState}{' '}
                    {sellerLien.lienholderZip}
                  </p>
                </div>
                <div>
                  <span className="bos-field-label">{b.lienDate}</span>
                  <p className="font-semibold font-mono">
                    {formatDate(sellerLien.lienDate)}
                  </p>
                </div>
                <div>
                  <span className="bos-field-label">{b.balanceDue}</span>
                  <p className="font-semibold font-mono">
                    {sellerLien.dueDate
                      ? formatDate(sellerLien.dueDate)
                      : b.onDemandPerAgreement}
                  </p>
                </div>
              </div>
              <div className="bos-lien-copy">
                <p>
                  <strong>{b.reason}</strong> {sellerLienReason}.
                </p>
                <p>{b.sellerLienAcknowledgment}</p>
              </div>
            </section>
          )}

          {/*
            The bank's lien, disclosed the way the seller's is.

            A lender-funded deal used to print "Financing" beside the payment
            method and nothing else, while the 130-U filed the same day put
            the bank in box 34. The buyer signs one sheet and the state
            records another; this makes them say the same thing.
          */}
          {titleLien.enabled && (
            <section className="bos-lien print-section" data-title-lien>
              <div className="bos-lien-heading">
                <div>
                  <h2 className="bos-major-heading">{b.titleLienTitle}</h2>
                  <p className="bos-helper">{b.titleLienDescription}</p>
                </div>
              </div>
              <div className="bos-lien-facts">
                <div className="bos-lienholder">
                  <span className="bos-field-label">{b.lienholder}</span>
                  <p className="font-semibold">{titleLien.lienholderName}</p>
                  {titleLien.lienholderAddress ? <p>{titleLien.lienholderAddress}</p> : null}
                  {titleLien.lienholderCity || titleLien.lienholderState || titleLien.lienholderZip ? (
                    <p>
                      {[titleLien.lienholderCity, titleLien.lienholderState].filter(Boolean).join(', ')}{' '}
                      {titleLien.lienholderZip}
                    </p>
                  ) : null}
                </div>
                <div>
                  <span className="bos-field-label">{b.lienDate}</span>
                  <p className="font-semibold font-mono">{formatDate(titleLien.lienDate)}</p>
                </div>
              </div>
              <div className="bos-lien-copy">
                {titleLien.reason ? (
                  <p>
                    <strong>{b.reason}</strong> {titleLien.reason}.
                  </p>
                ) : null}
                <p>{b.titleLienAcknowledgment}</p>
              </div>
            </section>
          )}

          {/*
            What the buyer still owes, and what they still have to do.

            The owner asked for this on its own sheet. It is the page a buyer
            leaves with and looks at again in a week: money outstanding, and
            the errands nobody has run yet. Grouping it here means it can be
            handed over on its own without the terms attached, and the red is
            the whole point of the page.
          */}
          <section className="bos-obligations print-section">
            <h2 className="bos-major-heading">{b.outstandingTitle}</h2>
            <p className="bos-helper">{b.outstandingIntro}</p>

            <div className="bos-checklist">
              {outstandingItems.map((item) => (
                <div key={item.key} className="bos-checklist-row">
                  <span
                    className="bos-checkbox"
                    data-done={item.done ? "true" : "false"}
                    aria-hidden="true"
                  />
                  <div>
                    <p className={item.owed ? "bos-checklist-name bos-important" : "bos-checklist-name"}>
                      {item.label}
                    </p>
                    <p className="bos-checklist-note">{item.note}</p>
                  </div>
                  <span className={item.owed ? "bos-checklist-status bos-important" : "bos-checklist-status"}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </section>

        <section className="bos-page" data-bos-page="agreement">
          <div className="bos-terms columns-2 print-section">
            <p>{renderLegalClause(b.transferOfTitle)}</p>
            <p>{renderLegalClause(b.representations)}</p>
            <p>{renderLegalClause(b.governingLaw)}</p>
            <p>{renderLegalClause(b.riskOfLoss)}</p>
            <p>{renderLegalClause(b.entireAgreement)}</p>
          </div>

          <section className="bos-acknowledgment">
            <header className="bos-ack-heading">
              <h2 className="bos-major-heading">{b.ackTitle}</h2>
              <p className="bos-helper">{b.ackRetain}</p>
            </header>

            <dl className="bos-ack-facts">
              <div>
                <dt className="bos-field-label">{b.ackBuyer}</dt>
                <dd className="font-semibold">
                  {data.buyerName || '________________________'}
                </dd>
              </div>
              <div>
                <dt className="bos-field-label">{b.ackDateOfSale}</dt>
                <dd className="font-semibold font-mono">
                  {formatDate(data.saleDate) || '________________________'}
                </dd>
              </div>
              <div>
                <dt className="bos-field-label">{b.ackVehicle}</dt>
                <dd className="font-medium">
                  {data.vehicleYear} {data.vehicleMake} {data.vehicleModel}{' '}
                  {data.vehicleTrim}
                </dd>
              </div>
              <div>
                <dt className="bos-field-label">{s.vin}</dt>
                <dd className="font-mono">{data.vehicleVin}</dd>
              </div>
              <div>
                <dt className="bos-field-label">{b.odometerReading}</dt>
                <dd className="font-mono">{data.odometerReading} mi</dd>
              </div>
            </dl>

            <dl className="bos-ack-money">
              <div>
                <dt className="bos-field-label">{b.ackSalePrice}</dt>
                <dd>{formatCurrency(data.salePrice)}</dd>
              </div>
              <div>
                <dt className="bos-field-label">{b.ackFeesTax}</dt>
                <dd>{formatCurrency(calc.feesSubtotal)}</dd>
              </div>
              <div>
                <dt className="bos-field-label">{b.ackTotalPaid}</dt>
                <dd>{formatCurrency(calc.totalDue)}</dd>
              </div>
              {sellerLien.enabled && (
                <div>
                  <dt className="bos-field-label">{b.ackSellerLienBalance}</dt>
                  <dd className="bos-lien-figure">
                    {formatCurrency(sellerLien.amount)}
                  </dd>
                  <p className="bos-helper">{sellerLienReason}</p>
                </div>
              )}
              {titleLien.enabled && (
                <div>
                  <dt className="bos-field-label">{b.ackTitleLien}</dt>
                  <dd className="bos-lien-figure">{titleLien.lienholderName}</dd>
                </div>
              )}
            </dl>

            <div className="bos-ack-copy">
              <p className="bos-ack-intro">
                <strong>{b.ackIntro}</strong>
              </p>
              <div className="bos-ack-list">
                {acknowledgmentItems.map(([key, label]) => (
                  <div key={key} className="bos-ack-item">
                    <span aria-hidden="true">
                      {acknowledgments?.[key] ? '\u2611' : '\u2610'}
                    </span>
                    <p>{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="bos-signatures print-signatures">
            <p className="bos-signature-agreement">{b.signatureAgreement}</p>
            <div className="bos-signature-grid">
              <SignatureLinePreview
                label={s.buyerSignature}
                dateLabel={s.date}
                signatureImage={signatures.buyerSignature}
                signatureDate={signatures.buyerSignatureDate || today}
                printedName={data.buyerName}
              />
              {hasCoBuyer && (
                <SignatureLinePreview
                  label={s.coBuyerSignature}
                  dateLabel={s.date}
                  signatureImage={signatures.coBuyerSignature}
                  signatureDate={signatures.coBuyerSignatureDate || today}
                  printedName={data.coBuyerName}
                />
              )}
              <SignatureLinePreview
                label={`${s.sellerDealer}. ${s.driverLicense} ${DEALER_LICENSE}`}
                dateLabel={s.date}
                signatureImage={signatures.dealerSignature}
                signatureDate={signatures.dealerSignatureDate || today}
              />
              <SignatureLinePreview
                label={b.witnessNotary}
                dateLabel={s.date}
              />
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}
