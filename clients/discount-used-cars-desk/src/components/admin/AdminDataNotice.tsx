import Link from "next/link";
import { AdminCard } from "@/components/admin/ui";
import { toTitleCaseDisplay } from "@/lib/display/title-case";

export default function AdminDataNotice({
  label = "Live Data Required",
  title = "Supabase backend not connected",
  message = "This screen is wired for live Supabase data only. Configure the Supabase environment variables locally and restart the dev server to load records.",
  action,
}: {
  label?: string;
  title?: string;
  message?: string;
  /** One way to fix it, when the person reading can fix it themselves. */
  action?: { href: string; label: string };
}) {
  return (
    <AdminCard className="px-5 py-8 text-center">
      <p className="tj-ui-label text-[11px] font-semibold text-[color:var(--tj-copper)]">
        {label}
      </p>
      <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl text-[color:var(--tj-ink)]">
        {toTitleCaseDisplay(title)}
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[color:var(--tj-muted)]">
        {toTitleCaseDisplay(message)}
      </p>
      {action ? (
        <Link
          href={action.href}
          className="tj-action-base tj-action-primary tj-action-md mt-5 inline-flex"
        >
          {action.label}
        </Link>
      ) : null}
    </AdminCard>
  );
}
