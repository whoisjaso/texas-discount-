"use client";

import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { tapHaptic } from "@/lib/haptics";
import "@/styles/hold-confirm.css";

export const CONFIRM_HOLD_MS = 1200;

export type HoldConfirmLabels = {
  hold: string;
  holding: string;
  release: string;
  preparing: string;
  ready: string;
  hint: string;
};

type Press = { kind: "pointer" | "keyboard" | "assistive"; started: number; pointerId?: number; key?: string };

/** The full hold arms the action. Releasing inside the button commits it. */
export default function HoldToConfirmButton({ labels, confirm, onConfirm, className, buttonRef }: {
  labels: HoldConfirmLabels;
  confirm: string;
  onConfirm: () => void;
  className: string;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const hintId = useId();
  const element = useRef<HTMLButtonElement>(null);
  useImperativeHandle(buttonRef, () => element.current!);
  const active = useRef<Press | null>(null);
  const frame = useRef<number | null>(null);
  const committed = useRef(false);
  const [progress, setProgress] = useState(0);
  const [kind, setKind] = useState<Press["kind"] | null>(null);

  const reset = useCallback(() => {
    active.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setProgress(0);
    setKind(null);
  }, []);

  useEffect(() => {
    // Pointer cancellation alone does not suppress a touch's compatibility
    // click after a dialog disappears. Cancel that default at its source.
    const button = element.current;
    const touchStart = (event: TouchEvent) => event.preventDefault();
    button?.addEventListener("touchstart", touchStart, { passive: false });
    const hidden = () => { if (document.hidden) reset(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") reset(); };
    window.addEventListener("blur", reset);
    window.addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      button?.removeEventListener("touchstart", touchStart);
      active.current = null;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      window.removeEventListener("blur", reset);
      window.removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [reset]);

  function start(press: Omit<Press, "started">) {
    if (committed.current || active.current) return;
    active.current = { ...press, started: performance.now() };
    setKind(press.kind);
    setProgress(0);
    tapHaptic();
    const tick = () => {
      if (!active.current) return;
      const next = Math.min(100, Math.floor((performance.now() - active.current.started) / CONFIRM_HOLD_MS * 100));
      setProgress(next);
      if (next < 100) frame.current = requestAnimationFrame(tick);
      else frame.current = null;
    };
    frame.current = requestAnimationFrame(tick);
  }

  function finish() {
    // Time alone cannot confirm. The user must have seen the completed state.
    if (!active.current || progress < 100 || committed.current) { reset(); return; }
    committed.current = true;
    reset();
    tapHaptic(8);
    onConfirm();
  }

  function inside(button: HTMLButtonElement, x: number, y: number) {
    const box = button.getBoundingClientRect();
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  }

  const ready = progress === 100;
  const text = ready ? kind === "assistive" ? confirm : labels.release
    : kind === "assistive" ? labels.preparing : kind ? labels.holding : labels.hold;

  return <>
    <button
      ref={element}
      type="button"
      className={`${className} ed-hold-confirm`}
      data-confirm-hold
      data-hold-ms={CONFIRM_HOLD_MS}
      data-hold-progress={progress}
      data-hold-ready={ready ? "true" : "false"}
      aria-describedby={hintId}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0 || active.current) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        start({ kind: "pointer", pointerId: event.pointerId });
      }}
      onPointerMove={event => {
        if (active.current?.kind === "pointer" && active.current.pointerId === event.pointerId && !inside(event.currentTarget, event.clientX, event.clientY)) reset();
      }}
      onPointerLeave={event => { if (active.current?.kind === "pointer" && active.current.pointerId === event.pointerId) reset(); }}
      onPointerCancel={reset}
      onLostPointerCapture={() => { if (active.current?.kind === "pointer") reset(); }}
      onPointerUp={event => {
        if (active.current?.kind !== "pointer" || active.current.pointerId !== event.pointerId) return;
        event.preventDefault();
        if (inside(event.currentTarget, event.clientX, event.clientY)) finish();
        else reset();
      }}
      onKeyDown={event => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (event.repeat || active.current) return;
        start({ kind: "keyboard", key: event.key });
      }}
      onKeyUp={event => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (active.current?.kind === "keyboard" && active.current.key === event.key) finish();
      }}
      onBlur={reset}
      onContextMenu={event => event.preventDefault()}
      onClick={event => {
        event.preventDefault();
        // Screen-reader/switch activation has no down/up pair. Offer two
        // deliberate activations with the same elapsed hold, never auto-save.
        if (event.detail !== 0 || committed.current) return;
        if (active.current?.kind === "assistive") { if (ready) finish(); }
        else if (!active.current) start({ kind: "assistive" });
      }}
    >
      <span className="ed-hold-confirm-fill" aria-hidden="true" style={{ scale: `${progress / 100} 1` }} />
      <span className="ed-hold-confirm-label">{text}</span>
      <span className="ed-hold-confirm-value" aria-hidden="true">{progress}%</span>
    </button>
    <span id={hintId} className="sr-only">{labels.hint}</span>
    <span className="sr-only" role="status">{ready ? labels.ready : ""}</span>
  </>;
}
