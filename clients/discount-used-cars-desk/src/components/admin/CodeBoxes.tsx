"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Six digits, six boxes.
 *
 * One long field asks a person to trust that what they typed landed in the
 * right place, and a mistyped digit in the middle of a six-character string is
 * genuinely hard to spot. Six boxes make the shape of the answer visible: you
 * can see at a glance that there are six, which are filled, and which one is
 * wrong.
 *
 * The parts that make it feel like one field rather than six:
 *   - Typing moves forward, backspace on an empty box moves back and clears
 *     the one before it, arrows move without editing.
 *   - A paste of the whole code fills every box, wherever it is pasted. This
 *     is the case that makes or breaks the control, because the code arrives
 *     in a message a person copies whole.
 *   - The real value lives in one hidden input, so the form posts a single
 *     `verification_code` field and the server is unaware there were ever six
 *     boxes.
 *
 * Autofill: `autoComplete="one-time-code"` sits on the first box only. iOS
 * offers the code from the Messages app above the keyboard when a field is
 * marked this way, and it fills the first box; the distribute path below
 * spreads it across the rest, because iOS delivers the whole code to the one
 * field it filled.
 */

const LENGTH = 6;

type Props = {
  /** Posted as this form field. */
  name?: string;
  /** Called with the full code once all six are filled. */
  onComplete?: (code: string) => void;
  autoFocus?: boolean;
  /** Marks every box as wrong, for a code the server refused. */
  invalid?: boolean;
  "aria-label"?: string;
};

export default function CodeBoxes({
  name = "verification_code",
  onComplete,
  autoFocus,
  invalid,
  "aria-label": ariaLabel = "Six-digit code",
}: Props) {
  const [digits, setDigits] = useState<string[]>(() => Array(LENGTH).fill(""));
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const value = digits.join("");

  useEffect(() => {
    if (value.length === LENGTH) onComplete?.(value);
  }, [value, onComplete]);

  /** One code spread across every box, from a paste or from iOS autofill. */
  const distribute = (raw: string, from: number) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    const next = [...digits];
    for (let i = 0; i < typed.length && from + i < LENGTH; i += 1) {
      next[from + i] = typed[i];
    }
    setDigits(next);
    const landed = Math.min(from + typed.length, LENGTH - 1);
    boxes.current[landed]?.focus();
  };

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <div className="ed-code-boxes" role="group" aria-label={ariaLabel}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              boxes.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            // iOS reads this on the first box and hands it the whole code.
            autoComplete={index === 0 ? "one-time-code" : "off"}
            autoFocus={autoFocus && index === 0}
            aria-label={`Digit ${index + 1} of ${LENGTH}`}
            aria-invalid={invalid || undefined}
            data-filled={digit ? "true" : undefined}
            value={digit}
            onChange={(event) => {
              const raw = event.target.value;
              // More than one character means a paste or an autofill landed
              // here, not a keystroke.
              if (raw.length > 1) return distribute(raw, index);
              const only = raw.replace(/\D/g, "").slice(-1);
              const next = [...digits];
              next[index] = only;
              setDigits(next);
              if (only && index < LENGTH - 1) boxes.current[index + 1]?.focus();
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && !digits[index] && index > 0) {
                event.preventDefault();
                const next = [...digits];
                next[index - 1] = "";
                setDigits(next);
                boxes.current[index - 1]?.focus();
                return;
              }
              if (event.key === "ArrowLeft" && index > 0) {
                event.preventDefault();
                boxes.current[index - 1]?.focus();
              }
              if (event.key === "ArrowRight" && index < LENGTH - 1) {
                event.preventDefault();
                boxes.current[index + 1]?.focus();
              }
            }}
            onPaste={(event) => {
              event.preventDefault();
              distribute(event.clipboardData.getData("text"), 0);
            }}
            onFocus={(event) => event.target.select()}
          />
        ))}
      </div>
    </div>
  );
}
