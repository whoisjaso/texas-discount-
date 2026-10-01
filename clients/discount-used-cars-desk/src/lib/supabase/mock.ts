import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getMockLeads } from "@/lib/mock-leads";
import { getMockVehicles } from "@/lib/mock-vehicles";
import { PUBLIC_VEHICLE_DB_COLUMNS } from "@/lib/vehicles/public";
import type { Lead, LeadRow, Vehicle, VehicleRow } from "@/types/database";
import { packetPreviewAgreements, packetPreviewDeals } from "@/lib/supabase/packet-preview-fixtures";

type QueryMode = "rows" | "single";

type MockRow = LeadRow | VehicleRow | Record<string, unknown>;

type MockFilterOp = "eq" | "in" | "gte" | "neq" | "is" | "not-is" | "not-in";

type MockQueryState = {
  table: string;
  mode: QueryMode;
  filters: Array<{ column: string; op: MockFilterOp; value: unknown }>;
  limit?: number;
  /** The patch an `.update()` carried, applied when the call is awaited. */
  update?: Record<string, unknown>;
  /** The rows an `.insert()` carried, appended when the call is awaited. */
  insert?: Array<Record<string, unknown>>;
  readOnlyMutation?: boolean;
  /** `.select("id", { count: "exact", head: true })` asked for a number. */
  wantsCount?: boolean;
  /** `head: true` means the caller wants the count and none of the rows. */
  headOnly?: boolean;
};

/**
 * What preview has been told, for the life of the process.
 *
 * The mock used to accept every write and remember none of them: `.update()`
 * fell through the proxy's catch-all and resolved to the fixtures, and
 * `storage.upload()` returned success without keeping anything. Anything
 * written in preview vanished, and a walk through a feature that writes then
 * reads back its own write came out green while proving nothing at all.
 *
 * That is worse than no fixture. A test instrument that always says yes is not
 * a weak test, it is a false one, and the licence attach path is exactly the
 * shape it would lie about: create a deal, upload two photographs, write them
 * onto the deal, then look at the deal to see whether they arrived.
 *
 * Two maps, keyed by table and by bucket. In memory only, per process, cleared
 * when the dev server restarts, which is the right lifetime for a fixture.
 */
/**
 * One store for the whole dev server, whichever bundle asks.
 *
 * Next compiles route handlers, server actions and server components into
 * separate bundles, and each bundle gets its own copy of a module's top-level
 * state. So a document filed through a server action sat in one copy of this
 * map while the PDF route, in another bundle, looked in a different one and
 * answered 404 for a row that had just been written. `globalThis` is the one
 * object every bundle shares, and the preview server is the only place this
 * module ever runs, so it is the right home for a fixture's memory.
 */
type MockStore = {
  written: Map<string, Map<string, Record<string, unknown>>>;
  uploaded: Map<string, Set<string>>;
  inserted: Map<string, Array<Record<string, unknown>>>;
  minted: { count: number };
};
const store: MockStore = ((globalThis as { __tjMockStore?: MockStore }).__tjMockStore ??= {
  written: new Map(),
  uploaded: new Map(),
  inserted: new Map(),
  minted: { count: 0 },
});
const written = store.written;
const uploaded = store.uploaded;

/**
 * Rows preview has been handed that the fixtures never had.
 *
 * `.insert()` used to fall through the proxy's catch-all like `.update()`
 * once did: it resolved to the untouched fixtures, so Start A Sale "created"
 * a deal whose id was the first fixture's, and File on a review screen
 * "filed" a document that never existed. A whole sale could not be walked
 * in preview, which is the one environment every persona walk and every
 * verification script runs in. Every one of those walks stopped at the
 * first document and called it done.
 *
 * Appended in memory per table, ids minted here, read back through the same
 * path the fixtures take so filters, writes and the deal's embedded buyer
 * and vehicle all behave the way a real row would.
 */
const inserted = store.inserted;
const minted = store.minted;

/** Everything preview has stored in one bucket. Read by tests and by walks. */
export function mockUploads(bucket: string): string[] {
  return [...(uploaded.get(bucket) ?? [])];
}

/** Every row preview has inserted into one table. Read by tests and by walks. */
export function mockInserted(table: string): Array<Record<string, unknown>> {
  return [...(inserted.get(table) ?? [])].map((row) => withWrites(table, row) as Record<string, unknown>);
}

/** Forget every write. For tests that need to start from the fixtures. */
export function resetMockWrites(): void {
  written.clear();
  uploaded.clear();
  inserted.clear();
}

/** The row as the fixtures have it, with anything written over the top. */
function withWrites(table: string, row: MockRow): MockRow {
  const id = (row as { id?: unknown }).id;
  if (typeof id !== "string") return row;
  const patch = written.get(table)?.get(id);
  return patch ? { ...row, ...patch } : row;
}

function applyUpdate(state: MockQueryState) {
  if (!state.update) return;
  // Only an update aimed at one row by id is recorded. A broader one is not
  // something this fixture can honestly represent, so it is left alone rather
  // than half-applied.
  const target = state.filters.find((f) => f.column === "id" && f.op === "eq");
  if (typeof target?.value !== "string") return;

  const table = written.get(state.table) ?? new Map<string, Record<string, unknown>>();
  table.set(target.value, { ...table.get(target.value), ...state.update });
  written.set(state.table, table);
}

/**
 * Append what an insert carried, the way the database would: an id when the
 * caller gave none, a creation time, and the status a fresh row starts in.
 * The rows come back as the result, so `.insert(row).select("id").single()`
 * answers with the id that was actually minted.
 */
function applyInsert(state: MockQueryState): Array<Record<string, unknown>> | null {
  if (!state.insert) return null;
  const now = new Date().toISOString();
  const rows = state.insert.map((row) => {
    minted.count += 1;
    const stored: Record<string, unknown> = {
      id: `preview-${state.table}-${minted.count}`,
      created_at: now,
      ...(state.table === "deals" ? { status: "in_progress", completed_at: null } : {}),
      ...(state.table === "vehicles" ? { status: "available" } : {}),
      ...row,
    };
    return stored;
  });
  inserted.set(state.table, [...(inserted.get(state.table) ?? []), ...rows]);
  return rows;
}

function createMockQueryResult(state: MockQueryState) {
  if (state.readOnlyMutation) {
    return { data: null, error: { code: "42501", message: "Public inventory is read-only." } };
  }
  const added = applyInsert(state);
  if (added) {
    return {
      data: state.mode === "single" ? (added[0] ?? null) : added,
      error: null,
    };
  }
  applyUpdate(state);
  const rows = getMockRows(state);
  if (state.wantsCount) {
    return {
      data: state.headOnly ? null : rows,
      count: rows.length,
      error: null,
    };
  }
  if (state.table === "public_inventory_vehicles" && state.mode === "single" && rows.length !== 1) {
    return { data: null, error: { code: "PGRST116", message: "Public vehicle not found." } };
  }
  return {
    data: state.mode === "single" ? (rows[0] ?? null) : rows,
    error: null,
  };
}

function vehicleToRow(vehicle: Vehicle): VehicleRow {
  return {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    price: vehicle.price,
    mileage: vehicle.mileage,
    vin: vehicle.vin,
    status: vehicle.status,
    description: vehicle.description,
    image_url: vehicle.imageUrl,
    gallery: vehicle.gallery,
    slug: vehicle.slug,
    body_style: vehicle.bodyStyle,
    exterior_color: vehicle.exteriorColor,
    interior_color: vehicle.interiorColor,
    transmission: vehicle.transmission,
    drivetrain: vehicle.drivetrain,
    engine: vehicle.engine,
    fuel_type: vehicle.fuelType,
    date_added: vehicle.dateAdded,
    created_at: vehicle.createdAt,
    updated_at: vehicle.updatedAt,
    trim: vehicle.trim,
    purchase_price: vehicle.purchasePrice,
    buy_fee: vehicle.buyFee,
    total_cost: vehicle.totalCost,
    seller_name: vehicle.sellerName,
    auction_location: vehicle.auctionLocation,
    work_order_number: vehicle.workOrderNumber,
    stock_number: vehicle.stockNumber,
    guarantee_expires_at: vehicle.guaranteeExpiresAt,
    guarantee_price: vehicle.guaranteePrice,
    transport_carrier: vehicle.transportCarrier,
    transport_load_id: vehicle.transportLoadId,
    transport_cost: vehicle.transportCost,
    transport_pickup_eta: vehicle.transportPickupEta,
    transport_delivery_eta: vehicle.transportDeliveryEta,
    source_email_id: vehicle.sourceEmailId,
    condition_notes: vehicle.conditionNotes,
    title_type: vehicle.titleType,
    // The same exact-value mapping the live migration used: a fixture that
    // says Clean is clean, anything else stays unverified so preview mode
    // exercises the title gate the way production does.
    title_status: /^(clean|clear)$/i.test((vehicle.titleType ?? "").trim())
      ? "clean"
      : "unknown",
    mechanical_cost: vehicle.mechanicalCost,
    cosmetic_cost: vehicle.cosmeticCost,
    other_costs: vehicle.otherCosts,
    date_listed: vehicle.dateListed,
    date_sold: vehicle.dateSold,
    sale_price: vehicle.salePrice,
    selling_fees: vehicle.sellingFees,
    net_profit: vehicle.netProfit,
    weight_lbs: vehicle.weightLbs,
    license_plate: vehicle.licensePlate,
    buyer_name: vehicle.buyerName,
    buyer_phone: vehicle.buyerPhone,
    buyer_customer_id: vehicle.buyerCustomerId,
    buyer_id_number: vehicle.buyerIdNumber,
    lead_source_name: vehicle.leadSourceName,
    days_in_stock: vehicle.daysInStock,
    target_list_price: vehicle.targetListPrice,
    floor_price: vehicle.floorPrice,
    carfax_url: vehicle.carfaxUrl ?? null,
    weekly_rental_rate: vehicle.weeklyRentalRate ?? null,
    is_rental_fleet: vehicle.isRentalFleet ?? false,
    last_known_location: vehicle.lastKnownLocation ?? null,
    readiness_bucket: vehicle.readinessBucket ?? null,
    keys_status: vehicle.keysStatus ?? null,
    gps_status: vehicle.gpsStatus ?? null,
    insurance_status: vehicle.insuranceStatus ?? null,
    title_registration_status: vehicle.titleRegistrationStatus ?? null,
    last_census_at: vehicle.lastCensusAt ?? null,
  };
}

function leadToRow(lead: Lead): LeadRow {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    vehicle_id: lead.vehicleId,
    source: lead.source,
    status: lead.status,
    buyer_name: lead.buyerName,
    buyer_phone: lead.buyerPhone,
    created_at: lead.createdAt,
  };
}

/** The fixtures for a table plus whatever preview has inserted since. */
function allRows(table: string): MockRow[] {
  if (table === "public_inventory_vehicles") {
    const vehiclesWithDeals = new Set(allRows("deals").map((row) => (row as Record<string, unknown>).vehicle_id));
    return allRows("vehicles").filter((row) => {
      const vehicle = row as Record<string, unknown>;
      return vehicle.status === "Available" && (vehicle.is_rental_fleet ?? false) === false
        && vehicle.date_sold == null && vehicle.buyer_customer_id == null
        && !["buyer_name", "buyer_phone", "buyer_id_number"].some((key) => {
          const value = vehicle[key];
          return value != null && (typeof value !== "string" || value.trim() !== "");
        })
        && !(Number(vehicle.sale_price ?? 0) > 0) && !vehiclesWithDeals.has(vehicle.id);
    }).map((row) => Object.fromEntries(PUBLIC_VEHICLE_DB_COLUMNS.map((key) =>
      [key, (row as Record<string, unknown>)[key] ?? null])));
  }
  let rows: MockRow[];
  if (table === "vehicles") {
    rows = getMockVehicles().map(vehicleToRow);
  } else if (table === "leads") {
    rows = getMockLeads().map(leadToRow);
  } else {
    rows = getPreviewRows(table);
  }
  // Anything preview has been told, over the top of the fixture. Applied before
  // filtering, so a row can be found by a value that was written rather than
  // only by one that shipped in the fixture.
  return [...rows, ...(inserted.get(table) ?? [])].map((row) => withWrites(table, row));
}

/**
 * A deal's buyer and vehicle, embedded the way the real query embeds them.
 *
 * The fixtures carry `customers` and `vehicles` objects inline because the
 * sale desk selects them that way. An inserted deal carries only the ids
 * Start A Sale wrote, so the join is done here from the same rows the
 * `customers` and `vehicles` tables answer with, writes included. Without
 * this a freshly started sale read as "Buyer not set" and "Vehicle not
 * set" on every screen after the one that created it.
 */
function embedDealRelations(row: MockRow): MockRow {
  const deal = row as Record<string, unknown>;
  const out: Record<string, unknown> = { ...deal };
  if (!out.customers && typeof deal.customer_id === "string") {
    out.customers =
      allRows("customers").find((r) => (r as { id?: unknown }).id === deal.customer_id) ?? null;
  }
  if (!out.vehicles && typeof deal.vehicle_id === "string") {
    out.vehicles =
      allRows("vehicles").find((r) => (r as { id?: unknown }).id === deal.vehicle_id) ?? null;
  }
  return out;
}

function getMockRows(state: MockQueryState) {
  let rows = allRows(state.table);
  if (state.table === "deals") rows = rows.map(embedDealRelations);

  for (const filter of state.filters) {
    rows = rows.filter((row) => {
      const value = row[filter.column as keyof typeof row];
      switch (filter.op) {
        case "in":
          return Array.isArray(filter.value) && filter.value.includes(value);
        case "not-in":
          return !(Array.isArray(filter.value) && filter.value.includes(value));
        case "gte":
          return typeof value === "string" && typeof filter.value === "string" && value >= filter.value;
        case "neq":
          return value !== filter.value;
        case "is":
          return (value ?? null) === filter.value;
        case "not-is":
          return (value ?? null) !== filter.value;
        default:
          return value === filter.value;
      }
    });
  }
  if (typeof state.limit === "number") {
    rows = rows.slice(0, state.limit);
  }
  return rows;
}

function getPreviewRows(table: string): Array<Record<string, unknown>> {
  if (table === "document_agreements") return [...previewRentalAgreements, ...packetPreviewAgreements];
  if (table === "deals") return [...previewDeals, ...packetPreviewDeals];
  if (table === "customers") return previewCustomers;
  if (table === "payment_schedules") return previewPaymentSchedules;
  if (table === "installments") return previewInstallments;
  if (table === "customer_payment_methods") return previewPaymentMethods;
  if (table === "rental_ledger") return previewRentalLedger;
  if (table === "notification_log") return previewNotificationLog;
  if (table === "sms_messages") return previewSmsMessages;
  return [];
}

const previewDeals = [
  {
    id: "preview-completed-deal",
    status: "completed",
    current_step: 9,
    step_data: {},
    language: "en",
    created_at: "2026-05-01T14:30:00.000Z",
    completed_at: "2026-05-01T16:00:00.000Z",
    vehicles: {
      id: "preview-vehicle-paperwork-1",
      year: 2022,
      make: "Mercedes-Benz",
      model: "C 300",
      vin: "W1KAF4HB0NR123456",
      // Price and body style are what the paperwork corridor reads: the money
      // on a bill of sale comes off the price, and the 130-U asks a truck for a
      // carrying capacity. Missing here meant neither could be seen locally.
      sale_price: 28500,
      body_style: "Sedan",
    },
    customers: {
      id: "preview-customer-paperwork-1",
      name: "Aaliyah Stone",
      phone: "+17135550123",
    },
  },
  {
    id: "preview-active-deal",
    status: "in_progress",
    current_step: 4,
    // A deal that went through the retired paperwork pipeline, so the sale's
    // registration block is reachable in preview. Empty here meant that
    // section could never be seen locally, which is how the mobile Late list
    // went unrendered for months.
    step_data: {
      "5": { used_reassignment: "Reassignment" },
      "6": { checklist: [true, true, true, true, false, false, false, false, false] },
      "7": { plate_number: "27422DLR" },
      /*
        A confirmed mailing address, in its pieces.

        Without one the whole address half of the webDEALER handoff renders as
        five "Missing" rows locally, so nobody working on that screen ever
        sees it carrying values. That is the same shape of blind spot this
        file's other preview rows exist to close.
      */
      buyerId: {
        mailing: {
          street: "4521 Telephone Rd",
          city: "Houston",
          state: "TX",
          postal: "77087-0421",
          county: "Harris",
        },
        mailingConfirmed: true,
      },
    },
    language: "en",
    created_at: "2026-05-02T11:15:00.000Z",
    completed_at: null,
    vehicles: {
      id: "preview-vehicle-paperwork-2",
      year: 2019,
      make: "BMW",
      model: "530i",
      vin: "WBAJA7C50KWW12345",
      sale_price: 19750,
      body_style: "Sedan",
      weight_lbs: 3765,
    },
    customers: {
      id: "preview-customer-paperwork-2",
      name: "Marcus Reed",
      phone: "+17135550188",
    },
  },
];

const previewCustomers = [
  {
    id: "preview-customer-1",
    good_standing_since: "2026-04-01",
    late_payment_count: 0,
    default_billing_agreement_id: "preview-billing-1",
  },
  {
    id: "preview-customer-2",
    good_standing_since: null,
    late_payment_count: 2,
    default_billing_agreement_id: null,
  },
  {
    id: "preview-customer-ended",
    good_standing_since: "2026-02-15",
    late_payment_count: 0,
    default_billing_agreement_id: null,
  },
  {
    id: "preview-financing-customer-1",
    name: "Darius Coleman",
    phone: "+17135550177",
    email: "darius@example.com",
    language: "en",
    lead_id: null,
    notes: null,
    sms_opted_out: false,
    stripe_customer_id: null,
    created_at: "2026-04-12T14:10:00.000Z",
    good_standing_since: null,
    late_payment_count: 1,
    default_billing_agreement_id: null,
  },
];

const previewPaymentMethods = [
  {
    id: "preview-method-1",
    customer_id: "preview-customer-1",
    status: "active",
    provider: "stripe",
    method_type: "card",
    last4: "4242",
  },
];

const previewRentalLedger = [
  {
    id: "preview-ledger-rental-1",
    agreement_id: "preview-rental-1",
    renter_id: "preview-customer-1",
    vehicle_id: "mock-1",
    weekly_rate_cents: 42500,
    current_balance_cents: 0,
    paid_through_date: "2026-06-03",
    ledger_status: "green",
    next_charge_attempt_at: "2026-06-03T15:00:00.000Z",
  },
  {
    id: "preview-ledger-rental-2",
    agreement_id: "preview-rental-2",
    renter_id: "preview-customer-2",
    vehicle_id: "mock-2",
    weekly_rate_cents: 37500,
    current_balance_cents: 75000,
    paid_through_date: "2026-05-20",
    ledger_status: "delinquent",
    next_charge_attempt_at: "2026-06-01T15:00:00.000Z",
  },
  {
    id: "preview-ledger-release-hold",
    agreement_id: "preview-rental-release-hold",
    renter_id: "preview-customer-3",
    vehicle_id: "mock-3",
    weekly_rate_cents: 39500,
    current_balance_cents: 39500,
    paid_through_date: null,
    ledger_status: "warning",
    next_charge_attempt_at: "2026-06-01T15:00:00.000Z",
  },
];

const previewPaymentSchedules = [
  {
    id: "preview-financing-schedule-1",
    customer_id: "preview-financing-customer-1",
    agreement_id: "preview-financing-agreement-1",
    vehicle_description: "2021 Chevrolet Malibu LT",
    schedule_type: "financing",
    total_amount: 7200,
    down_payment: 1200,
    installment_amount: 600,
    frequency: "Monthly",
    num_payments: 12,
    apr: 0,
    start_date: "2026-04-15",
    status: "active",
    created_at: "2026-04-12T14:30:00.000Z",
    customers: {
      id: "preview-financing-customer-1",
      name: "Darius Coleman",
      phone: "+17135550177",
      email: "darius@example.com",
      language: "en",
      lead_id: null,
      notes: null,
      sms_opted_out: false,
      stripe_customer_id: null,
      created_at: "2026-04-12T14:10:00.000Z",
    },
  },
];

const previewInstallments = [
  {
    id: "preview-financing-installment-1",
    schedule_id: "preview-financing-schedule-1",
    installment_number: 1,
    due_date: "2026-04-15",
    amount_due: 600,
    amount_paid: 600,
    status: "paid",
    paid_date: "2026-04-15",
    created_at: "2026-04-12T14:31:00.000Z",
    // The screen reads the schedule through the installment, the way the real
    // query joins it. Without this the preview shows nothing late, which is
    // exactly the false all-clear the money screen is built not to give.
    payment_schedules: {
      id: "preview-financing-schedule-1",
      status: "active",
      vehicle_description: "2021 Chevrolet Malibu LT",
      customer_id: "preview-financing-customer-1",
      customers: { name: "Darius Coleman", phone: "+17135550177" },
    },
  },
  {
    id: "preview-financing-installment-2",
    schedule_id: "preview-financing-schedule-1",
    installment_number: 2,
    due_date: "2026-05-15",
    amount_due: 600,
    amount_paid: 150,
    status: "partial",
    paid_date: "2026-05-16",
    created_at: "2026-04-12T14:31:00.000Z",
    // The screen reads the schedule through the installment, the way the real
    // query joins it. Without this the preview shows nothing late, which is
    // exactly the false all-clear the money screen is built not to give.
    payment_schedules: {
      id: "preview-financing-schedule-1",
      status: "active",
      vehicle_description: "2021 Chevrolet Malibu LT",
      customer_id: "preview-financing-customer-1",
      customers: { name: "Darius Coleman", phone: "+17135550177" },
    },
  },
  {
    id: "preview-financing-installment-3",
    schedule_id: "preview-financing-schedule-1",
    installment_number: 3,
    due_date: "2026-06-15",
    amount_due: 600,
    amount_paid: 0,
    status: "upcoming",
    paid_date: null,
    created_at: "2026-04-12T14:31:00.000Z",
    // The screen reads the schedule through the installment, the way the real
    // query joins it. Without this the preview shows nothing late, which is
    // exactly the false all-clear the money screen is built not to give.
    payment_schedules: {
      id: "preview-financing-schedule-1",
      status: "active",
      vehicle_description: "2021 Chevrolet Malibu LT",
      customer_id: "preview-financing-customer-1",
      customers: { name: "Darius Coleman", phone: "+17135550177" },
    },
  },
  {
    id: "preview-financing-installment-4",
    schedule_id: "preview-financing-schedule-1",
    installment_number: 4,
    due_date: "2026-07-15",
    amount_due: 600,
    amount_paid: 0,
    status: "upcoming",
    paid_date: null,
    created_at: "2026-04-12T14:31:00.000Z",
    // The screen reads the schedule through the installment, the way the real
    // query joins it. Without this the preview shows nothing late, which is
    // exactly the false all-clear the money screen is built not to give.
    payment_schedules: {
      id: "preview-financing-schedule-1",
      status: "active",
      vehicle_description: "2021 Chevrolet Malibu LT",
      customer_id: "preview-financing-customer-1",
      customers: { name: "Darius Coleman", phone: "+17135550177" },
    },
  },
];

const previewNotificationLog = [
  {
    id: "preview-financing-notification-1",
    customer_id: "preview-financing-customer-1",
    installment_id: "preview-financing-installment-2",
    channel: "sms",
    template_key: "overdue_3day",
    message_body: "Hi Darius, your Malibu payment still has a $450 balance. Call Vega's when you are ready to clear it.",
    status: "sent",
    provider_message_id: "preview-finance-message-1",
    notification_date: "2026-05-18",
    sent_at: "2026-05-18T15:00:00.000Z",
  },
];

const previewSmsMessages = [
  {
    id: "preview-sms-1",
    customer_id: "preview-customer-1",
    direction: "outbound",
    body: "Hi Maya, your insurance recheck is due today. Reply here once the updated card is ready.",
    from_number: "+17135550100",
    to_number: "+17135550101",
    telnyx_message_id: "preview_telnyx_1",
    status: "sent",
    provider_status: "delivered",
    error_code: null,
    error_message: null,
    last_status_at: "2026-05-27T14:31:00.000Z",
    ai_generated: true,
    created_at: "2026-05-27T14:30:00.000Z",
  },
  {
    id: "preview-sms-2",
    customer_id: "preview-customer-2",
    direction: "outbound",
    body: "Your Renewal Link Could Not Be Delivered. Staff Needs To Confirm The Phone Number.",
    from_number: "+17135550100",
    to_number: "+17135550102",
    telnyx_message_id: "preview_telnyx_2",
    status: "failed",
    provider_status: "delivery_failed",
    error_code: "40003",
    error_message: "Destination handset unreachable",
    last_status_at: "2026-05-27T13:11:00.000Z",
    ai_generated: false,
    created_at: "2026-05-27T13:10:00.000Z",
  },
  {
    id: "preview-financing-sms-1",
    customer_id: "preview-financing-customer-1",
    direction: "outbound",
    body: "Hi Darius, your Malibu account has a $450 remaining balance on payment #2. Reply here or call us today.",
    from_number: "+17135550100",
    to_number: "+17135550177",
    telnyx_message_id: "preview_telnyx_finance_1",
    status: "sent",
    provider_status: "delivered",
    error_code: null,
    error_message: null,
    last_status_at: "2026-05-18T15:02:00.000Z",
    ai_generated: false,
    created_at: "2026-05-18T15:00:00.000Z",
  },
];

const previewRentalAgreements = [
  /*
    Two documents filed against a preview deal, so the packet screen can be
    seen with something on it.

    Without these the only reachable state of that screen locally is "nothing
    has been signed yet", which is the one state that needs no checking. The
    same gap is what hid the mobile Late list for months, and the note on
    `previewDeals` records it: a fixture that cannot reach a screen's populated
    state is a fixture that lets that state ship unlooked at.
  */
  {
    id: "preview-agreement-bill-of-sale",
    deal_id: "preview-active-deal",
    document_type: "billOfSale",
    status: "finalized",
    buyer_name: "Marcus Reed",
    vehicle_description: "2019 BMW 530i",
    vehicle_vin: "WBAJA7C50KWW12345",
    finalized_at: "2026-05-02T16:20:00.000Z",
    completed_at: "2026-05-02T16:20:00.000Z",
    created_at: "2026-05-02T16:20:00.000Z",
  },
  {
    id: "preview-agreement-130u",
    deal_id: "preview-active-deal",
    document_type: "form130U",
    status: "draft",
    buyer_name: "Marcus Reed",
    vehicle_description: "2019 BMW 530i",
    vehicle_vin: "WBAJA7C50KWW12345",
    finalized_at: null,
    completed_at: null,
    created_at: "2026-05-02T16:35:00.000Z",
  },
  {
    id: "preview-rental-1",
    document_type: "rental",
    state: "active",
    status: "completed",
    buyer_name: "Maya Johnson",
    buyer_phone: "(713) 555-0101",
    buyer_email: "maya@example.com",
    buyer_address: "2100 Main St",
    buyer_city: "Houston",
    buyer_state: "TX",
    buyer_zip: "77002",
    buyer_license: "TX-4839201",
    buyer_license_state: "TX",
    buyer_id_photo: "uploaded",
    co_buyer_license: null,
    vehicle_id: "mock-1",
    vehicle_description: "2021 Mercedes-Benz GLE 350",
    vehicle_vin: "4JGFB4KB1MA000001",
    vehicles: { license_plate: "VGA-2041" },
    weekly_rate: 425,
    next_charge_date: "2026-06-03",
    rental_end_date: "2026-05-28",
    hardship_flag: false,
    customer_id: "preview-customer-1",
    created_at: "2026-05-01T15:00:00.000Z",
    completed_at: "2026-05-01T16:00:00.000Z",
    signed_at: "2026-05-01T16:00:00.000Z",
    deleted_at: null,
    terminated_at: null,
    terminated_reason: null,
    parent_agreement_id: null,
    new_agreement_id: null,
    renewal_decision_sent_at: null,
    signing_token: "preview-signing-1",
    signing_token_expires_at: "2027-01-01T00:00:00.000Z",
    completed_link: "https://example.com/completed/preview-rental-1",
    agreement_pdf_url: "https://example.com/preview-rental-1.pdf",
    portal_data: {
      d: {
        rentalStartDate: "2026-05-01",
        rentalEndDate: "2026-05-28",
        vehicleYear: "2021",
        vehicleMake: "Mercedes-Benz",
        vehicleModel: "GLE 350",
        vehicleVin: "4JGFB4KB1MA000001",
      },
      cd: {
        renterPhone: "(713) 555-0101",
        renterEmail: "maya@example.com",
        renterLicense: "TX-4839201",
        renterLicenseState: "TX",
        idFrontImage: "uploaded",
        idBackImage: "uploaded",
        identityStatus: "verified",
        insuranceCardImage: "uploaded",
        insuranceStatus: "needs_review",
        insuranceProvider: "Progressive",
        insurancePolicyNumber: "P-2041",
        insuranceEffectiveDate: "2026-05-01",
        insuranceExpirationDate: "2026-05-28",
        insuranceVehicleVin: "4JGFB4KB1MA000001",
        insuranceCompanyPhone: "(800) 555-0199",
        insuranceNamedInsured: "Maya Johnson",
        insuranceVehicleVinMatch: true,
        insuranceNamedInsuredMatch: true,
        approvedDriverStatus: "approved",
        emergencyContactName: "Andre Johnson",
        emergencyContactPhone: "(713) 555-0110",
        nextInsuranceVerificationDueDate: "2026-05-27",
      },
      ops: {
        maintenanceRequests: [],
      },
    },
  },
  {
    id: "preview-rental-2",
    document_type: "rental",
    state: "default",
    status: "sent",
    buyer_name: "Carlos Rivera",
    buyer_phone: "(713) 555-0102",
    buyer_email: "carlos@example.com",
    buyer_address: null,
    buyer_city: null,
    buyer_state: null,
    buyer_zip: null,
    buyer_license: null,
    buyer_license_state: null,
    buyer_id_photo: null,
    co_buyer_license: null,
    vehicle_id: "mock-2",
    vehicle_description: "2020 Lexus ES 350",
    vehicle_vin: "58ADZ1B10LU000002",
    vehicles: { license_plate: "VGA-1188" },
    weekly_rate: 375,
    next_charge_date: "2026-05-20",
    rental_end_date: "2026-06-12",
    hardship_flag: false,
    customer_id: "preview-customer-2",
    created_at: "2026-05-12T15:00:00.000Z",
    completed_at: null,
    signed_at: null,
    deleted_at: null,
    terminated_at: null,
    terminated_reason: null,
    parent_agreement_id: null,
    new_agreement_id: null,
    renewal_decision_sent_at: null,
    signing_token: "preview-signing-2",
    signing_token_expires_at: "2027-01-01T00:00:00.000Z",
    completed_link: null,
    agreement_pdf_url: null,
    portal_data: {
      d: {
        rentalStartDate: "2026-05-12",
        rentalEndDate: "2026-06-12",
        vehicleYear: "2020",
        vehicleMake: "Lexus",
        vehicleModel: "ES 350",
        vehicleVin: "58ADZ1B10LU000002",
      },
      cd: {
        renterPhone: "(713) 555-0102",
        renterEmail: "carlos@example.com",
        identityStatus: "not_submitted",
        insuranceStatus: "not_submitted",
        approvedDriverStatus: "pending",
      },
      ops: {
        maintenanceRequests: [],
      },
    },
  },
  {
    id: "preview-reservation-1",
    document_type: "rental",
    state: "sent",
    status: "pending",
    buyer_name: "Aaliyah Stone",
    buyer_phone: "(713) 555-0103",
    buyer_email: "aaliyah@example.com",
    buyer_address: null,
    buyer_city: null,
    buyer_state: null,
    buyer_zip: null,
    buyer_license: null,
    buyer_license_state: null,
    buyer_id_photo: null,
    co_buyer_license: null,
    vehicle_id: "mock-3",
    vehicle_description: "2022 Mercedes-Benz C 300",
    vehicle_vin: "W1KAF4GB1NR000003",
    vehicles: { license_plate: "VGA-3300" },
    weekly_rate: 395,
    next_charge_date: "2026-06-01",
    rental_end_date: "2026-06-29",
    hardship_flag: false,
    customer_id: "preview-customer-3",
    created_at: "2026-05-26T19:20:00.000Z",
    completed_at: null,
    signed_at: null,
    deleted_at: null,
    terminated_at: null,
    terminated_reason: null,
    parent_agreement_id: null,
    new_agreement_id: null,
    renewal_decision_sent_at: null,
    signing_token: "preview-signing-3",
    signing_token_expires_at: "2027-01-01T00:00:00.000Z",
    completed_link: null,
    agreement_pdf_url: null,
    portal_data: {
      d: {
        rentalStartDate: "2026-06-01",
        rentalEndDate: "2026-06-29",
        vehicleYear: "2022",
        vehicleMake: "Mercedes-Benz",
        vehicleModel: "C 300",
        vehicleVin: "W1KAF4GB1NR000003",
      },
      cd: {
        renterPhone: "(713) 555-0103",
        renterEmail: "aaliyah@example.com",
        identityStatus: "submitted",
        insuranceStatus: "submitted",
        approvedDriverStatus: "pending",
      },
      ops: {
        maintenanceRequests: [],
      },
    },
  },
  {
    id: "preview-rental-release-hold",
    document_type: "rental",
    state: "signed",
    status: "pending",
    buyer_name: "Jordan Miles",
    buyer_phone: "(713) 555-0137",
    buyer_email: "jordan@example.com",
    buyer_address: "4300 Alameda Rd",
    buyer_city: null,
    buyer_state: null,
    buyer_zip: null,
    buyer_license: "TX-9137002",
    buyer_license_state: "TX",
    buyer_id_photo: "uploaded",
    co_buyer_license: "TX-ADD-137",
    vehicle_id: "mock-3",
    vehicle_description: "2022 Mercedes-Benz C 300",
    vehicle_vin: "W1KAF4GB1NR000003",
    vehicles: { license_plate: "" },
    weekly_rate: 395,
    next_charge_date: null,
    rental_end_date: "2026-06-29",
    hardship_flag: false,
    customer_id: "preview-customer-3",
    created_at: "2026-05-26T19:20:00.000Z",
    completed_at: null,
    signed_at: "2026-05-31T18:15:00.000Z",
    deleted_at: null,
    terminated_at: null,
    terminated_reason: null,
    parent_agreement_id: null,
    new_agreement_id: null,
    renewal_decision_sent_at: null,
    signing_token: "preview-signing-release-hold",
    signing_token_expires_at: "2027-01-01T00:00:00.000Z",
    completed_link: null,
    agreement_pdf_url: null,
    portal_data: {
      releaseHolds: ["missing_plate", "additional_driver_not_approved"],
      d: {
        rentalStartDate: "2026-06-01",
        rentalEndDate: "2026-06-29",
        vehicleYear: "2022",
        vehicleMake: "Mercedes-Benz",
        vehicleModel: "C 300",
        vehicleVin: "W1KAF4GB1NR000003",
      },
      cd: {
        renterPhone: "(713) 555-0137",
        renterEmail: "jordan@example.com",
        renterLicense: "TX-9137002",
        renterLicenseState: "TX",
        idFrontImage: "uploaded",
        idBackImage: "uploaded",
        insuranceCardImage: "uploaded",
        insuranceStatus: "submitted",
        insuranceProvider: "Progressive",
        insurancePolicyNumber: "P-9137",
        insuranceEffectiveDate: "2026-05-31",
        insuranceExpirationDate: "2026-06-29",
        insuranceVehicleVin: "W1KAF4GB1NR000003",
        insuranceNamedInsured: "Jordan Miles",
        coRenterName: "Taylor Miles",
        coRenterPhone: "(713) 555-0138",
        coRenterLicense: "TX-ADD-137",
        approvedDriverStatus: "pending",
        emergencyContactName: "Avery Miles",
        emergencyContactPhone: "(713) 555-0139",
      },
    },
  },
  {
    id: "preview-rental-ended-archive",
    document_type: "rental",
    state: "terminated",
    status: "completed",
    buyer_name: "Renee Walker",
    buyer_phone: "(713) 555-0194",
    buyer_email: "renee@example.com",
    buyer_address: "1221 Dowling St",
    buyer_city: "Houston",
    buyer_state: "TX",
    buyer_zip: "77003",
    buyer_license: "TX-1948207",
    buyer_license_state: "TX",
    buyer_id_photo: "uploaded",
    co_buyer_license: null,
    vehicle_id: "mock-4",
    vehicle_description: "2020 Mercedes-Benz GLC 300",
    vehicle_vin: "W1N0G8DB2LF000194",
    vehicles: { license_plate: "VGA-1940" },
    weekly_rate: 405,
    next_charge_date: null,
    rental_end_date: "2026-05-12",
    hardship_flag: false,
    customer_id: "preview-customer-ended",
    created_at: "2026-04-14T13:00:00.000Z",
    completed_at: "2026-04-14T14:15:00.000Z",
    signed_at: "2026-04-14T14:12:00.000Z",
    deleted_at: null,
    terminated_at: "2026-05-12T18:30:00.000Z",
    terminated_reason: "term_ended_no_active_rental",
    parent_agreement_id: null,
    new_agreement_id: null,
    renewal_decision_sent_at: "2026-05-09T16:00:00.000Z",
    signing_token: "preview-signing-ended-archive",
    signing_token_expires_at: "2026-05-13T00:00:00.000Z",
    completed_link: "https://example.com/completed/preview-rental-ended-archive",
    agreement_pdf_url: "https://example.com/preview-rental-ended-archive.pdf",
    portal_data: {
      d: {
        rentalStartDate: "2026-04-14",
        rentalEndDate: "2026-05-12",
        vehicleYear: "2020",
        vehicleMake: "Mercedes-Benz",
        vehicleModel: "GLC 300",
        vehicleVin: "W1N0G8DB2LF000194",
      },
      cd: {
        renterPhone: "(713) 555-0194",
        renterEmail: "renee@example.com",
        renterLicense: "TX-1948207",
        renterLicenseState: "TX",
        idFrontImage: "uploaded",
        idBackImage: "uploaded",
        identityStatus: "verified",
        insuranceCardImage: "uploaded",
        insuranceStatus: "verified",
        insuranceProvider: "Progressive",
        insurancePolicyNumber: "P-1940",
        insuranceEffectiveDate: "2026-04-14",
        insuranceExpirationDate: "2026-05-12",
        insuranceVehicleVin: "W1N0G8DB2LF000194",
        insuranceNamedInsured: "Renee Walker",
        approvedDriverStatus: "approved",
        emergencyContactName: "Miles Walker",
        emergencyContactPhone: "(713) 555-0195",
      },
      ops: {
        maintenanceRequests: [],
      },
    },
  },
  {
    id: "preview-financing-agreement-1",
    document_type: "financing",
    state: "completed",
    status: "completed",
    buyer_name: "Darius Coleman",
    buyer_phone: "+17135550177",
    buyer_email: "darius@example.com",
    buyer_address: "1818 Southmore Blvd",
    buyer_city: "Houston",
    buyer_state: "TX",
    buyer_zip: "77004",
    buyer_license: "TX-7712045",
    buyer_license_state: "TX",
    buyer_id_photo: "uploaded",
    co_buyer_license: null,
    vehicle_id: "mock-1",
    vehicle_description: "2021 Chevrolet Malibu LT",
    vehicle_vin: "1G1ZD5ST8MF000001",
    vehicles: { license_plate: "VGA-1770" },
    weekly_rate: null,
    next_charge_date: null,
    rental_end_date: null,
    hardship_flag: false,
    customer_id: "preview-financing-customer-1",
    created_at: "2026-04-12T14:20:00.000Z",
    completed_at: "2026-04-12T15:10:00.000Z",
    signed_at: "2026-04-12T15:08:00.000Z",
    deleted_at: null,
    terminated_at: null,
    terminated_reason: null,
    parent_agreement_id: null,
    new_agreement_id: null,
    renewal_decision_sent_at: null,
    signing_token: "preview-financing-signing-1",
    signing_token_expires_at: "2027-01-01T00:00:00.000Z",
    completed_link: "https://example.com/completed/preview-financing-agreement-1",
    agreement_pdf_url: "https://example.com/preview-financing-agreement-1.pdf",
    sms_send_enabled: true,
    portal_data: {
      financial: {
        amountFinanced: 7200,
      },
      vehicle: {
        vin: "1G1ZD5ST8MF000001",
        plate: "VGA-1770",
      },
      sms: {
        adminConfirmationRequired: false,
      },
    },
  },
  {
    // Chargeback acknowledgment fixture — /sign/<id>?token=preview-chargeback-signing
    id: "9e1f0a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b",
    document_type: "chargebackAcknowledgment",
    state: "sent",
    status: "pending",
    buyer_name: "Maya Johnson",
    vehicle_description: "2021 Mercedes-Benz GLE 350",
    vehicle_vin: "4JGFB4KB1MA000001",
    deal_id: null,
    deleted_at: null,
    expires_at: null,
    language: "en",
    signing_token: "preview-chargeback-signing",
    signing_token_expires_at: "2027-01-01T00:00:00.000Z",
    form_data: {
      dealId: null,
      buyerName: "Maya Johnson",
      buyerIdType: "license",
      buyerIdNumber: "",
      cardLast4: "",
      vin: "4JGFB4KB1MA000001",
      vehicleDescription: "2021 Mercedes-Benz GLE 350",
      totalAmount: 1500,
      transactionDate: "2026-06-01",
      language: "en",
    },
  },
];

export function createMockSupabaseClient(user: User | null = null): SupabaseClient {
  const auth = {
    async getUser() {
      return { data: { user }, error: null };
    },
    async signOut() {
      return { error: null };
    },
    async signInWithPassword() {
      return { data: { user, session: null }, error: null };
    },
  };

  const storage = {
    from(bucket: string) {
      return {
        async download() {
          return { data: null, error: { message: "mock storage: no stored files in preview" } };
        },
        // The path is remembered, so a walk can ask afterwards whether the two
        // sides of a licence actually arrived. It used to return success and
        // keep nothing, which made every upload look like it worked.
        async upload(path: string) {
          const paths = uploaded.get(bucket) ?? new Set<string>();
          paths.add(path);
          uploaded.set(bucket, paths);
          return { data: { path }, error: null };
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: `https://example.com/mock-storage/${path}` } };
        },
        async createSignedUrl(path: string) {
          return {
            data: { signedUrl: `https://example.com/mock-storage/${path}?signed=preview` },
            error: null,
          };
        },
        async remove() {
          return { data: null, error: null };
        },
      };
    },
  };

  /**
   * The one transaction the desk needs to close a sale, done the way the
   * database function does it: the deal closes, the car is marked sold to
   * this buyer, and a deal with no buyer or no car is refused by name.
   *
   * Everything else answers with an error, which is what the compare-and-set
   * merge expects from this client: it falls back to the plain write.
   */
  async function rpc(name: string, args: Record<string, unknown> = {}) {
    if (name === "caps_vehicle_sale_eligibilities") {
      const ids = args.p_vehicle_ids;
      if (args.p_scope !== "primary" || !Array.isArray(ids)) return { data: null, error: { message: "Invalid fixture eligibility request" } };
      const vehicles = getMockRows({ table: "vehicles", mode: "rows", filters: [] }) as unknown as Record<string, unknown>[];
      const deals = getMockRows({ table: "deals", mode: "rows", filters: [] }) as unknown as Record<string, unknown>[];
      return { data: [...new Set(ids)].map(id => {
        const vehicle = vehicles.find(row => row.id === id);
        const saleAttached = vehicle && (vehicle.status === "Sold" || vehicle.date_sold != null || vehicle.buyer_customer_id != null
          || [vehicle.buyer_name, vehicle.buyer_phone, vehicle.buyer_id_number].some(value => typeof value === "string" && value.trim())
          || Number(vehicle.sale_price) > 0 || deals.some(deal => deal.vehicle_id === id || (deal.vehicles as { id?: string } | null)?.id === id));
        const status = !vehicle ? "source_missing" : saleAttached ? "sale_blocked"
          : vehicle.status !== "Available" || vehicle.is_rental_fleet ? "not_current_inventory" : "eligible";
        return { vehicle_id: id, eligible: status === "eligible", status };
      }), error: null };
    }
    if (name === "complete_sale_atomic") {
      const dealId = args.p_deal_id;
      if (typeof dealId !== "string") return { data: null, error: { message: "not_found" } };
      const deal = getMockRows({ table: "deals", mode: "single", filters: [{ column: "id", op: "eq", value: dealId }] })[0] as
        | Record<string, unknown>
        | undefined;
      if (!deal) return { data: null, error: { message: "not_found" } };
      const customer = deal.customers as { id?: string } | null;
      const vehicle = deal.vehicles as { id?: string } | null;
      if (!customer?.id || !vehicle?.id) return { data: null, error: { message: "missing_parties" } };
      const now = new Date().toISOString();
      applyUpdate({
        table: "deals",
        mode: "rows",
        filters: [{ column: "id", op: "eq", value: dealId }],
        update: { status: "completed", completed_at: now },
      });
      applyUpdate({
        table: "vehicles",
        mode: "rows",
        filters: [{ column: "id", op: "eq", value: vehicle.id }],
        update: {
          status: "sold",
          buyer_customer_id: customer.id,
          date_sold: now.slice(0, 10),
          ...(typeof args.p_sale_price === "number" ? { sale_price: args.p_sale_price } : {}),
        },
      });
      return { data: { vehicle_id: vehicle.id, customer_id: customer.id }, error: null };
    }
    return { data: null, error: { message: `mock: no rpc named ${name} in preview` } };
  }

  return {
    auth,
    storage,
    rpc,
    from(table: string) {
      const state: MockQueryState = { table, mode: "rows", filters: [] };
      const builder: Record<PropertyKey, unknown> = {
        /*
          `.select("id", { count: "exact", head: true })`.

          This used to fall through the proxy's catch-all, so the options were
          dropped and a count query resolved with rows and no `count`. Every
          caller reads `result.count ?? null`, so each of them got null, and
          the desk's work list — which is nothing but counts — could not be
          looked at on a machine running the fixture. It reported "Nothing
          outstanding" whatever the fixture held.
        */
        select(_columns?: string, options?: { count?: string; head?: boolean }) {
          if (options?.count) state.wantsCount = true;
          if (options?.head) state.headOnly = true;
          return proxy;
        },
        eq(column: string, value: unknown) {
          state.filters.push({ column, op: "eq", value });
          return proxy;
        },
        neq(column: string, value: unknown) {
          state.filters.push({ column, op: "neq", value });
          return proxy;
        },
        in(column: string, value: unknown[]) {
          state.filters.push({ column, op: "in", value });
          return proxy;
        },
        is(column: string, value: unknown) {
          state.filters.push({ column, op: "is", value });
          return proxy;
        },
        /*
          The two negations the sale actually uses: `.not("finalized_at",
          "is", null)` to find signed documents, and `.not("document_type",
          "in", "(a,b)")` to leave the rentals out. Anything else falls
          through unfiltered, which is the honest answer for a fixture.
        */
        not(column: string, op: string, value: unknown) {
          if (op === "is") state.filters.push({ column, op: "not-is", value });
          if (op === "in") {
            const list =
              typeof value === "string"
                ? value.replace(/^\(|\)$/g, "").split(",").map((v) => v.trim())
                : value;
            state.filters.push({ column, op: "not-in", value: list });
          }
          return proxy;
        },
        gte(column: string, value: unknown) {
          state.filters.push({ column, op: "gte", value });
          return proxy;
        },
        insert(rows: Record<string, unknown> | Array<Record<string, unknown>>) {
          state.insert = Array.isArray(rows) ? rows : [rows];
          return proxy;
        },
        // Title work writes one row per step with upsert. Preview keeps the
        // newest write per (vehicle, step) by recording it like an insert;
        // readers take the last row for a step, which is the same answer.
        upsert(rows: Record<string, unknown> | Array<Record<string, unknown>>) {
          state.insert = Array.isArray(rows) ? rows : [rows];
          return proxy;
        },
        limit(value: number) {
          state.limit = value;
          return proxy;
        },
        /*
          Recorded rather than swallowed.

          This used to fall through the proxy's catch-all below, which returns
          the builder for any method it does not know. `.update({...})` looked
          like it worked, resolved to the untouched fixtures, and preview
          silently forgot everything anybody wrote.
        */
        update(patch: Record<string, unknown>) {
          state.update = patch;
          return proxy;
        },
        maybeSingle() {
          state.mode = "single";
          return proxy;
        },
        single() {
          state.mode = "single";
          return proxy;
        },
        then(onFulfilled: unknown, onRejected: unknown) {
          return Promise.resolve(createMockQueryResult(state)).then(
            onFulfilled as Parameters<Promise<unknown>["then"]>[0],
            onRejected as Parameters<Promise<unknown>["then"]>[1],
          );
        },
      };

      const proxy = new Proxy(builder, {
        get(target, prop) {
          if (table === "public_inventory_vehicles" && ["insert", "upsert", "update", "delete"].includes(String(prop))) {
            return () => { state.readOnlyMutation = true; return proxy; };
          }
          if (prop in target) return target[prop];
          return () => proxy;
        },
      });

      return proxy;
    },
  } as unknown as SupabaseClient;
}
