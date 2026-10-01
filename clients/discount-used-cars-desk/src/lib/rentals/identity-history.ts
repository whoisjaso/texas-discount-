import type { SupabaseClient } from "@supabase/supabase-js";

type Json = Record<string, unknown>;

export interface RentalIdentityFields {
  renterAddress: string | null;
  renterLicense: string | null;
  coRenterName: string | null;
  coRenterAddress: string | null;
  coRenterPhone: string | null;
  coRenterEmail: string | null;
  coRenterLicense: string | null;
}

export interface RentalIdentityAgreementLike {
  portal_data?: unknown;
  buyer_address?: string | null;
  buyer_city?: string | null;
  buyer_state?: string | null;
  buyer_zip?: string | null;
  buyer_license?: string | null;
  co_buyer_license?: string | null;
}

interface RentalIdentityRow {
  id: string;
  state: string | null;
  status: string | null;
  signed_at: string | null;
  completed_at: string | null;
  completed_link: string | null;
  created_at: string;
  portal_data: Json | null;
  buyer_address: string | null;
  buyer_city: string | null;
  buyer_state: string | null;
  buyer_zip: string | null;
  buyer_license: string | null;
  co_buyer_license: string | null;
}

interface ResolveRentalIdentityInput {
  customerId?: string | null;
  buyerPhone?: string | null;
  excludeAgreementId?: string | null;
  beforeCreatedAt?: string | null;
  parentAgreementId?: string | null;
}

const EMPTY_IDENTITY: RentalIdentityFields = {
  renterAddress: null,
  renterLicense: null,
  coRenterName: null,
  coRenterAddress: null,
  coRenterPhone: null,
  coRenterEmail: null,
  coRenterLicense: null,
};

export function extractRentalIdentity(portalData: unknown): RentalIdentityFields {
  const cd = getPortalSection(portalData, "cd");
  return {
    renterAddress: cleanString(cd?.renterAddress),
    renterLicense: cleanString(cd?.renterLicense),
    coRenterName: cleanString(cd?.coRenterName),
    coRenterAddress: cleanString(cd?.coRenterAddress),
    coRenterPhone: cleanString(cd?.coRenterPhone),
    coRenterEmail: cleanString(cd?.coRenterEmail),
    coRenterLicense: cleanString(cd?.coRenterLicense),
  };
}

export function extractRentalIdentityFromAgreement(
  row: RentalIdentityAgreementLike,
): RentalIdentityFields {
  return fillMissingIdentity(extractRentalIdentity(row.portal_data), {
    ...EMPTY_IDENTITY,
    renterAddress: formatAddress(row),
    renterLicense: cleanString(row.buyer_license),
    coRenterLicense: cleanString(row.co_buyer_license),
  });
}

export function applyBlankRentalIdentityFallback<T extends Record<string, unknown>>(
  current: T,
  fallback: RentalIdentityFields,
): T & RentalIdentityFields {
  return {
    ...current,
    renterAddress: firstText(current.renterAddress, fallback.renterAddress),
    renterLicense: firstText(current.renterLicense, fallback.renterLicense),
    coRenterName: firstText(current.coRenterName, fallback.coRenterName),
    coRenterAddress: firstText(current.coRenterAddress, fallback.coRenterAddress),
    coRenterPhone: firstText(current.coRenterPhone, fallback.coRenterPhone),
    coRenterEmail: firstText(current.coRenterEmail, fallback.coRenterEmail),
    coRenterLicense: firstText(current.coRenterLicense, fallback.coRenterLicense),
  };
}

export async function resolvePriorRentalIdentity(
  supabase: SupabaseClient,
  input: ResolveRentalIdentityInput,
): Promise<RentalIdentityFields> {
  const rows = await loadPriorIdentityRows(supabase, input);
  let identity = { ...EMPTY_IDENTITY };

  for (const row of rows) {
    if (input.excludeAgreementId && row.id === input.excludeAgreementId) continue;
    if (
      input.beforeCreatedAt &&
      new Date(row.created_at).getTime() >= new Date(input.beforeCreatedAt).getTime()
    ) {
      continue;
    }
    if (!isUsableIdentitySource(row)) continue;
    identity = fillMissingIdentity(identity, extractRentalIdentityFromAgreement(row));
    if (hasCompleteCoreIdentity(identity)) break;
  }

  return identity;
}

async function loadPriorIdentityRows(
  supabase: SupabaseClient,
  input: ResolveRentalIdentityInput,
): Promise<RentalIdentityRow[]> {
  const rowsById = new Map<string, RentalIdentityRow>();

  if (input.parentAgreementId) {
    const { data } = await supabase
      .from("document_agreements")
      .select("id,state,status,signed_at,completed_at,completed_link,created_at,portal_data,buyer_address,buyer_city,buyer_state,buyer_zip,buyer_license,co_buyer_license")
      .eq("id", input.parentAgreementId)
      .maybeSingle<RentalIdentityRow>();
    if (data) rowsById.set(data.id, data);
  }

  if (input.customerId) {
    const { data } = await supabase
      .from("document_agreements")
      .select("id,state,status,signed_at,completed_at,completed_link,created_at,portal_data,buyer_address,buyer_city,buyer_state,buyer_zip,buyer_license,co_buyer_license")
      .eq("document_type", "rental")
      .eq("customer_id", input.customerId)
      .order("created_at", { ascending: false })
      .limit(25);
    for (const row of ((data ?? []) as RentalIdentityRow[])) {
      rowsById.set(row.id, row);
    }
  }

  if (!input.customerId && input.buyerPhone) {
    const { data } = await supabase
      .from("document_agreements")
      .select("id,state,status,signed_at,completed_at,completed_link,created_at,portal_data,buyer_address,buyer_city,buyer_state,buyer_zip,buyer_license,co_buyer_license")
      .eq("document_type", "rental")
      .eq("buyer_phone", input.buyerPhone)
      .order("created_at", { ascending: false })
      .limit(25);
    for (const row of ((data ?? []) as RentalIdentityRow[])) {
      rowsById.set(row.id, row);
    }
  }

  return Array.from(rowsById.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function fillMissingIdentity(
  current: RentalIdentityFields,
  candidate: RentalIdentityFields,
): RentalIdentityFields {
  return {
    renterAddress: firstText(current.renterAddress, candidate.renterAddress),
    renterLicense: firstText(current.renterLicense, candidate.renterLicense),
    coRenterName: firstText(current.coRenterName, candidate.coRenterName),
    coRenterAddress: firstText(current.coRenterAddress, candidate.coRenterAddress),
    coRenterPhone: firstText(current.coRenterPhone, candidate.coRenterPhone),
    coRenterEmail: firstText(current.coRenterEmail, candidate.coRenterEmail),
    coRenterLicense: firstText(current.coRenterLicense, candidate.coRenterLicense),
  };
}

function hasCompleteCoreIdentity(identity: RentalIdentityFields): boolean {
  return Boolean(identity.renterAddress && identity.renterLicense);
}

function isUsableIdentitySource(row: RentalIdentityRow): boolean {
  return (
    row.state === "signed" ||
    row.state === "completed" ||
    row.state === "active" ||
    row.status === "completed" ||
    row.status === "finalized" ||
    Boolean(row.signed_at || row.completed_at || row.completed_link)
  );
}

function getPortalSection(portalData: unknown, section: "cd"): Json | null {
  if (!portalData || typeof portalData !== "object") return null;
  const scoped = (portalData as Json)[section];
  return scoped && typeof scoped === "object" ? (scoped as Json) : null;
}

function formatAddress(row: RentalIdentityAgreementLike): string | null {
  const direct = cleanString(row.buyer_address);
  const city = cleanString(row.buyer_city);
  const state = cleanString(row.buyer_state);
  const zip = cleanString(row.buyer_zip);
  if (!direct) return null;
  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [direct, cityStateZip].filter(Boolean).join(", ");
}

function firstText(primary: unknown, fallback: unknown): string | null {
  return cleanString(primary) ?? cleanString(fallback);
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
