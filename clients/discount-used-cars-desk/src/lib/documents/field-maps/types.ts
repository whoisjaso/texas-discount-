/**
 * A document is its pages, and every box on every page has one source.
 *
 * The desk used to ask questions per document: a list of the handful of
 * things somebody thought to ask, with everything else assumed to come from
 * "the deal". Nothing said which box came from where, so a box nothing
 * filled (the co-buyer's name, the trade-in's VIN, the first payment date)
 * printed blank on a signed legal record and nobody found out until a title
 * clerk did.
 *
 * A field map turns that around. It lists the boxes the paper prints, page by
 * page, and names the source of each one. The corridor's questions are then
 * whatever the pages leave open (`paperwork.ts`), the review screen reads the
 * page back as it will print (`resolve.ts`), and the filing refuses a box the
 * sale could have filled and did not (`missingPrintedFields`).
 *
 * The maps are data. Nothing here renders, fills or asks; the tests read the
 * maps against the renderers and the state PDFs so the two cannot drift.
 */

/** A fact the dealership owns: its config, or the owner's onboarding answers. */
export type DealerFact =
  | "legalName"
  | "tradeName"
  | "license"
  | "address"
  | "phone"
  | "website"
  | "email"
  | "county"
  | "salvageDealerLicense"
  | "complaintsContact"
  | "sellsServiceContracts"
  | "etitleLienholderId"
  | "signerName"
  | "logo"
  | "lateHandlingFee";

/** A fee line, from the sale's fee copy of the owner's schedule or webDEALER. */
export type FeeLine =
  | "docFee"
  | "titleFee"
  | "registrationFee"
  | "inspectionFee"
  | "plateFee"
  | "taxRate"
  | "lateHandlingFee";

export type VehicleColumn =
  | "vin"
  | "year"
  | "make"
  | "model"
  | "trim"
  | "bodyStyle"
  | "exteriorColor"
  | "mileage"
  | "stockNumber"
  | "titleStatus"
  | "emptyWeight"
  | "plate";

export type BuyerFact =
  | "name"
  | "nameParts"
  | "idNumber"
  | "idKind"
  | "idIssuer"
  | "phone"
  | "email"
  | "street"
  | "city"
  | "state"
  | "zip"
  | "county"
  | "address";

export type CoBuyerFact = "name" | "nameParts" | "idNumber" | "idIssuer" | "phone" | "email" | "address";

/**
 * A registered deal fact: `<owner>.<key>`, e.g. "billOfSale.odometerStatus"
 * or "guide:plan.registrationBy". The registry (`deal-facts.ts`) holds every
 * one of them, with the question that asks it and where its answer is stored.
 */
export type FactKey = string;

export type Source =
  | { from: "dealer"; fact: DealerFact }
  | { from: "fees"; line: FeeLine }
  | { from: "vehicle"; column: VehicleColumn }
  | { from: "buyer"; fact: BuyerFact }
  | { from: "coBuyer"; fact: CoBuyerFact }
  | { from: "answer"; fact: FactKey }
  | { from: "computed"; by: string }
  | { from: "date"; which: "saleDate" | "signedOn" | "filedOn" | "lienDate" | "contractDate" }
  | { from: "signature"; who: "buyer" | "coBuyer" | "dealer" }
  | { from: "static"; text?: string }
  | { from: "none"; reason: string };

/**
 * When a box may print blank, and why.
 *
 *   never     the sale always has it: a blank is a defect, refused at filing
 *   when      printed only on some sales (the condition names which)
 *   allowed   the form itself allows a blank (the form's own words quoted)
 *   ink       a signature or a date left for a pen
 *   office    left for the county or the tax office
 *   marker    a dealer fact: prints the [Not set: ...] marker until supplied
 */
export type Blank =
  | "never"
  | { when: string }
  | { allowed: string }
  | { ink: true }
  | { office: true }
  | { marker: DealerFact };

export type MapField = {
  /**
   * The key the document's probe returns: the decoded `completed_link` key
   * for a designed sheet, the `AgreementData` key for the 130-U, the field
   * builder's key for the VTR-61, VTR-271 and Buyer's Guide.
   */
  id: string;
  /** The label as it is printed on the form. */
  label: string;
  source: Source;
  blank: Blank;
  /** The AcroForm field this box is, on a state form with fields. */
  acroField?: string;
  /** Carried in the payload, not printed on this page (a legacy shape, a gate's input). */
  printed?: false;
  note?: string;
};

export type PageMap = { page: number; title: string; fields: MapField[] };

export type DocumentMap = {
  /** `document_agreements` type, or "buyersGuide" | "vtr61" for the never-filed forms. */
  documentType: string;
  kind: "stateForm" | "designedSheet";
  /** The state template under public/forms, for a state form. */
  template?: string;
  /**
   * The order its corridor asks the facts it owns. Every fact whose owner is
   * this document is in it, and nothing else (a test holds the two equal).
   */
  askOrder: FactKey[];
  pages: PageMap[];
  /**
   * AcroForm fields on the state template that this desk never fills, each
   * with its reason, so the coverage test can tell "not on the map" from
   * "deliberately left alone".
   */
  notOnThisDesk?: Record<string, string>;
  /** Mapped and kept, not walked by the corridor (the rental agreement). */
  legacy?: true;
};

/** Every printed field of a map, flattened, with its page. */
export function printedFields(map: DocumentMap): Array<MapField & { page: number }> {
  return map.pages.flatMap((page) =>
    page.fields.filter((field) => field.printed !== false).map((field) => ({ ...field, page: page.page })),
  );
}

/** Every field of a map, printed or carried, with its page. */
export function allFields(map: DocumentMap): Array<MapField & { page: number }> {
  return map.pages.flatMap((page) => page.fields.map((field) => ({ ...field, page: page.page })));
}

/** The registered facts a map's pages read. */
export function factsRead(map: DocumentMap): FactKey[] {
  const out: FactKey[] = [];
  for (const field of allFields(map)) {
    if (field.source.from === "answer" && !out.includes(field.source.fact)) out.push(field.source.fact);
  }
  return out;
}

// Small constructors, so a map reads as a list of boxes rather than JSON.
export const dealer = (fact: DealerFact): Source => ({ from: "dealer", fact });
export const fees = (line: FeeLine): Source => ({ from: "fees", line });
export const vehicle = (column: VehicleColumn): Source => ({ from: "vehicle", column });
export const buyer = (fact: BuyerFact): Source => ({ from: "buyer", fact });
export const coBuyer = (fact: CoBuyerFact): Source => ({ from: "coBuyer", fact });
export const answer = (fact: FactKey): Source => ({ from: "answer", fact });
export const computed = (by: string): Source => ({ from: "computed", by });
export const date = (which: "saleDate" | "signedOn" | "filedOn" | "lienDate" | "contractDate"): Source => ({ from: "date", which });
export const signature = (who: "buyer" | "coBuyer" | "dealer"): Source => ({ from: "signature", who });
export const statik = (text?: string): Source => ({ from: "static", ...(text ? { text } : {}) });
export const none = (reason: string): Source => ({ from: "none", reason });

export const NEVER: Blank = "never";
export const INK: Blank = { ink: true };
export const OFFICE: Blank = { office: true };
export const when = (condition: string): Blank => ({ when: condition });
export const allowed = (words: string): Blank => ({ allowed: words });
export const marker = (fact: DealerFact): Blank => ({ marker: fact });
