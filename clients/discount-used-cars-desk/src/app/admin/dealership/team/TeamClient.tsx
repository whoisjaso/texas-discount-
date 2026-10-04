"use client";

import { useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle, Circle, WarningCircle } from "@phosphor-icons/react";
import { AdminButton, AdminCard } from "@/components/admin/ui";
import { DeskConfirm, useDeskConfirm } from "@/components/admin/DeskConfirm";
import type { HoldConfirmLabels } from "@/components/admin/HoldToConfirmButton";
import {
  correctTeamMemberNameAction,
  resetAcceptedTeamAccessAction,
  resetTeamMemberAccessAction,
  reviewTeamAccessAction,
  setTeamMemberSigningAction,
  type TeamAccessReviewState,
} from "@/lib/actions/team-access";
import type { TeamHistoryLine, TeamPerson } from "@/lib/admin/team-roster";
import type { TeamRole } from "@/lib/operations/team";
import "@/styles/team-screen.css";

/**
 * The team screen's controls. Every button calls the server action that
 * owns the decision; the server checks the rule again (team-rules.ts), so a
 * control shown disabled to a manager is a courtesy, not the guard. The
 * destructive ones (Deny, Remove Access, Reset Access, Reset Everyone) ask
 * first, in the desk's dialog, and act only on a completed hold.
 */

type RoleOption = { role: TeamRole; label: string; signsByDefault: boolean };

type Result = {
  ok: boolean;
  text: string;
  /** Counts answers, so a reader (or a walk) can tell a new one from the last. */
  seq: number;
  temporaryPassword?: string;
  fullName?: string;
  email?: string;
};

function holdLabels(verb: string): HoldConfirmLabels {
  const lower = verb.toLowerCase();
  return {
    hold: `Hold To ${verb}`,
    holding: "Keep Holding",
    release: `Release To ${verb}`,
    preparing: "Preparing",
    ready: `Ready to ${lower}.`,
    hint: `Hold for 1.2 seconds, then release to ${lower}. Release early to cancel. With assistive technology, activate once to prepare, then activate again when ready.`,
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function signingDefaultLine(option: RoleOption | undefined): string {
  if (!option) return "";
  return option.signsByDefault
    ? `${option.label} starts cleared to sign.`
    : `${option.label} starts not cleared to sign. An owner can turn signing on later.`;
}

export default function TeamClient({
  isOwner,
  roleOptions,
  requests,
  members,
  removed,
  activeOwners,
  history,
}: {
  isOwner: boolean;
  roleOptions: RoleOption[];
  requests: TeamPerson[];
  members: TeamPerson[];
  removed: TeamPerson[];
  activeOwners: number;
  history: TeamHistoryLine[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const confirm = useDeskConfirm();
  const ownerOnlyId = useId();
  const answers = useRef(0);

  function run(key: string, action: () => Promise<TeamAccessReviewState>, after?: () => void) {
    setBusy(key);
    setResult(null);
    startTransition(async () => {
      try {
        const state = await action();
        answers.current += 1;
        setResult({
          seq: answers.current,
          ok: state.ok,
          text: (state.ok ? state.message : state.error) ?? (state.ok ? "Done." : "That could not be done."),
          temporaryPassword: state.temporaryPassword,
          fullName: state.fullName,
          email: state.email,
        });
        if (state.ok) {
          after?.();
          router.refresh();
        }
      } catch {
        answers.current += 1;
        setResult({ seq: answers.current, ok: false, text: "That could not be done. Try again." });
      } finally {
        setBusy(null);
      }
    });
  }

  const nameOf = (entry: TeamPerson) => entry.name || entry.email || "This team member";

  async function deny(entry: TeamPerson) {
    const removing = entry.status === "active";
    const yes = await confirm.ask({
      question: removing ? `Remove ${nameOf(entry)}'s Access?` : `Deny ${nameOf(entry)}?`,
      address: entry.email ?? undefined,
      detail: removing
        ? "They are signed out of the desk at once. Paper they already filed keeps their name. You can approve them again from No Access."
        : "They cannot sign in. You can approve them later from No Access.",
      confirm: removing ? "Remove Access" : "Deny",
      cancel: "Keep",
      destructive: true,
      hold: holdLabels(removing ? "Remove" : "Deny"),
    });
    if (!yes) return;
    run(`deny:${entry.id}`, () => reviewTeamAccessAction({ ok: false }, form({ intent: "deny", member_id: entry.id })));
  }

  async function reset(entry: TeamPerson) {
    const yes = await confirm.ask({
      question: `Reset ${nameOf(entry)}'s Access?`,
      address: entry.email ?? undefined,
      detail:
        "Every device they are signed in on is signed out, and their next sign-in starts at Choose A Password. Their password is not changed, and whether they may sign stays as it is.",
      confirm: "Reset Access",
      cancel: "Keep",
      destructive: true,
      hold: holdLabels("Reset"),
    });
    if (!yes) return;
    run(`reset:${entry.id}`, () => resetTeamMemberAccessAction({ ok: false }, form({ member_id: entry.id })));
  }

  async function resetEveryone() {
    const yes = await confirm.ask({
      question: "Reset Everyone's Access?",
      detail:
        "Every active member except owners and you is signed out and chooses a new password at the next sign-in. Nobody's password is changed.",
      confirm: "Reset Everyone",
      cancel: "Keep",
      destructive: true,
      hold: holdLabels("Reset"),
    });
    if (!yes) return;
    run("reset:everyone", () => resetAcceptedTeamAccessAction({ ok: false }, new FormData()));
  }

  return (
    <div className="ed-team" data-team-screen={isOwner ? "owner" : "manager"}>
      <div aria-live="polite">
        {result ? (
          <div
            role={result.ok ? "status" : "alert"}
            className={`ed-notice ${result.ok ? "ed-notice-done" : "ed-notice-fault"}`}
            data-team-result={result.ok ? "ok" : "refused"}
            data-team-seq={result.seq}
          >
            {result.ok ? (
              <CheckCircle size={16} weight="regular" aria-hidden="true" />
            ) : (
              <WarningCircle size={16} weight="regular" aria-hidden="true" />
            )}
            <p className="ed-notice-text">{result.text}</p>
          </div>
        ) : null}
      </div>

      {result?.temporaryPassword ? (
        <AdminCard className="ed-team-password p-4 md:p-6" emphasis="gold">
          <h2 className="ed-team-heading">Temporary Password</h2>
          <p className="ed-team-fine">
            For {result.fullName || "the new member"}
            {result.email ? ` (${result.email})` : ""}. Give it to them in person. It is shown once, and
            they choose their own at the first sign-in.
          </p>
          <p className="ed-team-secret" data-temporary-password>
            {result.temporaryPassword}
          </p>
          <AdminButton type="button" variant="secondary" onClick={() => setResult(null)}>
            Done
          </AdminButton>
        </AdminCard>
      ) : null}

      <AdminCard as="section" className="p-4 md:p-6">
        <h2 id="team-requests" className="ed-team-heading">
          Access Requests
        </h2>
        {requests.length === 0 ? (
          <p className="ed-team-fine mt-2">Nobody is waiting.</p>
        ) : (
          <ul className="ed-team-list">
            {requests.map((entry) => (
              <RequestRow
                key={entry.id}
                entry={entry}
                roleOptions={roleOptions}
                busy={pending && busy !== null}
                working={busy}
                onApprove={(role) =>
                  run(`approve:${entry.id}`, () =>
                    reviewTeamAccessAction({ ok: false }, form({ intent: "approve", member_id: entry.id, role })),
                  )
                }
                onDeny={() => deny(entry)}
              />
            ))}
          </ul>
        )}
        <p className="ed-team-fine mt-4">
          New staff ask at{" "}
          <Link href="/admin/signup" className="ed-link" prefetch={false}>
            /admin/signup
          </Link>{" "}
          with their own email; the request lands here.
        </p>
      </AdminCard>

      <AdminCard as="section" className="mt-4 p-4 md:p-6">
        <h2 id="team-members" className="ed-team-heading">
          Team Members
        </h2>
        {!isOwner ? (
          <p id={ownerOnlyId} className="ed-team-fine mt-2" data-owner-only-note>
            Only an owner changes who is cleared to sign or corrects a name.
          </p>
        ) : null}
        {members.length === 0 ? (
          <p className="ed-team-fine mt-2">Nobody has access yet.</p>
        ) : (
          <ul className="ed-team-list">
            {members.map((entry) => (
              <MemberRow
                key={entry.id}
                entry={entry}
                isOwner={isOwner}
                ownerOnlyId={isOwner ? undefined : ownerOnlyId}
                lastOwner={entry.role === "owner" && activeOwners <= 1}
                busy={pending && busy !== null}
                editing={editing === entry.id}
                onEdit={(open) => setEditing(open ? entry.id : null)}
                onSigning={(next) =>
                  run(`signing:${entry.id}`, () =>
                    setTeamMemberSigningAction({ ok: false }, form({ member_id: entry.id, can_sign: String(next) })),
                  )
                }
                onName={(first, last) =>
                  run(
                    `name:${entry.id}`,
                    () =>
                      correctTeamMemberNameAction(
                        { ok: false },
                        form({ member_id: entry.id, firstName: first, lastName: last }),
                      ),
                    () => setEditing(null),
                  )
                }
                onReset={() => reset(entry)}
                onRemove={() => deny(entry)}
              />
            ))}
          </ul>
        )}
      </AdminCard>

      {removed.length > 0 ? (
        <AdminCard as="section" className="mt-4 p-4 md:p-6">
          <h2 id="team-removed" className="ed-team-heading">
            No Access
          </h2>
          <ul className="ed-team-list">
            {removed.map((entry) => (
              <RequestRow
                key={entry.id}
                entry={entry}
                roleOptions={roleOptions}
                busy={pending && busy !== null}
                working={busy}
                again
                keepsClearance={!isOwner}
                onApprove={(role) =>
                  run(`approve:${entry.id}`, () =>
                    reviewTeamAccessAction({ ok: false }, form({ intent: "approve", member_id: entry.id, role })),
                  )
                }
              />
            ))}
          </ul>
        </AdminCard>
      ) : null}

      <AdminCard as="section" className="mt-4 p-4 md:p-6">
        <h2 id="team-history" className="ed-team-heading">
          Team History
        </h2>
        {history.length === 0 ? (
          <p className="ed-team-fine mt-2">No team changes on record yet.</p>
        ) : (
          <ol className="ed-team-history" data-team-history>
            {history.map((line) => (
              <li key={line.id}>
                <span className="ed-team-when">{line.at}</span>
                <span>{line.body}</span>
              </li>
            ))}
          </ol>
        )}
      </AdminCard>

      <section className="ed-team-quiet mt-6" aria-labelledby="team-everyone">
        <h2 id="team-everyone" className="ed-team-heading">
          Reset Everyone
        </h2>
        <p className="ed-team-fine mt-1">
          Signs every active member out, never an owner and never you. Each one chooses a new password at the
          next sign-in.
        </p>
        <AdminButton
          type="button"
          variant="secondary"
          className="mt-3"
          disabled={pending}
          onClick={resetEveryone}
          data-reset-everyone
        >
          {busy === "reset:everyone" ? "Resetting" : "Reset Everyone"}
        </AdminButton>
      </section>

      <DeskConfirm pending={confirm.pending} onAnswer={confirm.answer} />
    </div>
  );
}

function RequestRow({
  entry,
  roleOptions,
  busy,
  working,
  again = false,
  keepsClearance = false,
  onApprove,
  onDeny,
}: {
  entry: TeamPerson;
  roleOptions: RoleOption[];
  busy: boolean;
  working: string | null;
  /** A person whose access was removed: approve again, nothing to deny. */
  again?: boolean;
  /**
   * A manager approving a person again keeps the clearance an owner left on
   * their row, never the role's default (team-rules.ts `clearanceAtApproval`).
   */
  keepsClearance?: boolean;
  onApprove: (role: TeamRole) => void;
  onDeny?: () => void;
}) {
  const selectId = useId();
  const hintId = useId();
  const offered = roleOptions.some((option) => option.role === entry.role);
  const [role, setRole] = useState<TeamRole | "">(offered ? entry.role : "");
  const chosen = roleOptions.find((option) => option.role === role);
  // A manager is never offered Owner, and never approves an owner's row.
  const canApprove = entry.role !== "owner" || offered;

  return (
    <li className="ed-team-row" data-team-request={again ? undefined : entry.id} data-team-removed={again ? entry.id : undefined}>
      <div className="ed-team-who">
        <p className="ed-team-name">{entry.name || entry.email || "No name given"}</p>
        {entry.email ? <p className="ed-team-email">{entry.email}</p> : null}
        <p className="ed-team-fine">
          {again ? `Was ${entry.roleLabel}` : `Asked for ${entry.roleLabel}`}
          {entry.since ? ` · ${entry.since}` : ""}
        </p>
        {again && entry.note ? <p className="ed-team-fine">{entry.note}</p> : null}
      </div>
      {canApprove ? (
        <div className="ed-team-approve">
          <label htmlFor={selectId} className="ed-field-label">
            Approve As
          </label>
          <select
            id={selectId}
            className="ed-input ed-team-select"
            value={role}
            aria-describedby={hintId}
            onChange={(event) => setRole(event.target.value as TeamRole)}
            data-approve-role
          >
            {offered ? null : (
              <option value="" disabled>
                Choose a role
              </option>
            )}
            {roleOptions.map((option) => (
              <option key={option.role} value={option.role}>
                {option.label}
              </option>
            ))}
          </select>
          {keepsClearance ? (
            <p id={hintId} className="ed-team-fine" data-keeps-clearance={entry.canSign ? "yes" : "no"}>
              {entry.canSign
                ? "Stays cleared to sign, as an owner left it. Only an owner changes it."
                : "Stays not cleared to sign, as an owner left it. Only an owner changes it."}
            </p>
          ) : (
            <p id={hintId} className="ed-team-fine" data-signs-by-default={chosen?.signsByDefault ? "yes" : "no"}>
              {signingDefaultLine(chosen)}
            </p>
          )}
          <div className="ed-team-actions">
            <AdminButton
              type="button"
              disabled={busy || !role}
              onClick={() => role && onApprove(role)}
              data-approve
            >
              {working === `approve:${entry.id}` ? "Approving" : again ? "Approve Again" : "Approve"}
            </AdminButton>
            {onDeny ? (
              <AdminButton type="button" variant="secondary" disabled={busy} onClick={onDeny} data-deny>
                Deny
              </AdminButton>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="ed-team-fine">Only an owner changes an owner&apos;s access.</p>
      )}
    </li>
  );
}

function MemberRow({
  entry,
  isOwner,
  ownerOnlyId,
  lastOwner,
  busy,
  editing,
  onEdit,
  onSigning,
  onName,
  onReset,
  onRemove,
}: {
  entry: TeamPerson;
  isOwner: boolean;
  ownerOnlyId?: string;
  lastOwner: boolean;
  busy: boolean;
  editing: boolean;
  onEdit: (open: boolean) => void;
  onSigning: (next: boolean) => void;
  onName: (first: string, last: string) => void;
  onReset: () => void;
  onRemove: () => void;
}) {
  const [first, setFirst] = useState(entry.first);
  const [last, setLast] = useState(entry.last);
  const firstId = useId();
  const lastId = useId();
  const helpId = useId();
  const removeNoteId = useId();
  // What a manager may not touch on an owner's row; what nobody touches on their own.
  const ownerRowForManager = entry.role === "owner" && !isOwner;
  const canReset = entry.role !== "owner" && !entry.isSelf;
  const removeNote = entry.isSelf
    ? null
    : ownerRowForManager
      ? "Only an owner changes an owner's access."
      : lastOwner
        ? "The last active owner cannot be removed."
        : null;

  return (
    <li className="ed-team-row" data-team-member={entry.id}>
      <div className="ed-team-who">
        <p className="ed-team-name">
          {entry.name || "No name yet"}
          {entry.isSelf ? <span className="ed-team-you"> (You)</span> : null}
        </p>
        {entry.email ? <p className="ed-team-email">{entry.email}</p> : null}
        <p className="ed-team-fine">{entry.roleLabel}</p>
        <ul className="ed-team-facts" aria-label="Status">
          <li data-onboarding={entry.onboardingFinished ? "finished" : "open"}>
            {entry.onboardingFinished ? (
              <CheckCircle size={14} weight="fill" aria-hidden="true" />
            ) : (
              <Circle size={14} aria-hidden="true" />
            )}
            {entry.onboardingFinished ? "Onboarding Finished" : "Onboarding Not Finished"}
          </li>
          <li data-cleared={entry.canSign ? "yes" : "no"}>
            {entry.canSign ? (
              <CheckCircle size={14} weight="fill" aria-hidden="true" />
            ) : (
              <Circle size={14} aria-hidden="true" />
            )}
            {entry.canSign ? "Cleared To Sign" : "Not Cleared To Sign"}
          </li>
          {entry.canSign ? (
            <li data-signature={entry.signatureOnFile ? "yes" : "no"}>
              {entry.signatureOnFile ? (
                <CheckCircle size={14} weight="fill" aria-hidden="true" />
              ) : (
                <Circle size={14} aria-hidden="true" />
              )}
              {entry.signatureOnFile ? "Signature On File" : "No Signature Yet"}
            </li>
          ) : null}
        </ul>
      </div>

      <div className="ed-team-controls">
        <div className="ed-team-actions">
          <AdminButton
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || !isOwner}
            aria-describedby={ownerOnlyId}
            onClick={() => onSigning(!entry.canSign)}
            data-signing-toggle={entry.canSign ? "off" : "on"}
          >
            {entry.canSign ? "Turn Signing Off" : "Turn Signing On"}
          </AdminButton>
          <AdminButton
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || !isOwner}
            aria-describedby={ownerOnlyId}
            aria-expanded={editing}
            onClick={() => onEdit(!editing)}
            data-correct-name
          >
            Correct Name
          </AdminButton>
          {canReset ? (
            <AdminButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={onReset}
              data-reset-access
            >
              Reset Access
            </AdminButton>
          ) : null}
          {!entry.isSelf ? (
            <AdminButton
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || removeNote !== null}
              aria-describedby={removeNote ? removeNoteId : undefined}
              onClick={onRemove}
              data-remove-access
            >
              Remove Access
            </AdminButton>
          ) : null}
        </div>
        {removeNote ? (
          <p id={removeNoteId} className="ed-team-fine">
            {removeNote}
          </p>
        ) : null}

        {editing ? (
          <form
            className="ed-team-name-form"
            data-correct-name-form
            onSubmit={(event) => {
              event.preventDefault();
              onName(first, last);
            }}
          >
            <div className="ed-team-name-boxes">
              <label htmlFor={firstId}>
                <span className="ed-field-label">First name</span>
                <input
                  id={firstId}
                  name="firstName"
                  className="ed-input"
                  required
                  autoComplete="off"
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={60}
                  aria-describedby={helpId}
                  value={first}
                  onChange={(event) => setFirst(event.target.value)}
                />
              </label>
              <label htmlFor={lastId}>
                <span className="ed-field-label">Last name</span>
                <input
                  id={lastId}
                  name="lastName"
                  className="ed-input"
                  required
                  autoComplete="off"
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={60}
                  aria-describedby={helpId}
                  value={last}
                  onChange={(event) => setLast(event.target.value)}
                />
              </label>
            </div>
            <p id={helpId} className="ed-team-fine">
              The legal name, as it is printed on their ID. It prints on the 130-U seller line and the VTR-61 for
              paper filed from now on; copies already filed keep the name they were filed with.
            </p>
            <div className="ed-team-actions">
              <AdminButton type="submit" size="sm" disabled={busy || !first.trim() || !last.trim()} data-save-name>
                Save Name
              </AdminButton>
              <AdminButton type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onEdit(false)}>
                Cancel
              </AdminButton>
            </div>
          </form>
        ) : null}
      </div>
    </li>
  );
}
