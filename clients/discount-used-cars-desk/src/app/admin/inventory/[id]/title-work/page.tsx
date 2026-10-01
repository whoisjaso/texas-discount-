import Link from "next/link";
import { notFound } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react/ssr";
import AdminDataNotice from "@/components/admin/AdminDataNotice";
import TitleWorkChecklist from "@/components/admin/TitleWorkChecklist";
import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { loadTitleWork } from "@/lib/vehicles/title-work-load";
import { dealership } from "@/lib/dealership-config";
import { TITLE_STATUS_LABELS, isTitleStatus, type TitleStatus } from "@/lib/vehicles/title-status";
import type { TitleWorkRow } from "@/lib/vehicles/title-path";

export const metadata = { title: `Title Work - ${dealership.shortName} Auto` };
export const dynamic = "force-dynamic";

/**
 * One salvage car's path to a rebuilt title.
 *
 * The screen the Start Sale refusal opens. The steps are the path in
 * `title-path.ts`; the rows are what has been done, by whom, when. The last
 * step is not a tick: it is the county's title arriving, and pressing it
 * changes the car's verified status so the sale can begin.
 */
export default async function TitleWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  type VehicleRow = { id: string; year: number | null; make: string | null; model: string | null; vin: string | null; title_status: string | null };
  let vehicle: VehicleRow | null = null;
  let rows: TitleWorkRow[] = [];
  let error: string | null = null;
  try {
    const supabase = await createAdminDataClient();
    const { data, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id, year, make, model, vin, title_status")
      .eq("id", id)
      .maybeSingle();
    if (vehicleError) throw vehicleError;
    vehicle = data as VehicleRow | null;
    if (vehicle) {
      // With the files that prove each step, signed for this screen.
      rows = await loadTitleWork(id);
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Could not load the car.";
  }

  if (!error && !vehicle) notFound();
  const car: VehicleRow | null = vehicle;

  const rawStatus = car?.title_status;
  const status: TitleStatus = isTitleStatus(rawStatus) ? rawStatus : "unknown";
  const name = [car?.year, car?.make, car?.model].filter(Boolean).join(" ") || "This vehicle";

  return (
    <div className="ed-admin mx-auto w-full max-w-3xl px-5 py-8 md:px-8 md:py-12">
      <Link href="/admin/inventory/title-status" className="ed-body inline-flex items-center gap-1 text-[color:var(--tj-muted)]">
        <CaretLeft size={14} weight="regular" aria-hidden="true" />
        Title Work
      </Link>

      <div className="ed-sale-head mt-4">
        <h1 className="ed-admin-title">{name}</h1>
      </div>
      <p className="ed-fine mt-2 text-[color:var(--tj-muted)]">
        {car?.vin ? `VIN ${car.vin.toUpperCase()} · ` : ""}
        {TITLE_STATUS_LABELS[status]}
      </p>

      {error ? (
        <div className="mt-8">
          <AdminDataNotice message={error} />
        </div>
      ) : status === "rebuilt_salvage" ? (
        <div className="ed-admin-panel mt-8 px-6 py-10">
          <p className="ed-body text-[color:var(--tj-ink)]">
            This car is on a rebuilt salvage title in our name. It can be sold; every sale carries the rebuilt
            disclosure on its own.
          </p>
          <p className="ed-fine mt-3 text-[color:var(--tj-muted)]">
            <Link href="/admin/sales/new" className="underline underline-offset-2">Start A Sale</Link>
          </p>
        </div>
      ) : status !== "salvage_unrebuilt" ? (
        <div className="ed-admin-panel mt-8 px-6 py-10">
          <p className="ed-body text-[color:var(--tj-ink)]">
            Title work is for a car on a salvage title. This one is marked {TITLE_STATUS_LABELS[status].toLowerCase()}.
          </p>
          <p className="ed-fine mt-3 text-[color:var(--tj-muted)]">
            <Link href="/admin/inventory/title-status" className="underline underline-offset-2">Mark the title status</Link>
          </p>
        </div>
      ) : (
        <>
          <p className="ed-body mt-4 max-w-[60ch] text-[color:var(--tj-muted)]">
            A salvage title cannot be assigned to a buyer. It becomes a rebuilt salvage title in our name first, at
            the county tax office, and then the car sells like any other, with its disclosure.
          </p>
          <TitleWorkChecklist vehicleId={car?.id ?? id} rows={rows} />
        </>
      )}
    </div>
  );
}
