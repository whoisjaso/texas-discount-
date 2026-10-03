/**
 * The documentary fee notice, word for word (rulebook section 1.2).
 *
 * Texas requires this exact notice in reasonable proximity to the doc fee on
 * the buyer's order (the desk's bill of sale) and on the retail installment
 * contract, in type that is bold, capitalized, underlined or otherwise
 * conspicuous, and posted where sales close (Tex. Fin. Code §348.006(c)(3),
 * (d)). Never paraphrased and never translated afresh: a test compares these
 * strings to the statute and the OCCC's approved translations by equality,
 * not by "contains".
 *
 * Pure strings, safe in the browser.
 */

/**
 * Tex. Fin. Code §348.006(c)(3)(B), as worded by HB 3621 (eff. 2009-09-01);
 * section last amended 2017-09-01. The comma after "BY LAW" and the last
 * sentence are part of the statute.
 */
export const DOC_FEE_NOTICE_EN =
  "A DOCUMENTARY FEE IS NOT AN OFFICIAL FEE. A DOCUMENTARY FEE IS NOT REQUIRED BY LAW, BUT MAY BE CHARGED TO BUYERS FOR HANDLING DOCUMENTS RELATING TO THE SALE. A DOCUMENTARY FEE MAY NOT EXCEED A REASONABLE AMOUNT AGREED TO BY THE PARTIES. THIS NOTICE IS REQUIRED BY LAW.";

/**
 * OCCC Advisory Bulletin B09-3 (2009-07-02, still current), Option 2. Chosen
 * because it matches the desk's existing Spanish label, "Cargo por
 * Documentación". Option 1 is equally approved; if counsel prefers it, this
 * is the one constant to change (DOC_FEE_NOTICE_ES_OPTION_1 below).
 */
export const DOC_FEE_NOTICE_ES =
  "UN CARGO DOCUMENTAL NO ES UN CARGO OFICIAL. LA LEY NO EXIGE QUE SE IMPONGA UN CARGO DOCUMENTAL. PERO ÉSTE PODRÍA COBRARSE A LOS COMPRADORES POR EL MANEJO DE LA DOCUMENTACIÓN EN RELACIÓN CON LA VENTA. UN CARGO DOCUMENTAL NO PUEDE EXCEDER UNA CANTIDAD RAZONABLE ACORDADA POR LAS PARTES. ESTA NOTIFICACIÓN SE EXIGE POR LEY.";

/** OCCC Advisory Bulletin B09-3, Option 1: recorded, not printed. */
export const DOC_FEE_NOTICE_ES_OPTION_1 =
  "UN HONORARIO DE DOCUMENTACIÓN NO ES UN HONORARIO OFICIAL. UN HONORARIO DE DOCUMENTACIÓN NO ES REQUERIDO POR LA LEY, PERO PUEDE SER CARGADA AL COMPRADOR COMO GASTOS DE MANEJO DE DOCUMENTOS RELACIONADOS CON UNA VENTA. UN HONORARIO DE DOCUMENTACIÓN NO PUEDE EXCEDER UNA CANTIDAD RAZONABLE ACORDADA POR LAS PARTES. ESTA NOTIFICACIÓN ES REQUERIDA POR LA LEY.";

/**
 * Tex. Fin. Code §345.251(c)(2), the wording for motorcycles, ATVs, mopeds,
 * towable RVs and watercraft on a Ch. 345 contract. Recorded, not used: the
 * desk does not write Ch. 345 contracts.
 */
export const DOC_FEE_NOTICE_CH345_EN =
  "A DOCUMENTARY FEE IS NOT AN OFFICIAL FEE. A DOCUMENTARY FEE IS NOT REQUIRED BY LAW, BUT MAY BE CHARGED TO BUYERS FOR HANDLING DOCUMENTS RELATING TO THE SALE. A DOCUMENTARY FEE MAY NOT EXCEED A REASONABLE AMOUNT AGREED TO BY THE PARTIES THAT IS NOT MORE THAN THE MAXIMUM AMOUNT ALLOWED BY THE STATE. THIS NOTICE IS REQUIRED BY LAW.";

/**
 * Stamped on a bill of sale or contract at filing (`docFeeNotice`), so a copy
 * filed before the notice existed re-renders exactly as it was filed and a
 * future change of wording can be told apart from this one.
 */
export const DOC_FEE_NOTICE_VERSION = 1;

/** The citation printed beside the posted notice. */
export const DOC_FEE_NOTICE_CITATION = "Tex. Fin. Code §348.006(c)(3)(B), (d); OCCC Bulletin B09-3";

/** Whether a filed payload carries the notice (stamped at filing by corridor-link). */
export function printsDocFeeNotice(data: Record<string, unknown> | null | undefined): boolean {
  const stamp = data?.docFeeNotice;
  return stamp === DOC_FEE_NOTICE_VERSION || stamp === String(DOC_FEE_NOTICE_VERSION);
}

/** Whether a filed payload asks for the Spanish notice beside the English one. */
export function printsSpanishDocFeeNotice(data: Record<string, unknown> | null | undefined): boolean {
  return printsDocFeeNotice(data) && data?.docFeeNoticeSpanish === true;
}
