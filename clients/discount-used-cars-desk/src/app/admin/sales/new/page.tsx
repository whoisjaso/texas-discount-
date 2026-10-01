import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/ssr";
import AdminDataNotice from "@/components/admin/AdminDataNotice";
import StartSale, { type PickableVehicle } from "@/components/admin/StartSale";
import FunnelLocaleProvider from "@/components/admin/funnel/FunnelLocaleProvider";
import { getFunnelBundles } from "@/lib/sales/i18n";
import { resolveAdminLanguageWithUser } from "@/lib/admin/server-language";
import { createAdminDataClient } from "@/lib/supabase/admin-data";
import { dealership } from "@/lib/dealership-config";

export const metadata = { title: `Start A Sale - ${dealership.shortName} Auto` };
export const dynamic = "force-dynamic";

async function getSellableVehicles(): Promise<{
  vehicles: PickableVehicle[];
  error: string | null;
}> {
  try {
    const supabase = await createAdminDataClient();
    // Sold cars are finished. Offering one here would invite a second deal on
    // the same VIN.
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, year, make, model, vin, mileage, image_url, status, title_status")
      .neq("status", "Sold")
      .order("make", { ascending: true })
      .order("model", { ascending: true })
      .order("year", { ascending: true })
      .limit(200);

    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<{
      id: string;
      year: number | null;
      make: string | null;
      model: string | null;
      vin: string | null;
      mileage: number | null;
      image_url: string | null;
      title_status: string | null;
    }>;

    return {
      vehicles: rows.map((row) => ({
        id: row.id,
        year: row.year,
        make: row.make,
        model: row.model,
        vin: row.vin,
        mileage: row.mileage,
        imageUrl: row.image_url,
        titleStatus: row.title_status ?? null,
      })),
      error: null,
    };
  } catch (error) {
    return {
      vehicles: [],
      error:
        error instanceof Error
          ? error.message
          : "Could not load vehicles. Try again in a moment.",
    };
  }
}

export default async function StartSalePage() {
  const { vehicles, error } = await getSellableVehicles();
  const { lang, userId } = await resolveAdminLanguageWithUser();

  return (
    /* No page frame and no title. The flow carries its own header, because
       the question is the title and a second heading above it is furniture. */
    <>
      {error ? (
        <div className="ed-admin px-5 py-8 md:px-10 md:py-12">
          <Link href="/admin/sales" className="ed-back">
            <CaretLeft size={14} aria-hidden="true" />
            Sale
          </Link>
          <AdminDataNotice message={error} />
        </div>
      ) : (
        <FunnelLocaleProvider bundles={getFunnelBundles()} initial={lang} userId={userId}>
          <StartSale vehicles={vehicles} />
        </FunnelLocaleProvider>
      )}
    </>
  );
}
