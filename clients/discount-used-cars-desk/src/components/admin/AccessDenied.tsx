/**
 * The screen a role does not open, said inside the desk's own chrome.
 *
 * The heading is a heading, so it is in Title Case like every other one on
 * the desk; it used to be a sentence ("This screen is not assigned to this
 * role.") that the title-casing helper leaves alone because it reads as prose.
 */
export const ACCESS_DENIED_HEADING = "This Screen Is Not Part Of Your Role";

export default function AccessDenied() {
  return (
    <section className="px-4 py-8 md:px-8 md:py-10" data-access-denied="">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[color:var(--tj-line)] bg-[color:var(--tj-surface)] p-5 md:p-8">
        <p className="tj-ui-label text-[11px] font-semibold text-[color:var(--tj-copper)]">Permission Needed</p>
        <h1 className="mt-3 text-2xl font-semibold text-[color:var(--tj-ink)] md:text-3xl">{ACCESS_DENIED_HEADING}</h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-[color:var(--tj-muted)]">
          Ask an owner to approve the account or change the role. The dashboard will only show the tools this person is
          allowed to use.
        </p>
      </div>
    </section>
  );
}
