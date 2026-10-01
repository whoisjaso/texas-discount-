export const RENTAL_MAINTENANCE_POLICY = {
  revision: "04/2026",
  checkIntervalDays: 14,
  oilChangeReimbursementCap: 75,
} as const;

export const MAINTENANCE_ISSUE_TYPES = [
  "oil_change",
  "routine_check",
  "tire_repair",
  "tire_replacement",
  "warning_light",
  "mechanical_breakdown",
  "roadside_assist",
] as const;

export type MaintenanceIssueType = (typeof MAINTENANCE_ISSUE_TYPES)[number];

export type MaintenanceDecision =
  | "owner_covered"
  | "owner_capped"
  | "renter_responsibility"
  | "needs_review"
  | "no_reimbursement";

export interface MaintenanceDecisionResult {
  decision: MaintenanceDecision;
  approvedAmount: number;
  label: string;
  reason: string;
}

export interface MaintenanceScheduleStatus {
  startDate: string | null;
  nextCheckDate: string | null;
  daysUntilNextCheck: number | null;
  completedCheckCount: number;
  state: "missing_start" | "due_today" | "due_soon" | "upcoming";
}

export interface MaintenanceRequestLog {
  id: string;
  recordedAt: string;
  issueType: MaintenanceIssueType;
  requestedAmount: number;
  approvedAmount: number;
  decision: MaintenanceDecision;
  vendor: string | null;
  odometer: string | null;
  notes: string | null;
  reason: string;
  policyRevision: string;
}

const ISSUE_LABELS: Record<MaintenanceIssueType, string> = {
  oil_change: "Oil change",
  routine_check: "Routine check",
  tire_repair: "Tire repair",
  tire_replacement: "Tire replacement",
  warning_light: "Warning light",
  mechanical_breakdown: "Mechanical breakdown",
  roadside_assist: "Roadside assist",
};

export function maintenanceIssueLabel(issueType: MaintenanceIssueType): string {
  return ISSUE_LABELS[issueType];
}

export function normalizeMaintenanceIssueType(
  value: FormDataEntryValue | string | null | undefined,
): MaintenanceIssueType {
  const key = String(value ?? "").trim();
  return MAINTENANCE_ISSUE_TYPES.includes(key as MaintenanceIssueType)
    ? (key as MaintenanceIssueType)
    : "mechanical_breakdown";
}

export function decideMaintenanceReimbursement(
  issueType: MaintenanceIssueType,
  requestedAmount: number,
): MaintenanceDecisionResult {
  const amount = Math.max(0, Math.round((Number(requestedAmount) || 0) * 100) / 100);
  const cap = RENTAL_MAINTENANCE_POLICY.oilChangeReimbursementCap;

  if (issueType === "oil_change") {
    if (amount <= 0) {
      return {
        decision: "needs_review",
        approvedAmount: 0,
        label: "Needs review",
        reason: "Oil change request is missing the receipt amount.",
      };
    }
    if (amount <= cap) {
      return {
        decision: "owner_covered",
        approvedAmount: amount,
        label: "Covered",
        reason: `Oil change is reimbursable up to $${cap} with receipt and odometer proof.`,
      };
    }
    return {
      decision: "owner_capped",
      approvedAmount: cap,
      label: `Capped at $${cap}`,
      reason: `Oil change exceeds the $${cap} contract cap. Anything above the cap requires written approval.`,
    };
  }

  if (issueType === "routine_check") {
    return {
      decision: "no_reimbursement",
      approvedAmount: 0,
      label: "Check only",
      reason: "Routine checks verify oil, tires, warnings, mileage, and condition without creating a reimbursement.",
    };
  }

  if (issueType === "tire_repair" || issueType === "tire_replacement") {
    return {
      decision: "renter_responsibility",
      approvedAmount: 0,
      label: "Renter responsibility",
      reason: "Tire punctures, road hazard damage, curb damage, and replacement during possession stay with the renter unless the file proves a pre-existing condition.",
    };
  }

  return {
    decision: "needs_review",
    approvedAmount: 0,
    label: "Needs review",
    reason: "Mechanical or roadside issues require owner review before reimbursement or repair authorization.",
  };
}

export function getMaintenanceScheduleStatus(
  startDate: string | null | undefined,
  today = new Date(),
): MaintenanceScheduleStatus {
  const cleanStart = typeof startDate === "string" && startDate.trim() ? startDate.trim() : null;
  if (!cleanStart) {
    return {
      startDate: null,
      nextCheckDate: null,
      daysUntilNextCheck: null,
      completedCheckCount: 0,
      state: "missing_start",
    };
  }

  const start = parseIsoDate(cleanStart);
  const now = parseIsoDate(today.toISOString().slice(0, 10));
  if (!start || !now) {
    return {
      startDate: cleanStart,
      nextCheckDate: null,
      daysUntilNextCheck: null,
      completedCheckCount: 0,
      state: "missing_start",
    };
  }

  const elapsedDays = Math.max(0, daysBetween(start, now));
  const interval = RENTAL_MAINTENANCE_POLICY.checkIntervalDays;
  const completedCheckCount = Math.floor(elapsedDays / interval);
  const nextOffset = elapsedDays % interval === 0
    ? elapsedDays
    : Math.ceil(elapsedDays / interval) * interval;
  const nextCheck = addDays(start, nextOffset);
  const daysUntilNextCheck = daysBetween(now, nextCheck);
  const state =
    daysUntilNextCheck === 0
      ? "due_today"
      : daysUntilNextCheck <= 3
        ? "due_soon"
        : "upcoming";

  return {
    startDate: cleanStart,
    nextCheckDate: nextCheck.toISOString().slice(0, 10),
    daysUntilNextCheck,
    completedCheckCount,
    state,
  };
}

export function readMaintenanceLog(portalData: unknown): MaintenanceRequestLog[] {
  if (!portalData || typeof portalData !== "object") return [];
  const ops = (portalData as Record<string, unknown>).ops;
  if (!ops || typeof ops !== "object") return [];
  const raw = (ops as Record<string, unknown>).maintenanceRequests;
  if (!Array.isArray(raw)) return [];

  return raw.filter(isMaintenanceRequestLog);
}

function isMaintenanceRequestLog(value: unknown): value is MaintenanceRequestLog {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<MaintenanceRequestLog>;
  return (
    typeof row.id === "string" &&
    typeof row.recordedAt === "string" &&
    MAINTENANCE_ISSUE_TYPES.includes(row.issueType as MaintenanceIssueType) &&
    typeof row.decision === "string"
  );
}

function parseIsoDate(value: string): Date | null {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function daysBetween(start: Date, end: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / dayMs);
}
