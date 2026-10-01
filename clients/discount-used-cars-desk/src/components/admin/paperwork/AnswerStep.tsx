"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { savePaperworkAnswer } from "@/lib/actions/paperwork";
import type { AskedQuestion } from "@/lib/sales/paperwork";
import { tapHaptic } from "@/lib/haptics";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { localizeQuestion } from "@/lib/sales/question-i18n";

/**
 * One paperwork question, answered.
 *
 * Built on the same contract as the funding step, which is the pattern for
 * every screen in this corridor: answering saves and moves on, and there is no
 * Save button, because there is nothing else on the screen to save alongside
 * it and a confirm after a single answer is a click that buys nothing.
 *
 * A choice question needs no second control at all. A typed one gets a Next,
 * because a keyboard has no moment that means "done" and submitting on blur
 * would move the page while somebody is still reading what they wrote.
 */

export default function AnswerStep({
  dealId,
  documentType,
  question,
  current,
  nextHref,
}: {
  dealId: string;
  documentType: string;
  question: AskedQuestion;
  /** What is already on the deal, or the sensible starting answer. */
  current: string;
  nextHref: string;
}) {
  const router = useRouter();
  const { t } = useFunnel();
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState<string | null>(null);
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);

  // The question arrives in English (the spine's language) and is localized
  // here, where the toggle can change it mid-screen. Values are untouched —
  // only labels, glosses and notes swap.
  const worded = localizeQuestion(t, documentType, question);

  function answer(next: string) {
    tapHaptic();
    setError(null);
    setChoosing(next);

    startTransition(async () => {
      const result = await savePaperworkAnswer(dealId, documentType, question.key, next);
      if (!result.ok) {
        setError(result.error ?? t.chrome.couldNotSave);
        setChoosing(null);
        return;
      }
      router.push(nextHref);
    });
  }

  if (question.kind === "choice") {
    return (
      <div className="ed-paper-answer">
        <div className="ed-pay-row">
          {(worded.options ?? []).map((option) => {
            const busy = pending && choosing === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className="ed-pay-choice"
                data-active={current === option.value ? "true" : undefined}
                aria-pressed={current === option.value}
                disabled={pending}
                onClick={() => answer(option.value)}
              >
                <span className="ed-pay-choice-label">{option.label}</span>
                {busy || option.gloss ? (
                  <span className="ed-pay-choice-gloss">
                    {busy ? t.chrome.saving : option.gloss}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {worded.note ? <p className="ed-paper-note">{worded.note}</p> : null}
        {error ? (
          <p className="ed-paper-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const numeric = question.kind === "money" || question.kind === "number";

  return (
    <form
      className="ed-paper-answer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending) answer(value.trim());
      }}
    >
      <label className="ed-paper-field">
        {/* The question is the page's heading, so the box does not repeat it.
            A visible label here would be the same words twice. */}
        <span className="sr-only">{worded.question}</span>
        <input
          className="ed-input ed-paper-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={pending}
          type={question.kind === "date" ? "date" : "text"}
          inputMode={numeric ? "decimal" : "text"}
          autoCapitalize={question.kind === "text" ? "words" : "none"}
          autoCorrect="off"
          spellCheck={false}
          // The hands are already on the keyboard when this screen arrives on
          // its own. Making them reach for the mouse is the friction the whole
          // corridor exists to remove.
          autoFocus
        />
      </label>

      {worded.note ? <p className="ed-paper-note">{worded.note}</p> : null}

      <button type="submit" className="ed-btn ed-btn-dark ed-paper-next" disabled={pending}>
        {pending ? t.chrome.saving : t.chrome.next}
      </button>

      {/* The way out of a question that does not apply to this vehicle. An
          empty answer files as a blank box, which is what the state form
          expects, and the corridor moves on. Only questions that say they
          are optional offer it; everything else has an answer on every deal
          it appears on. */}
      {question.optional ? (
        <button
          type="button"
          className="ed-btn ed-btn-outline ed-paper-skip"
          disabled={pending}
          onClick={() => answer("")}
        >
          {t.chrome.notApplicable}
        </button>
      ) : null}

      {error ? (
        <p className="ed-paper-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
