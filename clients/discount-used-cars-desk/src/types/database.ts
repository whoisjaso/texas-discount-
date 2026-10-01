// ============================================================
// Vehicle
// ============================================================

export type VehicleStatus =
  | "Bidding"
  | "Purchased"
  | "In_Transit"
  | "Arrived"
  | "Inspection"
  | "Available"
  | "Pending"
  | "Sold";

export type VehicleLocation =
  | "almeda"
  | "lot_7813"
  | "mechanic"
  | "customer"
  | "in_transit"
  | "unknown"
  | "other";

export type VehicleReadinessBucket =
  | "ready_to_make_money"
  | "one_fix_away"
  | "needs_decision"
  | "dead_money"
  | "unknown";

export type VehicleKeysStatus = "confirmed" | "missing" | "partial" | "unknown";
export type VehicleGpsStatus = "active" | "inactive" | "needs_install" | "unknown";
export type VehicleInsuranceStatus = "active" | "inactive" | "needs_verify" | "unknown";
export type VehicleTitleRegistrationStatus = "clear" | "pending" | "missing" | "issue" | "unknown";
export type VehicleRunStatus = "runs" | "no_start" | "drives_with_issue" | "unknown";

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  vin: string;
  status: VehicleStatus;
  description: string | null;
  imageUrl: string | null;
  gallery: string[];
  slug: string;
  bodyStyle: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  transmission: string | null;
  drivetrain: string | null;
  engine: string | null;
  fuelType: string | null;
  dateAdded: string;
  createdAt: string;
  updatedAt: string;
  // v0.2 Pipeline fields
  trim: string | null;
  purchasePrice: number | null;
  buyFee: number | null;
  totalCost: number | null;
  sellerName: string | null;
  auctionLocation: string | null;
  workOrderNumber: string | null;
  stockNumber: string | null;
  guaranteeExpiresAt: string | null;
  guaranteePrice: number | null;
  transportCarrier: string | null;
  transportLoadId: string | null;
  transportCost: number | null;
  transportPickupEta: string | null;
  transportDeliveryEta: string | null;
  sourceEmailId: string | null;
  // Business / inventory fields
  conditionNotes: string | null;
  titleType: string | null;
  /** Canonical verified title fact; absent on rows fetched without it. */
  titleStatus?: string | null;
  mechanicalCost: number | null;
  cosmeticCost: number | null;
  otherCosts: number | null;
  dateListed: string | null;
  dateSold: string | null;
  salePrice: number | null;
  sellingFees: number | null;
  netProfit: number | null;
  weightLbs: number | null;
  licensePlate: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  /** Customer who bought this vehicle. Set when a sale is completed. */
  buyerCustomerId: string | null;
  /** Government ID recorded at sale, for title and registration follow-up. */
  buyerIdNumber: string | null;
  leadSourceName: string | null;
  daysInStock: number | null;
  targetListPrice: number | null;
  floorPrice: number | null;
  carfaxUrl?: string | null;
  weeklyRentalRate?: number | null;
  isRentalFleet?: boolean;
  lastKnownLocation?: VehicleLocation | null;
  readinessBucket?: VehicleReadinessBucket | null;
  keysStatus?: VehicleKeysStatus | null;
  gpsStatus?: VehicleGpsStatus | null;
  insuranceStatus?: VehicleInsuranceStatus | null;
  titleRegistrationStatus?: VehicleTitleRegistrationStatus | null;
  lastCensusAt?: string | null;
}

/** Row shape returned by Supabase (snake_case) */
export interface VehicleRow {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  vin: string;
  status: VehicleStatus;
  description: string | null;
  image_url: string | null;
  gallery: string[];
  slug: string;
  body_style: string | null;
  exterior_color: string | null;
  interior_color: string | null;
  transmission: string | null;
  drivetrain: string | null;
  engine: string | null;
  fuel_type: string | null;
  date_added: string;
  created_at: string;
  updated_at: string;
  // v0.2 Pipeline fields
  trim: string | null;
  purchase_price: number | null;
  buy_fee: number | null;
  total_cost: number | null;
  seller_name: string | null;
  auction_location: string | null;
  work_order_number: string | null;
  stock_number: string | null;
  guarantee_expires_at: string | null;
  guarantee_price: number | null;
  transport_carrier: string | null;
  transport_load_id: string | null;
  transport_cost: number | null;
  transport_pickup_eta: string | null;
  transport_delivery_eta: string | null;
  source_email_id: string | null;
  // Business / inventory fields
  condition_notes: string | null;
  title_type: string | null;
  mechanical_cost: number | null;
  cosmetic_cost: number | null;
  other_costs: number | null;
  date_listed: string | null;
  date_sold: string | null;
  sale_price: number | null;
  selling_fees: number | null;
  net_profit: number | null;
  weight_lbs: number | null;
  license_plate: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  buyer_customer_id: string | null;
  buyer_id_number: string | null;
  lead_source_name: string | null;
  days_in_stock: number | null;
  target_list_price: number | null;
  floor_price: number | null;
  carfax_url?: string | null;
  weekly_rental_rate?: number | null;
  is_rental_fleet?: boolean | null;
  last_known_location?: VehicleLocation | null;
  readiness_bucket?: VehicleReadinessBucket | null;
  keys_status?: VehicleKeysStatus | null;
  gps_status?: VehicleGpsStatus | null;
  insurance_status?: VehicleInsuranceStatus | null;
  title_registration_status?: VehicleTitleRegistrationStatus | null;
  last_census_at?: string | null;
  // Canonical, verified title fact (title_type above stays the raw free text).
  title_status?: string | null;
  title_status_verified_at?: string | null;
  title_status_verified_by?: string | null;
  title_status_evidence?: string | null;
}

// Pipeline columns are optional on insert (nullable in DB, no default)
type PipelineColumns =
  | "trim" | "purchase_price" | "buy_fee" | "total_cost"
  | "seller_name" | "auction_location" | "work_order_number" | "stock_number"
  | "guarantee_expires_at" | "guarantee_price"
  | "transport_carrier" | "transport_load_id" | "transport_cost"
  | "transport_pickup_eta" | "transport_delivery_eta" | "source_email_id"
  | "condition_notes" | "title_type" | "mechanical_cost" | "cosmetic_cost" | "other_costs"
  | "date_listed" | "date_sold" | "sale_price" | "selling_fees" | "net_profit"
  | "weight_lbs" | "license_plate" | "buyer_name" | "buyer_phone"
  | "buyer_customer_id" | "buyer_id_number" | "lead_source_name"
  | "days_in_stock" | "target_list_price" | "floor_price"
  | "carfax_url"
  | "weekly_rental_rate" | "is_rental_fleet"
  | "last_known_location" | "readiness_bucket" | "keys_status" | "gps_status"
  | "insurance_status" | "title_registration_status" | "last_census_at"
  | "title_status" | "title_status_verified_at" | "title_status_verified_by"
  | "title_status_evidence";

export type VehicleInsert = Omit<
  VehicleRow,
  "id" | "created_at" | "updated_at" | "date_added" | PipelineColumns
> & Partial<Pick<VehicleRow, PipelineColumns>>;

export interface VehicleCensusReport {
  id: string;
  vehicleId: string;
  location: VehicleLocation;
  readinessBucket: VehicleReadinessBucket;
  runStatus: VehicleRunStatus;
  keysStatus: VehicleKeysStatus;
  gpsStatus: VehicleGpsStatus;
  insuranceStatus: VehicleInsuranceStatus;
  titleRegistrationStatus: VehicleTitleRegistrationStatus;
  plate: string | null;
  mileage: number | null;
  conditionTags: string[];
  photoUrls: string[];
  notes: string | null;
  nextAction: string | null;
  assignedTo: string | null;
  capturedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleCensusReportRow {
  id: string;
  vehicle_id: string;
  location: VehicleLocation;
  readiness_bucket: VehicleReadinessBucket;
  run_status: VehicleRunStatus;
  keys_status: VehicleKeysStatus;
  gps_status: VehicleGpsStatus;
  insurance_status: VehicleInsuranceStatus;
  title_registration_status: VehicleTitleRegistrationStatus;
  plate: string | null;
  mileage: number | null;
  condition_tags: string[] | null;
  photo_urls: string[] | null;
  notes: string | null;
  next_action: string | null;
  assigned_to: string | null;
  captured_by: string | null;
  created_at: string;
  updated_at: string;
}

export type VehicleCensusReportInsert = Omit<
  VehicleCensusReportRow,
  "id" | "created_at" | "updated_at"
>;

// ============================================================
// Lead
// ============================================================

export type LeadStatus =
  | "New"
  | "Contacted"
  | "Qualified"
  | "Appointment"
  | "Negotiation"
  | "Sold"
  | "Lost";

export type LeadSource =
  | "contact_form"
  | "financing_inquiry"
  | "vehicle_inquiry"
  | "schedule_visit";

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  message: string | null;
  vehicleId: string | null;
  source: LeadSource;
  status: LeadStatus;
  buyerName: string | null;
  buyerPhone: string | null;
  createdAt: string;
}

/** Row shape returned by Supabase (snake_case) */
export interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  message: string | null;
  vehicle_id: string | null;
  source: LeadSource;
  status: LeadStatus;
  buyer_name: string | null;
  buyer_phone: string | null;
  created_at: string;
}

export type LeadInsert = Omit<LeadRow, "id" | "created_at" | "buyer_name" | "buyer_phone"> & {
  buyer_name?: string | null;
  buyer_phone?: string | null;
};

// ============================================================
// Lead Notes (CRM Communication Log)
// ============================================================

export type NoteType = "call" | "text" | "email" | "visit" | "note";

export interface LeadNote {
  id: string;
  leadId: string;
  content: string;
  noteType: NoteType;
  createdAt: string;
}

export interface LeadNoteRow {
  id: string;
  lead_id: string;
  content: string;
  note_type: NoteType;
  created_at: string;
}

export function mapLeadNoteRow(row: LeadNoteRow): LeadNote {
  return {
    id: row.id,
    leadId: row.lead_id,
    content: row.content,
    noteType: row.note_type,
    createdAt: row.created_at,
  };
}

// ============================================================
// Lead Tasks (CRM Follow-up Reminders)
// ============================================================

export interface LeadTask {
  id: string;
  leadId: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
}

export interface LeadTaskRow {
  id: string;
  lead_id: string;
  title: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export function mapLeadTaskRow(row: LeadTaskRow): LeadTask {
  return {
    id: row.id,
    leadId: row.lead_id,
    title: row.title,
    dueDate: row.due_date,
    completed: row.completed,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

// ============================================================
// Query Filters
// ============================================================

export interface VehicleFilters {
  status?: VehicleStatus;
  make?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  search?: string;
  /**
   * One or more `body_style` values. Matching is case-insensitive so a link
   * built from a display label ("SUV") still finds rows stored as "Suv".
   */
  bodyStyles?: string[];
}

// ============================================================
// Mappers (snake_case DB rows → camelCase app types)
// ============================================================

export function mapVehicleRow(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    year: row.year,
    price: Number(row.price),
    mileage: row.mileage,
    vin: row.vin,
    status: row.status,
    description: row.description,
    imageUrl: row.image_url,
    gallery: row.gallery ?? [],
    slug: row.slug,
    bodyStyle: row.body_style,
    exteriorColor: row.exterior_color,
    interiorColor: row.interior_color,
    transmission: row.transmission,
    drivetrain: row.drivetrain,
    engine: row.engine,
    fuelType: row.fuel_type,
    dateAdded: row.date_added,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // v0.2 Pipeline fields
    trim: row.trim,
    purchasePrice: row.purchase_price != null ? Number(row.purchase_price) : null,
    buyFee: row.buy_fee != null ? Number(row.buy_fee) : null,
    totalCost: row.total_cost != null ? Number(row.total_cost) : null,
    sellerName: row.seller_name,
    auctionLocation: row.auction_location,
    workOrderNumber: row.work_order_number,
    stockNumber: row.stock_number,
    guaranteeExpiresAt: row.guarantee_expires_at,
    guaranteePrice: row.guarantee_price != null ? Number(row.guarantee_price) : null,
    transportCarrier: row.transport_carrier,
    transportLoadId: row.transport_load_id,
    transportCost: row.transport_cost != null ? Number(row.transport_cost) : null,
    transportPickupEta: row.transport_pickup_eta,
    transportDeliveryEta: row.transport_delivery_eta,
    sourceEmailId: row.source_email_id,
    // Business / inventory fields
    conditionNotes: row.condition_notes,
    titleType: row.title_type,
    titleStatus: row.title_status ?? null,
    mechanicalCost: row.mechanical_cost != null ? Number(row.mechanical_cost) : null,
    cosmeticCost: row.cosmetic_cost != null ? Number(row.cosmetic_cost) : null,
    otherCosts: row.other_costs != null ? Number(row.other_costs) : null,
    dateListed: row.date_listed,
    dateSold: row.date_sold,
    salePrice: row.sale_price != null ? Number(row.sale_price) : null,
    sellingFees: row.selling_fees != null ? Number(row.selling_fees) : null,
    netProfit: row.net_profit != null ? Number(row.net_profit) : null,
    weightLbs: row.weight_lbs,
    licensePlate: row.license_plate,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    buyerCustomerId: row.buyer_customer_id,
    buyerIdNumber: row.buyer_id_number,
    leadSourceName: row.lead_source_name,
    daysInStock: row.days_in_stock,
    targetListPrice: row.target_list_price != null ? Number(row.target_list_price) : null,
    floorPrice: row.floor_price != null ? Number(row.floor_price) : null,
    carfaxUrl: row.carfax_url ?? null,
    weeklyRentalRate: row.weekly_rental_rate != null ? Number(row.weekly_rental_rate) : null,
    isRentalFleet: row.is_rental_fleet ?? false,
    lastKnownLocation: row.last_known_location ?? null,
    readinessBucket: row.readiness_bucket ?? null,
    keysStatus: row.keys_status ?? null,
    gpsStatus: row.gps_status ?? null,
    insuranceStatus: row.insurance_status ?? null,
    titleRegistrationStatus: row.title_registration_status ?? null,
    lastCensusAt: row.last_census_at ?? null,
  };
}

export function mapVehicleCensusReportRow(row: VehicleCensusReportRow): VehicleCensusReport {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    location: row.location,
    readinessBucket: row.readiness_bucket,
    runStatus: row.run_status,
    keysStatus: row.keys_status,
    gpsStatus: row.gps_status,
    insuranceStatus: row.insurance_status,
    titleRegistrationStatus: row.title_registration_status,
    plate: row.plate,
    mileage: row.mileage,
    conditionTags: row.condition_tags ?? [],
    photoUrls: row.photo_urls ?? [],
    notes: row.notes,
    nextAction: row.next_action,
    assignedTo: row.assigned_to,
    capturedBy: row.captured_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapLeadRow(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    vehicleId: row.vehicle_id,
    source: row.source,
    status: row.status,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    createdAt: row.created_at,
  };
}

/** Convert camelCase LeadInsert to snake_case for Supabase */
export function toLeadRow(
  lead: Omit<Lead, "id" | "createdAt" | "status" | "buyerName" | "buyerPhone"> & { buyerName?: string | null; buyerPhone?: string | null }
): LeadInsert {
  return {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    vehicle_id: lead.vehicleId,
    source: lead.source,
    status: "New",
  };
}

// ============================================================
// Payment System Types (v0.3)
// ============================================================

export type ScheduleType = "financing" | "rental";
export type ScheduleStatus = "active" | "paid_off" | "defaulted";
export type InstallmentStatus = "upcoming" | "paid" | "partial";
export type PaymentMethod =
  | "cash"
  | "check"
  | "zelle"
  | "cash_app"
  | "apple_pay"
  | "paypal"
  | "card"
  | "transfer";
export type NotificationChannel = "sms" | "email";
export type PaymentFrequency = "Weekly" | "Bi-weekly" | "Monthly";
export type PaymentVerificationStatus = "needs_review" | "verified" | "rejected";

// ============================================================
// Customer
// ============================================================

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  language: string;
  leadId: string | null;
  notes: string | null;
  smsOptedOut: boolean;
  /** The manual-review hold an ambiguous reply raises; a person clears it. */
  smsReviewHoldAt?: string | null;
  smsReviewHoldClearedBy?: string | null;
  stripeCustomerId: string | null;
  dateOfBirth: string | null;
  createdAt: string;
}

export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  language: string;
  lead_id: string | null;
  notes: string | null;
  sms_opted_out: boolean;
  sms_review_hold_at?: string | null;
  sms_review_hold_cleared_by?: string | null;
  stripe_customer_id?: string | null;
  date_of_birth?: string | null;
  created_at: string;
}

export function mapCustomerRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    language: row.language,
    leadId: row.lead_id,
    notes: row.notes,
    smsOptedOut: row.sms_opted_out ?? false,
    smsReviewHoldAt: row.sms_review_hold_at ?? null,
    smsReviewHoldClearedBy: row.sms_review_hold_cleared_by ?? null,
    stripeCustomerId: row.stripe_customer_id ?? null,
    dateOfBirth: row.date_of_birth ?? null,
    createdAt: row.created_at,
  };
}

export type PaymentProvider = "stripe" | "paypal" | "manual";
export type PaymentTransactionType =
  | "setup"
  | "checkout_payment"
  | "off_session_charge"
  | "refund"
  | "manual_verification";
export type PaymentTransactionStatus =
  | "created"
  | "pending"
  | "succeeded"
  | "failed"
  | "canceled"
  | "requires_action"
  | "refunded"
  | "partially_refunded";

export interface CustomerPaymentMethod {
  id: string;
  customerId: string;
  provider: PaymentProvider | string;
  providerCustomerId: string | null;
  providerPaymentMethodId: string;
  methodType: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  status: string;
  usageScope: string;
  consentText: string | null;
  consentedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPaymentMethodRow {
  id: string;
  customer_id: string;
  provider: PaymentProvider | string;
  provider_customer_id: string | null;
  provider_payment_method_id: string;
  method_type: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  status: string;
  usage_scope: string;
  consent_text: string | null;
  consented_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentTransaction {
  id: string;
  provider: PaymentProvider | string;
  transactionType: PaymentTransactionType;
  status: PaymentTransactionStatus;
  customerId: string | null;
  scheduleId: string | null;
  installmentId: string | null;
  agreementId: string | null;
  dealId: string | null;
  amountCents: number;
  currency: string;
  providerSessionId: string | null;
  providerPaymentIntentId: string | null;
  providerSetupIntentId: string | null;
  providerChargeId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  requiresAdminReview: boolean;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransactionRow {
  id: string;
  provider: PaymentProvider | string;
  transaction_type: PaymentTransactionType;
  status: PaymentTransactionStatus;
  customer_id: string | null;
  schedule_id: string | null;
  installment_id: string | null;
  agreement_id: string | null;
  deal_id: string | null;
  amount_cents: number;
  currency: string;
  provider_session_id: string | null;
  provider_payment_intent_id: string | null;
  provider_setup_intent_id: string | null;
  provider_charge_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  requires_admin_review: boolean;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Payment Schedule
// ============================================================

export interface PaymentSchedule {
  id: string;
  customerId: string;
  agreementId: string | null;
  vehicleDescription: string;
  scheduleType: ScheduleType;
  totalAmount: number;
  downPayment: number;
  installmentAmount: number;
  frequency: PaymentFrequency;
  numPayments: number;
  apr: number;
  startDate: string;
  status: ScheduleStatus;
  createdAt: string;
}

export interface PaymentScheduleRow {
  id: string;
  customer_id: string;
  agreement_id: string | null;
  vehicle_description: string;
  schedule_type: ScheduleType;
  total_amount: number;
  down_payment: number;
  installment_amount: number;
  frequency: PaymentFrequency;
  num_payments: number;
  apr: number;
  start_date: string;
  status: ScheduleStatus;
  created_at: string;
}

export function mapPaymentScheduleRow(row: PaymentScheduleRow): PaymentSchedule {
  return {
    id: row.id,
    customerId: row.customer_id,
    agreementId: row.agreement_id,
    vehicleDescription: row.vehicle_description,
    scheduleType: row.schedule_type,
    totalAmount: Number(row.total_amount),
    downPayment: Number(row.down_payment),
    installmentAmount: Number(row.installment_amount),
    frequency: row.frequency,
    numPayments: row.num_payments,
    apr: Number(row.apr),
    startDate: row.start_date,
    status: row.status,
    createdAt: row.created_at,
  };
}

// ============================================================
// Installment
// ============================================================

export interface Installment {
  id: string;
  scheduleId: string;
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: InstallmentStatus;
  paidDate: string | null;
  createdAt: string;
}

export interface InstallmentRow {
  id: string;
  schedule_id: string;
  installment_number: number;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  status: InstallmentStatus;
  paid_date: string | null;
  created_at: string;
}

export function mapInstallmentRow(row: InstallmentRow): Installment {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    installmentNumber: row.installment_number,
    dueDate: row.due_date,
    amountDue: Number(row.amount_due),
    amountPaid: Number(row.amount_paid),
    status: row.status,
    paidDate: row.paid_date,
    createdAt: row.created_at,
  };
}

// ============================================================
// Payment (receipt)
// ============================================================

export interface Payment {
  id: string;
  installmentId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  receivedDate: string;
  notes: string | null;
  createdAt: string;
}

export interface PaymentRow {
  id: string;
  installment_id: string;
  amount: number;
  payment_method: PaymentMethod;
  received_date: string;
  notes: string | null;
  created_at: string;
}

export function mapPaymentRow(row: PaymentRow): Payment {
  return {
    id: row.id,
    installmentId: row.installment_id,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    receivedDate: row.received_date,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

// ============================================================
// Payment Verification (manual rail audit)
// ============================================================

export interface PaymentVerification {
  id: string;
  installmentId: string;
  scheduleId: string;
  customerId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  expectedDestination: string | null;
  payerReference: string | null;
  proofUrl: string | null;
  receivedDate: string;
  status: PaymentVerificationStatus;
  notes: string | null;
  reviewNotes: string | null;
  submittedBy: string | null;
  verifiedBy: string | null;
  verifiedPaymentId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentVerificationRow {
  id: string;
  installment_id: string;
  schedule_id: string;
  customer_id: string;
  amount: number;
  payment_method: PaymentMethod;
  expected_destination: string | null;
  payer_reference: string | null;
  proof_url: string | null;
  received_date: string;
  status: PaymentVerificationStatus;
  notes: string | null;
  review_notes: string | null;
  submitted_by: string | null;
  verified_by: string | null;
  verified_payment_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function mapPaymentVerificationRow(row: PaymentVerificationRow): PaymentVerification {
  return {
    id: row.id,
    installmentId: row.installment_id,
    scheduleId: row.schedule_id,
    customerId: row.customer_id,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    expectedDestination: row.expected_destination,
    payerReference: row.payer_reference,
    proofUrl: row.proof_url,
    receivedDate: row.received_date,
    status: row.status,
    notes: row.notes,
    reviewNotes: row.review_notes,
    submittedBy: row.submitted_by,
    verifiedBy: row.verified_by,
    verifiedPaymentId: row.verified_payment_id,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================
// Notification Log
// ============================================================

export interface NotificationLogEntry {
  id: string;
  customerId: string;
  installmentId: string | null;
  channel: NotificationChannel;
  templateKey: string;
  messageBody: string;
  status: string;
  providerMessageId: string | null;
  notificationDate: string;
  sentAt: string;
}

export interface NotificationLogRow {
  id: string;
  customer_id: string;
  installment_id: string | null;
  channel: NotificationChannel;
  template_key: string;
  message_body: string;
  status: string;
  provider_message_id: string | null;
  notification_date: string;
  sent_at: string;
}

export function mapNotificationLogRow(row: NotificationLogRow): NotificationLogEntry {
  return {
    id: row.id,
    customerId: row.customer_id,
    installmentId: row.installment_id,
    channel: row.channel,
    templateKey: row.template_key,
    messageBody: row.message_body,
    status: row.status,
    providerMessageId: row.provider_message_id,
    notificationDate: row.notification_date,
    sentAt: row.sent_at,
  };
}

// ============================================================
// SMS Message (Conversation Log)
// ============================================================

export type SmsDirection = "inbound" | "outbound";

export interface SmsMessage {
  id: string;
  customerId: string | null;
  direction: SmsDirection;
  body: string;
  fromNumber: string;
  toNumber: string;
  telnyxMessageId: string | null;
  status: string;
  providerStatus: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  lastStatusAt: string | null;
  aiGenerated: boolean;
  createdAt: string;
}

export interface SmsMessageRow {
  id: string;
  customer_id: string | null;
  direction: SmsDirection;
  body: string;
  from_number: string;
  to_number: string;
  telnyx_message_id: string | null;
  status: string;
  provider_status?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  last_status_at?: string | null;
  ai_generated: boolean;
  created_at: string;
}

export function mapSmsMessageRow(row: SmsMessageRow): SmsMessage {
  return {
    id: row.id,
    customerId: row.customer_id,
    direction: row.direction,
    body: row.body,
    fromNumber: row.from_number,
    toNumber: row.to_number,
    telnyxMessageId: row.telnyx_message_id,
    status: row.status,
    providerStatus: row.provider_status ?? null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    lastStatusAt: row.last_status_at ?? null,
    aiGenerated: row.ai_generated,
    createdAt: row.created_at,
  };
}

// ============================================================
// Deal (Post-Sale Paperwork Pipeline) — v0.5 Phase 21
// ============================================================

export type DealStatus = "in_progress" | "completed" | "abandoned";

/** Base step entry — every completed step gets a timestamp */
export interface StepEntryBase {
  completed_at: string;
}

/** Step 2 / Step 4: link to existing document agreement */
export interface StepDocData extends StepEntryBase {
  agreement_id?: string;
}

/** Step 5: title transfer — reassignment tracking */
export interface Step5Data extends StepEntryBase {
  used_reassignment: boolean;
}

/** Step 6: WebDealer submission — gated checklist + confirmation */
export interface Step6Data extends StepEntryBase {
  checklist: boolean[];
  confirmation_number: string;
}

/** Step 7: ePlates — plate number assignment */
export interface Step7Data extends StepEntryBase {
  plate_number: string;
}

/** JSONB step_data shape: keys are step numbers as strings */
export type StepData = {
  [step: string]:
    | StepEntryBase
    | StepDocData
    | Step5Data
    | Step6Data
    | Step7Data;
};

export interface Deal {
  id: string;
  vehicleId: string;
  customerId: string;
  status: DealStatus;
  currentStep: number;
  stepData: StepData;
  language: string;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface DealRow {
  id: string;
  vehicle_id: string;
  customer_id: string;
  status: DealStatus;
  current_step: number;
  step_data: StepData;
  language: string;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}

export interface DealWithRelations extends Deal {
  vehicle: Vehicle;
  customer: Customer;
}

export function mapDealRow(row: DealRow): Deal {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    customerId: row.customer_id,
    status: row.status,
    currentStep: row.current_step,
    stepData: row.step_data ?? {},
    language: row.language,
    createdBy: row.created_by,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}
