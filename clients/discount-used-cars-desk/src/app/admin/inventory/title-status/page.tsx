import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/ssr";
import AdminDataNotice from "@/components/admin/AdminDataNotice";
import TitleStatusList, { type UnverifiedVehicle } from "./TitleStatusList";
import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { dealership } from "@/lib/dealership-config";

export const metadata = { title: `Title Status - ${dealership.shortName} Auto` };
export const dynamic = "force-dynamic";

/**
 * The resolve screen the Start Sale gate points at.
 *
 * Every vehicle whose title status is still unverified, one row each, with
 * the answer a single tap away. This exists so the hard block on unknown
 * titles costs five seconds per car instead of a walk back to a filing
 * cabinet mid-sale, and so the marking is done by somebody standing in
 * inventory authority rather than guessed at the sales desk.
 */
type SalvageVehicle = { id: string; year: number | null; make: string | null; model: string | null; vin: string | null };

async function getUnverified(): Promise<{
  vehicles: UnverifiedVehicle[];
  salvage: SalvageVehicle[];
  verifiedCount: number;
  error: string | null;
}> {
  try {
    const supabase = await createAdminDataClient();
    const [{ data, error }, { count }, { data: salvageRows }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, year, make, model, vin, title_type, status")
        .eq("title_status", "unknown")
        .order("make", { ascending: true })
        .order("model", { ascending: true }),
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .neq("title_status", "unknown"),
      // Salvage cars on their way to a rebuilt title: the second list here,
      // because the person marking titles is the person walking that path.
      supabase
        .from("vehicles")
        .select("id, year, make, model, vin")
        .eq("title_status", "salvage_unrebuilt")
        .order("make", { ascending: true }),
    ]);
    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<{
      id: string;
      year: number | null;
      make: string | null;
      model: string | null;
      vin: string | null;
      title_type: string | null;
      status: string | null;
    }>;

    return {
      vehicles: rows.map((row) => ({
        id: row.id,
        year: row.year,
        make: row.make,
        model: row.model,
        vin: row.vin,
        rawTitleType: row.title_type,
        status: row.status,
      })),
      salvage: ((salvageRows ?? []) as unknown as SalvageVehicle[]),
      verifiedCount: count ?? 0,
      error: null,
    };
  } catch (error) {
    return {
      vehicles: [],
      salvage: [],
      verifiedCount: 0,
      error:
        error instanceof Error
          ? error.message
          : "Could not load the vehicles. Try again in a moment.",
    };
  }
}

export default async function TitleStatusPage() {
  const { vehicles, salvage, verifiedCount, error } = await getUnverified();

  return (
    <div className="ed-admin mx-auto w-full max-w-5xl px-5 py-8 md:px-8 md:py-12">
      <Link
        href="/admin/inventory"
        className="ed-body inline-flex items-center gap-1 text-[color:var(--tj-muted)]"
      >
        <CaretLeft size={14} weight="regular" aria-hidden="true" />
        Cars
      </Link>

      <div className="ed-sale-head mt-4">
        <h1 className="ed-admin-title">Title Status</h1>
      </div>

      <p className="ed-body mt-3 max-w-[62ch] text-[color:var(--tj-muted)]">
        A car cannot start a sale until its title is verified. Mark what the
        paper says. The answer follows the vehicle everywhere after that, and a
        rebuilt title brings its written disclosure with it on its own.
      </p>

      {error ? (
        <div className="mt-8">
          <AdminDataNotice message={error} />
        </div>
      ) : vehicles.length === 0 ? (
        <div className="ed-admin-panel mt-8 px-6 py-14 text-center">
          <p className="ed-body text-[color:var(--tj-muted)]">
            Every car on the lot has a verified title.
            {verifiedCount > 0 ? ` All ${verifiedCount} of them.` : ""}
          </p>
          <p className="ed-fine mt-2 text-[color:var(--tj-muted)]">
            A new car lands here only if it arrives without one.
          </p>
        </div>
      ) : (
        <>
          <p className="ed-fine mt-8 text-[color:var(--tj-muted)]">
            {vehicles.length === 1
              ? "One car waiting."
              : `${vehicles.length} cars waiting.`}
          </p>
          <TitleStatusList vehicles={vehicles} />
        </>
      )}

      {!error && salvage.length > 0 ? (
        <section className="mt-12" aria-labelledby="salvage-heading">
          <h2 id="salvage-heading" className="ed-onboard-h2">Salvage Titles, On Their Way</h2>
          <p className="ed-fine mt-2 max-w-[60ch] text-[color:var(--tj-muted)]">
            A salvage title becomes a rebuilt salvage title in our name before the car can be sold. Each car has its
            own checklist.
          </p>
          <ul className="mt-4 flex list-none flex-col gap-2 p-0">
            {salvage.map((car) => (
              <li key={car.id} className="ed-doc-row">
                <span className="min-w-0 flex-1">
                  <span className="ed-doc-title block">
                    {[car.year, car.make, car.model].filter(Boolean).join(" ") || "Untitled vehicle"}
                  </span>
                  <span className="ed-fine block text-[color:var(--tj-muted)]">
                    {car.vin ? `VIN ${car.vin.slice(-6).toUpperCase()}` : "No VIN on file"}
                  </span>
                </span>
                <Link href={`/admin/inventory/${car.id}/title-work`} className="tj-action-base tj-action-secondary tj-action-sm">
                  Title Work
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
