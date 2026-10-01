"use client";

import { useState, useTransition } from "react";
import { Check } from "@phosphor-icons/react";
import { setVehicleTitleStatus } from "@/lib/actions/title-status";
import {
  TITLE_STATUS_LABELS,
  type TitleStatus,
} from "@/lib/vehicles/title-status";

export type UnverifiedVehicle = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  /** The old free-text field, shown as a hint at what somebody once typed. */
  rawTitleType: string | null;
  status: string | null;
};

/**
 * One row per unverified car, the answer one tap away.
 *
 * The four buttons are the four answers a person holding the title can give.
 * A marked row stays where it is and turns into its answer rather than the
 * screen refetching underneath the work, so going down a long lot reads as
 * crossing things off a list.
 */
const CHOICES: TitleStatus[] = [
  "clean",
  "rebuilt_salvage",
  "bonded",
  "salvage_unrebuilt",
];

function carName(v: UnverifiedVehicle): string {
  const parts = [v.year, v.make, v.model].filter(Boolean);
  return parts.length ? parts.join(" ") : "Untitled vehicle";
}

export default function TitleStatusList({
  vehicles,
}: {
  vehicles: UnverifiedVehicle[];
}) {
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, TitleStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function mark(vehicle: UnverifiedVehicle, status: TitleStatus) {
    setSaving(vehicle.id);
    setErrors((prior) => {
      const next = { ...prior };
      delete next[vehicle.id];
      return next;
    });
    startTransition(async () => {
      const result = await setVehicleTitleStatus({
        vehicleId: vehicle.id,
        status,
        evidence: "Marked on the title status screen",
      });
      setSaving(null);
      if (result.success) {
        setDone((prior) => ({ ...prior, [vehicle.id]: result.status }));
      } else {
        setErrors((prior) => ({ ...prior, [vehicle.id]: result.error }));
      }
    });
  }

  return (
    <ul className="mt-3 flex list-none flex-col gap-3 p-0">
      {vehicles.map((vehicle) => {
        const marked = done[vehicle.id];
        const busy = saving === vehicle.id;
        return (
          <li key={vehicle.id}>
            <div className="ed-doc-row !items-start !flex-col sm:!flex-row sm:!items-center">
              <span
                className="ed-doc-mark"
                data-state={marked ? "done" : "open"}
                aria-hidden="true"
              >
                {marked ? <Check size={14} weight="bold" /> : null}
              </span>

              <span className="min-w-0 flex-1">
                <span className="ed-doc-title block">{carName(vehicle)}</span>
                <span className="ed-fine block text-[color:var(--tj-muted)]">
                  {vehicle.vin
                    ? `VIN ${vehicle.vin.slice(-6).toUpperCase()}`
                    : "No VIN on file"}
                  {vehicle.rawTitleType
                    ? ` · once typed in as "${vehicle.rawTitleType}"`
                    : ""}
                </span>
              </span>

              {marked ? (
                <span
                  role="status"
                  className="ed-body shrink-0 text-[color:var(--tj-ink)]"
                >
                  Marked: {TITLE_STATUS_LABELS[marked]}
                </span>
              ) : (
                <span className="flex flex-wrap gap-2">
                  {CHOICES.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      disabled={busy}
                      onClick={() => mark(vehicle, choice)}
                      className="tj-action-base tj-action-ghost tj-action-sm"
                    >
                      {TITLE_STATUS_LABELS[choice]}
                    </button>
                  ))}
                </span>
              )}
            </div>

            {errors[vehicle.id] ? (
              <p role="alert" className="ed-start-error mt-2">
                {errors[vehicle.id]}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
