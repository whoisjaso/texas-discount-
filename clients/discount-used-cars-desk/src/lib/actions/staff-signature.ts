"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { signatureDataUrlProblem } from "@/lib/forms/signature-data-url";
import { createServiceClient } from "@/lib/supabase/service";
import type { TeamMember } from "@/lib/operations/types";

/**
 * The one signature a staff member draws, and the only place it is kept.
 *
 * Every document this desk produces used to ask the person finishing it to draw
 * their name again, on a phone, with a finger, at the end of a deal. The tenth
 * one never looks like the first, and the one on the title application is the
 * one a county clerk compares against everything else. So it is drawn once,
 * deliberately, on a screen where nothing else is happening, and reused.
 *
 * Two things about the write path are not incidental.
 *
 * The service client is deliberate. RLS on team_members lets a member read
 * their own row but its WITH CHECK requires 'team:manage', so a salesperson
 * updating their own signature is refused by the very policy that is supposed
 * to protect it. team-onboarding.ts already carves out the same exception for
 * the same reason. What replaces the policy is the check below: the row written
 * is always the caller's own, resolved from their session, never named by the
 * caller.
 *
 * can_sign_contracts is the gate rather than a role. Signing authority is a
 * per-person fact an owner sets, and a viewer promoted to manager is still not
 * automatically someone whose signature belongs on a state form.
 */

export type StaffSignatureResult = { ok: boolean; error?: string };

export type StaffSignature = {
  dataUrl: string | null;
  name: string;
  updatedAt: string | null;
};

const SIGNATURE_PAGE = "/admin/account/signature";

type Signer = { ok: true; member: TeamMember } | { ok: false; error: string };

/**
 * Who is asking, and may they record a signature.
 *
 * `requireSigningClearance` separates the two things this gate is used for.
 * Recording a signature needs clearance: an account nobody has cleared must not
 * be able to put a mark on a state form. Removing one does not, and gating it
 * the same way produced a trap: revoke somebody's signing flag and their
 * signature stays in the row with no way for them to take it back. Withdrawing
 * your own mark is not a privilege, so it only needs you to be you.
 */
async function currentSigner(requireSigningClearance = true): Promise<Signer> {
  const access = await getCurrentAdminAccess();

  if (!access.user) {
    return { ok: false, error: "Sign in again first." };
  }

  if (!access.member) {
    return {
      ok: false,
      error: "This account is not on the team roster yet, so there is no profile to hold a signature.",
    };
  }

  if (requireSigningClearance && !access.member.can_sign_contracts) {
    return {
      ok: false,
      error: "This account is not cleared to sign contracts. Ask an owner to turn signing on first.",
    };
  }

  return { ok: true, member: access.member };
}

export async function saveStaffSignatureAction(
  dataUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const signer = await currentSigner();
  if (!signer.ok) return { ok: false, error: signer.error };

  const value = typeof dataUrl === "string" ? dataUrl.trim() : "";

  // The same rules onboarding applies, from the same module, so the two pads
  // that feed this column can never disagree about what fits in it.
  const problem = signatureDataUrlProblem(value);
  if (problem) {
    return { ok: false, error: problem };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("team_members")
    .update({
      signature_data_url: value,
      signature_updated_at: new Date().toISOString(),
    })
    .eq("id", signer.member.id);

  if (error) {
    return {
      ok: false,
      error: "The signature could not be saved. Apply the team member signature migration if this is a fresh deploy.",
    };
  }

  revalidatePath(SIGNATURE_PAGE);
  return { ok: true };
}

export async function clearStaffSignatureAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  // Not gated on signing clearance: see currentSigner. A revoked account must
  // still be able to take its own mark back out of the row.
  const signer = await currentSigner(false);
  if (!signer.ok) return { ok: false, error: signer.error };

  const service = createServiceClient();
  const { error } = await service
    .from("team_members")
    .update({
      signature_data_url: null,
      signature_updated_at: null,
    })
    .eq("id", signer.member.id);

  if (error) {
    return { ok: false, error: "The signature could not be removed. Try again." };
  }

  revalidatePath(SIGNATURE_PAGE);
  return { ok: true };
}

/**
 * Reads from the member row the session already loaded rather than issuing its
 * own query, because getCurrentAdminAccess selects the whole row and the
 * signature rides along with it.
 */
export async function getStaffSignature(): Promise<{
  dataUrl: string | null;
  name: string;
  updatedAt: string | null;
}> {
  const access = await getCurrentAdminAccess();
  const member = access.member;

  if (!member) {
    return { dataUrl: null, name: "", updatedAt: null };
  }

  return {
    dataUrl: member.signature_data_url ?? null,
    name: member.display_name || member.full_name,
    updatedAt: member.signature_updated_at ?? null,
  };
}
