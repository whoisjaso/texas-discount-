import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapCustomerRow,
  mapPaymentScheduleRow,
  mapInstallmentRow,
  mapPaymentRow,
  mapPaymentVerificationRow,
  mapNotificationLogRow,
  mapSmsMessageRow,
  type Customer,
  type CustomerRow,
  type PaymentSchedule,
  type PaymentScheduleRow,
  type Installment,
  type InstallmentRow,
  type Payment,
  type PaymentRow,
  type PaymentVerification,
  type PaymentVerificationRow,
  type PaymentVerificationStatus,
  type NotificationLogEntry,
  type NotificationLogRow,
  type SmsMessage,
  type SmsMessageRow,
  type ScheduleType,
  type PaymentFrequency,
  type SmsDirection,
  type PaymentMethod,
  type InstallmentStatus,
  type NotificationChannel,
} from "@/types/database";

// ============================================================
// Customer Queries
// ============================================================

export async function createCustomer(
  supabase: SupabaseClient,
  data: { name: string; phone: string; email?: string | null; language?: string; leadId?: string | null; notes?: string | null; dateOfBirth?: string | null }
): Promise<Customer> {
  const { data: row, error } = await supabase
    .from("customers")
    .insert({
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      language: data.language ?? "es",
      lead_id: data.leadId ?? null,
      notes: data.notes ?? null,
      date_of_birth: data.dateOfBirth ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return mapCustomerRow(row as CustomerRow);
}

export async function getCustomerByPhone(
  supabase: SupabaseClient,
  phone: string
): Promise<Customer | null> {
  const { data: row, error } = await supabase
    .from("customers")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (error) throw error;
  if (!row) return null;
  return mapCustomerRow(row as CustomerRow);
}

export async function getCustomerById(
  supabase: SupabaseClient,
  id: string
): Promise<Customer | null> {
  const { data: row, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return mapCustomerRow(row as CustomerRow);
}

export async function listCustomers(
  supabase: SupabaseClient
): Promise<(Customer & { activeSchedules: number })[]> {
  const { data: rows, error } = await supabase
    .from("customers")
    .select("*, payment_schedules(id, status)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (rows ?? []).map((row: CustomerRow & { payment_schedules: { id: string; status: string }[] }) => ({
    ...mapCustomerRow(row),
    activeSchedules: (row.payment_schedules ?? []).filter((s) => s.status === "active").length,
  }));
}

// ============================================================
// Payment Schedule Queries
// ============================================================

export async function createPaymentSchedule(
  supabase: SupabaseClient,
  data: {
    customerId: string;
    agreementId?: string | null;
    vehicleDescription: string;
    scheduleType: string;
    totalAmount: number;
    downPayment: number;
    installmentAmount: number;
    frequency: string;
    numPayments: number;
    apr: number;
    startDate: string;
  }
): Promise<PaymentSchedule> {
  const { data: row, error } = await supabase
    .from("payment_schedules")
    .insert({
      customer_id: data.customerId,
      agreement_id: data.agreementId ?? null,
      vehicle_description: data.vehicleDescription,
      schedule_type: data.scheduleType,
      total_amount: data.totalAmount,
      down_payment: data.downPayment,
      installment_amount: data.installmentAmount,
      frequency: data.frequency,
      num_payments: data.numPayments,
      apr: data.apr,
      start_date: data.startDate,
    })
    .select()
    .single();

  if (error) throw error;
  return mapPaymentScheduleRow(row as PaymentScheduleRow);
}

export async function createInstallments(
  supabase: SupabaseClient,
  scheduleId: string,
  installments: { installmentNumber: number; dueDate: string; amountDue: number }[]
): Promise<void> {
  const rows = installments.map((inst) => ({
    schedule_id: scheduleId,
    installment_number: inst.installmentNumber,
    due_date: inst.dueDate,
    amount_due: inst.amountDue,
  }));

  const { error } = await supabase.from("installments").insert(rows);
  if (error) throw error;
}

export async function getScheduleWithInstallments(
  supabase: SupabaseClient,
  scheduleId: string
): Promise<{ schedule: PaymentSchedule; installments: Installment[] } | null> {
  const { data: scheduleRow, error: sErr } = await supabase
    .from("payment_schedules")
    .select("*")
    .eq("id", scheduleId)
    .single();

  if (sErr || !scheduleRow) return null;

  const { data: instRows, error: iErr } = await supabase
    .from("installments")
    .select("*")
    .eq("schedule_id", scheduleId)
    .order("installment_number", { ascending: true });

  if (iErr) throw iErr;

  return {
    schedule: mapPaymentScheduleRow(scheduleRow as PaymentScheduleRow),
    installments: (instRows ?? []).map((r: InstallmentRow) => mapInstallmentRow(r)),
  };
}

export async function getSchedulesByCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<PaymentSchedule[]> {
  const { data: rows, error } = await supabase
    .from("payment_schedules")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (rows ?? []).map((r: PaymentScheduleRow) => mapPaymentScheduleRow(r));
}

// ============================================================
// Installment Queries
// ============================================================

export async function getInstallmentsDueInRange(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<(Installment & { customerId: string; customerName: string; customerPhone: string; customerLanguage: string; smsOptedOut: boolean; vehicleDescription: string })[]> {
  const { data: rows, error } = await supabase
    .from("installments")
    .select("*, payment_schedules!inner(vehicle_description, customer_id, status, customers!inner(name, phone, language, sms_opted_out))")
    .gte("due_date", startDate)
    .lte("due_date", endDate)
    .neq("status", "paid")
    .eq("payment_schedules.status", "active")
    .order("due_date", { ascending: true });

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows ?? []).map((r: any) => ({
    ...mapInstallmentRow(r as InstallmentRow),
    customerId: r.payment_schedules?.customer_id ?? "",
    customerName: r.payment_schedules?.customers?.name ?? "",
    customerPhone: r.payment_schedules?.customers?.phone ?? "",
    customerLanguage: r.payment_schedules?.customers?.language ?? "es",
    smsOptedOut: r.payment_schedules?.customers?.sms_opted_out ?? false,
    vehicleDescription: r.payment_schedules?.vehicle_description ?? "",
  }));
}

export async function getOverdueInstallments(
  supabase: SupabaseClient
): Promise<(Installment & { customerName: string; customerPhone: string; customerLanguage: string; smsOptedOut: boolean; vehicleDescription: string; customerId: string })[]> {
  const today = new Date().toISOString().split("T")[0];

  const { data: rows, error } = await supabase
    .from("installments")
    .select("*, payment_schedules!inner(vehicle_description, customer_id, status, customers!inner(id, name, phone, language, sms_opted_out))")
    .lt("due_date", today)
    .neq("status", "paid")
    .eq("payment_schedules.status", "active")
    .order("due_date", { ascending: true });

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows ?? []).map((r: any) => ({
    ...mapInstallmentRow(r as InstallmentRow),
    customerId: r.payment_schedules?.customers?.id ?? "",
    customerName: r.payment_schedules?.customers?.name ?? "",
    customerPhone: r.payment_schedules?.customers?.phone ?? "",
    customerLanguage: r.payment_schedules?.customers?.language ?? "es",
    smsOptedOut: r.payment_schedules?.customers?.sms_opted_out ?? false,
    vehicleDescription: r.payment_schedules?.vehicle_description ?? "",
  }));
}

export async function updateInstallmentPayment(
  supabase: SupabaseClient,
  installmentId: string,
  amountPaid: number,
  status: InstallmentStatus,
  paidDate?: string | null
): Promise<void> {
  const { error } = await supabase
    .from("installments")
    .update({
      amount_paid: amountPaid,
      status,
      paid_date: paidDate ?? null,
    })
    .eq("id", installmentId);

  if (error) throw error;
}

// ============================================================
// Payment Queries
// ============================================================

export async function createPayment(
  supabase: SupabaseClient,
  data: { installmentId: string; amount: number; paymentMethod: PaymentMethod; receivedDate?: string; notes?: string | null }
): Promise<Payment> {
  const { data: row, error } = await supabase
    .from("payments")
    .insert({
      installment_id: data.installmentId,
      amount: data.amount,
      payment_method: data.paymentMethod,
      received_date: data.receivedDate ?? new Date().toISOString().split("T")[0],
      notes: data.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return mapPaymentRow(row as PaymentRow);
}

export async function getPaymentsByInstallment(
  supabase: SupabaseClient,
  installmentId: string
): Promise<Payment[]> {
  const { data: rows, error } = await supabase
    .from("payments")
    .select("*")
    .eq("installment_id", installmentId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (rows ?? []).map((r: PaymentRow) => mapPaymentRow(r));
}

// ============================================================
// Payment Verification Queries
// ============================================================

export interface PaymentVerificationQueueItem extends PaymentVerification {
  customerName: string;
  customerPhone: string;
  customerLanguage: string;
  vehicleDescription: string;
  scheduleType: string;
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  installmentStatus: string;
}

type PaymentVerificationQueueRow = PaymentVerificationRow & {
  customers?: Pick<CustomerRow, "name" | "phone" | "language"> | null;
  installments?: Pick<
    InstallmentRow,
    "installment_number" | "due_date" | "amount_due" | "amount_paid" | "status"
  > & {
    payment_schedules?: Pick<PaymentScheduleRow, "vehicle_description" | "schedule_type"> | null;
  } | null;
};

export async function createPaymentVerification(
  supabase: SupabaseClient,
  data: {
    installmentId: string;
    scheduleId: string;
    customerId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    expectedDestination?: string | null;
    payerReference?: string | null;
    proofUrl?: string | null;
    receivedDate?: string | null;
    notes?: string | null;
    submittedBy?: string | null;
  }
): Promise<PaymentVerification> {
  const { data: row, error } = await supabase
    .from("payment_verifications")
    .insert({
      installment_id: data.installmentId,
      schedule_id: data.scheduleId,
      customer_id: data.customerId,
      amount: data.amount,
      payment_method: data.paymentMethod,
      expected_destination: data.expectedDestination ?? null,
      payer_reference: data.payerReference ?? null,
      proof_url: data.proofUrl ?? null,
      received_date: data.receivedDate ?? new Date().toISOString().split("T")[0],
      notes: data.notes ?? null,
      submitted_by: data.submittedBy ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return mapPaymentVerificationRow(row as PaymentVerificationRow);
}

export async function getPaymentVerificationById(
  supabase: SupabaseClient,
  id: string
): Promise<PaymentVerification | null> {
  const { data: row, error } = await supabase
    .from("payment_verifications")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !row) return null;
  return mapPaymentVerificationRow(row as PaymentVerificationRow);
}

export async function listPaymentVerificationQueue(
  supabase: SupabaseClient,
  limit = 12,
  scheduleType?: ScheduleType,
): Promise<PaymentVerificationQueueItem[]> {
  const { data: rows, error } = await supabase
    .from("payment_verifications")
    .select(
      "*, customers(name, phone, language), installments(installment_number, due_date, amount_due, amount_paid, status, payment_schedules(vehicle_description, schedule_type))"
    )
    .eq("status", "needs_review")
    .order("created_at", { ascending: true })
    .limit(scheduleType ? Math.max(limit * 4, 40) : limit);

  if (error) throw error;

  return ((rows ?? []) as PaymentVerificationQueueRow[])
    .filter((row) => {
      if (!scheduleType) return true;
      return row.installments?.payment_schedules?.schedule_type === scheduleType;
    })
    .slice(0, limit)
    .map((row) => {
    const base = mapPaymentVerificationRow(row);
    const installment = row.installments;
    return {
      ...base,
      customerName: row.customers?.name ?? "Unknown customer",
      customerPhone: row.customers?.phone ?? "",
      customerLanguage: row.customers?.language ?? "es",
      vehicleDescription:
        installment?.payment_schedules?.vehicle_description ?? "Vehicle not recorded",
      scheduleType: installment?.payment_schedules?.schedule_type ?? "payment",
      installmentNumber: Number(installment?.installment_number ?? 0),
      dueDate: installment?.due_date ?? base.receivedDate,
      amountDue: Number(installment?.amount_due ?? 0),
      amountPaid: Number(installment?.amount_paid ?? 0),
      installmentStatus: installment?.status ?? "upcoming",
    };
  });
}

export async function updatePaymentVerificationStatus(
  supabase: SupabaseClient,
  id: string,
  data: {
    status: PaymentVerificationStatus;
    reviewNotes?: string | null;
    verifiedBy?: string | null;
    verifiedPaymentId?: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from("payment_verifications")
    .update({
      status: data.status,
      review_notes: data.reviewNotes ?? null,
      verified_by: data.verifiedBy ?? null,
      verified_payment_id: data.verifiedPaymentId ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
}

// ============================================================
// Notification Queries
// ============================================================

export async function createNotificationLog(
  supabase: SupabaseClient,
  data: {
    customerId: string;
    installmentId?: string | null;
    channel: NotificationChannel;
    templateKey: string;
    messageBody: string;
    status?: string;
    providerMessageId?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("notification_log").insert({
    customer_id: data.customerId,
    installment_id: data.installmentId ?? null,
    channel: data.channel,
    template_key: data.templateKey,
    message_body: data.messageBody,
    status: data.status ?? "sent",
    provider_message_id: data.providerMessageId ?? null,
  });

  if (error) throw error;
}

export async function wasNotifiedToday(
  supabase: SupabaseClient,
  customerId: string,
  installmentId: string | null,
  templateKey: string
): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];

  let query = supabase
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("template_key", templateKey)
    .eq("notification_date", today);

  if (installmentId) {
    query = query.eq("installment_id", installmentId);
  }

  const { count, error } = await query;
  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Whether this customer has EVER had this message.
 *
 * `wasNotifiedToday` above dedups per day, which is right for a reminder that
 * repeats. A welcome is once in a lifetime: a second one tells the customer
 * the system does not know who they are, which is the opposite of what it is
 * for. Same safe default as its sibling — an error answers false and we send,
 * because a missing welcome is worse than a duplicated one.
 */
export async function wasEverNotified(
  supabase: SupabaseClient,
  customerId: string,
  templateKey: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("template_key", templateKey);

  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Schedules whose first payment has not come round yet.
 *
 * The window for a welcome. Anything older than a few days has already met
 * the reminder ladder, and a welcome arriving after the first payment demand
 * is worse than none: it says nobody is paying attention.
 */
export async function getSchedulesAwaitingWelcome(
  supabase: SupabaseClient,
  withinDays = 7,
): Promise<ActiveRentalSchedule[]> {
  const since = new Date(Date.now() - withinDays * 86400000).toISOString();

  const { data: rows, error } = await supabase
    .from("payment_schedules")
    .select("*, customers(name, phone, language, sms_opted_out)")
    .eq("status", "active")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows ?? []).map((r: any) => ({
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customers?.name ?? "",
    customerPhone: r.customers?.phone ?? "",
    customerLanguage: r.customers?.language ?? "es",
    vehicleDescription: r.vehicle_description ?? "",
    startDate: r.start_date,
    numPayments: r.num_payments,
    frequency: r.frequency,
    agreementId: r.agreement_id ?? null,
    smsOptedOut: r.customers?.sms_opted_out ?? false,
  }));
}

// ============================================================
// Lifecycle Queries (maintenance + renewal)
// ============================================================

export interface ActiveRentalSchedule {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerLanguage: string;
  vehicleDescription: string;
  startDate: string;
  numPayments: number;
  frequency: string;
  agreementId: string | null;
  smsOptedOut: boolean;
}

export async function getActiveRentalSchedules(
  supabase: SupabaseClient,
): Promise<ActiveRentalSchedule[]> {
  const { data: rows, error } = await supabase
    .from("payment_schedules")
    .select("*, customers(name, phone, language, sms_opted_out)")
    .eq("status", "active")
    .eq("schedule_type", "rental")
    .order("start_date", { ascending: true });

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows ?? []).map((r: any) => ({
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customers?.name ?? "",
    customerPhone: r.customers?.phone ?? "",
    customerLanguage: r.customers?.language ?? "es",
    vehicleDescription: r.vehicle_description ?? "",
    startDate: r.start_date,
    numPayments: r.num_payments,
    frequency: r.frequency,
    agreementId: r.agreement_id ?? null,
    smsOptedOut: r.customers?.sms_opted_out ?? false,
  }));
}

// ============================================================
// Dashboard Queries
// ============================================================

export async function getPaymentDashboardData(
  supabase: SupabaseClient,
  scheduleType?: ScheduleType,
) {
  const today = new Date().toISOString().split("T")[0];
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const scopedInstallmentQuery = () => {
    let query = supabase
      .from("installments")
      .select("*, payment_schedules!inner(customer_id, vehicle_description, schedule_type, status, customers(name, phone))")
      .eq("payment_schedules.status", "active");

    if (scheduleType) {
      query = query.eq("payment_schedules.schedule_type", scheduleType);
    }

    return query;
  };

  const scopedInstallmentCountQuery = () => {
    let query = supabase
      .from("installments")
      .select("id, payment_schedules!inner(schedule_type, status)", {
        count: "exact",
        head: true,
      })
      .eq("payment_schedules.status", "active");

    if (scheduleType) {
      query = query.eq("payment_schedules.schedule_type", scheduleType);
    }

    return query;
  };

  const { data: dueTodayRows, error: dueTodayError } = await scopedInstallmentQuery()
    .eq("due_date", today)
    .neq("status", "paid");

  const { data: overdueRows, error: overdueError } = await scopedInstallmentQuery()
    .lt("due_date", today)
    .neq("status", "paid")
    .order("due_date", { ascending: true });

  const { data: upcomingRows, error: upcomingError } = await scopedInstallmentQuery()
    .gt("due_date", today)
    .lte("due_date", weekFromNow)
    .neq("status", "paid")
    .order("due_date", { ascending: true });

  // Recent payments (last 10)
  const { data: recentPaymentRows, error: recentPaymentError } = await supabase
    .from("payments")
    .select("*, installments(due_date, payment_schedules(schedule_type, status, vehicle_description, customers(name)))")
    .order("created_at", { ascending: false })
    .limit(scheduleType ? 40 : 10);

  // Collection rate: paid installments / total past-due installments
  const { count: totalPastDue, error: totalPastDueError } = await scopedInstallmentCountQuery()
    .lte("due_date", today);

  const { count: paidOnTime, error: paidOnTimeError } = await scopedInstallmentCountQuery()
    .lte("due_date", today)
    .eq("status", "paid");

  const firstError =
    dueTodayError ??
    overdueError ??
    upcomingError ??
    recentPaymentError ??
    totalPastDueError ??
    paidOnTimeError;

  if (firstError) throw firstError;

  const collectionSampleSize = totalPastDue ?? 0;
  const collectionRate =
    collectionSampleSize > 0
      ? Math.round(((paidOnTime ?? 0) / collectionSampleSize) * 100)
      : null;

  const scopedRecentPayments = scheduleType
    ? (recentPaymentRows ?? []).filter(
        (row) => row.installments?.payment_schedules?.schedule_type === scheduleType,
      )
    : recentPaymentRows ?? [];

  return {
    dueToday: dueTodayRows ?? [],
    overdue: overdueRows ?? [],
    upcomingWeek: upcomingRows ?? [],
    recentPayments: scopedRecentPayments.slice(0, 10),
    collectionRate,
    collectionSampleSize,
  };
}

// ============================================================
// Rental Residual Income Report
// ============================================================

export interface RentalResidualIncomeRow {
  scheduleId: string;
  agreementId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  vehicleDescription: string;
  contractStatus: string;
  signedDate: string;
  startDate: string;
  endDate: string;
  nextDueDate: string | null;
  frequency: PaymentFrequency;
  installmentAmount: number;
  termPayments: number;
  paidPayments: number;
  openPayments: number;
  contractValue: number;
  collectedValue: number;
  residualValue: number;
  monthlyEquivalent: number;
  agreementPdfUrl: string | null;
}

export interface RentalResidualIncomeReport {
  generatedAt: string;
  rows: RentalResidualIncomeRow[];
  summary: {
    activeContracts: number;
    contractValue: number;
    collectedValue: number;
    residualValue: number;
    monthlyEquivalent: number;
    next30DaysValue: number;
  };
}

type RentalResidualScheduleRow = PaymentScheduleRow & {
  customers?: Pick<CustomerRow, "name" | "phone" | "email"> | null;
};

type RentalResidualAgreementRow = {
  id: string;
  status: string;
  state: string | null;
  completed_at: string | null;
  signed_at: string | null;
  rental_end_date: string | null;
  agreement_pdf_url: string | null;
};

function maxDate(values: Array<string | null | undefined>, fallback: string): string {
  const valid = values.filter((value): value is string => !!value).sort();
  return valid.at(-1) ?? fallback;
}

function monthlyEquivalent(amount: number, frequency: PaymentFrequency): number {
  if (frequency === "Weekly") return Math.round((amount * 52 / 12) * 100) / 100;
  if (frequency === "Bi-weekly") return Math.round((amount * 26 / 12) * 100) / 100;
  return amount;
}

export async function getRentalResidualIncomeReport(
  supabase: SupabaseClient,
): Promise<RentalResidualIncomeReport> {
  const { data: scheduleRows, error: scheduleError } = await supabase
    .from("payment_schedules")
    .select("*, customers(name, phone, email)")
    .eq("schedule_type", "rental")
    .eq("status", "active")
    .order("start_date", { ascending: true });

  if (scheduleError) throw scheduleError;
  const schedules = (scheduleRows ?? []) as RentalResidualScheduleRow[];
  const scheduleIds = schedules.map((row) => row.id);
  const agreementIds = schedules
    .map((row) => row.agreement_id)
    .filter((id): id is string => !!id);

  const installmentsBySchedule = new Map<string, Installment[]>();
  if (scheduleIds.length > 0) {
    const { data: installmentRows, error: installmentError } = await supabase
      .from("installments")
      .select("*")
      .in("schedule_id", scheduleIds)
      .order("due_date", { ascending: true });

    if (installmentError) throw installmentError;
    for (const installment of ((installmentRows ?? []) as InstallmentRow[]).map(mapInstallmentRow)) {
      const rows = installmentsBySchedule.get(installment.scheduleId) ?? [];
      rows.push(installment);
      installmentsBySchedule.set(installment.scheduleId, rows);
    }
  }

  const agreementsById = new Map<string, RentalResidualAgreementRow>();
  if (agreementIds.length > 0) {
    const { data: agreementRows, error: agreementError } = await supabase
      .from("document_agreements")
      .select("id,status,state,completed_at,signed_at,rental_end_date,agreement_pdf_url")
      .in("id", agreementIds);

    if (agreementError) throw agreementError;
    for (const row of (agreementRows ?? []) as RentalResidualAgreementRow[]) {
      agreementsById.set(row.id, row);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next30 = new Date(today);
  next30.setDate(next30.getDate() + 30);
  const generatedAt = new Date().toISOString();

  const rows = schedules.map((row): RentalResidualIncomeRow => {
    const schedule = mapPaymentScheduleRow(row);
    const agreement = schedule.agreementId ? agreementsById.get(schedule.agreementId) ?? null : null;
    const installments = installmentsBySchedule.get(schedule.id) ?? [];
    const paidPayments = installments.filter((installment) => installment.status === "paid").length;
    const openPayments = installments.length - paidPayments;
    const collectedValue = installments.reduce(
      (sum, installment) => sum + Number(installment.amountPaid ?? 0),
      0,
    );
    const residualValue = installments.reduce(
      (sum, installment) =>
        sum + Math.max(0, Number(installment.amountDue ?? 0) - Number(installment.amountPaid ?? 0)),
      0,
    );
    const nextDue = installments.find((installment) => installment.status !== "paid") ?? null;

    return {
      scheduleId: schedule.id,
      agreementId: schedule.agreementId,
      customerName: row.customers?.name ?? "Unknown Customer",
      customerPhone: row.customers?.phone ?? null,
      customerEmail: row.customers?.email ?? null,
      vehicleDescription: schedule.vehicleDescription || "Vehicle Not Recorded",
      contractStatus: agreement?.state ?? agreement?.status ?? schedule.status,
      signedDate: agreement?.signed_at ?? agreement?.completed_at ?? schedule.createdAt,
      startDate: schedule.startDate,
      endDate: agreement?.rental_end_date ?? maxDate(installments.map((installment) => installment.dueDate), schedule.startDate),
      nextDueDate: nextDue?.dueDate ?? null,
      frequency: schedule.frequency,
      installmentAmount: schedule.installmentAmount,
      termPayments: schedule.numPayments,
      paidPayments,
      openPayments,
      contractValue: schedule.totalAmount,
      collectedValue,
      residualValue,
      monthlyEquivalent: monthlyEquivalent(schedule.installmentAmount, schedule.frequency),
      agreementPdfUrl: agreement?.agreement_pdf_url ?? null,
    };
  });

  const next30DaysValue = rows.reduce((sum, row) => {
    const installments = installmentsBySchedule.get(row.scheduleId) ?? [];
    return (
      sum +
      installments.reduce((inner, installment) => {
        const due = new Date(`${installment.dueDate}T00:00:00`);
        if (due < today || due > next30 || installment.status === "paid") return inner;
        return inner + Math.max(0, installment.amountDue - installment.amountPaid);
      }, 0)
    );
  }, 0);

  return {
    generatedAt,
    rows,
    summary: {
      activeContracts: rows.length,
      contractValue: rows.reduce((sum, row) => sum + row.contractValue, 0),
      collectedValue: rows.reduce((sum, row) => sum + row.collectedValue, 0),
      residualValue: rows.reduce((sum, row) => sum + row.residualValue, 0),
      monthlyEquivalent: rows.reduce((sum, row) => sum + row.monthlyEquivalent, 0),
      next30DaysValue,
    },
  };
}

export async function getCustomerDetail(
  supabase: SupabaseClient,
  customerId: string
) {
  const customer = await getCustomerById(supabase, customerId);
  if (!customer) return null;

  const schedules = await getSchedulesByCustomer(supabase, customerId);

  const schedulesWithDetails = await Promise.all(
    schedules.map(async (schedule) => {
      const result = await getScheduleWithInstallments(supabase, schedule.id);
      if (!result) return { schedule, installments: [], payments: [] as Payment[] };

      // Get payments for all installments in this schedule
      const allPayments: Payment[] = [];
      for (const inst of result.installments) {
        const payments = await getPaymentsByInstallment(supabase, inst.id);
        allPayments.push(...payments);
      }

      return {
        schedule: result.schedule,
        installments: result.installments,
        payments: allPayments,
      };
    })
  );

  return { customer, schedules: schedulesWithDetails };
}

// ============================================================
// Dealership Financing Accounts
// ============================================================

export interface FinancingAgreementRef {
  id: string;
  documentType: string;
  status: string;
  state: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  buyerEmail: string | null;
  buyerAddress: string | null;
  vehicleDescription: string | null;
  vehicleVin: string | null;
  vehicleId: string | null;
  smsSendEnabled: boolean;
  completedLink: string | null;
  agreementPdfUrl: string | null;
  portalData: Record<string, unknown> | null;
  createdAt: string;
  completedAt: string | null;
  signedAt: string | null;
}

export interface FinancingVehicleRef {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  licensePlate: string | null;
  mileage: number | null;
  status: string | null;
  price: number | null;
  salePrice: number | null;
}

export interface FinancingAccount {
  schedule: PaymentSchedule;
  customer: Customer;
  agreement: FinancingAgreementRef | null;
  vehicle: FinancingVehicleRef | null;
  installments: Installment[];
  notifications: NotificationLogEntry[];
  smsMessages: SmsMessage[];
}

type FinancingScheduleRow = PaymentScheduleRow & {
  customers?: CustomerRow | null;
};

type FinancingAgreementRow = {
  id: string;
  document_type: string;
  status: string;
  state: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  buyer_email: string | null;
  buyer_address: string | null;
  vehicle_description: string | null;
  vehicle_vin: string | null;
  vehicle_id: string | null;
  sms_send_enabled: boolean | null;
  completed_link: string | null;
  agreement_pdf_url: string | null;
  portal_data: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  signed_at: string | null;
};

type FinancingVehicleRow = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  mileage: number | null;
  status: string | null;
  price: number | null;
  sale_price: number | null;
};

function mapFinancingAgreementRow(row: FinancingAgreementRow): FinancingAgreementRef {
  return {
    id: row.id,
    documentType: row.document_type,
    status: row.status,
    state: row.state,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    buyerEmail: row.buyer_email,
    buyerAddress: row.buyer_address,
    vehicleDescription: row.vehicle_description,
    vehicleVin: row.vehicle_vin,
    vehicleId: row.vehicle_id,
    smsSendEnabled: row.sms_send_enabled ?? true,
    completedLink: row.completed_link,
    agreementPdfUrl: row.agreement_pdf_url,
    portalData: row.portal_data,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    signedAt: row.signed_at,
  };
}

function mapFinancingVehicleRow(row: FinancingVehicleRow): FinancingVehicleRef {
  return {
    id: row.id,
    year: row.year,
    make: row.make,
    model: row.model,
    vin: row.vin,
    licensePlate: row.license_plate,
    mileage: row.mileage,
    status: row.status,
    price: row.price == null ? null : Number(row.price),
    salePrice: row.sale_price == null ? null : Number(row.sale_price),
  };
}

function groupBy<T, K extends string>(
  rows: T[],
  keyFor: (row: T) => K | null | undefined,
): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    if (!key) continue;
    const current = map.get(key) ?? [];
    current.push(row);
    map.set(key, current);
  }
  return map;
}

async function getFinancingAccountsInternal(
  supabase: SupabaseClient,
  scheduleId?: string,
): Promise<FinancingAccount[]> {
  let scheduleQuery = supabase
    .from("payment_schedules")
    .select("*, customers(id,name,phone,email,language,lead_id,notes,sms_opted_out,created_at)")
    .eq("schedule_type", "financing")
    .order("created_at", { ascending: false });

  if (scheduleId) {
    scheduleQuery = scheduleQuery.eq("id", scheduleId);
  }

  const { data: scheduleRows, error: scheduleError } = await scheduleQuery;
  if (scheduleError) throw scheduleError;
  if (!scheduleRows?.length) return [];

  const schedules = scheduleRows as FinancingScheduleRow[];
  const scheduleIds = schedules.map((row) => row.id);
  const customerIds = Array.from(new Set(schedules.map((row) => row.customer_id).filter(Boolean)));
  const agreementIds = Array.from(new Set(schedules.map((row) => row.agreement_id).filter(Boolean))) as string[];

  const { data: installmentRows, error: installmentError } = await supabase
    .from("installments")
    .select("*")
    .in("schedule_id", scheduleIds)
    .order("installment_number", { ascending: true });
  if (installmentError) throw installmentError;

  const agreementsById = new Map<string, FinancingAgreementRef>();
  const vehiclesById = new Map<string, FinancingVehicleRef>();
  const vehiclesByVin = new Map<string, FinancingVehicleRef>();

  if (agreementIds.length > 0) {
    const { data: agreementRows, error: agreementError } = await supabase
      .from("document_agreements")
      .select(
        "id,document_type,status,state,buyer_name,buyer_phone,buyer_email,buyer_address,vehicle_description,vehicle_vin,vehicle_id,sms_send_enabled,completed_link,agreement_pdf_url,portal_data,created_at,completed_at,signed_at",
      )
      .in("id", agreementIds);
    if (agreementError) throw agreementError;

    for (const row of (agreementRows ?? []) as FinancingAgreementRow[]) {
      const agreement = mapFinancingAgreementRow(row);
      agreementsById.set(agreement.id, agreement);
    }

    const vehicleIds = Array.from(
      new Set(
        [...agreementsById.values()]
          .map((agreement) => agreement.vehicleId)
          .filter(Boolean),
      ),
    ) as string[];
    const vins = Array.from(
      new Set(
        [...agreementsById.values()]
          .map((agreement) => agreement.vehicleVin)
          .filter(Boolean),
      ),
    ) as string[];

    const vehicleRows: FinancingVehicleRow[] = [];
    if (vehicleIds.length > 0) {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id,year,make,model,vin,license_plate,mileage,status,price,sale_price")
        .in("id", vehicleIds);
      if (error) throw error;
      vehicleRows.push(...((data ?? []) as FinancingVehicleRow[]));
    }
    if (vins.length > 0) {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id,year,make,model,vin,license_plate,mileage,status,price,sale_price")
        .in("vin", vins);
      if (error) throw error;
      vehicleRows.push(...((data ?? []) as FinancingVehicleRow[]));
    }

    for (const row of vehicleRows) {
      const vehicle = mapFinancingVehicleRow(row);
      vehiclesById.set(vehicle.id, vehicle);
      if (vehicle.vin) vehiclesByVin.set(vehicle.vin, vehicle);
    }
  }

  const { data: notificationRows, error: notificationError } = await supabase
    .from("notification_log")
    .select("*")
    .in("customer_id", customerIds)
    .order("sent_at", { ascending: false })
    .limit(scheduleId ? 100 : 250);
  if (notificationError) throw notificationError;

  const { data: smsRows, error: smsError } = await supabase
    .from("sms_messages")
    .select("*")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false })
    .limit(scheduleId ? 100 : 250);
  if (smsError) throw smsError;

  const installmentsBySchedule = groupBy(
    ((installmentRows ?? []) as InstallmentRow[]).map(mapInstallmentRow),
    (row) => row.scheduleId,
  );
  const notificationsByCustomer = groupBy(
    ((notificationRows ?? []) as NotificationLogRow[]).map(mapNotificationLogRow),
    (row) => row.customerId,
  );
  const smsByCustomer = groupBy(
    ((smsRows ?? []) as SmsMessageRow[]).map(mapSmsMessageRow),
    (row) => row.customerId ?? undefined,
  );

  return schedules
    .map((row) => {
      if (!row.customers) return null;
      const agreement = row.agreement_id ? agreementsById.get(row.agreement_id) ?? null : null;
      const vehicle =
        agreement?.vehicleId && vehiclesById.has(agreement.vehicleId)
          ? vehiclesById.get(agreement.vehicleId) ?? null
          : agreement?.vehicleVin
            ? vehiclesByVin.get(agreement.vehicleVin) ?? null
            : null;

      const installments = installmentsBySchedule.get(row.id) ?? [];
      const installmentIds = new Set(installments.map((installment) => installment.id));
      const notifications = (notificationsByCustomer.get(row.customer_id) ?? []).filter(
        (entry) => !entry.installmentId || installmentIds.has(entry.installmentId),
      );

      return {
        schedule: mapPaymentScheduleRow(row),
        customer: mapCustomerRow(row.customers),
        agreement,
        vehicle,
        installments,
        notifications,
        smsMessages: smsByCustomer.get(row.customer_id) ?? [],
      };
    })
    .filter((account): account is FinancingAccount => Boolean(account));
}

export async function listFinancingAccounts(
  supabase: SupabaseClient,
): Promise<FinancingAccount[]> {
  return getFinancingAccountsInternal(supabase);
}

export async function getFinancingAccountDetail(
  supabase: SupabaseClient,
  scheduleId: string,
): Promise<FinancingAccount | null> {
  const [account] = await getFinancingAccountsInternal(supabase, scheduleId);
  return account ?? null;
}

// ============================================================
// Schedule Status Update
// ============================================================

export async function updateScheduleStatus(
  supabase: SupabaseClient,
  scheduleId: string,
  status: string
): Promise<void> {
  const { error } = await supabase
    .from("payment_schedules")
    .update({ status })
    .eq("id", scheduleId);

  if (error) throw error;
}

// ============================================================
// SMS Message Queries
// ============================================================

export async function createSmsMessage(
  supabase: SupabaseClient,
  data: {
    customerId?: string | null;
    direction: SmsDirection;
    body: string;
    fromNumber: string;
    toNumber: string;
    telnyxMessageId?: string | null;
    status?: string;
    providerStatus?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    lastStatusAt?: string | null;
    aiGenerated?: boolean;
  }
): Promise<SmsMessage> {
  const { data: row, error } = await supabase
    .from("sms_messages")
    .insert({
      customer_id: data.customerId ?? null,
      direction: data.direction,
      body: data.body,
      from_number: data.fromNumber,
      to_number: data.toNumber,
      telnyx_message_id: data.telnyxMessageId ?? null,
      status: data.status ?? (data.direction === "inbound" ? "received" : "sent"),
      provider_status: data.providerStatus ?? (data.direction === "inbound" ? "received" : null),
      error_code: data.errorCode ?? null,
      error_message: data.errorMessage ?? null,
      last_status_at: data.lastStatusAt ?? new Date().toISOString(),
      ai_generated: data.aiGenerated ?? false,
    })
    .select()
    .single();

  if (error) throw error;
  return mapSmsMessageRow(row as SmsMessageRow);
}

export async function getRecentSmsMessages(
  supabase: SupabaseClient,
  customerId: string,
  limit: number = 5
): Promise<SmsMessage[]> {
  const { data: rows, error } = await supabase
    .from("sms_messages")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (rows ?? []).map((r: SmsMessageRow) => mapSmsMessageRow(r));
}

export async function setCustomerOptOut(
  supabase: SupabaseClient,
  customerId: string,
  optedOut: boolean
): Promise<void> {
  const { error } = await supabase
    .from("customers")
    .update({ sms_opted_out: optedOut })
    .eq("id", customerId);

  if (error) throw error;
}

/**
 * Load customer context for AI SMS agent.
 * Returns customer info, active payment schedule, next installment, and recent messages.
 */
export async function getCustomerSmsContext(
  supabase: SupabaseClient,
  customerId: string
): Promise<{
  customer: Customer;
  activeSchedule: PaymentSchedule | null;
  nextInstallment: Installment | null;
  recentMessages: SmsMessage[];
} | null> {
  const customer = await getCustomerById(supabase, customerId);
  if (!customer) return null;

  // Get active payment schedule with installments
  const { data: scheduleRows } = await supabase
    .from("payment_schedules")
    .select("*")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  let activeSchedule: PaymentSchedule | null = null;
  let nextInstallment: Installment | null = null;

  if (scheduleRows && scheduleRows.length > 0) {
    activeSchedule = mapPaymentScheduleRow(scheduleRows[0] as PaymentScheduleRow);

    // Get next unpaid installment
    const { data: instRows } = await supabase
      .from("installments")
      .select("*")
      .eq("schedule_id", activeSchedule.id)
      .neq("status", "paid")
      .order("due_date", { ascending: true })
      .limit(1);

    if (instRows && instRows.length > 0) {
      nextInstallment = mapInstallmentRow(instRows[0] as InstallmentRow);
    }
  }

  const recentMessages = await getRecentSmsMessages(supabase, customerId, 5);

  return { customer, activeSchedule, nextInstallment, recentMessages };
}
