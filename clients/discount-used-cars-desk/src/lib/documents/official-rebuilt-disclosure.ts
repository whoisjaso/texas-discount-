import { PDFDocument, StandardFonts, rgb, type PDFImage } from "pdf-lib";
import { embedImageDataUrl, fitWithin } from "@/lib/documents/embed-image";
import { usDate } from "@/lib/documents/us-date";
import type { CompletedLinkData } from "@/lib/documents/customerPortal";

export const OFFICIAL_REBUILT_FORM = "ENF-MV-RBLT-DSCLMR";
export const OFFICIAL_REBUILT_SOURCE = "https://www.txdmv.gov/sites/default/files/body-files/Rebuilt_Motor_Vehicle_Written_Description.pdf";
export const OFFICIAL_REBUILT_PATH = "/forms/ENF-MV-RBLT-DSCLMR.pdf";

export type OfficialRebuiltDisclosureData = {
  year: string;
  make: string;
  vin: string;
  buyerName: string;
  /** The actual signature date, or blank for the purchaser to enter. */
  signatureDate?: string;
  /** Only a purchaser's actual captured stroke belongs on the signing line. */
  buyerSignature?: string | null;
};

/** Historical links have no marker and must retain the document they signed. */
export function officialRebuiltDataFromLink(link: CompletedLinkData, includeSignatures = true): OfficialRebuiltDisclosureData | null {
  if (link.s !== "rebuiltDisclosure" || link.dd.officialForm !== OFFICIAL_REBUILT_FORM) return null;
  const data = { ...link.dd, ...link.cd };
  const value = (key: string) => typeof data[key] === "string" ? data[key] as string : "";
  const words = value("vehicleDescription").split(/\s+/);
  const signature = includeSignatures ? link.bs : undefined;
  return {
    year: value("vehicleYear") || (/^\d{4}$/.test(words[0]) ? words[0] : ""),
    make: value("vehicleMake") || (/^\d{4}$/.test(words[0]) ? words[1] : words[0]) || "",
    vin: value("vin"), buyerName: value("buyerName"),
    buyerSignature: signature, signatureDate: signature ? link.bsd : "",
  };
}

/** Fill only the write-in lines of the original TxDMV purchaser disclosure. */
export async function fillOfficialRebuiltDisclosure(source: Uint8Array, data: OfficialRebuiltDisclosureData): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source);
  const page = pdf.getPage(0);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  function write(value: string | undefined, x: number, y: number, width: number) {
    const text = value?.trim();
    if (!text) return;
    const size = Math.min(11, width / Math.max(1, font.widthOfTextAtSize(text, 1)));
    page.drawText(text, { x, y, font, size, color: rgb(0, 0, 0) });
  }
  // Coordinates measured from the state's letter-sized PDF. The artwork,
  // title, acknowledgment and signature rules remain the original page.
  write(data.year, 111, 534, 43);
  write(data.make, 242, 534, 215);
  write(data.vin.toUpperCase(), 112, 494, 344);
  write(data.buyerName, 194, 459, 177);
  write(usDate(data.signatureDate || ""), 325, 170, 201);
  const signature = await embedImageDataUrl<PDFImage>(pdf, data.buyerSignature);
  if (signature) {
    const placement = fitWithin({ width: signature.width, height: signature.height }, { x: 324, y: 239, width: 206, height: 39 });
    if (placement.width >= 8 && placement.height >= 4) page.drawImage(signature, placement);
  }
  return pdf.save({ updateFieldAppearances: false });
}
