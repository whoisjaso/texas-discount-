import Monogram from "@/components/site/shared/Monogram";
import Wordmark from "@/components/site/shared/Wordmark";
import {
  DEALER_ADDRESS,
  DEALER_LICENSE,
  DEALER_NAME,
  DEALER_PHONE,
  DEALER_WEBSITE,
} from "@/lib/documents/shared";

/**
 * The letterhead every Triple J document carries.
 *
 * Typographic, not a badge: the wordmark, a hairline, and the dealer block set
 * small. A document is read and filed, sometimes photocopied — so it is built
 * out of black type and rules rather than a logo that turns to mud on a fax.
 *
 * Dealer details come from the shared config. Nobody types them onto a form.
 */
export default function DocumentLetterhead({
  title,
  subtitle,
  reference,
}: {
  title: string;
  subtitle?: string;
  /** Date, stock number and anything else that identifies this copy. */
  reference?: Array<{ label: string; value: string }>;
}) {
  return (
    <header className="doc-letterhead">
      <div className="doc-letterhead-row">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* The owner's marks, in ink: copper turns to mud on a copier. */}
          <Monogram height={54} tone="ink" />
          <Wordmark width={168} tone="dark" withSubline />
        </div>
        <div className="doc-dealer">
          <p className="doc-dealer-name">{DEALER_NAME}</p>
          <p>{DEALER_ADDRESS}</p>
          <p>
            {DEALER_PHONE} · {DEALER_WEBSITE}
          </p>
          <p>Dealer licence {DEALER_LICENSE}</p>
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
