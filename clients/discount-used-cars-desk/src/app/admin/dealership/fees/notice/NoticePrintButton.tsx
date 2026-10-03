"use client";

/** Prints the posted notice; hidden on paper. */
export default function NoticePrintButton() {
  return (
    <button type="button" className="tj-action-base tj-action-primary tj-action-md" onClick={() => window.print()}>
      Print The Notice
    </button>
  );
}
