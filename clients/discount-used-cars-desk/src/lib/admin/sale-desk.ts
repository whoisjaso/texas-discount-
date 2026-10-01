import { readBuyerProfile } from "@/lib/admin/buyer-profile";
import type { IdDocumentKind } from "@/lib/forms/id-document";
import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { readFunding, type DealFunding } from "@/lib/sales/deal-type";
import { hasPaperwork } from "@/lib/sales/paperwork";
import { readPlate, readPlateAsked } from "@/lib/sales/webdealer";


/**
 * Everything the deal view needs, in one read.
 *
 * The document list is built from what the database actually holds. A document
 * that never writes a record — the buyer's guide is printed, not stored —
 * says so rather than borrowing a tick from somewhere else.
 */

export type SaleBuyer = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  idNumber: string | null;
  /** The issuer: a state's two letters, or a passport's country code. */
  idState: string | null;
  /** Licence, ID card, passport or military ID. Null on older records: a licence. */
  idKind: IdDocumentKind | null;
  address: string | null;
};

export type SaleVehicle = {
  id: string;
  /** The canonical, acquisition-verified title fact. */
  titleStatus: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  status: string | null;
  salePrice: number | null;
  /**
   * What kind of vehicle it is, as the VIN decode or the intake recorded it.
   *
   * Carried on the sale because one paperwork question depends on it: the
   * 130-U wants a carrying capacity, which exists only for trucks and vans and
   * has no source anywhere in this product. Asking every buyer of a sedan for
   * one is a screen that can only be answered with a shrug.
   */
  bodyStyle: string | null;
  /**
   * The odometer reading, in miles, as Start A Sale recorded it that day.
   *
   * Carried on the sale because three documents print it and none could
   * reach it: the intake wrote the reading onto the vehicle row, the corridor
   * asks only whether the mileage is real, and the bill of sale's federal
   * odometer disclosure printed a blank line under a signed statement that
   * the reading was true. The state form alone survived, by looking the
   * vehicle up again on its own.
   */
  mileage: number | null;
  /** Exterior colour, for the 130-U's colour box and the bill of sale. */
  exteriorColor: string | null;
  /** Trim level, for the bill of sale's vehicle line. */
  trim: string | null;
  /** Empty weight in pounds, when the row holds one: the 130-U's starting answer for box 11. */
  weightLbs: number | null;
};

/**
 * How far a document has got on this deal.
 *
 * `signed` and `filed` are both finished states, and the difference between
 * them is the whole evidentiary point of a packet. `finalizePaperwork`
 * writes a finalized row whether or not a signature came with it, so until
 * now a document nobody had put a name to displayed as "Signed and on file".
 * That is a claim the record could not support.
 *
 * `filed` means we generated it and it exists. `signed` means the buyer's
 * own signature is on it. Both count as done for the corridor's progress,
 * because filing IS the step; only the wording stops overstating.
 */
export type SaleDocumentState = "signed" | "filed" | "finalized" | "draft" | "none";

/** Both finished states, for the many callers that only care whether it exists. */
export function isDocumentDone(state: SaleDocumentState): boolean {
  return state === "signed" || state === "filed" || state === "finalized";
}

export type SaleDetail = {
  id: string;
  status: string;
  language: string | null;
  createdAt: string;
  /**
   * When somebody started working this sale, as opposed to when the row was
   * written. Null on every deal from before the clock existed, and on any
   * whose reported start the server would not believe: untimed, never zero.
   */
  startedAt: string | null;
  completedAt: string | null;
  buyer: SaleBuyer | null;
  vehicle: SaleVehicle | null;
  /** document_type → the furthest state we hold for it on this deal. */
  documents: Record<string, SaleDocumentState>;
  /** What the retired paperwork pipeline recorded, when it ran on this deal. */
  registration: SaleRegistration | null;
  /** How the sale is paid for. Drives which documents the packet requires. */
  funding: DealFunding;
  /** The plate webDEALER issued, once someone has recorded it. */
  plate: string | null;
  /** Whether the corridor's plate question was answered, even with "not yet". */
  plateAsked: boolean;
  /**
   * The raw blob, for readers that own their own slice of it.
   *
   * `funding` and `plate` above are pre-read because almost every caller wants
   * them. The licence is not: it is a dozen fields with their own confirmation
   * rules, and duplicating that shape here would mean two places to keep in
   * step. Callers that need it run `readBuyerId` on this.
   */
  stepData: unknown;
};

export function vehicleLabel(vehicle: SaleVehicle | null): string {
  if (!vehicle) return "Vehicle not set";
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Vehicle not set";
}

export async function getSaleDetail(dealId: string): Promise<SaleDetail | null> {
  const supabase = await createAdminDataClient();

  const { data, error } = await supabase
    .from("deals")
    .select(
      "id, status, language, created_at, started_at, completed_at, step_data, customers(id, name, phone, email, profile_data), vehicles(id, year, make, model, vin, status, sale_price, body_style, title_status, mileage, exterior_color, trim, weight_lbs)",
    )
    .eq("id", dealId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    status: string;
    language: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    step_data: unknown;
    customers: {
      id: string;
      name: string | null;
      phone: string | null;
      email: string | null;
      profile_data: unknown;
    } | null;
    vehicles: {
      id: string;
      year: number | null;
      make: string | null;
      model: string | null;
      vin: string | null;
      status: string | null;
      sale_price: number | null;
      body_style: string | null;
      title_status: string | null;
      mileage: number | null;
      exterior_color: string | null;
      trim: string | null;
      weight_lbs: number | null;
    } | null;
  };

  const { data: agreements, error: agreementError } = await supabase
    .from("document_agreements")
    .select(
      "document_type, status, completed_at, finalized_at, has_buyer_signature, signature_svg, signed_at",
    )
    .eq("deal_id", dealId);

  if (agreementError) throw agreementError;

  const documents: Record<string, SaleDocumentState> = {};
  for (const raw of agreements ?? []) {
    const agreement = raw as unknown as {
      document_type: string | null;
      status: string | null;
      completed_at: string | null;
      finalized_at: string | null;
      has_buyer_signature: boolean | null;
      signature_svg: string | null;
      signed_at: string | null;
    };
    const type = agreement.document_type;
    if (!type) continue;

    const finished =
      Boolean(agreement.finalized_at) ||
      Boolean(agreement.completed_at) ||
      agreement.status === "completed" ||
      agreement.status === "finalized";

    /*
      The buyer's own signature, three ways, depending on which path captured
      it. Any one of them means a person put their name to this; none of them
      means we generated a document and filed it, which is a different claim.
    */
    const buyerSigned =
      agreement.has_buyer_signature === true ||
      Boolean(agreement.signature_svg) ||
      Boolean(agreement.signed_at);

    const state: SaleDocumentState = finished
      ? buyerSigned
        ? "signed"
        : "filed"
      : "draft";

    /*
      A deal can hold several attempts at the same document, so keep the
      furthest one: a superseded draft must never hide a signed copy, and a
      filed copy must never hide a signed one either.
    */
    const rank = { none: 0, draft: 1, filed: 2, finalized: 2, signed: 3 } as const;
    const held = documents[type];
    if (held === undefined || rank[state] > rank[held]) {
      documents[type] = state;
    }
  }

  const profile = readBuyerProfile(row.customers?.profile_data);

  return {
    id: row.id,
    status: row.status,
    language: row.language,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    buyer: row.customers
      ? {
          id: row.customers.id,
          name: row.customers.name,
          phone: row.customers.phone,
          email: row.customers.email,
          idNumber: profile.idNumber ?? null,
          idState: profile.idState ?? null,
          idKind: profile.idKind ?? null,
          address: profile.address ?? null,
        }
      : null,
    vehicle: row.vehicles
      ? {
          id: row.vehicles.id,
          // Verified at acquisition. The sale reads it and never asks, and a
          // rebuilt title pulls its own disclosure into the packet.
          titleStatus: row.vehicles.title_status ?? null,
          year: row.vehicles.year,
          make: row.vehicles.make,
          model: row.vehicles.model,
          vin: row.vehicles.vin,
          status: row.vehicles.status,
          salePrice: row.vehicles.sale_price,
          bodyStyle: row.vehicles.body_style,
          mileage: row.vehicles.mileage ?? null,
          exteriorColor: row.vehicles.exterior_color ?? null,
          trim: row.vehicles.trim ?? null,
          weightLbs: row.vehicles.weight_lbs ?? null,
        }
      : null,
    documents,
    registration: readSaleRegistration(row.step_data),
    funding: readFunding(row.step_data),
    stepData: row.step_data,
    // The retired pipeline wrote a plate at its step 7 and the new handoff
    // writes its own key. Prefer the new one; fall back so deals that only
    // went through the old flow still show the plate they already have.
    plate: readPlate(row.step_data) ?? readSaleRegistration(row.step_data)?.plate ?? null,
    plateAsked: readPlateAsked(row.step_data),
  };
}

/**
 * The packet, in the order it gets signed.
 *
 * `documentType` is what `document_agreements` calls the record. An entry
 * without one is printed rather than stored — the buyer's guide is a window
 * form, and nothing writes a row for it — so the desk says that plainly
 * instead of showing a tick it has not earned.
 */
export type SaleDocumentEntry = {
  href: string;
  title: string;
  /** The teaching sentence, for someone deliberately learning the packet. */
  note: string;
  /**
   * Three or four words answering "which one is that?" on the row itself.
   *
   * The rows carried nothing but their titles for a while, and zero explanatory
   * prose was recorded as a win. It is a win for the operator who runs this
   * packet daily and a loss for the new hire, who reads "Vehicle
   * Responsibility" and cannot tell what it is without opening it. That is the
   * discoverability failure ACM Interactions describes in "Stop Hiding My
   * Controls" - tidiness bought with information scent.
   *
   * So: scent, not explanation. Short enough that six of them together stay
   * under the screen's word limit, long enough to pick the right row.
   */
  gloss: string;
  documentType?: string;
  optional?: boolean;
};

export const SALE_DOCUMENTS: SaleDocumentEntry[] = [
  {
    /*
      First, before the bill of sale, on purpose: Texas wants a rebuilt
      salvage disclosure signed before any instrument of sale, and the
      corridor walks documents in this list's order. Reached only through
      the corridor; there is no standalone template page for it.
    */
    href: "/admin/documents/rebuilt-disclosure",
    title: "Rebuilt Title Disclosure",
    gloss: "Rebuilt salvage title, told in writing",
    note: "The written disclosure a rebuilt salvage title requires before anything else is signed.",
    documentType: "rebuiltDisclosure",
    optional: true,
  },
  {
    href: "/admin/documents/bill-of-sale",
    title: "Bill Of Sale",
    gloss: "Price, odometer, signatures",
    note: "The purchase itself. Price, odometer, and the buyer's acknowledgment.",
    documentType: "billOfSale",
  },
  {
    href: "/admin/documents/buyers-guide",
    title: "Buyer's Guide",
    gloss: "FTC window form",
    note: "FTC as-is window form. Printed for the packet, not stored as a record.",
  },
  {
    href: "/admin/documents/form-130u",
    title: "Form 130-U",
    gloss: "Title and registration",
    note: "Texas application for title and registration.",
    documentType: "form130U",
  },
  {
    href: "/admin/documents/vehicle-responsibility",
    title: "Vehicle Responsibility",
    gloss: "Buyer registers it themselves",
    note: "The buyer takes on their own registration, and agrees what it costs if it comes back to us.",
    documentType: "vehicleResponsibility",
    // Optional because it only applies when the buyer is handling their own
    // registration. When we file the title for them, this document describes
    // an arrangement that is not happening.
    optional: true,
  },
  {
    // Only when the prescreen recorded that no proof of insurance was shown.
    // Reached only through the corridor.
    href: "/admin/documents/insurance-acknowledgment",
    title: "Insurance Acknowledgment",
    gloss: "No proof of insurance shown",
    note: "The buyer signs that no insurance was shown, that they will get it, and that we cannot register the car until they do.",
    documentType: "insuranceAcknowledgment",
    optional: true,
  },
  {
    href: "/admin/documents/power-of-attorney",
    title: "Power Of Attorney",
    gloss: "We sign the title for them",
    note: "Only if we are signing title paperwork on the buyer's behalf.",
    documentType: "powerOfAttorney",
    // Optional again, and this time for the right reason: the buyer at the
    // desk signs the 130-U themselves, so this is owed only when they are
    // not here to sign and we sign for them. The plan adds it on that route.
    optional: true,
  },
  {
    href: "/admin/documents/financing",
    title: "Financing Contract",
    gloss: "In-house payment plan",
    note: "Only if the buyer is financing through us.",
    documentType: "financing",
    optional: true,
  },
  /*
    The tow-away packet: three sheets, on a salvage car the sale has chosen
    to sell as salvage rather than rebuild. Reached only through the
    corridor and only on that path; the salvage answer puts them in the
    packet and takes the ordinary sheets out (see `sales/salvage-plan.ts`).
    Their order is the order the buyer signs them: what they are buying,
    then that it cannot be driven, then what is theirs to do.
  */
  {
    href: "/admin/documents/salvage-bill-of-sale",
    title: "Salvage Bill Of Sale",
    gloss: "Salvage, not for the road",
    note: "The purchase of a salvage vehicle as is, for parts or rebuilding, with no representation it can be registered.",
    documentType: "salvageBillOfSale",
    optional: true,
  },
  {
    href: "/admin/documents/tow-away-acknowledgment",
    title: "Tow-Away Acknowledgment",
    gloss: "No plates, towed off the lot",
    note: "The buyer signs that the car leaves on a tow, that no plates or registration come with it, and that we promised neither.",
    documentType: "towAwayAcknowledgment",
    optional: true,
  },
  {
    href: "/admin/documents/buyer-responsibility-statement",
    title: "Buyer Responsibility Statement",
    gloss: "Title work is theirs now",
    note: "The buyer takes on the salvage title, the rebuild, the inspection and any application to the state, in their own name.",
    documentType: "buyerResponsibilityStatement",
    optional: true,
  },
];

/** What we hold for one document on one sale. */
export function documentStateFor(
  entry: SaleDocumentEntry,
  documents: Record<string, SaleDocumentState>,
): SaleDocumentState {
  if (!entry.documentType) return "none";
  return documents[entry.documentType] ?? "none";
}

export function describeDocumentState(
  entry: SaleDocumentEntry,
  state: SaleDocumentState,
): string {
  if (!entry.documentType) return "Print when you need it";
  /*
    "Signed" is a claim about a person, not about us.

    This said "Signed and on file" for anything finalized, and
    finalizePaperwork writes finalized whether or not a signature came with
    it. So a document the dealership generated and nobody put a name to
    announced itself as signed. On a packet whose whole value is evidentiary
    that is the one sentence that must not be generous.
  */
  if (state === "signed") return "Signed and on file";
  if (state === "filed" || state === "finalized") return "Filed. No signature yet";
  if (state === "draft") return "Draft saved. Not signed yet";
  return entry.optional ? "Not needed yet" : "Not started";
}

/** Every document a sale must hold before it is safe to close. */
export function outstandingRequiredDocuments(
  documents: Record<string, SaleDocumentState>,
): SaleDocumentEntry[] {
  return SALE_DOCUMENTS.filter(
    (entry) =>
      entry.documentType &&
      !entry.optional &&
      !isDocumentDone(documentStateFor(entry, documents)),
  );
}

/**
 * Where a document is answered, inside the sale it belongs to.
 *
 * The other one, `saleDocumentHref`, points at the templates section: a single
 * page of every box the form has, which is the right screen for printing a
 * blank form and the wrong one for the middle of a deal. This points at the
 * corridor, where the vehicle, the buyer and the licence are already known and
 * only the handful of genuinely open questions get asked, one to a screen.
 *
 * Returns null for a document this flow does not know how to ask for, so the
 * caller can fall back rather than link somewhere that would 404.
 */
export function paperworkHref(
  entry: SaleDocumentEntry,
  dealId: string,
): string | null {
  if (!entry.documentType) return null;
  // Only documents the corridor can actually ask. The power of attorney had
  // no question set, and this built its corridor URL anyway — so the guide's
  // required "Sign The Power Of Attorney" step linked every deal to a 404.
  // Null sends the caller to its fallback, the document's own form with the
  // deal attached, and heals itself the day the corridor learns the type.
  if (!hasPaperwork(entry.documentType)) return null;
  return `/admin/sales/${encodeURIComponent(dealId)}/paperwork/${encodeURIComponent(entry.documentType)}/start`;
}

/** Build a document link that carries the sale with it. */
export function saleDocumentHref(
  entry: SaleDocumentEntry,
  dealId: string,
): string {
  return `${entry.href}?dealId=${encodeURIComponent(dealId)}`;
}

/**
 * What the old paperwork pipeline recorded, read onto the sale.
 *
 * /admin/paperwork was a second sale system writing to the same deals table.
 * Its intake retired once the start screen could decode a VIN, but its deal
 * view had to stay open because of one column: `step_data`, a JSON blob the
 * sales view did not read. Redirecting it would have stranded that.
 *
 * There is less in there than the blob suggests. Across eight steps it holds
 * exactly three answers worth keeping: the plate issued for the car, whether
 * the title took the reassignment path, and how far the WebDealer checklist
 * got. The plate is the one that matters; it is a fact about the vehicle that
 * nothing else on the sale records.
 *
 * Everything is optional and nothing is inferred. A deal that never went
 * through that pipeline returns null and the sale shows no such section, which
 * is different from showing an empty one.
 */

export type SaleRegistration = {
  /** The plate issued, as it was typed at step 7. */
  plate: string | null;
  /** Whether the title took the used-reassignment path, when it was answered. */
  reassignment: string | null;
  /** How many of the WebDealer checklist items were ticked, and out of how many. */
  checklist: { done: number; total: number } | null;
};

/** True when the pipeline recorded anything at all worth showing. */
export function hasRegistrationRecord(
  registration: SaleRegistration | null,
): registration is SaleRegistration {
  if (!registration) return false;
  return Boolean(
    registration.plate || registration.reassignment || registration.checklist,
  );
}

/**
 * Pull the three answers out of the step blob.
 *
 * Exported separately from the query so the shape can be checked against a
 * fixture. The blob is keyed by step number as a string and every value in it
 * is `unknown`, so each read is guarded rather than cast.
 */
export function readSaleRegistration(raw: unknown): SaleRegistration | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const steps = raw as Record<string, unknown>;

  const stepAt = (n: number): Record<string, unknown> => {
    const value = steps[String(n)];
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  };

  const text = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  };

  const rawChecklist = stepAt(6).checklist;
  const checklist = Array.isArray(rawChecklist)
    ? {
        done: rawChecklist.filter(Boolean).length,
        total: rawChecklist.length,
      }
    : null;

  return {
    plate: text(stepAt(7).plate_number),
    reassignment: text(stepAt(5).used_reassignment),
    checklist,
  };
}
