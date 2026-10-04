interface Props {
  label: string;
  dateLabel?: string;
  signatureImage?: string;
  signatureDate?: string;
  printedName?: string;
}

import { usDate } from '@/lib/documents/us-date';

/**
 * Handles both YYYY-MM-DD (the corridor and the wizard) and full ISO
 * timestamps (the rental path writes `new Date().toISOString()`). A plain
 * date is never shifted; an instant is dated in the dealership's own time
 * zone rather than the server's, which is how a 7:41 pm signature in
 * Houston was printed as the next day.
 */
function formatSignatureDate(raw: string): string {
  return usDate(raw);
}

export default function SignatureLinePreview({ label, dateLabel = 'Date', signatureImage, signatureDate, printedName }: Props) {
  return (
    <div>
      <div className="signature-line-container border-b border-black h-14 mb-2 relative flex items-end">
        {signatureImage && (
          // eslint-disable-next-line @next/next/no-img-element -- Signature previews are user-generated data URLs inside printable documents.
          <img
            src={signatureImage}
            alt={label}
            className="signature-img h-12 max-w-[300px] object-contain absolute bottom-0 left-2"
          />
        )}
        {signatureDate && (
          <span className="signature-date absolute bottom-1 right-0 text-xs text-[color:var(--tj-ink)] font-medium">
            {formatSignatureDate(signatureDate)}
          </span>
        )}
      </div>
      <div className="flex justify-between gap-4 text-[10px] uppercase tracking-widest font-semibold">
        <span className="min-w-0">{label}</span>
        <span className="shrink-0">{dateLabel}</span>
      </div>
      {printedName && <p className="text-[10px] text-[color:var(--tj-muted)] mt-1">{printedName}</p>}
    </div>
  );
}
