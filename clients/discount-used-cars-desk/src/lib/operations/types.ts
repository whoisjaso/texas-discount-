import type { TeamRole } from "@/lib/operations/team";

export type OperatorTaskCategory =
  | "marketplace"
  | "rentals"
  | "communications"
  | "paperwork"
  | "lot"
  | "social";

export type OperatorTaskPriority = "critical" | "important" | "routine";
export type OperatorEscalationTier = "green" | "yellow" | "red";
export type OperatorTaskStatus =
  | "not_started"
  | "in_progress"
  | "done"
  | "skipped";
export type OperatorTaskProofStatus = "none" | "submitted" | "approved" | "rejected";
export type TeamMemberStatus = "pending" | "active" | "inactive";
export type TeamLanguage = "en" | "es";

export interface OperatorTask {
  id: string;
  task_date: string;
  category: OperatorTaskCategory;
  title: string;
  description: string;
  how_to_content: string;
  estimated_minutes: number;
  priority: OperatorTaskPriority;
  escalation_tier: OperatorEscalationTier;
  status: OperatorTaskStatus;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  source_key?: string | null;
  source_event_id?: string | null;
  source_event_type?: string | null;
  due_at?: string | null;
  suggested_action?: string | null;
  blocker_reason?: string | null;
  workspace?: "rental" | "dealership" | "shared" | null;
  workflow_stage?: string | null;
  customer_id?: string | null;
  vehicle_id?: string | null;
  assigned_to?: string | null;
  assigned_role?: TeamRole | null;
  proof_required?: boolean | null;
  proof_status?: OperatorTaskProofStatus | null;
  started_at?: string | null;
  completed_by?: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface OperatorChecklist {
  id: string;
  checklist_date: string;
  total_tasks: number;
  completed_tasks: number;
  skipped_tasks: number;
  completion_percentage: number;
  daily_summary: string | null;
  created_at: string;
}

export interface OnboardingProgress {
  id: string;
  operator_name: string;
  category: OperatorTaskCategory;
  tutorials_completed: number;
  tutorials_total: number;
  certified: boolean;
  certified_at: string | null;
  streak_days: number;
  created_at: string;
  updated_at: string;
}

export interface SmsAuditRow {
  id: string;
  customerName: string;
  phone: string;
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  providerMessageId: string | null;
  links: string[];
  hasLink: boolean;
  aiGenerated: boolean;
  createdAt: string;
}

export interface NotificationAuditRow {
  id: string;
  customerName: string;
  templateKey: string;
  messageBody: string;
  status: string;
  providerMessageId: string | null;
  links: string[];
  hasLink: boolean;
  sentAt: string;
}

export type AutomatedMessageSource = "ai_sms" | "system_sms" | "auto_reminder";

export interface AutomatedMessageRow {
  id: string;
  source: AutomatedMessageSource;
  customerName: string;
  phone: string;
  body: string;
  status: string;
  createdAt: string;
  templateKey: string | null;
  channel: string;
  providerMessageId: string | null;
  links: string[];
  hasLink: boolean;
  aiGenerated: boolean;
}

export interface TeamMember {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  display_name?: string | null;
  username?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  email: string | null;
  phone: string | null;
  role: TeamRole;
  language_preference: TeamLanguage;
  status: TeamMemberStatus;
  can_sign_contracts: boolean;
  // Optional because a deploy can be running ahead of the migration that adds
  // them, and every caller reads this row with select("*").
  signature_data_url?: string | null;
  signature_updated_at?: string | null;
  invited_at: string | null;
  last_invite_error: string | null;
  onboarding_completed_at?: string | null;
  approved_email_sent_at?: string | null;
  approved_email_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperatorTaskProof {
  id: string;
  task_id: string;
  submitted_by: string | null;
  submitter_name?: string | null;
  proof_type: "note" | "photo" | "link" | "file";
  note: string;
  file_url: string | null;
  status: "submitted" | "approved" | "rejected";
  created_at: string;
}

export interface TeamChannel {
  id: string;
  name: string;
  purpose: string;
  channel_type: "group" | "direct" | "system";
  created_by: string | null;
  created_at: string;
}

export interface TeamMessage {
  id: string;
  channel_id: string;
  author_id: string | null;
  author_name?: string | null;
  author_role?: TeamRole | null;
  body: string;
  attachments: unknown[];
  created_at: string;
}

export interface TeamActivityEvent {
  id: string;
  actor_id: string | null;
  actor_name?: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface WorkerHandoffNote {
  id: string;
  note_date: string;
  author_id: string | null;
  author_name?: string | null;
  workspace: "rental" | "dealership" | "shared";
  entity_type: string | null;
  entity_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  priority: "normal" | "important" | "urgent";
  body: string;
  ai_summary: string | null;
  resolved_at: string | null;
  created_at: string;
}
