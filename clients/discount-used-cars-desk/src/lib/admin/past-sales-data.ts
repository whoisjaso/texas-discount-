import { createAdminDataClient } from "@/lib/supabase/admin-data";
import {
  buildPastSales,
  type PastDealRow,
  type PastSale,
  type SoldVehicleRow,
} from "@/lib/admin/past-sales";

/**
 * Cars this lot has sold, and who ran the sale.
 *
 * `/admin/sales` answers "what still owes something", so it lists only the
 * open ones. Nothing answered the other question: what did this lot sell, to
 * whom, and who at the desk handled it. On a two-person lot that second
 * question is asked constantly and out loud, and the only way to answer it was
 * to remember.
 *
 * Everyone's sales, not the signed-in person's. A dealership is one book.
 *
 * THE BOOK IS THE CARS, NOT THE DEALS. This read `deals` alone, and on the
 * live database that is five rows — while thirty-seven vehicles are marked
 * Sold, thirty of them carrying the buyer's name. A screen headed "Past Sales"
 * was saying "5 sales" and omitting thirty-four cars the lot had actually
 * sold, because those sales were never run through the deal flow. The count
 * was not merely incomplete; it was a wrong number in the largest type on the
 * page, and the answer to "who bought that car" was still in somebody's
 * memory, which is the one thing this screen exists to fix.
 *
 * So a sold car is a past sale, deal or no deal. The deal is attached when one
 * exists, and it supplies the two things a car record cannot: who at the desk
 * handled it, and a packet to print. A completed deal whose car is not marked
 * Sold still appears — that is a sale somebody made where the vehicle's status
 * was never updated, and dropping it would lose it.
 *
 * The merging is `buildPastSales`, which is pure and lives beside this. All
 * that happens here is the asking.
 */

/**
 * Every sale that is over, newest dated first.
 *
 * Capped rather than paged. A lot doing ten cars a month takes twenty years to
 * reach this ceiling, and a cap keeps the whole list in the browser, which is
 * what makes the search and the sorting instant. When a dealership outgrows it
 * the fix is paging, and the cap is where to notice.
 */
export async function getPastSales(limit = 500): Promise<PastSale[]> {
  const supabase = await createAdminDataClient();

  const [soldRes, dealsRes] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, year, make, model, vin, license_plate, buyer_name, date_sold")
      .eq("status", "Sold")
      .order("date_sold", { ascending: false })
      .limit(limit),
    supabase
      .from("deals")
      .select(
        "id, status, created_at, completed_at, created_by, vehicle_id, step_data, customers(name), vehicles(year, make, model, vin)",
      )
      .neq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (soldRes.error) throw soldRes.error;
  if (dealsRes.error) throw dealsRes.error;

  const sold = (soldRes.data ?? []) as unknown as SoldVehicleRow[];
  const rawDeals = (dealsRes.data ?? []) as unknown as Array<{
    id: string;
    created_at: string;
    completed_at: string | null;
    created_by: string | null;
    vehicle_id: string | null;
    step_data: unknown;
    customers: { name: string | null } | null;
    vehicles: {
      year: number | null;
      make: string | null;
      model: string | null;
      vin: string | null;
    } | null;
  }>;

  const deals: PastDealRow[] = rawDeals.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    completed_at: row.completed_at,
    created_by: row.created_by,
    vehicle_id: row.vehicle_id,
    plate: readPlate(row.step_data),
    customerName: row.customers?.name ?? null,
    vehicle: row.vehicles,
  }));

  /*
    One lookup for every name, rather than one per row.

    A hundred sales made by three people is three names. Fetching them per row
    would be a hundred round trips to learn three things.
  */
  const authorIds = [...new Set(deals.map((row) => row.created_by).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: members } = await supabase
      .from("team_members")
      .select("auth_user_id, full_name")
      .in("auth_user_id", authorIds);
    for (const raw of members ?? []) {
      const member = raw as unknown as { auth_user_id: string | null; full_name: string | null };
      if (member.auth_user_id && member.full_name?.trim()) {
        names.set(member.auth_user_id, member.full_name.trim());
      }
    }
  }

  return buildPastSales(sold, deals, names);
}

/** The plate, wherever the retired pipeline happened to leave it. */
function readPlate(stepData: unknown): string | null {
  if (!stepData || typeof stepData !== "object") return null;
  const seven = (stepData as Record<string, unknown>)["7"];
  if (!seven || typeof seven !== "object") return null;
  const plate = (seven as Record<string, unknown>).plate_number;
  return typeof plate === "string" && plate.trim() ? plate.trim() : null;
}
