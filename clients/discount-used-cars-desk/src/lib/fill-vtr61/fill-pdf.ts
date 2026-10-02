import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { dealership, dealerSignerPrintedName, factOr } from "@/lib/dealership-config";
import { fillDealerPrintedName, type PrintedNameLayout } from "@/lib/forms/dealer-printed-name-field";
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
 * Wherever the dealership is the owner or the rebuilder, the
 * "Printed Name (Same as Signature)" beside that signature line is the
 * dealer's legal name with the person who prints the form in parentheses,
 * "Legal Name, LLC (First Last)", exactly as the 130-U seller line prints it
 * (owner's decision 10/01/2026; SOP 130-U bullet: "wherever a state form asks
 * for the dealer's printed name beside a dealer signature"). The person is
 * the cleared, onboarded member printing it (`dealerSignerName`; the routes
 * refuse anyone else), with the same fit rules and two-line layout as the
 * seller line. The entity rows above stay the entity alone: they name the
 * owner and the rebuilder, not who signs for them. A party that is not the
 * dealership prints its own name, as typed.
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
  /**
   * The person printing the form, named as onboarding saved them (the
   * parentheses of the dealer's printed name). Null or absent prints the
   * "[Not set: signer name]" marker, never the entity alone; the routes
   * refuse that unless DESK_ALLOW_UNSET_FACTS lifts it for a demo.
   */
  dealerSignerName?: string | null;
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

/*
  The two printed-name boxes, measured on public/forms/VTR-61.pdf (Rev
  01/25). Both are 226.43pt wide. The rebuilder's sits at y 221.55 and is
  23.64 tall, with its rule at y 224.5 to 224.9 and the certification text
  above ending at y 245.3; the owner's sits at y 141.52 and is 22.33 tall,
  with its rule at y 143.6 to 144.1 and the text above ending at y 164.4.
  Two lines at 7.25pt on these baselines clear both rules (the lower line's
  descenders end about 2.3pt above the higher rule) and stay inside both
  boxes and under the text above.
*/
const VTR61_PRINTED_NAME_BASELINES = { upper: 14.6, lower: 7.2 } as const;

const PRINTED_NAME_LAYOUT: Record<"owner" | "rebuilder", PrintedNameLayout> = {
  owner: { baselines: VTR61_PRINTED_NAME_BASELINES, label: "VTR-61 owner's printed name", box: "owner's printed name box" },
  rebuilder: {
    baselines: VTR61_PRINTED_NAME_BASELINES,
    label: "VTR-61 rebuilder's printed name",
    box: "rebuilder's printed name box",
  },
};

function clean(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function sameName(a: string, b: string): boolean {
  const fold = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  return fold(a) === fold(b);
}

/**
 * Which of the two certifying parties is the dealership: the owner when the
 * form is filled for the dealership's own car (no owner given) or names the
 * dealer's legal name, and the rebuilder when it is the owner (no other
 * rebuilder given) or names the dealer's legal name. Exported so the routes
 * ask for a signer exactly when the form will print one.
 */
export function vtr61DealerParties(input: Pick<Vtr61Input, "ownerName" | "rebuilderName">): {
  owner: boolean;
  rebuilder: boolean;
} {
  const legal = dealership.legalName;
  const isDealer = (name: string) => Boolean(legal) && sameName(name, legal ?? "");
  const owner = input.ownerName === undefined || isDealer(clean(input.ownerName));
  const rebuilderGiven = clean(input.rebuilderName);
  const rebuilder = rebuilderGiven ? isDealer(rebuilderGiven) : owner;
  return { owner, rebuilder };
}

export async function fillVtr61(input: Vtr61Input): Promise<Uint8Array> {
  const bytes = await readFile(PDF_PATH);
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const owner = input.ownerName === undefined ? factOr(dealership.legalName, "dealer legal name") : clean(input.ownerName);
  const rebuilder = clean(input.rebuilderName) || owner;
  const dealerParty = vtr61DealerParties(input);
  // The pairing, never the entity alone, beside a signature the dealership gives.
  const printedByDealer = dealerSignerPrintedName(input.dealerSignerName);
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
  };
  // A party that is not the dealership prints its own name in its box, as
  // before; the dealership's boxes are filled below by the printed-name rules.
  if (!dealerParty.rebuilder) values[FIELDS.rebuilderPrintedName] = rebuilder;
  if (!dealerParty.owner) values[FIELDS.ownerPrintedName] = owner;

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

  // Explicit, like the 130-U seller line: a name the form cannot print, or
  // one the box would clip, refuses the render rather than leaving a blank
  // or cut-off box beside the signature.
  if (dealerParty.rebuilder) {
    fillDealerPrintedName(form, font, FIELDS.rebuilderPrintedName, printedByDealer, PRINTED_NAME_LAYOUT.rebuilder);
  }
  if (dealerParty.owner) {
    fillDealerPrintedName(form, font, FIELDS.ownerPrintedName, printedByDealer, PRINTED_NAME_LAYOUT.owner);
  }

  return pdf.save();
}
