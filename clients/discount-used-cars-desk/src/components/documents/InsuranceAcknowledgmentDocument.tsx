import DocumentLetterhead from "@/components/documents/DocumentLetterhead";
import SignatureLinePreview from "@/components/documents/SignatureLinePreview";
import { usDate } from "@/lib/documents/us-date";
import {
  getInsuranceCopy,
  type AcknowledgmentLanguage,
  type InsuranceAcknowledgmentData,
} from "@/lib/documents/insuranceAcknowledgment";
import { brand, dealership } from "@/lib/dealership-config";

/**
 * Insurance Acknowledgment, on the house paper.
 *
 * The buyer signs this when they showed no proof of insurance at the desk.
 * It is the document the sale plan adds when the insurance question is
 * answered No, and until this file existed that answer produced a document
 * type nothing could draw.
 *
 * Typeset with the same `bos-` system as the bill of sale and the Vehicle
 * Responsibility form: bands divided by hairlines, the serif above 18px and
 * Geist below it, the one sentence that matters set apart. A packet whose
 * pages are designed by different hands reads as a pile of forms.
 *
 * The legal wording is not written here. It lives in
 * `@/lib/documents/insuranceAcknowledgment` so counsel can revise it without
 * touching a React component, and both language versions move together.
 */

type Props = {
  data: InsuranceAcknowledgmentData;
  language?: AcknowledgmentLanguage;
  buyerSignature?: string | null;
  buyerSignatureDate?: string | null;
  /** The staff member's stroke, drawn on the dealer line when they hold one. */
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

export default function InsuranceAcknowledgmentDocument({
  data,
  language = "en",
  buyerSignature,
  buyerSignatureDate,
  dealerSignature,
  dealerSignatureDate,
}: Props) {
  const copy = getInsuranceCopy(language);

  return (
    // `print-doc` is what the PDF generator waits for before it prints.
    <div className="print-doc bos-print doc-sheet">
      <section className="bos-page" data-bos-page="insurance">
        <DocumentLetterhead
          title={copy.heading}
          subtitle={copy.subtitle}
          reference={[{ label: copy.dateLabel, value: usDate(data.saleDate) }]}
        />

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

        <section className="bos-section">
          <h2 className="bos-section-heading">{copy.vehicleHeading}</h2>
          <div className="doc-vin">
            <div>
              <span className="doc-vin-label">{copy.vehicleLabel}</span>
              <p className="font-medium" style={{ fontSize: "1.05rem" }}>
                {data.vehicleDescription}
              </p>
            </div>
            <div className="doc-vin-secondary">
              <span className="doc-vin-label">VIN</span>
              <span className="doc-vin-value">{data.vin}</span>
            </div>
          </div>
        </section>

        <section className="bos-section">
          <h2 className="bos-major-heading">{copy.agreesHeading}</h2>
          <p className="bos-helper">{copy.intro}</p>
          <div className="bos-checklist">
            {copy.clauses.map((clause, index) => (
              <div key={index} className="bos-checklist-row">
                {/* Ticked once the buyer has signed: a signed acknowledgment with
                    every box empty reads as a form nobody finished. Unsigned,
                    the boxes stay open for the buyer to initial in ink. */}
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
            {/* The dealer's line carries the staff member's own stroke, the one
                drawn once at onboarding, so every sheet in the packet is
                signed by the person who filed it. */}
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
          </p>
        </section>
      </section>
    </div>
  );
}
