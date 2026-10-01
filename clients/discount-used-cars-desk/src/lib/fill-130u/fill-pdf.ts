/**
 * 130-U PDF Fill Engine
 *
 * Loads the blank TxDMV Form 130-U, fills AcroForm fields using the
 * field mapping, and returns the filled PDF as Uint8Array.
 *
 * The form is NOT flattened — fields remain editable so the tax office
 * can make corrections if needed.
 */

import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont, type PDFImage, type PDFTextField } from 'pdf-lib';
import { embedImageDataUrl, fitWithin } from '@/lib/documents/embed-image';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  ADDITIONAL_APPLICANT_NAME_FIELD_ID,
  APPLICANT_ADDRESS_FIELD_ID,
  APPLICANT_NAME_FIELD_ID,
  DEALER,
  FIELD_MAPPINGS,
  FIRST_LIENHOLDER_FIELD_ID,
  PREVIOUS_OWNER_FIELD_ID,
  type AgreementData,
} from './field-mapping';

const PDF_PATH = join(process.cwd(), 'public', 'forms', '130-U.pdf');

// Keep every filled 130-U text box on one print system: regular Helvetica,
// pure black, one weight everywhere, with size chosen from the physical field
// box. The owner's instruction, looking at a filled form: the same font in
// every box, neutral, not deliberately bold, legible to anybody who reads it.
const FONT_SIZE_DEFAULT = 10.5;
const FONT_SIZE_LONG = 9.5;
const FONT_SIZE_TINY = 8.5;
const MIN_FONT_SIZE = 7.25;
const FIELD_HORIZONTAL_PADDING = 4;
const FIELD_HEIGHT_RATIO = 0.62;
const APPLICANT_NAME_FONT_SIZE = 10.5;

// The official 130-U prints four labels inside one applicant-name field.
// These x positions are the visible label centers from the TxDMV PDF.
const NAME_COLUMN_CENTERS = {
  first: 93.56,
  middle: 266.13,
  last: 373.64,
  suffix: 526.28,
} as const;

// Fields that need smaller font to fit long content
const SMALL_FONT_FIELDS = new Set([
  '16 Applicant First Name or Entity Name Middle Name Last Name Suffix if any',
  '17 Additional Applicant First Name if applicable Middle Name Last Name Suffix if any',
  '18 Applicant Mailing Address City State Zip',
  '20 Previous Owner Name or Entity Name City State',
  '23 Renewal Recipient First Name or Entity Name if different Middle Name Last Name Suffix if any',
  '24 Renewal Notice Mailing Address if different City State Zip',
  '29 Vehicle Location Address if different City State Zip',
  '34 First Lienholder Name if any Mailing Address City State Zip',
  '36 TradeIn if any Year Make Vehicle Identification Number',
  'Seller  Name',
  'Applicant Owner',
  'Additional Applicant',
]);

const TINY_FONT_FIELDS = new Set([
  '26 Email optional',
  'Sales Tax Exemption Reason',
]);

function getFontSize(fieldId: string): number {
  if (TINY_FONT_FIELDS.has(fieldId)) return FONT_SIZE_TINY;
  if (SMALL_FONT_FIELDS.has(fieldId)) return FONT_SIZE_LONG;
  return FONT_SIZE_DEFAULT;
}

function fitFontSize(field: PDFTextField, value: string, font: PDFFont, maxSize: number): number {
  const widgets = field.acroField.getWidgets();
  const rect = widgets[0]?.getRectangle();
  if (!rect) return maxSize;

  const heightCap = Math.max(MIN_FONT_SIZE, rect.height * FIELD_HEIGHT_RATIO);
  const widthAtOnePoint = font.widthOfTextAtSize(value, 1);
  const usableWidth = Math.max(1, rect.width - FIELD_HORIZONTAL_PADDING);
  const widthCap = widthAtOnePoint > 0 ? usableWidth / widthAtOnePoint : maxSize;

  return Math.max(MIN_FONT_SIZE, Math.min(maxSize, heightCap, widthCap));
}

function applyPrintTypography(field: PDFTextField, font: PDFFont, fontSize: number) {
  const defaultAppearance = `0 0 0 rg\n/${font.name} ${fontSize} Tf`;
  field.acroField.setDefaultAppearance(defaultAppearance);

  for (const widget of field.acroField.getWidgets()) {
    widget.setDefaultAppearance(defaultAppearance);
  }

  field.updateAppearances(font);
}

function drawCenteredText(page: PDFPage, font: PDFFont, text: string | undefined, centerX: number, baselineY: number) {
  if (!text) return;
  const width = font.widthOfTextAtSize(text, APPLICANT_NAME_FONT_SIZE);
  page.drawText(text, {
    x: centerX - width / 2,
    y: baselineY,
    size: APPLICANT_NAME_FONT_SIZE,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawLeftFitText(
  page: PDFPage,
  font: PDFFont,
  text: string | undefined,
  x: number,
  baselineY: number,
  maxWidth: number,
  maxSize = APPLICANT_NAME_FONT_SIZE,
) {
  const value = (text || '').trim();
  if (!value) return;
  page.drawText(value, {
    x,
    y: baselineY,
    size: fitFontSizeForWidth(font, value, maxWidth, maxSize),
    font,
    color: rgb(0, 0, 0),
  });
}

function fitFontSizeForWidth(font: PDFFont, value: string, maxWidth: number, maxSize: number): number {
  const widthAtOnePoint = font.widthOfTextAtSize(value, 1);
  if (widthAtOnePoint <= 0) return maxSize;
  return Math.max(MIN_FONT_SIZE, Math.min(maxSize, maxWidth / widthAtOnePoint));
}

function splitName(fullName: string | undefined) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', middle: '', last: '', suffix: '' };
  if (parts.length === 1) return { first: parts[0], middle: '', last: '', suffix: '' };
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1], suffix: '' };
  return {
    first: parts[0],
    middle: parts.slice(1, -1).join(' '),
    last: parts[parts.length - 1],
    suffix: '',
  };
}

function clearOverlayField(field: PDFTextField, font: PDFFont) {
  field.setText('');
  applyPrintTypography(field, font, APPLICANT_NAME_FONT_SIZE);
}

function drawNameColumns(
  pdfDoc: PDFDocument,
  field: PDFTextField,
  font: PDFFont,
  parts: { first?: string; middle?: string; last?: string; suffix?: string },
) {
  const rect = field.acroField.getWidgets()[0]?.getRectangle();
  if (!rect) return;

  field.setText('');
  applyPrintTypography(field, font, APPLICANT_NAME_FONT_SIZE);

  const page = pdfDoc.getPages()[0];
  const baselineY = rect.y + 6.2;

  drawCenteredText(page, font, parts.first, NAME_COLUMN_CENTERS.first, baselineY);
  drawCenteredText(page, font, parts.middle, NAME_COLUMN_CENTERS.middle, baselineY);
  drawCenteredText(page, font, parts.last, NAME_COLUMN_CENTERS.last, baselineY);
  drawCenteredText(page, font, parts.suffix, NAME_COLUMN_CENTERS.suffix, baselineY);
}

function drawApplicantAddressColumns(pdfDoc: PDFDocument, field: PDFTextField, font: PDFFont, data: AgreementData) {
  const rect = field.acroField.getWidgets()[0]?.getRectangle();
  if (!rect) return;

  clearOverlayField(field, font);
  const page = pdfDoc.getPages()[0];
  const baselineY = rect.y + 6.2;

  drawLeftFitText(page, font, data.buyer_address, 31.8, baselineY, 204, 9.6);
  drawLeftFitText(page, font, data.buyer_city, 244.08, baselineY, 96, 9.6);
  drawLeftFitText(page, font, data.buyer_state.toUpperCase(), 356.52, baselineY, 34, 9.6);
  drawLeftFitText(page, font, data.buyer_zip, 441.0, baselineY, 36, 9.1);
}

function drawPreviousOwnerColumns(pdfDoc: PDFDocument, field: PDFTextField, font: PDFFont, data: AgreementData) {
  const rect = field.acroField.getWidgets()[0]?.getRectangle();
  if (!rect) return;

  clearOverlayField(field, font);
  const page = pdfDoc.getPages()[0];
  const baselineY = rect.y + 6.2;

  const useDealer = data.previous_owner_name === undefined;
  drawLeftFitText(page, font, useDealer ? DEALER.name : data.previous_owner_name, 31.8, baselineY, 204, 9.4);
  drawLeftFitText(page, font, useDealer ? DEALER.city : data.previous_owner_city, 244.08, baselineY, 96, 9.6);
  drawLeftFitText(page, font, useDealer ? DEALER.state : data.previous_owner_state, 356.52, baselineY, 24, 9.4);
}

function drawLienholderColumns(pdfDoc: PDFDocument, field: PDFTextField, font: PDFFont, data: AgreementData) {
  if (!data.has_lien) return;
  const rect = field.acroField.getWidgets()[0]?.getRectangle();
  if (!rect) return;

  clearOverlayField(field, font);
  const page = pdfDoc.getPages()[0];
  const baselineY = rect.y + 6.2;

  /*
    The dealership's address completes the dealership's own lien and no
    other. A bank-funded sale names the lender and leaves its address for
    webDEALER, where the lender record lives; completing those boxes with
    our own street drew the bank's name over the dealership's address on a
    filed state form. Empty boxes are ones a clerk completes; wrong ones are
    ones a clerk trusts.
  */
  const name = data.lienholder_name || DEALER.name;
  const ours = name === DEALER.name;
  drawLeftFitText(page, font, name, 31.8, baselineY, 116, 8.8);
  drawLeftFitText(page, font, data.lienholder_address || (ours ? DEALER.address : ''), 158.52, baselineY, 118, 8.8);
  drawLeftFitText(page, font, data.lienholder_city || (ours ? DEALER.city : ''), 289.08, baselineY, 112, 8.8);
  drawLeftFitText(page, font, (data.lienholder_state || (ours ? DEALER.state : '')).toUpperCase(), 415.08, baselineY, 72, 8.8);
  drawLeftFitText(page, font, data.lienholder_zip || (ours ? DEALER.zip : ''), 505.08, baselineY, 78, 8.8);
}

/**
 * The seller's signature band on page 1.
 *
 * Measured off the template rather than guessed: the label "Signature(s) of
 * Seller(s), Donor(s), or Trader(s)" sits at y=77, and the printed name box
 * beside it occupies y=80 to y=104. So the ink goes in the space above the
 * label and level with that box, left of the name.
 *
 * This is the dealership's own line. Triple J is the seller on these deals, so
 * a staff member signing it is signing for themselves. The applicant lines
 * below it belong to the buyer and are never touched here: a signature drawn
 * onto somebody else's line would be a forgery on a state title document, not
 * a convenience.
 */
const SELLER_SIGNATURE_BOX = { x: 24, y: 81, width: 262, height: 22 };

/**
 * The applicant's signature band, directly under the seller's.
 *
 * Measured the same way: the label "Signature of Applicant/Owner" sits at
 * y=54 (738pt from the top of a letter page) and the seller label at y=82,
 * so the buyer's ink goes in the band between the two, level with the
 * applicant's printed-name box. The co-applicant band below it is left
 * alone.
 *
 * This is the BUYER's line, and it is drawn only from the buyer's own pad
 * stroke captured on the 130-U review screen. It is what makes a power of
 * attorney unnecessary when the buyer is standing at the desk: the
 * applicant signs the application, and nobody signs for them.
 */
const APPLICANT_SIGNATURE_BOX = { x: 24, y: 55, width: 262, height: 19 };

/** Optional extras a caller can put on the form. */
export interface Fill130UExtras {
  /** Original-form outputs retain TxDMV's second instruction page. */
  preserveInstructions?: boolean;
  /**
   * The signing staff member's saved signature, as a PNG data URL. Goes on the
   * seller line only.
   */
  staffSignatureDataUrl?: string | null;
  /**
   * The buyer's signature from the review screen's pad, as a PNG data URL.
   * Goes on the applicant line only.
   */
  buyerSignatureDataUrl?: string | null;
  /**
   * A photograph of the buyer's licence, as a data URL. Appended as its own
   * page rather than stamped onto the form: page 1 is a state document with a
   * fixed layout and no room, and the county wants the identification legible
   * rather than shrunk into a margin.
   */
  idPhotoDataUrl?: string | null;
}

async function drawSignature(
  pdfDoc: PDFDocument,
  dataUrl: string | null | undefined,
  band: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const image = await embedImageDataUrl<PDFImage>(pdfDoc, dataUrl);
  if (!image) return;

  const box = fitWithin({ width: image.width, height: image.height }, band);
  // A signature narrower than a few points is a stray dot from a pad that was
  // tapped rather than signed, and printing it would assert something nobody
  // meant to assert.
  if (box.width < 8 || box.height < 4) return;

  pdfDoc.getPages()[0].drawImage(image, box);
}

async function drawStaffSignature(
  pdfDoc: PDFDocument,
  dataUrl: string | null | undefined,
): Promise<void> {
  await drawSignature(pdfDoc, dataUrl, SELLER_SIGNATURE_BOX);
}

async function drawApplicantSignature(
  pdfDoc: PDFDocument,
  dataUrl: string | null | undefined,
): Promise<void> {
  await drawSignature(pdfDoc, dataUrl, APPLICANT_SIGNATURE_BOX);
}

/**
 * A page holding the buyer's identification, at a size somebody can read.
 *
 * The whole point of capturing the licence was that the paperwork carries it,
 * and a licence reproduced as a postage stamp in a margin fails a county clerk
 * for exactly the reason a missing one does. The capture step already crops to
 * the edges of the card, so this fills the page with the card rather than with
 * whatever desk it was lying on.
 */
async function appendIdPage(
  pdfDoc: PDFDocument,
  font: PDFFont,
  dataUrl: string | null | undefined,
  data: AgreementData,
): Promise<void> {
  const image = await embedImageDataUrl<PDFImage>(pdfDoc, dataUrl);
  if (!image) return;

  const first = pdfDoc.getPages()[0];
  const { width: pageWidth, height: pageHeight } = first.getSize();
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const margin = 54;
  const headingY = pageHeight - margin;
  page.drawText('Buyer Identification', {
    x: margin,
    y: headingY,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });

  const holder = [data.buyer_first_name, data.buyer_middle_name, data.buyer_last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const caption = [holder, data.vin ? `VIN ${data.vin}` : null]
    .filter(Boolean)
    .join('   ');
  if (caption) {
    page.drawText(caption, {
      x: margin,
      y: headingY - 20,
      size: 9.5,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const box = fitWithin(
    { width: image.width, height: image.height },
    {
      x: margin,
      y: margin,
      width: pageWidth - margin * 2,
      height: headingY - 44 - margin,
    },
  );
  if (box.width < 1 || box.height < 1) return;
  page.drawImage(image, box);
}

export async function fill130U(
  data: AgreementData,
  extras: Fill130UExtras = {},
): Promise<Uint8Array> {
  // Load blank 130-U template
  const templateBytes = await readFile(PDF_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  /*
    Existing direct callers use the filing sheet alone. Original-form
    previews and deliveries opt into the unchanged state instruction page.
  */
  if (!extras.preserveInstructions) while (pdfDoc.getPageCount() > 1) pdfDoc.removePage(1);

  // Fill each mapped field
  for (const mapping of FIELD_MAPPINGS) {
    try {
      const value = mapping.getValue(data);

      // Skip undefined/empty values
      if (value === undefined || value === null || value === '') continue;

      if (mapping.type === 'text' && typeof value === 'string') {
        const field = form.getTextField(mapping.fieldId);
        field.setText(value);
        const fontSize = fitFontSize(field, value, font, getFontSize(mapping.fieldId));
        applyPrintTypography(field, font, fontSize);
      } else if (mapping.type === 'checkbox' && typeof value === 'boolean') {
        const field = form.getCheckBox(mapping.fieldId);
        if (value) {
          field.check();
        } else {
          field.uncheck();
        }
        field.defaultUpdateAppearances();
      }
    } catch (err) {
      // Field doesn't exist in PDF — log warning but don't crash
      console.warn(
        `[fill-130u] Warning: Could not fill field "${mapping.fieldId}":`,
        (err as Error).message
      );
    }
  }

  // Do NOT flatten — leave fields editable
  const applicantField = form.getTextField(APPLICANT_NAME_FIELD_ID);
  if (data.applicant_type !== 'individual' && data.buyer_entity_name) {
    // Entity names occupy the complete row. Splitting one into personal-name
    // columns either loses words or puts an invented person on a state form.
    applicantField.setText(data.buyer_entity_name);
    applyPrintTypography(applicantField, font, fitFontSize(applicantField, data.buyer_entity_name, font, FONT_SIZE_DEFAULT));
  } else {
    drawNameColumns(pdfDoc, applicantField, font, {
      first: data.buyer_first_name,
      middle: data.buyer_middle_name,
      last: data.buyer_last_name,
      suffix: data.buyer_suffix,
    });
  }
  drawApplicantAddressColumns(pdfDoc, form.getTextField(APPLICANT_ADDRESS_FIELD_ID), font, data);
  drawPreviousOwnerColumns(pdfDoc, form.getTextField(PREVIOUS_OWNER_FIELD_ID), font, data);
  drawLienholderColumns(pdfDoc, form.getTextField(FIRST_LIENHOLDER_FIELD_ID), font, data);

  if (data.co_buyer_name) {
    drawNameColumns(
      pdfDoc,
      form.getTextField(ADDITIONAL_APPLICANT_NAME_FIELD_ID),
      font,
      splitName(data.co_buyer_name),
    );
  }

  // Both are optional and both fail quietly. A document that would otherwise
  // be correct must not be lost because a signature was never recorded or a
  // photograph did not decode.
  await drawStaffSignature(pdfDoc, extras.staffSignatureDataUrl);
  await drawApplicantSignature(pdfDoc, extras.buyerSignatureDataUrl);
  await appendIdPage(pdfDoc, font, extras.idPhotoDataUrl, data);

  const filledPdf = await pdfDoc.save();
  return filledPdf;
}
