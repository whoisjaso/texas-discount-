import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { dealership, factOr } from "@/lib/dealership-config";
import { VTR61_COMPONENTS, type Vtr61Part } from "@/lib/vehicles/title-work-evidence";

/**
 * The real VTR-61, Rebuilt Vehicle Statement, filled from the car.
 *
 * `public/forms/VTR-61.pdf` is the TxDMV form (Rev 01/25) with its own
 * fields. The desk fills what the car and the dealership already know: the
 * VIN, year, make, model and body style; the dealership as owner, with its
 * address; the dealership as rebuilder when it did the work; the date the
 * work was finished and what it was; and page 2, the component parts, from
 * the title work's own record of them, each with where it came from and
 * the donor VIN when it came off another car. The certifications are
 * signed in ink by the rebuilder and by us, so the signature lines are left
 * for the pen.
 *
 * Field names are the form's own, read from its AcroForm; a form revision
 * that renames them fails loudly here rather than filling the wrong box.
 */

const PDF_PATH = join(process.cwd(), "public", "forms", "VTR-61.pdf");

export type Vtr61Input = {
  vin: string;
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  bodyStyle?: string | null;
  /** Standalone Templates records its actual owner; inventory defaults remain. */
  ownerName?: string | null;
  /** The rebuilder, when not the dealership. */
  rebuilderName?: string | null;
  /** The form's address row belongs to the rebuilder. */
  rebuilderAddress?: string | null;
  /** When the work was finished, as the desk types it. */
  dateWorkCompleted?: string | null;
  /** The rebuilder's account of the work, for the details box. */
  workPerformed?: string | null;
  /** Page 2: the component parts used, from the title work's record. */
  parts?: readonly Vtr61Part[] | null;
  /** When no part was replaced, the statement that says so, printed in the details box. */
  laborStatement?: string | null;
};

const FIELDS = {
  vin: "Vehicle Identification Number",
  year: "Year",
  make: "Make",
  bodyStyle: "Body Style",
  model: "Model",
  ownerName: "First Name or Entity Name Middle Name Last Name Suffix if any",
  rebuilderName: "First Name or Entity Name Middle Name Last Name Suffix if any_2",
  ownerAddress: "Address City State Zip",
  dateWorkCompleted: "Date Work Completed",
  workPerformed: "1",
  rebuilderPrintedName: "Printed Name (Same as Signature)",
  ownerPrintedName: "Printed Name (Same as Signature)_2",
} as const;

function clean(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

export async function fillVtr61(input: Vtr61Input): Promise<Uint8Array> {
  const bytes = await readFile(PDF_PATH);
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const owner = input.ownerName === undefined ? factOr(dealership.legalName, "dealer legal name") : clean(input.ownerName);
  const rebuilder = clean(input.rebuilderName) || owner;
  const address = input.rebuilderAddress === undefined ? `${dealership.address.street}, ${dealership.address.locality}, ${dealership.address.region} ${dealership.address.postalCode}` : clean(input.rebuilderAddress);

  // The details box carries the work, and the no-parts statement when
  // there is one, because the county reads an empty page 2 as unfinished
  // unless the statement says why it is empty.
  const details = [clean(input.workPerformed), clean(input.laborStatement)].filter(Boolean).join(" ");

  const values: Record<string, string> = {
    [FIELDS.vin]: clean(input.vin).toUpperCase(),
    [FIELDS.year]: clean(input.year),
    [FIELDS.make]: clean(input.make),
    [FIELDS.model]: clean(input.model),
    [FIELDS.bodyStyle]: clean(input.bodyStyle),
    [FIELDS.ownerName]: owner,
    [FIELDS.ownerAddress]: address,
    [FIELDS.rebuilderName]: rebuilder,
    [FIELDS.dateWorkCompleted]: clean(input.dateWorkCompleted),
    [FIELDS.workPerformed]: details,
    [FIELDS.rebuilderPrintedName]: rebuilder,
    [FIELDS.ownerPrintedName]: owner,
  };

  /*
    Page 2, one line per component. The form has one origin box and one
    number box per part, so two entries for the same component share the
    boxes, separated. The donor VIN goes inside the origin box, because
    that is what the form's own instructions ask: "purchased from, name
    and complete address" or the vehicle it came from.
  */
  for (const component of VTR61_COMPONENTS) {
    const entries = (input.parts ?? []).filter((part) => part.component === component.key);
    if (entries.length === 0) continue;
    values[component.origin] = entries
      .map((part) => [part.origin, part.donorVin ? `Donor VIN ${part.donorVin}` : ""].filter(Boolean).join(", "))
      .join("; ");
    values[component.number] = entries.map((part) => part.partNumber).filter(Boolean).join("; ");
  }

  for (const [name, value] of Object.entries(values)) {
    const field = form.getTextField(name);
    field.setText(value);
    field.updateAppearances(font);
  }

  return pdf.save();
}
