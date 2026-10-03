import type { GateReason } from "@/lib/vehicles/empty-weight/rules";

/** Every reason the gate can give; the copy test checks each has words. */
export const GATE_REASONS_FOR_COPY: readonly GateReason[] = [
  "pickup",
  "cargoVan",
  "incomplete",
  "heavyDuty",
  "bus",
  "classUnknown",
  "lowConfidence",
  "nearSixThousand",
] satisfies readonly GateReason[];
