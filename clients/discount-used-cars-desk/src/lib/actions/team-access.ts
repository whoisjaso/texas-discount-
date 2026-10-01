"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";
import { requireCurrentAdminPermission } from "@/lib/admin/current-admin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isTeamRole,
  ROLE_LABELS,
  type TeamRole,
} from "@/lib/operations/team";
import type { TeamMember } from "@/lib/operations/types";
import { SITE_URL } from "@/lib/dealership-config";
import { sendEmail, recipientFingerprint } from "@/lib/email/send";
import { teamWelcomeEmail, ownerAlertEmail, recoveryUrlFor } from "@/lib/email/templates";
import { issueCode, verifyCode } from "@/lib/auth/code-store";
import { isLocalAdminPreviewEnabled } from "@/lib/auth/local-admin";
import { formatPhone, phoneToE164 } from "@/lib/forms/phone";

const PUBLIC_REQUEST_ROLES: TeamRole[] = [
  "finance",
  "lot",
  "mechanic",
  "registration",
  "sales",
  "social",
  "viewer",
];

export type TeamAccessRequestState = {
  ok: boolean;
  message?: string;
  error?: string;
  /**
   * "code" once a confirmation code has been emailed: the form stays filled
   * and asks for the six digits before the request is recorded.
   */
  stage?: "form" | "code";
  email?: string;
  /** How the code was sent, so the screen can name it and offer the other. */
  channel?: "email" | "sms";
};

export type TeamAccessReviewState = {
  ok: boolean;
  message?: string;
  error?: string;
  email?: string;
  fullName?: string;
  temporaryPassword?: string;
};

function cleanText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanEmail(value: FormDataEntryValue | null): string {
  return cleanText(value).toLowerCase();
}

function safeRequestedRole(value: string): TeamRole {
  return isTeamRole(value) && PUBLIC_REQUEST_ROLES.includes(value)
    ? value
    : "viewer";
}

/**
 * The role an approver is allowed to hand out.
 *
 * Owner was refused outright and, worse, refused silently: an attempt to
 * approve somebody as owner became "viewer" with no error, so the one person
 * entitled to grant co-ownership could not, and could not see why.
 *
 * The guard behind that was right even if its handling was not. `team:manage`
 * is held by managers too, so an unconditional allow would let a manager mint
 * owners and hand themselves everything. So the rule is the narrower one:
 * only an owner can make another owner. Everyone else gets `null` and the
 * caller says so out loud rather than quietly writing a lesser role.
 */
function safeApprovalRole(value: string, approverRole: TeamRole | null): TeamRole | null {
  if (!isTeamRole(value)) return "viewer";
  if (value === "owner") return approverRole === "owner" ? "owner" : null;
  return value;
}

const OWNER_REFUSED = "Only an owner can approve another owner.";

function generatedTemporaryPassword(): string {
  const body = randomBytes(12).toString("base64url").replace(/[_-]/g, "").slice(0, 14);
  return `VG-${body}aA1!`;
}

/** A repeated, mailbox-verified request must preserve the owner's decision. */
function existingRequestResult(status: unknown): TeamAccessRequestState | null {
  if (status === "active") {
    return { ok: true, message: "Request received. Existing approved team access is unchanged." };
  }
  if (status === "pending") {
    return { ok: true, message: "Your request is already awaiting owner review." };
  }
  if (status === "inactive") {
    return { ok: false, stage: "form", error: "This access request was declined. Ask the owner to invite you." };
  }
  return null;
}

function canRoleSignContracts(role: TeamRole): boolean {
  return role === "manager" || role === "registration";
}

function siteBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : SITE_URL)
  ).replace(/\/$/, "");
}

async function notifyOwnerOfAccessRequest({
  email,
  fullName,
  note,
  role,
}: {
  email: string;
  fullName: string;
  note: string;
  role: TeamRole;
}) {
  const ownerEmail = process.env.TEAM_ACCESS_NOTIFY_EMAIL ?? process.env.ADMIN_EMAIL;
  if (!ownerEmail) return;

  // Best-effort by policy: the request is already persisted and visible on
  // the team screen; this alert failing must never fail the request.
  const content = ownerAlertEmail(
    `Access request: ${fullName}`,
    [
      `${fullName} requested dashboard access.`,
      `Email: ${email}`,
      `Requested role: ${ROLE_LABELS[role]}`,
      `Note: ${note || "none"}`,
      "Approve in the website. Email is only the alert, not the approval record.",
    ],
    `${siteBaseUrl()}/admin/team`,
  );
  await sendEmail({
    businessKey: `owner-alert/access-request/${recipientFingerprint(email)}/${Date.now()}`,
    template: "ownerAlert",
    to: ownerEmail,
    language: "en",
    from: "support",
    ...content,
  }).catch(() => undefined);
}

type ApprovalEmailResult = {
  sent: boolean;
  error?: string;
};

async function sendTeamApprovalEmail({
  email,
  fullName,
  role,
}: {
  email: string;
  fullName: string;
  role: TeamRole;
}): Promise<ApprovalEmailResult> {
  /*
    An invite LINK, never a password. The old email carried the temporary
    password in plaintext - a leak in every inbox it touched, and a
    lockout design when the send failed after the credential was already
    rotated (Track D review). The link is a one-time recovery token: the
    person chooses their own password on the recovery page, and nothing
    secret ever rides an email body.
  */
  try {
    const service = createServiceClient();
    const { data, error } = await service.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    const hashedToken = data?.properties?.hashed_token;
    if (error || !hashedToken) {
      return { sent: false, error: error?.message ?? "Could not mint the invite link." };
    }

    const { data: memberRow } = await service
      .from("team_members")
      .select("language_preference")
      .eq("email", email)
      .maybeSingle();
    const language: "en" | "es" =
      memberRow?.language_preference === "es" ? "es" : "en";

    const content = teamWelcomeEmail(
      language,
      fullName,
      ROLE_LABELS[role],
      recoveryUrlFor(hashedToken),
    );
    const bucket = Math.floor(Date.now() / 600_000);
    const result = await sendEmail({
      businessKey: `team-invite/${recipientFingerprint(email)}/${bucket}`,
      template: "teamWelcome",
      to: email,
      language,
      from: "support",
      ...content,
    });
    if (result.state === "accepted" || result.state === "duplicate") {
      return { sent: true };
    }
    return {
      sent: false,
      error:
        result.state === "not_configured"
          ? "Invite email skipped because email is not configured."
          : `Invite email ${result.state}.`,
    };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Invite email could not be sent.",
    };
  }
}

function approvalMessage(base: string, emailResult: ApprovalEmailResult): string {
  if (emailResult.sent) {
    return `${base} Approval email sent.`;
  }
  return `${base} Approval email did not send: ${emailResult.error ?? "unknown email error"}`;
}

async function recordApprovalEmailResult(
  service: ReturnType<typeof createServiceClient>,
  memberId: string,
  result: ApprovalEmailResult,
) {
  try {
    const now = new Date().toISOString();
    const { error } = await service
      .from("team_members")
      .update({
        approved_email_sent_at: result.sent ? now : null,
        approved_email_error: result.sent ? null : result.error ?? "Approval email was not sent.",
        updated_at: now,
      })
      .eq("id", memberId);

    if (error) {
      // Older deployments may not have migration 33 yet.
    }
  } catch {
    // Email status is visible when the profile columns are deployed, but it must
    // never block the actual owner approval.
  }
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const service = createServiceClient();
  const { data, error } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) return null;

  return (
    data.users.find((user) => user.email?.trim().toLowerCase() === email)?.id ??
    null
  );
}

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const service = createServiceClient();
  const { data, error } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) return null;

  return (
    data.users.find((user) => user.email?.trim().toLowerCase() === email) ??
    null
  );
}

async function saveAuthOnlyAccessRequest({
  email,
  fullName,
  language,
  note,
  phone,
  role,
}: {
  email: string;
  fullName: string;
  language: "en" | "es";
  note: string;
  /** E.164, or null when what was typed was not a whole US number. */
  phone: string | null;
  role: TeamRole;
}): Promise<TeamAccessRequestState> {
  const service = createServiceClient();
  const existing = await findAuthUserByEmail(email);
  const appMetadata = {
    access_status: "pending",
    desk_role: role,
    requested_role: role,
  };
  const userMetadata = {
    full_name: fullName,
    phone,
    access_request_note: note || null,
    language_preference: language,
  };

  if (existing) {
    const existingResult = existingRequestResult(existing.app_metadata?.access_status);
    if (existingResult) return existingResult;
    const { error } = await service.auth.admin.updateUserById(existing.id, {
      app_metadata: {
        ...(existing.app_metadata ?? {}),
        ...appMetadata,
      },
      user_metadata: {
        ...(existing.user_metadata ?? {}),
        ...userMetadata,
      },
    });
    if (error) return { ok: false, error: "Access request could not be updated yet." };
  } else {
    const { error } = await service.auth.admin.createUser({
      email,
      password: generatedTemporaryPassword(),
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    });
    if (error) return { ok: false, error: "Access request could not be created yet." };
  }

  revalidatePath("/admin/team");
  await notifyOwnerOfAccessRequest({ email, fullName, note, role });
  return {
    ok: true,
    message:
      "Request received. An owner must approve the role before this account can enter the dashboard.",
  };
}

async function logTeamActivity({
  actorId,
  body,
  eventType,
  metadata,
}: {
  actorId: string | null;
  body: string;
  eventType: string;
  metadata: Record<string, unknown>;
}) {
  try {
    const service = createServiceClient();
    await service.from("team_activity_events").insert({
      actor_id: actorId,
      event_type: eventType,
      entity_type: "team_member",
      entity_id: typeof metadata.member_id === "string" ? metadata.member_id : null,
      body,
      metadata,
    });
  } catch {
    // Activity should never block access-control changes.
  }
}

export async function requestTeamAccessAction(
  _prevState: TeamAccessRequestState,
  formData: FormData,
): Promise<TeamAccessRequestState> {
  const fullName = cleanText(formData.get("full_name"));
  const email = cleanEmail(formData.get("email"));
  // One shape in the database, decided here rather than trusted from the
  // browser. The request screen caps and formats the field as it is typed,
  // but a form post is a form post and the field is optional, so anything
  // that is not a whole US number is stored as nothing rather than as a
  // fragment nobody can dial. `customers.phone` already holds rows like
  // "+1 832-273-6126", and one of those cost a customer her reminders.
  const phone = phoneToE164(cleanText(formData.get("phone")));
  const note = cleanText(formData.get("note"));
  const language = cleanText(formData.get("language_preference")) === "es" ? "es" : "en";
  const role = safeRequestedRole(cleanText(formData.get("requested_role")));

  if (!fullName || !email) {
    return { ok: false, error: "Name and email are required." };
  }

  if (!email.includes("@") || email.length < 6) {
    return { ok: false, error: "Enter a valid email address." };
  }

  /*
    The address is proved before the request exists.

    A six-digit code goes to the address; the request is recorded only once
    the code comes back. An owner then approves a person who can read the
    inbox they named, not a form somebody filled in with somebody else's
    address. Production requires that proof even when mail is unavailable;
    the owner can still invite a team member from the authenticated desk.
    Only the explicit local preview skips mailbox verification.
  */
  const typedCode = cleanText(formData.get("verification_code"));
  // Where the code goes. The address is still the identity being proved; the
  // phone is only the route, and only offered when one was given.
  const wantsText = cleanText(formData.get("code_channel")) === "sms" && Boolean(phone);
  if (!isLocalAdminPreviewEnabled()) {
    if (!typedCode) {
      const issued = await issueCode(
        email,
        "verify_email",
        language,
        wantsText && phone ? { channel: "sms", phone } : { channel: "email" },
      );
      if (issued.ok) {
        return {
          ok: false,
          stage: "code",
          email,
          channel: wantsText ? "sms" : "email",
          message: wantsText
            ? `We texted a six-digit code to ${formatPhone(phone ?? "")}. Type it below to finish the request.`
            : `We emailed a six-digit code to ${email}. Type it below to finish the request.`,
        };
      }
      if (issued.reason !== "not_configured" && issued.reason !== "no_secret") {
        return { ok: false, stage: "form", error: "The confirmation code could not be sent. Try again in a minute." };
      }
      return { ok: false, stage: "form", error: "Email verification is unavailable. Ask the owner to invite you." };
    } else {
      const verified = await verifyCode(email, "verify_email", typedCode);
      if (!verified.ok) {
        const error =
          verified.reason === "expired" || verified.reason === "consumed" || verified.reason === "none"
            ? "That code has expired. Send the request again for a new one."
            : verified.reason === "locked"
              ? "Too many tries. Send the request again for a new code."
              : "That code is not right. Check the email and try again.";
        return { ok: false, stage: verified.reason === "wrong" ? "code" : "form", email, error };
      }
    }
  }

  try {
    const service = createServiceClient();
    const requestNote = note
      ? `Access requested: ${note}`
      : `Access requested for ${ROLE_LABELS[role]}.`;

    const { data: inserted, error } = await service.from("team_members").upsert(
      {
        full_name: fullName,
        email,
        phone,
        role,
        language_preference: language,
        status: "pending",
        can_sign_contracts: false,
        last_invite_error: requestNote,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email", ignoreDuplicates: true },
    ).select("id").maybeSingle();

    if (error?.code === "PGRST205") {
      return await saveAuthOnlyAccessRequest({
        email,
        fullName,
        language,
        note,
        phone,
        role,
      });
    }

    if (error) {
      return { ok: false, error: "Access request could not be saved yet." };
    }

    if (!inserted) {
      const { data: existing, error: existingError } = await service
        .from("team_members")
        .select("status")
        .eq("email", email)
        .maybeSingle();
      if (existingError) return { ok: false, error: "Access request could not be checked. Try again." };
      return existingRequestResult(existing?.status)
        ?? { ok: false, error: "Access request could not be checked. Try again." };
    }

    revalidatePath("/admin/team");
    revalidatePath("/admin/operations");
    await notifyOwnerOfAccessRequest({ email, fullName, note, role });
    return {
      ok: true,
      message:
        "Request received. An owner must approve the role before this account can enter the dashboard.",
    };
  } catch {
    return { ok: false, error: "Access request service is unavailable." };
  }
}

async function reviewAuthOnlyAccess(
  formData: FormData,
  actorId: string | null,
  approverRole: TeamRole | null,
): Promise<TeamAccessReviewState> {
  const service = createServiceClient();
  const intent = cleanText(formData.get("intent"));
  const userId = cleanText(formData.get("member_id"));
  const role = safeApprovalRole(cleanText(formData.get("role")), approverRole);
  if (!role) return { ok: false, error: OWNER_REFUSED };

  if (!userId) return { ok: false, error: "Team member is required." };

  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user) return { ok: false, error: "Request not found." };

  const user = data.user;
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : user.email ?? "Associate";
  const email = user.email?.trim().toLowerCase() ?? "";

  if (intent === "deny") {
    const { error: updateError } = await service.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...(user.app_metadata ?? {}),
        access_status: "inactive",
        requires_password_change: false,
      },
    });
    if (updateError) return { ok: false, error: updateError.message };

    await logTeamActivity({
      actorId,
      eventType: "team_access_denied",
      body: `${fullName} was denied dashboard access.`,
      metadata: { member_id: user.id, email, auth_only: true },
    });

    revalidatePath("/admin/team");
    return { ok: true, message: `${fullName} was denied.` };
  }

  const temporaryPassword = generatedTemporaryPassword();
  const { error: updateError } = await service.auth.admin.updateUserById(user.id, {
    password: temporaryPassword,
    email_confirm: true,
    app_metadata: {
      ...(user.app_metadata ?? {}),
      access_status: "active",
      desk_role: role,
      requires_password_change: true,
      can_sign_contracts: canRoleSignContracts(role),
    },
    user_metadata: {
      ...(user.user_metadata ?? {}),
      full_name: fullName,
    },
  });
  if (updateError) return { ok: false, error: updateError.message };

  await logTeamActivity({
    actorId,
    eventType: "team_access_approved",
    body: `${fullName} was approved as ${ROLE_LABELS[role]}.`,
    metadata: { member_id: user.id, email, role, auth_only: true },
  });

  const emailResult = await sendTeamApprovalEmail({
    email,
    fullName,
    role,
  });

  revalidatePath("/admin/team");
  return {
    ok: true,
    email,
    fullName,
    temporaryPassword,
    message: approvalMessage(
      "Approved. The associate will be sent to finish profile onboarding after first login.",
      emailResult,
    ),
  };
}

export async function reviewTeamAccessAction(
  _prevState: TeamAccessReviewState,
  formData: FormData,
): Promise<TeamAccessReviewState> {
  const access = await requireCurrentAdminPermission("team:manage");
  if (!access.ok) return { ok: false, error: access.error };

  const intent = cleanText(formData.get("intent"));
  const memberId = cleanText(formData.get("member_id"));
  const role = safeApprovalRole(cleanText(formData.get("role")), access.role);
  if (!role) return { ok: false, error: OWNER_REFUSED };

  if (!memberId) {
    return { ok: false, error: "Team member is required." };
  }

  const { data: memberRaw, error: memberError } = await access.service
    .from("team_members")
    .select("*")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError?.code === "PGRST205") {
    return await reviewAuthOnlyAccess(formData, access.member?.id ?? null, access.role);
  }

  if (memberError || !memberRaw) {
    return { ok: false, error: "Request not found." };
  }

  const member = memberRaw as TeamMember;
  const email = member.email?.trim().toLowerCase();

  if (intent === "deny") {
    const { error } = await access.service
      .from("team_members")
      .update({
        status: "inactive",
        last_invite_error: "Access request denied by owner.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", member.id);

    if (error) return { ok: false, error: error.message };

    await logTeamActivity({
      actorId: access.member?.id ?? null,
      eventType: "team_access_denied",
      body: `${member.full_name} was denied dashboard access.`,
      metadata: { member_id: member.id, email },
    });

    revalidatePath("/admin/team");
    revalidatePath("/admin/operations");
    return { ok: true, message: `${member.full_name} was denied.` };
  }

  if (!email) {
    return { ok: false, error: "This request needs an email before approval." };
  }

  const temporaryPassword = generatedTemporaryPassword();
  let authUserId = member.auth_user_id;

  if (authUserId) {
    const { error } = await access.service.auth.admin.updateUserById(authUserId, {
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: {
        access_status: "active",
        desk_role: role,
        requires_password_change: true,
        can_sign_contracts: canRoleSignContracts(role),
      },
      user_metadata: { full_name: member.full_name },
    });
    if (error) return { ok: false, error: error.message };
  } else {
    authUserId = await findAuthUserIdByEmail(email);
    if (authUserId) {
      const { error } = await access.service.auth.admin.updateUserById(authUserId, {
        password: temporaryPassword,
        email_confirm: true,
        app_metadata: {
          access_status: "active",
          desk_role: role,
          requires_password_change: true,
          can_sign_contracts: canRoleSignContracts(role),
        },
        user_metadata: { full_name: member.full_name },
      });
      if (error) return { ok: false, error: error.message };
    } else {
      const { data, error } = await access.service.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        app_metadata: {
          access_status: "active",
          desk_role: role,
          requires_password_change: true,
          can_sign_contracts: canRoleSignContracts(role),
        },
        user_metadata: { full_name: member.full_name },
      });
      if (error) return { ok: false, error: error.message };
      authUserId = data.user?.id ?? null;
    }
  }

  const { error: updateError } = await access.service
    .from("team_members")
    .update({
      auth_user_id: authUserId,
      role,
      status: "active",
      can_sign_contracts: canRoleSignContracts(role),
      invited_at: new Date().toISOString(),
      last_invite_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", member.id);

  if (updateError) return { ok: false, error: updateError.message };

  const emailResult = await sendTeamApprovalEmail({
    email,
    fullName: member.full_name,
    role,
  });
  await recordApprovalEmailResult(access.service, member.id, emailResult);

  await logTeamActivity({
    actorId: access.member?.id ?? null,
    eventType: "team_access_approved",
    body: `${member.full_name} was approved as ${ROLE_LABELS[role]}.`,
    metadata: { member_id: member.id, email, role },
  });

  revalidatePath("/admin/team");
  revalidatePath("/admin/operations");
  return {
    ok: true,
    email,
    fullName: member.full_name,
    temporaryPassword,
    message: approvalMessage(
      "Approved. The associate will be sent to finish profile onboarding after first login.",
      emailResult,
    ),
  };
}

async function resetApprovedMemberAccess({
  member,
  service,
}: {
  member: TeamMember;
  service: ReturnType<typeof createServiceClient>;
}): Promise<
  | {
      ok: true;
      email: string;
      fullName: string;
      temporaryPassword: string;
      emailResult: ApprovalEmailResult;
    }
  | { ok: false; error: string }
> {
  const email = member.email?.trim().toLowerCase();
  if (!email) return { ok: false, error: `${member.full_name} needs an email first.` };
  if (member.status !== "active") {
    return { ok: false, error: `${member.full_name} is not active yet.` };
  }
  if (member.role === "owner") {
    return { ok: false, error: "Owner accounts are not reset from the team screen." };
  }

  let existingUser: User | null = null;
  if (member.auth_user_id) {
    const { data } = await service.auth.admin.getUserById(member.auth_user_id);
    existingUser = data.user ?? null;
  }
  existingUser ??= await findAuthUserByEmail(email);

  const fullName = member.display_name || member.full_name;
  const temporaryPassword = generatedTemporaryPassword();
  const appMetadata = {
    ...(existingUser?.app_metadata ?? {}),
    access_status: "active",
    desk_role: member.role,
    requires_password_change: true,
    can_sign_contracts: canRoleSignContracts(member.role),
  };
  const userMetadata = {
    ...(existingUser?.user_metadata ?? {}),
    avatar_url: member.avatar_url ?? existingUser?.user_metadata?.avatar_url ?? null,
    bio: member.bio ?? existingUser?.user_metadata?.bio ?? null,
    display_name: fullName,
    full_name: fullName,
    username: member.username ?? existingUser?.user_metadata?.username ?? null,
  };

  let authUserId = existingUser?.id ?? member.auth_user_id;
  if (authUserId) {
    // Deliberately NOT rotating the password: overwriting a working
    // credential to initiate an email is how a failed send became a
    // lockout (Track D review). The invite link resets it when used.
    const { error } = await service.auth.admin.updateUserById(authUserId, {
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    });
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    });
    if (error) return { ok: false, error: error.message };
    authUserId = data.user?.id ?? null;
  }

  const now = new Date().toISOString();
  const { error: memberUpdateError } = await service
    .from("team_members")
    .update({
      auth_user_id: authUserId,
      invited_at: now,
      last_invite_error: null,
      updated_at: now,
    })
    .eq("id", member.id);
  if (memberUpdateError) return { ok: false, error: memberUpdateError.message };

  const emailResult = await sendTeamApprovalEmail({
    email,
    fullName,
    role: member.role,
  });
  await recordApprovalEmailResult(service, member.id, emailResult);

  return {
    ok: true,
    email,
    fullName,
    temporaryPassword,
    emailResult,
  };
}

export async function resetTeamMemberAccessAction(
  _prevState: TeamAccessReviewState,
  formData: FormData,
): Promise<TeamAccessReviewState> {
  const access = await requireCurrentAdminPermission("team:manage");
  if (!access.ok) return { ok: false, error: access.error };

  const memberId = cleanText(formData.get("member_id"));
  if (!memberId) return { ok: false, error: "Team member is required." };

  const { data: memberRaw, error } = await access.service
    .from("team_members")
    .select("*")
    .eq("id", memberId)
    .maybeSingle();

  if (error || !memberRaw) {
    return { ok: false, error: "Active team member not found." };
  }

  const member = memberRaw as TeamMember;
  const reset = await resetApprovedMemberAccess({ member, service: access.service });
  if (!reset.ok) return { ok: false, error: reset.error };

  await logTeamActivity({
    actorId: access.member?.id ?? null,
    eventType: "team_access_reset",
    body: `${reset.fullName} was sent a fresh setup email.`,
    metadata: { member_id: member.id, email: reset.email, role: member.role },
  });

  revalidatePath("/admin/team");
  revalidatePath("/admin/operations");
  return {
    ok: true,
    email: reset.email,
    fullName: reset.fullName,
    temporaryPassword: reset.temporaryPassword,
    message: approvalMessage(
      "Temporary password reset. The associate will finish profile onboarding after login.",
      reset.emailResult,
    ),
  };
}

export async function resetAcceptedTeamAccessAction(
  _prevState: TeamAccessReviewState,
  _formData: FormData,
): Promise<TeamAccessReviewState> {
  void _prevState;
  void _formData;

  const access = await requireCurrentAdminPermission("team:manage");
  if (!access.ok) return { ok: false, error: access.error };

  const { data, error } = await access.service
    .from("team_members")
    .select("*")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) return { ok: false, error: "Active team could not be loaded." };

  const currentEmail = access.user?.email?.trim().toLowerCase();
  const members = ((data ?? []) as TeamMember[]).filter((member) => {
    const email = member.email?.trim().toLowerCase();
    return member.role !== "owner" && !!email && email !== currentEmail;
  });

  if (members.length === 0) {
    return { ok: false, error: "No active non-owner team members with email were found." };
  }

  const sentNames: string[] = [];
  const failedNames: string[] = [];
  for (const member of members) {
    const reset = await resetApprovedMemberAccess({ member, service: access.service });
    if (reset.ok && reset.emailResult.sent) {
      sentNames.push(reset.fullName);
      await logTeamActivity({
        actorId: access.member?.id ?? null,
        eventType: "team_access_reset",
        body: `${reset.fullName} was sent a fresh setup email.`,
        metadata: { member_id: member.id, email: reset.email, role: member.role, bulk: true },
      });
    } else {
      failedNames.push(member.full_name);
    }
  }

  revalidatePath("/admin/team");
  revalidatePath("/admin/operations");
  return {
    ok: sentNames.length > 0,
    message:
      sentNames.length > 0
        ? `Setup emails sent to ${sentNames.length} active team member${sentNames.length === 1 ? "" : "s"}.`
        : undefined,
    error:
      failedNames.length > 0
        ? `Some setup emails did not send: ${failedNames.join(", ")}.`
        : undefined,
  };
}
