import DocumentLetterhead from "@/components/documents/DocumentLetterhead";
import SignatureLinePreview from "@/components/documents/SignatureLinePreview";
import { usDate } from "@/lib/documents/us-date";
import {
  LATE_HANDLING_FEE_USD,
  TRANSFER_WINDOW_DAYS,
  buildReturnClause,
  formatUsd,
  getLegalBody,
  type VehicleResponsibilityLanguage,
} from "@/lib/documents/vehicleResponsibility";
import { brand, dealership } from "@/lib/dealership-config";

/**
 * Vehicle Responsibility Acknowledgment, on the house paper.
 *
 * The buyer signs this when they take their own title and registration on
 * rather than have us file it, which since HB 718 is the exception. It is
 * the document the sale plan swaps in when registration goes to the buyer.
 *
 * Typeset with the same `bos-` system as the bill of sale rather than a
 * second set of rules: bands divided by full width hairlines, the editorial
 * serif above 18px and Geist below it, generous leading, and anything the
 * buyer still owes in red. A packet whose pages are designed by different
 * hands reads as a pile of forms, which is the thing this product exists to
 * stop being.
 *
 * The legal wording is not written here. It lives in
 * `@/lib/documents/vehicleResponsibility` so counsel can revise it without
 * touching a React component, and both language versions move together.
 */

export type VehicleResponsibilityDocumentData = {
  buyerName: string;
  buyerIdNumber: string;
  buyerPhone: string;
  buyerAddress: string;
  vehicleDescription: string;
  vin: string;
  /** ISO date, YYYY-MM-DD. */
  saleDate: string;
  quotedRegistrationAmount: number;
};

type Props = {
  data: VehicleResponsibilityDocumentData;
  language?: VehicleResponsibilityLanguage;
  /** Ink signature captured on a pad, when there is one. */
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
      {/* A blank field prints as blank, holding its line height with a
          non-breaking space. A dash placeholder is both a banned character
          and worse on paper: this is a line somebody writes on. */}
      <p className="font-medium">{value || " "}</p>
    </div>
  );
}

export default function VehicleResponsibilityDocument({
  data,
  language = "en",
  buyerSignature,
  buyerSignatureDate,
  dealerSignature,
  dealerSignatureDate,
}: Props) {
  const body = getLegalBody(language);
  const es = language === "es";
  const returnClause = buildReturnClause(
    language,
    data.quotedRegistrationAmount,
    LATE_HANDLING_FEE_USD,
  );

  return (
    // `print-doc` is what the PDF generator waits for before it prints. This
    // sheet only ever reached a browser's own print dialog before; the packet
    // prints it through the generator now.
    <div className="print-doc bos-print doc-sheet">
      <section className="bos-page" data-bos-page="responsibility">
        {/* The letterhead owns the title row, so this document's name and its
            reference data sit on the same grid as the bill of sale's. */}
        <DocumentLetterhead
          title={body.heading}
          subtitle={
            es
              ? "El comprador titula y registra este vehículo"
              : "Buyer Files Their Own Title And Registration"
          }
          reference={[{ label: body.dateLabel, value: usDate(data.saleDate) }]}
        />

        <section className="bos-section">
          <h2 className="bos-section-heading">{es ? "Comprador" : "Buyer"}</h2>
          <div className="bos-trade-grid">
            <Field label={es ? "Nombre" : "Name"} value={data.buyerName} />
            <Field label={es ? "Número de identificación" : "ID number"} value={data.buyerIdNumber} />
            <Field label={es ? "Teléfono" : "Phone"} value={data.buyerPhone} />
          </div>
          <div className="mt-4">
            <Field label={es ? "Dirección" : "Address"} value={data.buyerAddress} />
          </div>
        </section>

        <section className="bos-section">
          <h2 className="bos-section-heading">{es ? "Vehículo" : "Vehicle"}</h2>
          {/* The VIN takes the identifier treatment, uppercase and monospaced
              so a clerk can read it a character at a time. The description is
              a name, not an identifier, so it stays in the body voice: it was
              printing as "2019 BMW 530I XDRIVE", which is a licence plate
              impression of a car rather than the car. */}
          <div className="doc-vin">
            <div>
              <span className="doc-vin-label">{es ? "Vehículo" : "Vehicle"}</span>
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
          <h2 className="bos-major-heading">
            {es ? "Lo Que El Comprador Acepta" : "What The Buyer Agrees To"}
          </h2>
          <p className="bos-helper">{body.intro}</p>

          <div className="bos-checklist">
            {body.clauses.map((clause, index) => (
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

        {/*
          The money clause, in red.

          It is the one paragraph on this sheet that costs the buyer something
          later, and it is the reason the form exists at all: if the filing
          comes back to us it comes back with a penalty we have already paid.
          Red is how it stops being a paragraph nobody read.
        */}
      </section>

      {/*
        The money and the signature, on their own sheet.

        These two belong together and they were spilling as an overflow: the
        clause a buyer pays for, then the line they sign. Made an explicit
        page rather than left to land wherever the first one ran out, so it
        centres on the paper the way every other short page does and reads as
        the signing sheet it is.
      */}
      <section className="bos-page" data-bos-page="responsibility">
        <section className="bos-section">
          <h2 className="bos-major-heading">
            {es ? "Si Nos Lo Devuelve" : "If It Comes Back To Us"}
          </h2>

          {/*
            The money, reckoned rather than buried.

            This figure used to live only inside the red paragraph below and
            again as a grey line under the signatures, which is two places for
            one number and neither of them somewhere an eye lands. The bill of
            sale sets the amount a buyer owes line by line and then large, and
            this is the one figure on this sheet that costs them anything
            later, so it gets the same treatment from the same stylesheet.

            The clause stays underneath. It is the agreement; this is the
            arithmetic, and a buyer should be able to check one against the
            other without reading a paragraph twice.
          */}
          <div className="bos-reckoning-wrap print-section">
            <dl className="doc-reckoning">
              <div className="doc-reckoning-row">
                <dt>{body.quotedLabel}</dt>
                <dd>{formatUsd(data.quotedRegistrationAmount)}</dd>
              </div>
              <div className="doc-reckoning-row">
                <dt>{body.feeLabel}</dt>
                <dd>{formatUsd(LATE_HANDLING_FEE_USD)}</dd>
              </div>
              <div className="doc-reckoning-total">
                <dt>{body.owedTotalLabel}</dt>
                <dd className="bos-live-figure">
                  {formatUsd(data.quotedRegistrationAmount + LATE_HANDLING_FEE_USD)}
                </dd>
              </div>
            </dl>
          </div>

          <p className="bos-important">{returnClause}</p>
          <p className="bos-helper" style={{ marginTop: "0.5rem" }}>
            {es
              ? `La solicitud debe presentarse dentro de ${TRANSFER_WINDOW_DAYS} días de la fecha de venta.`
              : `The application must be filed within ${TRANSFER_WINDOW_DAYS} days of the sale date above.`}
          </p>
        </section>

        <section className="bos-signatures print-signatures">
          <p className="bos-signature-agreement">{body.attestation}</p>
          <div className="bos-signature-grid">
            <SignatureLinePreview
              label={body.buyerSignatureLabel}
              dateLabel={body.dateLabel}
              signatureImage={buyerSignature ?? undefined}
              signatureDate={buyerSignatureDate ?? data.saleDate}
              printedName={data.buyerName}
            />
            {/* The dealer's line carries the staff member's own stroke, the one
                drawn once at onboarding, so every sheet in the packet is
                signed by the person who filed it. */}
            <SignatureLinePreview
              label={`${body.dealerSignatureLabel}, ${brand.legal}`}
              dateLabel={body.dateLabel}
              signatureImage={dealerSignature ?? undefined}
              signatureDate={dealerSignatureDate ?? data.saleDate}
            />
          </div>
          {/* The dealership, and only the dealership. The quoted figure used
              to be repeated here in grey after being stated twice above; a
              number a buyer is agreeing to owe belongs in one place they can
              point at, not scattered down the page. */}
          <p className="bos-helper" style={{ marginTop: "0.75rem" }}>
            {dealership.name} · {dealership.address.street}, {dealership.address.locality},{" "}
            {dealership.address.region} {dealership.address.postalCode}
          </p>
        </section>
      </section>
    </div>
  );
}
