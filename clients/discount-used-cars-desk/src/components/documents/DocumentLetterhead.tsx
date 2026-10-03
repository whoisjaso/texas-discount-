import Monogram from "@/components/site/shared/Monogram";
import {
  DEALER_ADDRESS,
  DEALER_LICENSE,
  DEALER_NAME,
  DEALER_PHONE,
  DEALER_WEBSITE,
} from "@/lib/documents/shared";
import { getDocStrings } from "@/lib/documents/i18n";

/**
 * The letterhead every document this dealer files carries.
 *
 * The dealer's logo in black ink, a hairline, and the dealer block set small.
 * A document is read and filed, sometimes photocopied — so it is built out of
 * black type and rules, and the logo is the ink version rather than the red
 * and navy one that turns to mud on a fax. The logo already sets the name, so
 * no drawn wordmark repeats it beside the mark.
 *
 * Dealer details come from the shared config. Nobody types them onto a form.
 */
export default function DocumentLetterhead({
  title,
  subtitle,
  reference,
  lang = "en",
}: {
  title: string;
  subtitle?: string;
  /** The sheet's language: the licence label prints in it (documents.shared.dealerLicenceShort). */
  lang?: "en" | "es";
  /** Date, stock number and anything else that identifies this copy. */
  reference?: Array<{ label: string; value: string }>;
}) {
  return (
    <header className="doc-letterhead">
      <div className="doc-letterhead-row">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* The owner's logo, in ink: colour turns to mud on a copier. */}
          <Monogram height={58} tone="ink" />
        </div>
        <div className="doc-dealer">
          <p className="doc-dealer-name">{DEALER_NAME}</p>
          <p>{DEALER_ADDRESS}</p>
          <p>
            {DEALER_PHONE} · {DEALER_WEBSITE}
          </p>
          <p>
            {getDocStrings(lang).shared.dealerLicenceShort} {DEALER_LICENSE}
          </p>
        </div>
      </div>

      <div className="doc-title-row">
        <div>
          <h1 className="doc-title">{title}</h1>
          {subtitle ? <p className="doc-subtitle">{subtitle}</p> : null}
        </div>
        {reference && reference.length > 0 ? (
          <dl className="doc-reference">
            {reference.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </header>
  );
}
