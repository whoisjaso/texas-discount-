import {
  DOC_FEE_NOTICE_EN,
  DOC_FEE_NOTICE_ES,
  printsDocFeeNotice,
  printsSpanishDocFeeNotice,
} from "@/lib/legal/doc-fee-notice";

/**
 * The documentary fee notice, printed beside the fee on the buyer's order
 * (the bill of sale and the salvage bill of sale), word for word, in bold
 * capitals (Tex. Fin. Code §348.006(c)(3)). The approved Spanish notice
 * (OCCC Bulletin B09-3) prints beside it on a Spanish sale (§348.006(d)).
 *
 * Only on a copy stamped at filing (`docFeeNotice`, corridor-link.ts): a copy
 * filed before the notice existed re-renders exactly as it was filed.
 */
export default function DocFeeNotice({
  data,
  spanish,
}: {
  data: Record<string, unknown>;
  /** Forces the Spanish notice on (a sheet printed in Spanish). */
  spanish?: boolean;
}) {
  if (!printsDocFeeNotice(data)) return null;
  const withSpanish = spanish === true || printsSpanishDocFeeNotice(data);
  return (
    <div className="bos-doc-fee-notice" data-doc-fee-notice="">
      <p lang="en">{DOC_FEE_NOTICE_EN}</p>
      {withSpanish ? <p lang="es">{DOC_FEE_NOTICE_ES}</p> : null}
    </div>
  );
}
