"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { searchDestinations, type AdminDestination } from "@/lib/admin/destinations";

/**
 * Everywhere, one keystroke away.
 *
 * This is what a desk deserves that a phone cannot have: a keyboard. The
 * counter runs this all day on a real screen, and the fastest tools give a
 * daily operator a way past the navigation rather than a bigger navigation.
 *
 * Press Cmd+K, type three letters, press Return. Any screen in the product,
 * from any other screen, without reading a menu. It costs the interface
 * nothing when it is closed, which is the point: desktop gets more power here
 * without the screen getting busier.
 *
 * Typing matches the name first, then what the thing is for, then the words a
 * person actually reaches for. "plates" finds Form 130-U. "owed" finds
 * Payments. Nobody has to learn our vocabulary to use the search.
 */

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => searchDestinations(query), [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCursor(0);
  }, []);

  const go = useCallback(
    (destination: AdminDestination | undefined) => {
      if (!destination) return;
      close();
      router.push(destination.href);
    },
    [close, router],
  );

  // Cmd+K anywhere, and the slash key for the hand already on the keyboard.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.key === "/" && !typing && !open) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape and the backdrop mean the same thing.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const cancel = (event: Event) => {
      event.preventDefault();
      close();
    };
    dialog.addEventListener("cancel", cancel);
    return () => dialog.removeEventListener("cancel", cancel);
  }, [close]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.children[cursor] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function onInputKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => (results.length === 0 ? 0 : (c + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) =>
        results.length === 0 ? 0 : (c - 1 + results.length) % results.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[cursor]);
    }
  }

  return (
    <>
      {/* For the hand on the mouse. Quiet, and only where there is room.
          Exactly one of these is mounted, in the rail. A second copy in the
          shell meant two dialogs both answered Cmd+K and both opened. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ed-palette-open"
        aria-label="Search everything"
      >
        <MagnifyingGlass size={14} weight="regular" aria-hidden="true" />
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>

      <dialog ref={dialogRef} className="ed-palette" aria-label="Go to">
        {open ? (
          <div className="ed-palette-body">
            <div className="ed-palette-field">
              <MagnifyingGlass size={16} weight="regular" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCursor(0);
                }}
                onKeyDown={onInputKey}
                placeholder="Go to"
                aria-label="Go to"
                aria-controls="ed-palette-list"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {results.length === 0 ? (
              <p className="ed-palette-empty">Nothing by that name.</p>
            ) : (
              <ul id="ed-palette-list" ref={listRef} className="ed-palette-list" role="listbox">
                {results.map((destination, index) => (
                  <li key={destination.href} role="option" aria-selected={index === cursor}>
                    <button
                      type="button"
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => go(destination)}
                      className={`ed-palette-row${index === cursor ? " is-on" : ""}`}
                      tabIndex={-1}
                    >
                      <span className="ed-palette-label">{destination.label}</span>
                      <span className="ed-palette-group">{destination.group}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </dialog>

    </>
  );
}
