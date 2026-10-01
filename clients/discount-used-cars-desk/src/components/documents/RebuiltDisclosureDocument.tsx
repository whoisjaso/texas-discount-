import DocumentLetterhead from "@/components/documents/DocumentLetterhead";
import SignatureLinePreview from "@/components/documents/SignatureLinePreview";
import { usDate } from "@/lib/documents/us-date";
import {
  getRebuiltCopy,
  vehicleParts,
  type DisclosureLanguage,
  type RebuiltDisclosureData,
} from "@/lib/documents/rebuiltDisclosure";
import { brand, dealership } from "@/lib/dealership-config";

/**
 * Rebuilt Salvage Title Disclosure, on the house paper.
 *
 * The first document the corridor walks on a rebuilt car, because Texas
 * wants it signed before any instrument of sale. The vehicle's title
 * status puts it in the packet; nobody chooses it.
 *
 * It is our own sheet, and it answers for the state's. The TxDMV publishes
 * a one-page Rebuilt Motor Vehicle Written Disclosure (Form ENF-MV-RBLT
 * DSCLMR): year, make, VIN, and one sentence in the purchaser's own voice
 * over their name and the date. The owner's call was to print that on our
 * paper rather than staple the state's PDF behind ours, so this sheet
 * carries the year and make as their own lines, the VIN, and the state's
 * sentence word for word with the purchaser's name set into it, above the
 * signature. One document, both languages, one look.
 *
 * Typeset with the same `bos-` system as every other page in the packet.
 * The one sentence that has to be read is set in the bill of sale's
 * important band, which is the only red on the sheet.
 *
 * The legal wording lives in `@/lib/documents/rebuiltDisclosure` so counsel
 * can revise it without touching a React component.
 */

type Props = {
  data: RebuiltDisclosureData;
  language?: DisclosureLanguage;
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

/**
 * The state's sentence with the purchaser's name set into it.
 *
 * The name is the one thing on the line that is not the state's wording,
 * so it is the one thing set apart: heavier, on its own rule, the way a
 * name written onto a printed form reads.
 */
function Written({ template, name, className }: { template: string; name: string; className: string }) {
  const [before, after] = template.split("{name}");
  return (
    <p className={className}>
      {before}
      <span className="bos-written-name">{name || " "}</span>
      {after}
    </p>
  );
}

export default function RebuiltDisclosureDocument({
  data,
  language = "en",
  buyerSignature,
  buyerSignatureDate,
  dealerSignature,
  dealerSignatureDate,
}: Props) {
  const copy = getRebuiltCopy(language);
  const parts = vehicleParts(data);

  return (
    // `print-doc` is what the PDF generator waits for before it prints.
    <div className="print-doc bos-print doc-sheet">
      <section className="bos-page" data-bos-page="rebuilt">
        <DocumentLetterhead
          title={copy.heading}
          subtitle={copy.subtitle}
          reference={[
            { label: copy.dateLabel, value: usDate(data.saleDate) },
            { label: copy.titleBrandLabel, value: copy.titleBrand },
          ]}
        />

        <p className="bos-important">{copy.important}</p>

        <section className="bos-section">
          <h2 className="bos-section-heading">{copy.vehicleHeading}</h2>
          {/* Year and make on their own lines, because the state's form has a
              rule for each and this sheet stands in for it. */}
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
          </div>
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

        {/* The state's written disclosure, in the purchaser's voice. */}
        <section className="bos-section" data-rebuilt-written>
          <h2 className="bos-major-heading">{copy.writtenHeading}</h2>
          <Written template={copy.written} name={data.buyerName} className="bos-written" />
          <p className="bos-helper bos-written-source">{copy.writtenSource}</p>
          {copy.writtenOriginal ? (
            <Written template={copy.writtenOriginal} name={data.buyerName} className="bos-written bos-written-original" />
          ) : null}
        </section>

        <section className="bos-section">
          <h2 className="bos-major-heading">{copy.disclosureHeading}</h2>
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
