"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import SignaturePad from "@/components/documents/SignaturePad";
import { AdminButton, AdminCard } from "@/components/admin/ui";
import {
  clearStaffSignatureAction,
  saveStaffSignatureAction,
} from "@/lib/actions/staff-signature";

/**
 * One pad, with the signature already on file drawn into it.
 *
 * Not a preview panel beside a blank box. That is the same ink twice, and a
 * screen showing two of something is a screen asking which one counts. The
 * stored signature is rehydrated into the pad instead, so what is on the screen
 * is what is on the documents, and replacing it is drawing over it.
 *
 * `padSession` exists because the pad seeds its canvas once, at mount, from
 * `value`. After Remove there is nothing left to seed it with, and mounting a
 * fresh one is the only way to say so to a component with no imperative handle.
 */

type Props = {
  canSign: boolean;
  /** Whether this reader could actually open the team page, if pointed at it. */
  canOpenTeam: boolean;
  name: string;
  recordedLabel: string | null;
  signature: string | null;
};

export default function StaffSignatureClient({
  canSign,
  canOpenTeam,
  name,
  recordedLabel,
  signature,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [padSession, setPadSession] = useState(0);
  const [saved, setSaved] = useState(signature ?? "");
  const [drawn, setDrawn] = useState(signature ?? "");
  const [signedOn, setSignedOn] = useState("");
  const [recorded, setRecorded] = useState(recordedLabel);
  const [error, setError] = useState<string | null>(null);

  if (!canSign) {
    return (
      <AdminCard className="p-4 md:p-6">
        <h2 className="text-lg font-semibold leading-tight text-[color:var(--tj-ink)] md:text-xl">
          Signing Is Not Turned On
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-[color:var(--tj-muted)]">
          This account cannot sign contracts yet, so there is nothing for a
          signature to go on. Signing is switched on per person from the team
          page, and this pad will be waiting.
        </p>
        {/* The sentence used to name the team page and stop there, which is a
            dead end for the one reader who can act on it: an owner whose own
            signing is off reads "an owner can switch this on" and has to go
            find the screen. The link is only drawn for somebody the route
            actually opens for, so nobody is sent to a door that will not. */}
        {canOpenTeam ? (
          <p className="mt-4">
            <Link href="/admin/dealership/team" className="ed-link text-[color:var(--tj-ink)] underline">
              Open Team Access
            </Link>
          </p>
        ) : null}
      </AdminCard>
    );
  }

  const onFile = saved !== "";
  const unsaved = drawn !== saved;

  function save() {
    setError(null);
    const value = drawn;
    startTransition(async () => {
      const result = await saveStaffSignatureAction(value);
      if (!result.ok) {
        setError(result.error ?? "The signature could not be saved.");
        return;
      }
      setSaved(value);
      setRecorded("Recorded just now.");
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await clearStaffSignatureAction();
      if (!result.ok) {
        setError(result.error ?? "The signature could not be removed.");
        return;
      }
      setSaved("");
      setDrawn("");
      setSignedOn("");
      setRecorded(null);
      setPadSession((session) => session + 1);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <AdminCard className="p-4 md:p-6">
        {/* No status pill here. The heading already says the signature is on
            file and the pad prints its own "Signed" marker beside the name, so
            a third badge would be the same fact three times. */}
        <div className="mb-4 min-w-0">
          <h2 className="text-lg font-semibold leading-tight text-[color:var(--tj-ink)] md:text-xl">
            {onFile ? "Signature On File" : "Draw Your Signature"}
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-[color:var(--tj-muted)]">
            {onFile
              ? "This is what goes on your documents. Draw over it to replace it."
              : "Sign in the box the way you sign on paper, then save it."}
          </p>
        </div>

        <SignaturePad
          key={padSession}
          label={name || "Your signature"}
          value={saved}
          dateValue={signedOn}
          onChange={setDrawn}
          onDateChange={setSignedOn}
        />

        {recorded ? (
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--tj-muted)]">
            {recorded}
          </p>
        ) : null}

        {error ? (
          <div role="alert" className="ed-notice ed-notice-fault mt-3">
            <WarningCircle size={16} weight="regular" aria-hidden="true" />
            <p className="ed-notice-text">{error}</p>
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(9.25rem,1fr))] items-stretch gap-2 md:flex md:flex-wrap">
          <AdminButton
            type="button"
            onClick={save}
            disabled={pending || !drawn || !unsaved}
          >
            {pending ? "Saving" : onFile ? "Replace Signature" : "Save Signature"}
          </AdminButton>
          {onFile ? (
            <AdminButton
              type="button"
              variant="danger"
              onClick={remove}
              disabled={pending}
            >
              Remove Signature
            </AdminButton>
          ) : null}
        </div>
      </AdminCard>

      {/* This was a second card, which put a paragraph of reasoning at the
          same weight as the pad it explains. The desk is Operate: the task is
          the screen, and the reason it exists sits under it quietly. */}
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-[color:var(--tj-muted)]">
        A signature drawn with a finger at the end of a deal never looks like
        the last one, and the one on a title application is the one a clerk
        compares against everything else. Drawing it once, here, is what keeps
        them the same. Remove it whenever you want and the desk goes back to
        asking.
      </p>
    </div>
  );
}
