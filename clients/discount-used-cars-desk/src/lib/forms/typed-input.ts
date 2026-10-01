/**
 * Keeping what somebody typed when the submit comes back refused.
 *
 * React 19 clears an uncontrolled form once its `action` finishes. "Finishes"
 * means the function returned, not that the answer was yes. A server action
 * that returns `{ success: false, error: "Please enter a valid phone number." }`
 * has finished perfectly well, so React resets the form and the visitor reads
 * that sentence over an empty set of fields, including the fields that were
 * right.
 *
 * Measured on the public contact form at 390x844 and 1440x900: name, phone,
 * vehicle and preferred contact all came back empty behind the error. The
 * vehicle someone was asking about is gone along with everything else.
 *
 * The alternative fix is to make every field controlled. That is fine for four
 * fields and unreasonable for the thirty on the sale intake, and it converts a
 * data-loss bug into a large diff across ten files. This restores instead:
 * read the values on submit, put them back if the answer was no.
 *
 * These two functions are deliberately free of React so they can be tested
 * against a real form rather than through a component.
 */

export interface FieldSnapshot {
  /** Position in `form.elements`, which is what the restore matches on. */
  index: number;
  name: string;
  type: string;
  value: string;
  checked: boolean;
  /** Selected values, for a `<select multiple>`. */
  selected: string[] | null;
}

/** Controls whose value cannot be restored, or that hold no typed input. */
const UNRESTORABLE = new Set([
  // A file input's value is not settable: browsers refuse, for good reason.
  "file",
  "submit",
  "reset",
  "button",
  "image",
]);

function elementType(el: Element): string {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return el.multiple ? "select-multiple" : "select";
  if (el instanceof HTMLInputElement) return el.type;
  return el.tagName.toLowerCase();
}

function isRestorable(el: Element): boolean {
  if (
    !(el instanceof HTMLInputElement) &&
    !(el instanceof HTMLTextAreaElement) &&
    !(el instanceof HTMLSelectElement)
  ) {
    return false;
  }
  return !UNRESTORABLE.has(elementType(el));
}

/** Read every restorable control in the form, in document order. */
export function snapshotForm(form: HTMLFormElement): FieldSnapshot[] {
  const snapshot: FieldSnapshot[] = [];
  const elements = Array.from(form.elements);

  for (let index = 0; index < elements.length; index += 1) {
    const el = elements[index];
    if (!isRestorable(el)) continue;
    const type = elementType(el);
    snapshot.push({
      index,
      name: (el as HTMLInputElement).name ?? "",
      type,
      value: (el as HTMLInputElement).value,
      checked: el instanceof HTMLInputElement ? el.checked : false,
      selected:
        type === "select-multiple"
          ? Array.from((el as HTMLSelectElement).selectedOptions).map((o) => o.value)
          : null,
    });
  }

  return snapshot;
}

/**
 * Put a snapshot back.
 *
 * Matches on position, then checks that the name and type still agree before
 * writing. A failed submit can re-render the form with a field added or
 * removed, and writing a phone number into a date field because the indices
 * shifted would be worse than the reset this exists to undo.
 *
 * Returns how many fields it restored, so a test can tell "nothing needed
 * doing" apart from "nothing matched".
 */
export function restoreForm(form: HTMLFormElement, snapshot: FieldSnapshot[]): number {
  const elements = Array.from(form.elements);
  let restored = 0;

  for (const field of snapshot) {
    const el = elements[field.index];
    if (!el || !isRestorable(el)) continue;
    if ((el as HTMLInputElement).name !== field.name) continue;
    if (elementType(el) !== field.type) continue;

    if (field.type === "select-multiple" && el instanceof HTMLSelectElement) {
      const wanted = new Set(field.selected ?? []);
      for (const option of Array.from(el.options)) option.selected = wanted.has(option.value);
      restored += 1;
      continue;
    }

    if ((field.type === "checkbox" || field.type === "radio") && el instanceof HTMLInputElement) {
      if (el.checked !== field.checked) el.checked = field.checked;
      restored += 1;
      continue;
    }

    if ((el as HTMLInputElement).value !== field.value) {
      (el as HTMLInputElement).value = field.value;
    }
    restored += 1;
  }

  return restored;
}
