import DocumentLetterhead from "@/components/documents/DocumentLetterhead";
import SignatureLinePreview from "@/components/documents/SignatureLinePreview";
import { usDate } from "@/lib/documents/us-date";
import {
  getSalvageCopy,
  odometerWords,
  salvageVehicleParts,
  type SalvageLanguage,
  type SalvageSaleData,
} from "@/lib/documents/salvageSale";
import { brand, dealership } from "@/lib/dealership-config";

/**
 * The three tow-away sheets, one component, because they are one document
 * in three parts: the same buyer, the same car, the same money, the same
 * pair of signature lines, and a different set of clauses on each. Drawn
 * with the `bos-` system every other page in the packet uses, so the packet
 * reads as one hand. The one sentence that has to be read on each sheet is
 * set in the bill of sale's important band, which is the only red on the
 * paper.
 *
 * The legal wording lives in `@/lib/documents/salvageSale` so counsel can
 * revise it without touching a React component.
 */

export type SalvageSheet = "salvageBillOfSale" | "towAwayAcknowledgment" | "buyerResponsibilityStatement";

type Props = {
  sheet: SalvageSheet;
  data: SalvageSaleData;
  language?: SalvageLanguage;
  buyerSignature?: string | null;
  buyerSignatureDate?: string | null;
  dealerSignature?: string | null;
  dealerSignatureDate?: string | null;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="bos-field-label">{label}</span>
      <p className="font-medium">{value || " "}</p>
    </div>
  );
}

function dollars(amount: number): string {
  return `$${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function SalvageSaleDocument({
  sheet,
  data,
  language = "en",
  buyerSignature,
  buyerSignatureDate,
  dealerSignature,
  dealerSignatureDate,
}: Props) {
  const copy = getSalvageCopy(language);
  const parts = salvageVehicleParts(data);

  const heading =
    sheet === "salvageBillOfSale"
      ? copy.billHeading
      : sheet === "towAwayAcknowledgment"
        ? copy.towHeading
        : copy.responsibilityHeading;
  const subtitle =
    sheet === "salvageBillOfSale"
      ? copy.billSubtitle
      : sheet === "towAwayAcknowledgment"
        ? copy.towSubtitle
        : copy.responsibilitySubtitle;
  const important =
    sheet === "salvageBillOfSale"
      ? copy.billImportant
      : sheet === "towAwayAcknowledgment"
        ? copy.towImportant
        : copy.responsibilityImportant;
  const clausesHeading =
    sheet === "salvageBillOfSale"
      ? copy.billHeadingClauses
      : sheet === "towAwayAcknowledgment"
        ? copy.towHeadingClauses
        : copy.responsibilityHeadingClauses;
  const clauses =
    sheet === "salvageBillOfSale"
      ? copy.billClauses
      : sheet === "towAwayAcknowledgment"
        ? copy.towClauses
        : copy.responsibilityClauses;

  const titleFrom = data.titleOriginState ? data.titleOriginState : dealership.address.region;
  const leaving = data.howLeaving ? copy.howLeaving[data.howLeaving] : "";

  return (
    // `print-doc` is what the PDF generator waits for before it prints.
    <div className="print-doc bos-print doc-sheet">
      <section className="bos-page" data-bos-page={sheet}>
        <DocumentLetterhead
          title={heading}
          subtitle={subtitle}
          reference={[
            { label: copy.dateLabel, value: usDate(data.saleDate) },
            { label: copy.titleBrandLabel, value: copy.titleBrand },
          ]}
        />

        <p className="bos-important">{important}</p>

        <section className="bos-section">
          <h2 className="bos-section-heading">{copy.vehicleHeading}</h2>
          <div className="bos-trade-grid">
            <Field label={copy.yearLabel} value={parts.year} />
            <Field label={copy.makeLabel} value={parts.make} />
            <Field label={copy.modelLabel} value={parts.model} />
          </div>
          <div className="doc-vin">
            <div>
              <span className="doc-vin-label">VIN</span>
              <span className="doc-vin-value">{data.vin}</span>
            </div>
            <div className="doc-vin-secondary">
              <span className="doc-vin-label">{copy.titleFromLabel}</span>
              <span className="doc-vin-value">{titleFrom}</span>
            </div>
          </div>
          {sheet === "salvageBillOfSale" ? (
            <div className="bos-trade-grid mt-4">
              <Field
                label={copy.odometerLabel}
                value={
                  data.vehicleMileage
                    ? `${data.vehicleMileage} · ${odometerWords(copy, data.odometerStatus)}`
                    : odometerWords(copy, data.odometerStatus)
                }
              />
              <Field
                label={copy.salvageLicenseLabel}
                value={data.salvageLicense || copy.salvageLicenseNone}
              />
            </div>
          ) : null}
          {sheet === "towAwayAcknowledgment" ? (
            <div className="bos-trade-grid mt-4">
              <Field label={copy.howLeavingLabel} value={leaving} />
            </div>
          ) : null}
        </section>

        <section className="bos-section">
          <h2 className="bos-section-heading">{copy.buyerHeading}</h2>
          <div className="bos-trade-grid">
            <Field label={copy.nameLabel} value={data.buyerName} />
            <Field label={copy.idLabel} value={data.buyerIdNumber} />
            <Field label={copy.phoneLabel} value={data.buyerPhone} />
          </div>
          <div className="mt-4">
            <Field label={copy.addressLabel} value={data.buyerAddress} />
          </div>
        </section>

        {sheet === "salvageBillOfSale" ? (
          <section className="bos-section">
            <h2 className="bos-section-heading">{copy.moneyHeading}</h2>
            <div className="bos-trade-grid">
              <Field label={copy.priceLabel} value={dollars(data.salePrice)} />
              <Field label={copy.taxLabel} value={dollars(data.tax)} />
              <Field label={copy.titleFeeLabel} value={dollars(data.titleFee)} />
              <Field label={copy.docFeeLabel} value={dollars(data.docFee)} />
              <Field label={copy.totalLabel} value={dollars(data.total)} />
              <Field label={copy.paidTodayLabel} value={dollars(data.amountPaidToday)} />
            </div>
            <div className="mt-4">
              <Field label={copy.paymentMethodLabel} value={data.paymentMethod} />
            </div>
          </section>
        ) : null}

        <section className="bos-section">
          <h2 className="bos-major-heading">{clausesHeading}</h2>
          <div className="bos-checklist">
            {clauses.map((clause, index) => (
              <div key={index} className="bos-checklist-row">
                {/* Ticked once the buyer has signed: a signed sheet with every
                    box empty reads as a form nobody finished. Unsigned, the
                    boxes stay open for the buyer to initial in ink. */}
                <span className="bos-checkbox" data-done={buyerSignature ? "true" : "false"} aria-hidden="true" />
                <div>
                  <p className="bos-checklist-note">{clause}</p>
                </div>
                <span />
              </div>
            ))}
          </div>
        </section>

        <section className="bos-signatures print-signatures">
          <p className="bos-signature-agreement">{copy.attestation}</p>
          <div className="bos-signature-grid">
            <SignatureLinePreview
              label={copy.buyerSignatureLabel}
              dateLabel={copy.dateLabel}
              signatureImage={buyerSignature ?? undefined}
              signatureDate={buyerSignatureDate ?? data.saleDate}
              printedName={data.buyerName}
            />
            <SignatureLinePreview
              label={`${copy.dealerSignatureLabel}, ${brand.legal}`}
              dateLabel={copy.dateLabel}
              signatureImage={dealerSignature ?? undefined}
              signatureDate={dealerSignatureDate ?? data.saleDate}
            />
          </div>
          <p className="bos-helper" style={{ marginTop: "0.75rem" }}>
            {dealership.name} · {dealership.address.street}, {dealership.address.locality},{" "}
            {dealership.address.region} {dealership.address.postalCode}
            {data.salvageLicense ? ` · ${copy.salvageLicenseLabel} ${data.salvageLicense}` : ""}
          </p>
        </section>
      </section>
    </div>
  );
}
