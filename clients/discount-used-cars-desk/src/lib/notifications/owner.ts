import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone, sendSMS } from "@/lib/sms";

// No owner phone is on file; alerts go only to ADMIN_PHONE when it is set.
const DEFAULT_OWNER_PHONE: string | null = null;

interface VehicleParts {
  year: string;
  make: string;
  model: string;
}

interface OwnerDocumentNotificationInput {
  agreementId: string;
  customerName: string | null;
  vehicleDescription: string | null;
  signedAt: string;
  isRenewal: boolean;
  vehicle?: {
    year?: number | string | null;
    make?: string | null;
    model?: string | null;
  } | null;
}

function ownerPhone(): string | null {
  const raw =
    process.env.OWNER_NOTIFICATION_PHONE ||
    process.env.ADMIN_NOTIFY_PHONE ||
    DEFAULT_OWNER_PHONE;
  return raw ? normalizePhone(raw) : null;
}

function customerLabel(name: string | null): string {
  const cleaned = name?.trim();
  return cleaned || "Unknown customer";
}

function signedTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function vehicleParts(input: OwnerDocumentNotificationInput): VehicleParts {
  const fromVehicle = {
    year: input.vehicle?.year ? String(input.vehicle.year).trim() : "",
    make: input.vehicle?.make?.trim() ?? "",
    model: input.vehicle?.model?.trim() ?? "",
  };

  if (fromVehicle.year && fromVehicle.make && fromVehicle.model) {
    return fromVehicle;
  }

  const description = input.vehicleDescription?.replace(/\s+/g, " ").trim() ?? "";
  const match = description.match(/\b((?:19|20)\d{2})\b\s+([A-Za-z]+)\s+(.+)/);
  if (match) {
    return {
      year: fromVehicle.year || match[1],
      make: fromVehicle.make || match[2],
      model: fromVehicle.model || match[3],
    };
  }

  return {
    year: fromVehicle.year || "",
    make: fromVehicle.make || "",
    model: fromVehicle.model || description || "vehicle",
  };
}

export function buildOwnerDocumentNotification(
  input: OwnerDocumentNotificationInput,
): string {
  const name = customerLabel(input.customerName);
  const vehicle = vehicleParts(input);
  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(" ");
  const action = input.isRenewal
    ? "has finished renewing"
    : "has finished signing for the first time";

  return `${name} ${action} ${vehicleLabel}. Signed: ${signedTimeLabel(input.signedAt)}.`;
}

export async function notifyOwnerDocumentSigned(
  supabase: SupabaseClient,
  input: OwnerDocumentNotificationInput,
): Promise<{ ok: boolean; error?: string }> {
  let to: string;
  try {
    const phone = ownerPhone();
    if (!phone) return { ok: false, error: "No owner phone is configured." };
    to = phone;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Owner phone is invalid.",
    };
  }

  const body = buildOwnerDocumentNotification(input);
  const result = await sendSMS(to, body);

  try {
    await supabase.from("sms_messages").insert({
      customer_id: null,
      direction: "outbound",
      body,
      from_number: process.env.TELNYX_PHONE_NUMBER || "",
      to_number: to,
      telnyx_message_id: result.messageId ?? null,
      status: result.success ? "sent" : "failed",
      ai_generated: false,
    });
  } catch (error) {
    console.error(
      "[owner-notification] Failed to log owner SMS:",
      error instanceof Error ? error.message : error,
    );
  }

  return result.success
    ? { ok: true }
    : { ok: false, error: result.error ?? "Owner SMS failed." };
}
