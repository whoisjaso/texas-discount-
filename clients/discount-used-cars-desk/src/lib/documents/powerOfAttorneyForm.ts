import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import * as normalise from "@/lib/documents/normalize";
import { dealership } from "@/lib/dealership-config";
import { placeColumns, type MultiBoxField } from "@/lib/forms/box-columns";
import { VTR_271_COLUMNS } from "@/lib/forms/vtr-271-columns";
import { splitPersonName, type NameParts } from "@/lib/forms/person-name";

/**
 * Texas Limited Power of Attorney — official form VTR-271.
 *
 * This fills the real TxDMV form rather than a look-alike, the same way the
 * 130-U and the FTC Buyer's Guide are handled. A county tax office rejects a
 * home-made power of attorney, so the only useful version is the official one.
 *
 * The template is published encrypted with an owner password and an empty user
 * password — hence `password: ""` on load, and why this module uses the
 * decrypting pdf-lib fork rather than the one the 130-U uses.
 */

export const VTR_271_SOURCE_URL =
  "https://www.txdmv.gov/sites/default/files/form_files/VTR-271.pdf";

export const VTR_271_TEMPLATE_PATH = join(
  process.cwd(),
  "public",
  "forms",
  "VTR-271.pdf",
);

/** Revision of the template checked into `public/forms`. */
export const VTR_271_REVISION = "Rev 11/20";

/**
 * The restriction printed on the form itself, in its own words.
 *
 * VTR-271 may not be used by a dealer to complete a title assignment on a
 * vehicle subject to federal odometer disclosure — the secure VTR-271-A is
 * required there. VTR-271-A is a controlled document: it is not published for
 * download and has to be obtained through the county tax assessor-collector,
 * so this system cannot produce one. Saying so is the point; quietly printing
 * the wrong form would be worse than printing none.
 */
export const VTR_271_RESTRICTION =
  "VTR-271 cannot be used in a dealer transaction to assign title on a vehicle subject to federal odometer disclosure. That requires the secure Power of Attorney (VTR-271-A), which is a controlled form obtained from the county tax office and cannot be printed from here.";

export { ODOMETER_DISCLOSURE_EXEMPT_AGE_YEARS, isEligibleForPlainPoa } from "./power-of-attorney-eligibility";

export type PowerOfAttorneyFormFields = {
  vin: string;
  year?: string;
  make?: string;
  model?: string;
  bodyStyle?: string;
  licensePlate?: string;
  /** Left blank when unknown, exactly as the form instructs. */
  titleDocumentNumber?: string;
  grantorName: string;
  /**
   * The name already in parts, which is what the form's four boxes want.
   * When absent, `grantorName` is split, and that split has to guess on a
   * three-word name — see `splitPersonName`. Callers holding the parts
   * should always pass them.
   */
  grantorNameParts?: NameParts;
  grantorAddress?: string;
  /**
   * The form prints City / County / State / Zip as four separate boxes, so
   * this takes them separately. Deals already store them apart in
   * `step_data.buyerId.mailing`; nothing needs to re-parse a joined line.
   */
  grantorCity?: string;
  grantorCounty?: string;
  grantorState?: string;
  grantorZip?: string;
  /** Date signed, as it should read on the form. */
  executedDate?: string;
};

/** Field names as they appear in the official template's AcroForm. */
const FIELD = {
  vin: "Vehicle Identification Number",
  year: "Year",
  make: "Make",
  bodyStyle: "Body Style",
  model: "Model",
  plate: "License Plate State and Number if any",
  titleDoc: "Title Document Number if unknown leave blank",
  grantorName: "First Name or Entity Name Middle Name Last Name Suffix if any",
  grantorAddress: "Address",
  grantorCity: "City County State Zip",
  granteeName: "First Name or Entity Name Middle Name Last Name Suffix if any_2",
  granteeAddress: "Address_2",
  granteeCity: "City County State Zip_2",
  date: "Date",
  printedName: "Printed Name",
} as const;

/**
 * Triple J is always the grantee — it is the dealership acting for the buyer.
 *
 * The city line used to be joined with two spaces, which lined the four
 * values up under the City box and left County, State and Zip empty. They
 * are kept apart now because the form prints four boxes and each one gets
 * its own value.
 */
function granteeBlock() {
  const { address } = dealership;
  return {
    // An entity goes in the box the form labels "First Name (or Entity
    // Name)"; the remaining name boxes are for a person and stay empty.
    name: { first: dealership.name } satisfies NameParts,
    street: address.street,
    // Harris County is where the lot sits; the config carries locality and
    // region, and the county is fixed for this address.
    city: address.locality,
    county: "Harris",
    state: address.region,
    zip: address.postalCode,
  };
}

export async function fillPowerOfAttorney(
  fields: PowerOfAttorneyFormFields,
): Promise<Uint8Array> {
  const templateBytes = await readFile(VTR_271_TEMPLATE_PATH);
  const pdf = await PDFDocument.load(templateBytes, {
    password: "",
    throwOnInvalidObject: false,
  });
  const form = pdf.getForm();

  // The vehicle row is four narrow columns; at the template's default size a
  // make like "Chevrolet" clips. Everything is set explicitly so nothing is
  // silently cut off on a printed form.
  const NARROW = new Set<string>([
    FIELD.year, FIELD.make, FIELD.bodyStyle, FIELD.model,
  ]);

  const set = (name: string, value: string | undefined) => {
    if (!value) return;
    try {
      const field = form.getTextField(name);
      field.setFontSize(NARROW.has(name) ? 8 : 10);
      field.setText(value);
    } catch {
      // A template revision that renames a field must not take the whole
      // document down — the rest still prints, and the gap is visible.
      console.warn(`VTR-271: no field named ${name}`);
    }
  };

  const grantee = granteeBlock();

  /*
    The four boxes.

    Each of these fields is one widget printed under four labelled boxes, not
    combed and with no maxLength, so `setText` can only put the whole string
    in the leftmost box. That is the defect the owner reported: his name sat
    under First Name with Middle, Last and Suffix empty, and the whole
    "Houston, Harris, TX 77004" sat under City.

    So the field is emptied and each part drawn at the coordinate of the box
    that names it, from the map in `vtr-271-columns.ts`, whose numbers come
    off the template itself.
  */
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const measure = (text: string, size: number) =>
    helvetica.widthOfTextAtSize(text, size);

  const drawBoxes = (
    spec: MultiBoxField,
    values: Record<string, string | undefined>,
  ) => {
    let field;
    try {
      field = form.getTextField(spec.field);
    } catch {
      console.warn(`VTR-271: no field named ${spec.field}`);
      return;
    }
    const rect = field.acroField.getWidgets()[0]?.getRectangle();
    if (!rect) return;

    // Emptied so the widget's own appearance cannot print underneath the
    // drawn text; the boxes are the field's rectangle either way.
    field.setText("");
    field.updateAppearances(helvetica);

    const page = pdf.getPages()[spec.page - 1];
    if (!page) return;
    const baseline = rect.y + spec.baselineOffset;

    for (const placed of placeColumns(spec.columns, values, {
      measure,
      size: 10,
    })) {
      page.drawText(placed.text, {
        x: placed.x,
        y: baseline,
        size: placed.size,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
  };

  // Every typed value is normalised on the way onto the page rather than
  // policed on the way into the box. Somebody filling this in has a customer
  // waiting and often has caps lock on, and a county clerk should not receive
  // a title application that shouts. Each field gets the rule that suits it: a
  // VIN stays capitals, a name does not.
  const name = normalise.personName(fields.grantorName);

  set(FIELD.vin, normalise.vin(fields.vin));
  set(FIELD.year, fields.year);
  set(FIELD.make, normalise.vehicleTerm(fields.make));
  set(FIELD.bodyStyle, normalise.vehicleTerm(fields.bodyStyle));
  set(FIELD.model, normalise.vehicleTerm(fields.model));
  set(FIELD.plate, normalise.plate(fields.licensePlate));
  set(FIELD.titleDoc, fields.titleDocumentNumber);

  /*
    Parts when the caller has them, a split of the written name when it does
    not. `splitPersonName` is documented about what it cannot know, and the
    field it fills is the one a county clerk reads, so callers holding the
    parts are expected to pass them rather than lean on the split.
  */
  const grantorParts: NameParts = fields.grantorNameParts ?? splitPersonName(name);

  drawBoxes(VTR_271_COLUMNS.grantorName, {
    first: normalise.personName(grantorParts.first ?? ""),
    middle: normalise.personName(grantorParts.middle ?? ""),
    last: normalise.personName(grantorParts.last ?? ""),
    suffix: grantorParts.suffix ?? undefined,
  });
  set(FIELD.grantorAddress, normalise.streetAddress(fields.grantorAddress));
  drawBoxes(VTR_271_COLUMNS.grantorCity, {
    city: normalise.personName(fields.grantorCity ?? ""),
    county: normalise.personName(fields.grantorCounty ?? ""),
    state: fields.grantorState?.toUpperCase(),
    zip: fields.grantorZip,
  });

  drawBoxes(VTR_271_COLUMNS.granteeName, {
    first: grantee.name.first,
  });
  set(FIELD.granteeAddress, normalise.streetAddress(grantee.street));
  drawBoxes(VTR_271_COLUMNS.granteeCity, {
    city: grantee.city,
    county: grantee.county,
    state: grantee.state?.toUpperCase(),
    zip: grantee.zip,
  });

  set(FIELD.date, fields.executedDate);
  // "Printed Name (Same as Signature)" — the grantor signs in ink.
  set(FIELD.printedName, name);

  // Left unflattened on purpose: the county sometimes needs to correct a
  // field, and the form says no alterations, which a typed correction is not.
  return pdf.save();
}
