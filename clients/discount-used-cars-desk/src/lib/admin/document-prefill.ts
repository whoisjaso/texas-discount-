import { readBuyerProfile } from "@/lib/admin/buyer-profile";
import {
  mailingOneLine,
  nameForForms,
  readBuyerId,
  settled,
  type AamvaAddress,
  type StoredName,
} from "@/lib/sales/buyer-id";
import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { getCustomerById } from "@/lib/supabase/queries/payments";

export interface VehicleDocumentPrefill {
  vin?: string;
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  mileage?: string;
  color?: string;
  bodyStyle?: string;
  plate?: string;
  price?: number;
  stockNumber?: string;
}

export interface BuyerDocumentPrefill {
  name?: string;
  phone?: string;
  email?: string;
  /** Driver licence or state ID, captured once when the sale is started. */
  idNumber?: string;
  address?: string;
  /**
   * The name in the boxes a state form prints, and where they came from.
   *
   * `typed` means a person filled them at intake, `split` means the deal only
   * ever stored one string and the surname was located by rule. A document
   * fills its boxes from these either way; a screen can warn on `split`.
   */
  nameParts?: StoredName;
  nameSource?: "typed" | "split" | "none";
  /** The address in the pieces a form has separate boxes for. */
  addressParts?: AamvaAddress;
}

export interface DocumentPrefill {
  customerId?: string;
  vehiclePrefill?: VehicleDocumentPrefill;
  buyerPrefill?: BuyerDocumentPrefill;
  /**
   * What a person confirmed off the licence at this deal.
   *
   * Held apart from `buyerPrefill` rather than merged early, so that the
   * question of what outranks what is answered in one place instead of by
   * whichever lookup happened to return first.
   */
  licencePrefill?: Partial<BuyerDocumentPrefill>;
}

async function getDealPrefill(dealId: string | undefined): Promise<DocumentPrefill> {
  if (!dealId) return {};
  const supabase = await createAdminDataClient();
  const { data, error } = await supabase
    .from("deals")
    .select(
      "vehicle_id, customer_id, step_data, vehicles(year, make, model, vin, trim, mileage, exterior_color, body_style, license_plate, sale_price, stock_number), customers(name, phone, email, profile_data)"
    )
    .eq("id", dealId)
    .single();

  if (error) throw error;
  if (!data) return {};

  const raw = data as unknown as {
    customer_id: string | null;
    step_data: unknown;
    vehicles: {
      year: number | null;
      make: string | null;
      model: string | null;
      vin: string | null;
      trim: string | null;
      mileage: number | null;
      exterior_color: string | null;
      body_style: string | null;
      license_plate: string | null;
      sale_price: number | null;
      stock_number: string | null;
    } | null;
    customers: {
      name: string | null;
      phone: string | null;
      email: string | null;
      profile_data: unknown;
    } | null;
  };

  const vehicle = raw.vehicles;
  const customer = raw.customers;
  const licence = readBuyerId(raw.step_data);

  return {
    customerId: raw.customer_id ?? undefined,
    vehiclePrefill: vehicle
      ? {
          vin: vehicle.vin ?? undefined,
          year: vehicle.year ? String(vehicle.year) : undefined,
          make: vehicle.make ?? undefined,
          model: vehicle.model ?? undefined,
          trim: vehicle.trim ?? undefined,
          mileage: vehicle.mileage != null ? String(vehicle.mileage) : undefined,
          color: vehicle.exterior_color ?? undefined,
          bodyStyle: vehicle.body_style ?? undefined,
          plate: vehicle.license_plate ?? undefined,
          price: vehicle.sale_price ?? undefined,
          stockNumber: vehicle.stock_number ?? undefined,
        }
      : undefined,
    buyerPrefill: customer
      ? {
          name: customer.name ?? undefined,
          phone: customer.phone ?? undefined,
          email: customer.email ?? undefined,
          ...readBuyerProfile(customer.profile_data),
        }
      : undefined,
    licencePrefill: confirmedFromLicence(licence),
  };
}

/**
 * The parts of a confirmed licence a document can use.
 *
 * Only non-null values are returned, so this layers over the customer record
 * without blanking fields the licence did not answer.
 */
function confirmedFromLicence(
  licence: ReturnType<typeof readBuyerId>,
): Partial<BuyerDocumentPrefill> {
  const prefill: Partial<BuyerDocumentPrefill> = {};

  const name = settled(licence.name);
  if (name) prefill.name = name;

  // The four boxes, typed where the deal has them. This is what stops the
  // power of attorney and the 130-U each guessing separately at the surname.
  const forForms = nameForForms(licence);
  if (forForms.source !== "none") {
    prefill.nameParts = forForms.parts;
    prefill.nameSource = forForms.source;
  }

  const idNumber = settled(licence.licenseNumber);
  if (idNumber) prefill.idNumber = idNumber;

  /**
   * Where post actually goes, not what is printed on the card.
   *
   * These differ often enough that treating them as one field is how plates
   * get lost: people move and licences lag. The mailing address is only used
   * once somebody has answered the question out loud, which is what
   * `mailingConfirmed` records. An unconfirmed mailing address is a box that
   * happens to be filled in, and using it here would defeat the gate.
   */
  const mailing = licence.mailingConfirmed ? mailingOneLine(licence) : null;
  const address = mailing ?? settled(licence.address);
  if (address) prefill.address = address;

  // The same address in pieces, for the forms that print four boxes. Held to
  // the same confirmation gate as the line above.
  if (licence.mailingConfirmed) prefill.addressParts = licence.mailing;

  return prefill;
}

async function getCustomerPrefill(customerId: string | undefined): Promise<DocumentPrefill> {
  if (!customerId) return {};
  const supabase = await createAdminDataClient();
  const customer = await getCustomerById(supabase, customerId);
  if (!customer) return {};

  return {
    customerId: customer.id,
    buyerPrefill: {
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? undefined,
      ...readBuyerProfile(
        (customer as unknown as { profile_data?: unknown }).profile_data,
      ),
    },
  };
}

export async function getDocumentPrefill({
  dealId,
  customerId,
}: {
  dealId?: string;
  customerId?: string;
}): Promise<DocumentPrefill> {
  const [dealPrefill, customerPrefill] = await Promise.all([
    getDealPrefill(dealId),
    getCustomerPrefill(customerId),
  ]);

  /**
   * The confirmed licence outranks both records, and that is the point.
   *
   * Until this merge existed, somebody photographed a licence, read it, and
   * confirmed every value on the deal, and then retyped those same values into
   * the bill of sale, because documents prefilled from the customer row
   * instead. A customer row can be months old and was typed by hand. A
   * confirmed licence field was checked against the card at this deal.
   *
   * `settled()` returns the confirmed value and never the read one, so nothing
   * a machine merely guessed can arrive here. Everything below is something a
   * person looked at and agreed to.
   *
   * The customer lookup still wins over the deal's copy of the same customer,
   * because passing a customerId is an explicit choice of whose file to use.
   * The licence then overrides whichever of those was chosen.
   */
  const base = customerPrefill.buyerPrefill ?? dealPrefill.buyerPrefill;
  const merged: BuyerDocumentPrefill = { ...base, ...dealPrefill.licencePrefill };

  // An object of nothing but undefined is not a prefill. Callers test this for
  // truthiness to decide whether a deal carried anything worth showing.
  const anything = Object.values(merged).some((value) => value !== undefined);

  return {
    customerId: customerPrefill.customerId ?? dealPrefill.customerId,
    vehiclePrefill: dealPrefill.vehiclePrefill,
    buyerPrefill: anything ? merged : undefined,
  };
}
