import { readFile } from "fs/promises";
import { join } from "path";
import { LineCapStyle, PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  DEALER_ADDRESS,
  DEALER_NAME,
  DEALER_PHONE,
  DEALER_WEBSITE,
} from "@/lib/documents/shared";

export const BUYERS_GUIDE_TEMPLATE_SOURCE_URL =
  "https://www.ftc.gov/system/files/documents/plain-language/buyersguide_eng_2016-11.pdf";
export const BUYERS_GUIDE_TEMPLATE_SOURCE_URL_ES =
  "https://www.ftc.gov/system/files/documents/plain-language/spdf-0083-guia-del-comprador.pdf";

export type BuyersGuideLanguage = "en" | "es";

export const BUYERS_GUIDE_TEMPLATE_PATH = join(
  process.cwd(),
  "public",
  "forms",
  "buyers-guide-ftc-english-2016.pdf",
);
export const BUYERS_GUIDE_TEMPLATE_PATH_ES = join(
  process.cwd(),
  "public",
  "forms",
  "buyers-guide-ftc-spanish-2016.pdf",
);

export const BUYERS_GUIDE_PREFILL_PAGE_INDEXES = [0, 2] as const;
export const BUYERS_GUIDE_AS_IS_PAGE_INDEX = 0;

// The AS IS checkbox on page 1, measured against a 10pt coordinate grid
// rendered over each official FTC form (PDF points, origin bottom-left).
export const BUYERS_GUIDE_AS_IS_BOX = {
  x: 80.3,
  y: 573.6,
  width: 22.4,
  height: 22.7,
} as const;

export const BUYERS_GUIDE_AS_IS_BOX_ES = {
  x: 79.5,
  y: 574.6,
  width: 23.1,
  height: 22.3,
} as const;

// Inset keeps the 2pt stroke fully inside the printed box outline.
export const BUYERS_GUIDE_AS_IS_MARK_INSET = 1.8;

interface FieldSpot {
  x: number;
  y: number;
  maxWidth: number;
  size?: number;
}

interface BuyersGuideLayout {
  templatePath: string;
  asIsBox: { x: number; y: number; width: number; height: number };
  vehicle: { make: FieldSpot; model: FieldSpot; year: FieldSpot; vin: FieldSpot };
  dealer: {
    name: FieldSpot;
    address: FieldSpot;
    phone: FieldSpot;
    email: FieldSpot;
    contact: FieldSpot;
  };
}

const LAYOUTS: Record<BuyersGuideLanguage, BuyersGuideLayout> = {
  en: {
    templatePath: BUYERS_GUIDE_TEMPLATE_PATH,
    asIsBox: BUYERS_GUIDE_AS_IS_BOX,
    vehicle: {
      make: { x: 82, y: 650, maxWidth: 108, size: 11 },
      model: { x: 205, y: 650, maxWidth: 78, size: 11 },
      year: { x: 296, y: 650, maxWidth: 58, size: 11 },
      vin: { x: 414, y: 650, maxWidth: 116, size: 10 },
    },
    dealer: {
      name: { x: 82, y: 225, maxWidth: 430 },
      address: { x: 82, y: 199, maxWidth: 430 },
      phone: { x: 82, y: 174, maxWidth: 190 },
      email: { x: 306, y: 174, maxWidth: 204 },
      // Same line as the "FOR COMPLAINTS AFTER SALE, CONTACT:" label.
      contact: { x: 252, y: 136, maxWidth: 258 },
    },
  },
  es: {
    templatePath: BUYERS_GUIDE_TEMPLATE_PATH_ES,
    asIsBox: BUYERS_GUIDE_AS_IS_BOX_ES,
    vehicle: {
      make: { x: 80, y: 650, maxWidth: 115, size: 11 },
      model: { x: 205, y: 650, maxWidth: 80, size: 11 },
      year: { x: 296, y: 650, maxWidth: 58, size: 11 },
      vin: { x: 385, y: 650, maxWidth: 148, size: 10 },
    },
    dealer: {
      name: { x: 78, y: 219, maxWidth: 450 },
      address: { x: 78, y: 194, maxWidth: 450 },
      phone: { x: 78, y: 169, maxWidth: 200 },
      email: { x: 302, y: 169, maxWidth: 225 },
      // Spanish form puts the complaints contact on its own line BELOW the
      // "PARA QUEJAS DESPUÉS DE LA VENTA COMUNÍQUESE CON:" label.
      contact: { x: 78, y: 121, maxWidth: 450 },
    },
  },
};

export interface MarkLine {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

// A single clean X spanning the checkbox corner-to-corner.
export function buyersGuideAsIsMarkLines(
  language: BuyersGuideLanguage = "en",
): [MarkLine, MarkLine] {
  const { x, y, width, height } = LAYOUTS[language].asIsBox;
  const inset = BUYERS_GUIDE_AS_IS_MARK_INSET;
  const left = x + inset;
  const right = x + width - inset;
  const bottom = y + inset;
  const top = y + height - inset;
  return [
    { start: { x: left, y: bottom }, end: { x: right, y: top } },
    { start: { x: left, y: top }, end: { x: right, y: bottom } },
  ];
}

export interface BuyersGuideVehicleInput {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  stockNumber?: string | null;
}

export interface BuyersGuideDealerInput {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contact?: string | null;
}

export interface BuyersGuideInput {
  vehicle: BuyersGuideVehicleInput;
  dealer?: BuyersGuideDealerInput;
  language?: BuyersGuideLanguage;
}

const BLACK = rgb(0, 0, 0);

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function drawFitText({
  page,
  font,
  text,
  spot,
}: {
  page: PDFPage;
  font: PDFFont;
  text: unknown;
  spot: FieldSpot;
}) {
  const safe = clean(text);
  if (!safe) return;

  let fontSize = spot.size ?? 10;
  while (fontSize > 6 && font.widthOfTextAtSize(safe, fontSize) > spot.maxWidth) {
    fontSize -= 0.5;
  }

  page.drawText(safe, {
    x: spot.x,
    y: spot.y,
    size: fontSize,
    font,
    color: BLACK,
  });
}

function drawAsIsSelection(page: PDFPage, language: BuyersGuideLanguage) {
  for (const line of buyersGuideAsIsMarkLines(language)) {
    page.drawLine({
      ...line,
      thickness: 2,
      color: BLACK,
      lineCap: LineCapStyle.Round,
    });
  }
}

function drawPageOneVehicle(
  page: PDFPage,
  font: PDFFont,
  vehicle: BuyersGuideVehicleInput,
  layout: BuyersGuideLayout,
) {
  drawFitText({ page, font, text: vehicle.make ?? "", spot: layout.vehicle.make });
  drawFitText({ page, font, text: vehicle.model ?? "", spot: layout.vehicle.model });
  drawFitText({ page, font, text: vehicle.year ?? "", spot: layout.vehicle.year });
  drawFitText({ page, font, text: vehicle.vin ?? "", spot: layout.vehicle.vin });
}

function drawPageThreeDealer(
  page: PDFPage,
  font: PDFFont,
  dealer: BuyersGuideDealerInput,
  layout: BuyersGuideLayout,
) {
  const email = clean(dealer.email) || DEALER_WEBSITE;
  drawFitText({ page, font, text: dealer.name ?? DEALER_NAME, spot: layout.dealer.name });
  drawFitText({ page, font, text: dealer.address ?? DEALER_ADDRESS, spot: layout.dealer.address });
  drawFitText({ page, font, text: dealer.phone ?? DEALER_PHONE, spot: layout.dealer.phone });
  drawFitText({ page, font, text: email, spot: layout.dealer.email });
  drawFitText({ page, font, text: dealer.contact ?? "Sales Office", spot: layout.dealer.contact });
}

export async function generateBuyersGuidePdf(input: BuyersGuideInput): Promise<Uint8Array> {
  const language: BuyersGuideLanguage = input.language === "es" ? "es" : "en";
  const layout = LAYOUTS[language];
  const templateBytes = await readFile(layout.templatePath);
  const pdf = await PDFDocument.load(templateBytes);
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  if (pages.length !== 3) {
    throw new Error(
      `Expected the FTC Buyers Guide template (${language}) to have 3 pages; found ${pages.length}.`,
    );
  }

  drawAsIsSelection(pages[BUYERS_GUIDE_AS_IS_PAGE_INDEX], language);
  drawPageOneVehicle(pages[BUYERS_GUIDE_PREFILL_PAGE_INDEXES[0]], font, input.vehicle, layout);
  drawPageThreeDealer(pages[BUYERS_GUIDE_PREFILL_PAGE_INDEXES[1]], font, input.dealer ?? {}, layout);

  return pdf.save();
}

export function buildBuyersGuideFilename(
  vehicle: BuyersGuideVehicleInput,
  language: BuyersGuideLanguage = "en",
): string {
  const label = [vehicle.year, vehicle.make, vehicle.model]
    .map(clean)
    .filter(Boolean)
    .join("-")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const vinTail = clean(vehicle.vin).slice(-6).toUpperCase() || "NOVIN";
  const suffix = language === "es" ? "-es" : "";
  return `buyers-guide-${label || "vehicle"}-${vinTail}${suffix}.pdf`;
}
