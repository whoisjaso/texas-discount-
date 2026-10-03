export const RENTAL_DOCUMENT_TYPES = [
  "rental",
  "rentalAgreement",
  "rental_agreement",
  "rental-agreement",
  "vehicleRental",
  "vehicle_rental",
  "coreconnectRental",
  "coreconnect_rental",
] as const;

const RENTAL_TYPE_KEYS = new Set(
  RENTAL_DOCUMENT_TYPES.map((type) => normalizeDocumentType(type)),
);

const DEALERSHIP_TYPE_KEYS = new Set(
  [
    "billOfSale",
    "financing",
    "form130U",
    "chargebackAcknowledgment",
  ].map((type) => normalizeDocumentType(type)),
);

export interface ContractClassificationInput {
  documentType?: string | null;
  title?: string | null;
  templateName?: string | null;
  sourcePath?: string | null;
  tags?: Array<string | null | undefined> | null;
  contentHints?: Array<string | null | undefined> | null;
}

function normalizeDocumentType(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

export type ContractWorkspace = "rental" | "dealership" | "unknown";

export function classifyContractWorkspace(
  input: string | null | undefined | ContractClassificationInput,
): ContractWorkspace {
  const evidence = collectClassificationEvidence(input);
  const normalized = evidence.map((value) => normalizeDocumentType(value)).filter(Boolean);
  const primary = normalized[0] ?? "";
  if (!primary) return "unknown";

  if (
    normalized.some((value) => RENTAL_TYPE_KEYS.has(value)) ||
    normalized.some((value) => value.includes("rental") || value.includes("rentals"))
  ) {
    return "rental";
  }
  if (
    normalized.some((value) => DEALERSHIP_TYPE_KEYS.has(value)) ||
    normalized.some((value) =>
      [
        "billofsale",
        "retailinstallment",
        "financing",
        "form130u",
        "chargeback",
        "dealership",
        "dealercontract",
      ].some((keyword) => value.includes(keyword)),
    )
  ) {
    return "dealership";
  }

  return "unknown";
}

function collectClassificationEvidence(
  input: string | null | undefined | ContractClassificationInput,
): string[] {
  if (typeof input === "string" || input == null) {
    return [input ?? ""];
  }

  return [
    input.documentType,
    input.title,
    input.templateName,
    input.sourcePath,
    ...(input.tags ?? []),
    ...(input.contentHints ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export function classifyDocumentType(
  documentType: string | null | undefined,
): ContractWorkspace {
  const normalized = normalizeDocumentType(documentType);
  if (!normalized) return "unknown";
  if (RENTAL_TYPE_KEYS.has(normalized) || normalized.includes("rental")) {
    return "rental";
  }
  if (DEALERSHIP_TYPE_KEYS.has(normalized)) {
    return "dealership";
  }
  return "unknown";
}

export function isRentalContractType(
  input: string | null | undefined | ContractClassificationInput,
): boolean {
  return classifyContractWorkspace(input) === "rental";
}

export function isDealershipContractType(
  input: string | null | undefined | ContractClassificationInput,
): boolean {
  const workspace = classifyContractWorkspace(input);
  return workspace === "dealership" || workspace === "unknown";
}
