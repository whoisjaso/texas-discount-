import Link from "next/link";

/**
 * A desk address that leads nowhere, said in the desk's own clothes.
 *
 * It used to be Next's default page: unstyled black on white, "404 | This
 * page could not be found.", with no way back but the browser's. Reached by
 * an old link, a typed address, or a sale or document that no longer exists.
 */
export const ADMIN_NOT_FOUND_HEADING = "This Page Is Not On The Desk";
export const ADMIN_NOT_FOUND_BACK = "Back To Handle A Sale";

export default function AdminNotFound() {
  return (
    <section className="px-4 py-8 md:px-8 md:py-10" data-admin-not-found="">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[color:var(--tj-line)] bg-[color:var(--tj-surface)] p-5 md:p-8">
        <p className="tj-ui-label text-[11px] font-semibold text-[color:var(--tj-copper)]">Not Found</p>
        <h1 className="mt-3 text-2xl font-semibold text-[color:var(--tj-ink)] md:text-3xl">{ADMIN_NOT_FOUND_HEADING}</h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-[color:var(--tj-muted)]">
          The link may be old, or the address mistyped. Nothing was changed.
        </p>
        <Link className="ed-btn ed-btn-dark mt-6 inline-flex" href="/admin/sales">
          {ADMIN_NOT_FOUND_BACK}
        </Link>
      </div>
    </section>
  );
}
