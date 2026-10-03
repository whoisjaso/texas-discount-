"use client";

import { useCallback, useEffect, useRef } from "react";
import { restoreForm, snapshotForm, type FieldSnapshot } from "@/lib/forms/typed-input";

/** What the handler needs from a submit event, and nothing more. */
export interface SubmittedForm {
  currentTarget: HTMLFormElement;
}

/**
 * Hold a form's typed values across a refused submit.
 *
 * Pass the action result and a way to read failure out of it, then hand the
 * returned handler to the form's `onSubmit`. On submit it reads the fields;
 * when the result comes back and says no, it writes them again. React's own
 * reset happens during the commit and effects run after the commit, so the
 * restore lands last. That ordering is the mechanism, and it is verified in a
 * browser rather than assumed: see docs/SIMPLICITY_RESEARCH.md.
 *
 * The form comes from the submit event rather than a ref the caller has to
 * thread through. That is not only shorter at the call site: forms rendered
 * inside a `.map()`, one per row, cannot share a single ref, and those are
 * exactly the approve and reset forms on the team screen. Only one form can be
 * mid-submit at a time, so one slot is enough.
 *
 * A successful submit is left alone. Clearing the form is the right thing then,
 * and several of these screens count on it.
 */
export function useKeepTypedInput<T>(
  result: T,
  failed: (result: T) => boolean,
): (event: SubmittedForm) => void {
  const pending = useRef<{ form: HTMLFormElement; snapshot: FieldSnapshot[] } | null>(null);

  /**
   * The predicate is read through a ref so that a callback written inline at
   * the call site, which is a new function on every render, does not become an
   * effect dependency. If it did, the effect would fire on the pending render
   * between submit and answer. The snapshot is still sitting there at that
   * moment, so it would be spent restoring values nothing had touched yet, and
   * the reset arriving with the real answer would go unanswered.
   *
   * Updated in an effect rather than during render, because writing a ref while
   * rendering is not safe. Effects fire in declaration order, so this one lands
   * before the restore below on the same commit.
   */
  const failedRef = useRef(failed);
  useEffect(() => {
    failedRef.current = failed;
  });

  const onSubmit = useCallback((event: SubmittedForm) => {
    const form = event.currentTarget;
    pending.current = form ? { form, snapshot: snapshotForm(form) } : null;
  }, []);

  useEffect(() => {
    const submitted = pending.current;
    // Null on the first render and on any render that is not an action result,
    // which is what keeps this from firing when nothing was submitted.
    if (!submitted) return;
    pending.current = null;
    if (!failedRef.current(result)) return;
    // The form can have been unmounted while the action was in flight.
    if (!submitted.form.isConnected) return;
    restoreForm(submitted.form, submitted.snapshot);
  }, [result]);

  return onSubmit;
}
