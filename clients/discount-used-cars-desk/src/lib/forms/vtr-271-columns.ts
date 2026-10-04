import { columnsFromLabels, type MultiBoxField } from "@/lib/forms/box-columns";

/**
 * Where the VTR-271 prints its boxes.
 *
 * Every number here was read off the shipped template rather than chosen:
 * the label positions come from the page's own text, and the field extents
 * from the widget rectangles. Both are reproduced by
 * `src/__tests__/vtr-271-columns.test.ts`, which re-derives them from
 * `public/forms/VTR-271.pdf` and fails if a revision moves anything.
 *
 * The form has FOUR multi-box fields, not the one the filler used to treat
 * specially: the grantor's name and city row, and the grantee's name and city
 * row. All four share the same geometry, because the form prints the same
 * four-box rule four times.
 *
 *   field                                    x      y      w        h
 *   First Name ... Suffix if any             37.0   331.0  538.2    21.1
 *   City County State Zip                    37.0   272.4  538.2    21.1
 *   First Name ... Suffix if any_2           37.0   218.4  538.2    20.6
 *   City County State Zip_2                  37.0   160.8  538.2    20.6
 *
 * Each printed label sits about two points above its own field's top edge,
 * which is what ties label to box unambiguously.
 */

/** Right edge of all four fields: x 37.0 + width 538.2. */
const FIELD_RIGHT = 575.2;

/**
 * The four name labels, at their printed left edges.
 * "First Name (or Entity Name)" x=38.8, "Middle Name" x=259.1,
 * "Last Name" x=414.2, "Suffix (if any)" x=520.1.
 */
const NAME_LABELS = [
  { part: "first", x: 38.8 },
  { part: "middle", x: 259.1 },
  { part: "last", x: 414.2 },
  { part: "suffix", x: 520.1 },
];

/**
 * The four address labels, at the same left edges as the name row.
 *
 * Note "County" here. The 130-U's applicant address row is City / State / Zip
 * with the county asked separately in box 19; this form prints the county
 * inline as one of the four boxes, which is why an address cannot be carried
 * between the two forms as a single string and split by position.
 */
const CITY_LABELS = [
  { part: "city", x: 38.8 },
  { part: "county", x: 259.1 },
  { part: "state", x: 414.2 },
  { part: "zip", x: 520.1 },
];

/**
 * Points above the widget's bottom edge for the text baseline.
 *
 * The boxes are about 21pt tall and the type is 10pt, so this sits the text
 * off the bottom rule without crowding the label above it.
 */
const BASELINE_OFFSET = 6.5;

function field(name: string, labels: Array<{ part: string; x: number }>): MultiBoxField {
  return {
    field: name,
    page: 1,
    baselineOffset: BASELINE_OFFSET,
    columns: columnsFromLabels(labels, FIELD_RIGHT),
  };
}

export const VTR_271_COLUMNS = {
  grantorName: field(
    "First Name or Entity Name Middle Name Last Name Suffix if any",
    NAME_LABELS,
  ),
  grantorCity: field("City County State Zip", CITY_LABELS),
  granteeName: field(
    "First Name or Entity Name Middle Name Last Name Suffix if any_2",
    NAME_LABELS,
  ),
  granteeCity: field("City County State Zip_2", CITY_LABELS),
} as const;

/** Every multi-box field on this form, for the verification pass. */
export const VTR_271_MULTI_BOX_FIELDS: MultiBoxField[] =
  Object.values(VTR_271_COLUMNS);
