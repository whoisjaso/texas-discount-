"use client";

import { useState } from "react";
import type { PaperworkOption } from "@/lib/sales/paperwork";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";

/**
 * Several taps, then Done: the systems a warranty covers, from the Buyers
 * Guide's own list. Stored as the keys, comma-separated, in the list's order.
 */
export default function MultiPickStep({
  options,
  current,
  pending,
  onDone,
}: {
  options: PaperworkOption[];
  current: string;
  pending: boolean;
  onDone: (value: string) => void;
}) {
  const { t } = useFunnel();
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(current.split(",").map((part) => part.trim()).filter(Boolean)),
  );
  const toggle = (value: string) =>
    setPicked((before) => {
      const next = new Set(before);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  const value = options.filter((option) => picked.has(option.value)).map((option) => option.value).join(",");

  return (
    <div className="ed-multi-pick">
      <div className="ed-multi-grid">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="ed-list-row ed-multi-row"
            aria-pressed={picked.has(option.value)}
            data-active={picked.has(option.value) ? "true" : undefined}
            disabled={pending}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="ed-btn ed-btn-dark ed-paper-next"
        disabled={pending || value === ""}
        onClick={() => onDone(value)}
      >
        {pending ? t.chrome.saving : t.chrome.done}
      </button>
    </div>
  );
}
