/**
 * One value per printed box.
 *
 * The state forms print several labelled boxes over a single AcroForm field.
 * The 130-U prints "First Name (or Entity Name) | Middle Name | Last Name |
 * Suffix (if any)" above one text field 573.7pt wide; the VTR-271 does the
 * same over 538.2pt, twice, and again for "City | County | State | Zip".
 *
 * Checked on the shipped templates rather than assumed: those fields carry a
 * SINGLE widget, are not combed, and set no maxLength. There are no kids to
 * fill individually and no comb to divide the box. So `setText` on the field
 * can only ever drop the whole string into the leftmost box, which is exactly
 * what the owner reported seeing: a full name under First Name with Middle,
 * Last and Suffix empty, and "Houston, Harris, TX 77004" under City.
 *
 * Placing each part at its own coordinate is therefore not a workaround. It
 * is the only mechanism these PDFs offer.
 *
 * This module is the geometry and nothing else. It takes no PDF library,
 * because the two fillers in this codebase load different forks (the VTR-271
 * is encrypted and needs @cantoo/pdf-lib), and because arithmetic that decides
 * whether a surname prints under "Last Name" deserves to be unit-testable
 * without opening a document.
 */

/** A printed box, measured from the label above it. */
export type BoxColumn = {
  /** Which part of the value belongs in this box. */
  part: string;
  /**
   * Left edge in PDF points from the page's left edge, taken from the
   * printed label rather than chosen by eye.
   */
  x: number;
  /** Usable width before the next box's label begins. */
  width: number;
};

/** A field whose one widget sits under several printed boxes. */
export type MultiBoxField = {
  /** The AcroForm field name, exactly as the template spells it. */
  field: string;
  /** 1-based page the boxes are printed on. */
  page: number;
  /**
   * Points above the widget's bottom edge to sit the baseline on. The boxes
   * are the field's own rectangle, so the baseline is derived from the widget
   * at fill time rather than stored per form.
   */
  baselineOffset: number;
  columns: BoxColumn[];
};

/** What a caller must be able to do to lay text out: measure it. */
export type Measure = (text: string, size: number) => number;

export type PlacedText = {
  part: string;
  text: string;
  /** Where to start drawing, in PDF points from the page's left edge. */
  x: number;
  /** Point size, reduced from `size` only when the text would overflow. */
  size: number;
};

/**
 * The smallest size this will shrink text to before letting it overflow.
 *
 * A county clerk reading a title application is the audience. Text below this
 * is not a legible correction, it is a different problem, and silently
 * printing four-point type would hide the fact that a value does not fit.
 */
export const MIN_FONT_SIZE = 5.5;

/** Points of clearance kept inside each box so ink never touches the rule. */
const GUTTER = 2;

/**
 * Fit one string inside one box, shrinking only as far as it has to.
 *
 * Returns the size that fits, or `MIN_FONT_SIZE` when nothing does. Callers
 * that need to know about the overflow should compare the measured width at
 * the returned size against the column width.
 */
export function fitSize(
  measure: Measure,
  text: string,
  maxWidth: number,
  startSize: number,
): number {
  let size = startSize;
  while (size > MIN_FONT_SIZE && measure(text, size) > maxWidth) {
    size -= 0.25;
  }
  return Math.max(size, MIN_FONT_SIZE);
}

/**
 * Place each part of a value under the box that names it.
 *
 * Parts with no value are skipped rather than drawn empty, and a part the map
 * does not declare is ignored: a template revision that drops a box should
 * lose that value visibly, not shift every later value one box to the left,
 * which is the failure that makes a wrong form look like a right one.
 */
export function placeColumns(
  columns: BoxColumn[],
  values: Record<string, string | null | undefined>,
  opts: { measure: Measure; size: number; align?: "left" | "center" },
): PlacedText[] {
  const align = opts.align ?? "left";
  const placed: PlacedText[] = [];

  for (const column of columns) {
    const raw = values[column.part];
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) continue;

    const usable = Math.max(column.width - GUTTER * 2, 1);
    const size = fitSize(opts.measure, text, usable, opts.size);
    const width = opts.measure(text, size);

    const x =
      align === "center"
        ? column.x + (column.width - width) / 2
        : column.x + GUTTER;

    placed.push({ part: column.part, text, x, size });
  }

  return placed;
}

/**
 * Which declared box a given x-coordinate falls in, or null for none.
 *
 * This exists for the verification pass: fill a form with distinctive values,
 * read the text back out with positions, and assert each one landed in the
 * box that names it. That turns "does the surname print under Last Name" into
 * a test rather than a squint at a screenshot.
 */
export function columnAt(columns: BoxColumn[], x: number): BoxColumn | null {
  for (const column of columns) {
    if (x >= column.x - GUTTER && x < column.x + column.width) return column;
  }
  return null;
}

/**
 * Build columns from the printed labels' left edges.
 *
 * Each box runs from its own label to the next one, and the last box runs to
 * the field's right edge. This is how the 130-U's existing constants were
 * arrived at, which is checkable: its name labels sit at x 31.8, 244.1, 356.5
 * and 505.1 with widths 123.5, 44.1, 34.2 and 42.4, and the centres the
 * filler hardcodes (93.56, 266.13, 373.64, 526.28) are exactly those labels'
 * midpoints. Deriving the map the same way means a template revision that
 * moves a label is caught by re-deriving, instead of printing into the space
 * where a box used to be.
 */
export function columnsFromLabels(
  labels: Array<{ part: string; x: number }>,
  fieldRight: number,
): BoxColumn[] {
  const sorted = [...labels].sort((a, b) => a.x - b.x);
  return sorted.map((label, i) => ({
    part: label.part,
    x: label.x,
    width: (i + 1 < sorted.length ? sorted[i + 1].x : fieldRight) - label.x,
  }));
}
