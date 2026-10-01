"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "@phosphor-icons/react";
import { saveSalePlanAnswer } from "@/lib/actions/sale-plan";
import { PLAN_STEP_KEY, type PlanQuestionId } from "@/lib/sales/sale-plan";
import { tapHaptic } from "@/lib/haptics";
import { DeskConfirm, useDeskConfirm } from "@/components/admin/DeskConfirm";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";

/**
 * One question. One page. Answer it and the corridor moves.
 *
 * The prescreen used to stack four questions on one screen. The owner's
 * objection was friction and confusion: a dealer should look at a screen and
 * know immediately what it wants, answer, and be moved on. So each question
 * became its own step with its own URL, which also means Back works, a
 * refresh lands where you were, and the progress count is real.
 *
 * ## Why there is no Next button
 *
 * The owner's word was frictionless. Tapping the answer IS the submit, which
 * is how `FundingStep` has always worked, so this makes the corridor
 * consistent rather than inventing an interaction.
 *
 * ## Why there is no artificial pause
 *
 * The first draft held the screen for a beat so the choice could be seen
 * registering. DESIGN.md forbids exactly that: motion "never delays input. A
 * press responds on press." So the press paints the chosen state
 * synchronously in the same tick, the save leaves immediately, and the move
 * happens when the write lands. The round trip is the pause, honestly
 * earned, and there is no timer to cancel for somebody who asked for less
 * motion.
 *
 * ## Why the lock is a ref
 *
 * `useTransition`'s pending flag updates a render too late to stop a second
 * tap that lands in the same frame, which would fire two saves and two
 * navigations. The ref is taken synchronously before any await.
 *
 * ## Why the server decides where to go next
 *
 * Answering the registration question can lengthen or shorten the chain, so
 * the destination is not knowable from this screen's copy of it. The action
 * returns the next unanswered question as it stands AFTER the write commits,
 * and this navigates to that. Guessing locally is how a branch switch sends
 * somebody to a question that no longer exists.
 */

export type PlanChoice = {
  value: string | boolean;
  label: string;
  gloss?: string;
};

export default function PlanQuestionStep({
  dealId,
  questionId,
  help,
  choices,
  current,
  stepBase,
  packetHref,
  returnHref = null,
  savingLabel,
  onNavigate,
}: {
  dealId: string;
  questionId: PlanQuestionId;
  help?: string;
  choices: PlanChoice[];
  /** What is already stored, so returning to a question shows the answer. */
  current: string | boolean | null;
  /**
   * The corridor's step base, ending in a slash.
   *
   * Absolute, never relative: `../plan:price-includes` from
   * `/admin/sales/{id}/guide/plan:registration` resolves to
   * `/admin/sales/{id}/plan:price-includes`, dropping the `guide` segment
   * entirely. That is a 404 that looks like the answer failed to save when
   * in fact it had already committed.
   */
  stepBase: string;
  /** Where the corridor goes once the whole plan is answered. */
  packetHref: string;
  /**
   * Where to go instead, when the question was opened from the summary.
   *
   * The chain below is right for somebody walking the corridor and wrong for
   * somebody who came to change one answer: chaining would carry them into
   * the next prescreen question they did not ask for. When this is set the
   * answer saves and the reader goes straight back to the line they tapped.
   */
  returnHref?: string | null;
  /** "Saving", from the catalogue, because a screen reader hears it. */
  savingLabel: string;
  /** Records forward motion without sitting between the save and navigation. */
  onNavigate: () => void;
}) {
  const router = useRouter();
  const { t } = useFunnel();
  const { ask, pending: inspectionPending, answer: answerInspection } = useDeskConfirm();
  const [chosen, setChosen] = useState<string | boolean | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Synchronous, so a second tap in the same frame cannot get through. */
  const locked = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /*
    Focus is the shell's job, not this component's. The corridor's h1 IS the
    question, it is re-keyed per step, and it takes focus on every move. A
    second focus target here would fight it.
  */

  const pick = useCallback(
    (value: string | boolean) => {
      if (locked.current) return;
      locked.current = true;

      // The press responds on press: paint first, then save.
      setChosen(value);
      setError(null);
      tapHaptic();

      void (async () => {
        const needsAcknowledgment = questionId === "inspectionBy" && value === "buyer";
        if (needsAcknowledgment) {
          const confirmed = await ask({
            question: t.plan.inspectionConfirmTitle,
            detail: t.plan.inspectionConfirmBody,
            confirm: t.plan.inspectionConfirmYes,
            cancel: t.plan.inspectionConfirmNo,
            hold: t.holdConfirmation,
          });
          if (!alive.current) return;
          if (!confirmed) {
            setChosen(current);
            locked.current = false;
            return;
          }
        }
        setBusy(true);
        const result = await saveSalePlanAnswer(dealId, {
          questionId,
          value,
          ...(needsAcknowledgment ? { inspectionAcknowledged: true } : {}),
        });

        if (!alive.current) return;

        if (!result.ok) {
          // The move is cancelled, the stored answer is restored, and the
          // lock is released so it can be tried again.
          setChosen(current);
          setError(result.error);
          setBusy(false);
          locked.current = false;
          return;
        }

        // Where to go is the SERVER's answer, computed after the write, so a
        // branch switch cannot send anybody to a question that stopped
        // existing.
        onNavigate();
        /*
          The plate comes straight after "we file". The server names the
          next PLAN question, and the plate is not one: it is the guide's
          own step, wedged between this answer and the next question so a
          plate on the shelf prints on every document. So that one answer
          goes to the plate step, and the plate step's Next carries on to
          whatever the server would have named.
        */
        const toPlate = questionId === "registrationBy" && value === "dealer";
        router.push(
          returnHref ??
            (toPlate
              ? `${stepBase}plate`
              : result.next
                ? `${stepBase}${PLAN_STEP_KEY[result.next]}`
                : packetHref),
        );
      })();
    },
    [ask, current, dealId, onNavigate, packetHref, questionId, returnHref, router, stepBase, t.plan, t.holdConfirmation],
  );

  return (
    <div data-tj-stagger key={questionId}>
      {help ? (
        <p className="ed-fine text-[color:var(--tj-muted)]">{help}</p>
      ) : null}

      <div
        role="group"
        aria-busy={busy}
        className="ed-plan-choices"
        data-tj-stagger
      >
        {choices.map((choice) => {
          const isChosen = chosen === choice.value;
          return (
            <button
              key={String(choice.value)}
              type="button"
              aria-pressed={isChosen}
              disabled={busy}
              data-chosen={isChosen ? "true" : "false"}
              onClick={() => pick(choice.value)}
              className="tj-choice tj-action-base tj-action-ghost ed-plan-choice"
            >
              {isChosen ? <Check size={14} weight="bold" aria-hidden="true" /> : null}
              <span>
                {choice.label}
                {choice.gloss ? (
                  <span className="ed-fine block text-[color:var(--tj-muted)]">
                    {choice.gloss}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* Announced, not just drawn: the corridor moves on its own, so a
          failure has to reach somebody who is not watching the screen. */}
      <p role="status" aria-live="polite" className="sr-only">
        {busy ? savingLabel : ""}
      </p>

      {error ? (
        <p role="alert" className="ed-start-error mt-6">
          {error}
        </p>
      ) : null}
      <DeskConfirm pending={inspectionPending} onAnswer={answerInspection} />
    </div>
  );
}
