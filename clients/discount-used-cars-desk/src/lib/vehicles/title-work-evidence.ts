import type { TitlePathStepKey, TitleWorkRow } from "@/lib/vehicles/title-path";

/**
 * What proves each step of the rebuild, and what the VTR-61 needs said.
 *
 * The owner's brief: the rebuilt packet should be complete by design, not
 * by somebody remembering. So each step on the path names the file kinds
 * it takes, and the two steps that can be ticked wrongly (the paper in
 * hand, the repairs) refuse a tick until their proof is on the row. The
 * VTR-61 step carries the form's own facts: when the work was finished,
 * who did it, the component parts with where each came from, and a written
 * statement of the labour when no part was replaced. Pure: the action
 * refuses with these words, the screen shows the same words, and the
 * form filler reads the same record.
 */

export type TitleWorkFileKind =
  | "salvageTitle"
  | "purchaseReceipt"
  | "partsReceipt"
  | "photo"
  | "inspection"
  | "other";

export const FILE_KINDS: Record<TitleWorkFileKind, { label: string; what: string }> = {
  salvageTitle: { label: "Salvage title", what: "Front and back, assigned to the dealership." },
  purchaseReceipt: { label: "Purchase receipt", what: "The auction or seller's receipt: Copart, IAA, or a bill of sale." },
  partsReceipt: { label: "Parts receipt", what: "One per component part used, with the seller's name and address." },
  photo: { label: "Photo", what: "Before and after the repairs." },
  inspection: { label: "Inspection report", what: "The passing report, if the county asks for one." },
  other: { label: "Other", what: "Anything else the county asked for." },
};

/** Which kinds each step takes. Absent means the step takes no file. */
export const STEP_FILE_KINDS: Partial<Record<TitlePathStepKey, TitleWorkFileKind[]>> = {
  ownership: ["salvageTitle", "purchaseReceipt"],
  repairs: ["partsReceipt"],
  photos: ["photo"],
  inspection: ["inspection"],
  county: ["other"],
};

export type TitleWorkFile = {
  kind: TitleWorkFileKind;
  /** The object path inside the title-work bucket. */
  path: string;
  name: string;
  contentType: string;
  uploadedAt: string;
  /** A short-lived signed URL, set by the loader for the screen; never stored. */
  url?: string;
};

export function isTitleWorkFileKind(value: unknown): value is TitleWorkFileKind {
  return typeof value === "string" && value in FILE_KINDS;
}

export function readFiles(raw: unknown): TitleWorkFile[] {
  if (!Array.isArray(raw)) return [];
  const out: TitleWorkFile[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const file = entry as Record<string, unknown>;
    if (!isTitleWorkFileKind(file.kind) || typeof file.path !== "string") continue;
    out.push({
      kind: file.kind,
      path: file.path,
      name: typeof file.name === "string" ? file.name : file.path.split("/").pop() ?? file.path,
      contentType: typeof file.contentType === "string" ? file.contentType : "application/octet-stream",
      uploadedAt: typeof file.uploadedAt === "string" ? file.uploadedAt : "",
    });
  }
  return out;
}

// ============================================================
// The VTR-61's own facts
// ============================================================

/**
 * The component parts the state's form lists on page 2, with the exact
 * field names its AcroForm carries for each. A part is a row: where it
 * came from (the seller's name and full address, or the donor vehicle),
 * its part number when it has one, and the donor VIN when it came off
 * another car, which the form wants inside the origin box.
 */
export const VTR61_COMPONENTS = [
  { key: "engine", label: "Engine", origin: "Origin of Component PartPurchased from Name and Complete AddressEngine", number: "Component Part Number requiredEngine", numberRequired: true },
  { key: "frame", label: "Frame", origin: "Origin of Component PartPurchased from Name and Complete AddressFrame", number: "Component Part Number requiredFrame", numberRequired: true },
  { key: "body", label: "Body", origin: "Origin of Component PartPurchased from Name and Complete AddressBody", number: "Component Part Number requiredBody", numberRequired: true },
  { key: "transmission", label: "Transmission", origin: "Origin of Component PartPurchased from Name and Complete AddressTransmission", number: "Component Part Number if availableTransmission", numberRequired: false },
  { key: "fenders", label: "Fenders", origin: "Origin of Component PartPurchased from Name and Complete AddressFenders", number: "Component Part Number if availableFenders", numberRequired: false },
  { key: "hood", label: "Hood", origin: "Origin of Component PartPurchased from Name and Complete AddressHood", number: "Component Part Number if availableHood", numberRequired: false },
  { key: "doors", label: "Doors", origin: "Origin of Component PartPurchased from Name and Complete AddressDoors", number: "Component Part Number if availableDoors", numberRequired: false },
  { key: "bumpers", label: "Bumpers", origin: "Origin of Component PartPurchased from Name and Complete AddressBumpers", number: "Component Part Number if availableBumpers", numberRequired: false },
  { key: "quarterPanels", label: "Quarter panels", origin: "Origin of Component PartPurchased from Name and Complete AddressQuarter Panels", number: "Component Part Number if availableQuarter Panels", numberRequired: false },
  { key: "tailgate", label: "Tailgate, deck lid or hatchback", origin: "Origin of Component PartPurchased from Name and Complete AddressTailgateDeck Lid Hatchback", number: "Component Part Number if availableTailgateDeck Lid Hatchback", numberRequired: false },
  { key: "cargoBox", label: "Pickup cargo box", origin: "Origin of Component PartPurchased from Name and Complete AddressPickup Cargo Box vehicle 10000 pounds or less", number: "Component Part Number if availablePickup Cargo Box vehicle 10000 pounds or less", numberRequired: false },
  { key: "cab", label: "Cab of a truck", origin: "Origin of Component PartPurchased from Name and Complete AddressCab of a Truck", number: "Component Part Number if availableCab of a Truck", numberRequired: false },
  { key: "roof", label: "Roof or floor pan", origin: "Origin of Component PartPurchased from Name and Complete AddressRoof or Floor Pan passenger vehicle if separate from body", number: "Component Part Number if availableRoof or Floor Pan passenger vehicle if separate from body", numberRequired: false },
] as const;

export type Vtr61ComponentKey = (typeof VTR61_COMPONENTS)[number]["key"];

export function isVtr61ComponentKey(value: unknown): value is Vtr61ComponentKey {
  return typeof value === "string" && VTR61_COMPONENTS.some((component) => component.key === value);
}

export type Vtr61Part = {
  component: Vtr61ComponentKey;
  /** Who it was bought from, name and complete address, or the donor car. */
  origin: string;
  partNumber: string;
  /** The VIN of the vehicle the part came off, when it came off one. */
  donorVin: string;
};

export type Vtr61Data = {
  dateWorkCompleted: string;
  /** Empty means the dealership rebuilt it. */
  rebuilderName: string;
  /** The account of the work, for the form's details box. */
  workPerformed: string;
  /** True when no component part was replaced: then the labour statement stands in for the parts list. */
  noPartsUsed: boolean;
  laborStatement: string;
  parts: Vtr61Part[];
};

export const EMPTY_VTR61: Vtr61Data = {
  dateWorkCompleted: "",
  rebuilderName: "",
  workPerformed: "",
  noPartsUsed: false,
  laborStatement: "",
  parts: [],
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function readVtr61(raw: unknown): Vtr61Data {
  if (!raw || typeof raw !== "object") return EMPTY_VTR61;
  const data = raw as Record<string, unknown>;
  const parts: Vtr61Part[] = [];
  if (Array.isArray(data.parts)) {
    for (const entry of data.parts) {
      if (!entry || typeof entry !== "object") continue;
      const part = entry as Record<string, unknown>;
      if (!isVtr61ComponentKey(part.component)) continue;
      parts.push({
        component: part.component,
        origin: text(part.origin),
        partNumber: text(part.partNumber),
        donorVin: text(part.donorVin).toUpperCase(),
      });
    }
  }
  return {
    dateWorkCompleted: text(data.dateWorkCompleted),
    rebuilderName: text(data.rebuilderName),
    workPerformed: text(data.workPerformed),
    noPartsUsed: data.noPartsUsed === true,
    laborStatement: text(data.laborStatement),
    parts,
  };
}

/**
 * What the VTR-61 still needs said, in the words the screen shows.
 *
 * The parts logic is the brief's: if no parts were used, a written
 * statement of the labour is required instead, because the county's clerk
 * reads an empty parts page as an unfinished form. A part with no origin
 * is a part the form cannot describe; the engine, frame and body must
 * carry their number, as the form itself says.
 */
export function vtr61Missing(data: Vtr61Data): string[] {
  const missing: string[] = [];
  if (!data.dateWorkCompleted) missing.push("the date the work was finished");
  if (!data.workPerformed) missing.push("what work was done");
  if (data.noPartsUsed) {
    if (!data.laborStatement) missing.push("the written statement that no component part was replaced, and what the labour was");
  } else {
    if (data.parts.length === 0) missing.push("at least one component part, or say no parts were used");
    for (const part of data.parts) {
      const component = VTR61_COMPONENTS.find((entry) => entry.key === part.component);
      if (!component) continue;
      if (!part.origin) missing.push(`where the ${component.label.toLowerCase()} came from`);
      if (component.numberRequired && !part.partNumber) missing.push(`the ${component.label.toLowerCase()}'s part number`);
      if (part.donorVin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(part.donorVin)) {
        missing.push(`a full 17-character donor VIN for the ${component.label.toLowerCase()}`);
      }
    }
  }
  return missing;
}

// ============================================================
// Whether a step may be ticked
// ============================================================

export type StepReadiness = { ok: true } | { ok: false; missing: string[] };

function filesOf(rows: readonly TitleWorkRow[], step: TitlePathStepKey, kind?: TitleWorkFileKind): TitleWorkFile[] {
  const row = rows.find((entry) => entry.step === step);
  const files = readFiles(row?.files);
  return kind ? files.filter((file) => file.kind === kind) : files;
}

/**
 * The proof each step needs before it counts as done.
 *
 * Only the steps whose tick would otherwise be a memory are gated: the
 * paper in hand needs the paper, the repairs need receipts or a labour
 * statement, the VTR-61 needs its facts. The rest are the county's own
 * acts and a tick is the honest record of them.
 */
export function stepReadiness(step: TitlePathStepKey, rows: readonly TitleWorkRow[]): StepReadiness {
  const missing: string[] = [];
  if (step === "ownership") {
    if (filesOf(rows, "ownership", "salvageTitle").length === 0) missing.push("a scan or photo of the salvage title, assigned to us");
  }
  if (step === "repairs") {
    const vtr61 = readVtr61(rows.find((entry) => entry.step === "vtr61")?.data);
    const receipts = filesOf(rows, "repairs", "partsReceipt").length;
    if (receipts === 0 && !(vtr61.noPartsUsed && vtr61.laborStatement)) {
      missing.push("a receipt for each component part used, or the VTR-61's statement that no parts were used");
    }
  }
  if (step === "vtr61") {
    missing.push(...vtr61Missing(readVtr61(rows.find((entry) => entry.step === "vtr61")?.data)));
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}
