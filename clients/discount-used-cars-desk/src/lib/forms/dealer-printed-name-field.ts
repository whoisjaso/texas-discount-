import {
  drawTextField,
  rgb,
  type AppearanceProviderFor,
  type PDFFont,
  type PDFForm,
  type PDFTextField,
} from "pdf-lib";
import { firstUnprintableOnStateForm } from "@/lib/forms/state-form-charset";

/**
 * The dealer's printed name beside a dealer signature on an official state
 * form: "Legal Name (First Last)" (owner's instructions 10/01/2026; SOP
 * "Legal content each document must carry", 130-U bullet).
 *
 * One set of fit rules for every form that prints it, first the 130-U seller
 * line and now the VTR-61's two "Printed Name (Same as Signature)" boxes:
 *
 *   one line   the house print system (regular Helvetica, black), sized
 *              from 9.5pt down to the 7.25pt floor to fit the box less 4pt
 *              of padding;
 *   two lines  when one line would not fit even at the floor: the entity,
 *              then the person in parentheses, both at 7.25pt, drawn between
 *              the form's printed-name rule and the text above it at
 *              baselines measured off that form (never pdf-lib's multiline
 *              layout, which was proven to strike through the rule);
 *   refused    a character the form's font cannot print, or a line wider
 *              than the box even at the floor, throws rather than leaving a
 *              blank box or one with its end cut off.
 *
 * The field's stored value is the one-line string either way, so a dump of
 * the form by field name reads the whole pairing.
 */

export const PRINTED_NAME_MAX_FONT_SIZE = 9.5;
export const PRINTED_NAME_MIN_FONT_SIZE = 7.25;
export const PRINTED_NAME_PADDING = 4;
const FIELD_HEIGHT_RATIO = 0.62;
const TWO_LINE_INSET = 2;

export type PrintedNameLayout = {
  /**
   * The two-line layout's baselines, in points above the widget's bottom
   * edge, measured on the form so both lines sit above its printed-name rule
   * and below the text above the box.
   */
  baselines: { upper: number; lower: number };
  /** What the refusal calls the value, e.g. "130-U seller name". */
  label: string;
  /** What the refusal calls the box, e.g. "seller box". */
  box: string;
};

function setPrintTypography(field: PDFTextField, font: PDFFont, fontSize: number) {
  const defaultAppearance = `0 0 0 rg\n/${font.name} ${fontSize} Tf`;
  field.acroField.setDefaultAppearance(defaultAppearance);
  for (const widget of field.acroField.getWidgets()) widget.setDefaultAppearance(defaultAppearance);
  field.updateAppearances(font);
}

function oneLineSize(field: PDFTextField, value: string, font: PDFFont): number {
  const rect = field.acroField.getWidgets()[0]?.getRectangle();
  if (!rect) return PRINTED_NAME_MAX_FONT_SIZE;
  const heightCap = Math.max(PRINTED_NAME_MIN_FONT_SIZE, rect.height * FIELD_HEIGHT_RATIO);
  const widthAtOnePoint = font.widthOfTextAtSize(value, 1);
  const usableWidth = Math.max(1, rect.width - PRINTED_NAME_PADDING);
  const widthCap = widthAtOnePoint > 0 ? usableWidth / widthAtOnePoint : PRINTED_NAME_MAX_FONT_SIZE;
  return Math.max(PRINTED_NAME_MIN_FONT_SIZE, Math.min(PRINTED_NAME_MAX_FONT_SIZE, heightCap, widthCap));
}

function twoLineAppearance(
  upper: string,
  lower: string,
  baselines: PrintedNameLayout["baselines"],
): AppearanceProviderFor<PDFTextField> {
  return (_field, widget, font) => {
    const rect = widget.getRectangle();
    return drawTextField({
      x: 0,
      y: 0,
      width: rect.width,
      height: rect.height,
      borderWidth: 0,
      color: undefined,
      borderColor: undefined,
      textColor: rgb(0, 0, 0),
      font: font.name,
      fontSize: PRINTED_NAME_MIN_FONT_SIZE,
      padding: 1,
      textLines: [
        { encoded: font.encodeText(upper), x: TWO_LINE_INSET, y: baselines.upper },
        { encoded: font.encodeText(lower), x: TWO_LINE_INSET, y: baselines.lower },
      ],
    });
  };
}

/**
 * Fill one printed-name box with the dealer pairing, by the rules above.
 * Returns how many lines it took.
 */
export function fillDealerPrintedName(
  form: PDFForm,
  font: PDFFont,
  fieldName: string,
  value: string,
  layout: PrintedNameLayout,
): 1 | 2 {
  const unprintable = firstUnprintableOnStateForm(value);
  if (unprintable) {
    throw new Error(`The ${layout.label} contains "${unprintable}", which the state form's font cannot print.`);
  }
  const field = form.getTextField(fieldName);
  const rect = field.acroField.getWidgets()[0]?.getRectangle();
  field.setText(value);

  const usable = rect ? rect.width - PRINTED_NAME_PADDING : Infinity;
  if (font.widthOfTextAtSize(value, PRINTED_NAME_MIN_FONT_SIZE) <= usable) {
    setPrintTypography(field, font, oneLineSize(field, value, font));
    return 1;
  }
  // Two lines, each measured at the floor: a line wider than the box would
  // be clipped by it, so the render is refused instead (onboarding and the
  // filing gate refuse such a name first; see seller-line-fit.ts).
  const split = value.lastIndexOf(" (");
  const upper = split > 0 ? value.slice(0, split) : value;
  const lower = split > 0 ? value.slice(split + 1) : "";
  if (
    split <= 0 ||
    font.widthOfTextAtSize(upper, PRINTED_NAME_MIN_FONT_SIZE) > usable ||
    font.widthOfTextAtSize(lower, PRINTED_NAME_MIN_FONT_SIZE) > usable
  ) {
    throw new Error(
      `The ${layout.label} "${value}" does not fit the ${layout.box} at ${PRINTED_NAME_MIN_FONT_SIZE}pt, even on two lines.`,
    );
  }
  setPrintTypography(field, font, PRINTED_NAME_MIN_FONT_SIZE);
  field.updateAppearances(font, twoLineAppearance(upper, lower, layout.baselines));
  return 2;
}
