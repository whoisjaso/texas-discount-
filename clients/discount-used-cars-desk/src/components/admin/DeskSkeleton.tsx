/**
 * What an admin page looks like while it is still coming.
 *
 * Every route under /admin is force-dynamic against Supabase, so a tap has
 * real latency behind it. Without this the interface simply does not respond
 * until the server answers, which reads as a broken button rather than a slow
 * one.
 *
 * It deliberately mirrors the shape every desk page shares: a title, a
 * statement, an action, then a ruled index. Matching the shape means nothing
 * moves when the real content arrives.
 */
export default function DeskSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="ed-admin px-5 py-8 md:px-10 md:py-14" aria-busy="true">
      <div className="mx-auto w-full max-w-[820px]">
        <span className="sr-only" role="status">
          Loading
        </span>

        <div className="ed-skel h-9 w-[180px] md:h-11 md:w-[220px]" />

        <div className="mt-8 md:mt-10">
          <div className="ed-skel h-7 w-[74%] max-w-[420px] md:h-9" />
          <div className="ed-skel mt-3 h-4 w-[52%] max-w-[300px]" />
          <div className="ed-skel mt-6 h-11 w-[150px] rounded-[9px]" />
        </div>

        <div className="mt-12 border-t border-[color:var(--tj-line)] md:mt-16">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-6 border-b border-[color:var(--tj-line)] py-[22px]"
            >
              <div className="min-w-0 flex-1">
                <div
                  className="ed-skel h-5"
                  style={{ width: `${34 - i * 3}%`, minWidth: 96 }}
                />
                <div
                  className="ed-skel mt-2.5 h-3.5"
                  style={{ width: `${62 - i * 4}%`, minWidth: 140 }}
                />
              </div>
              <div className="ed-skel h-3.5 w-[74px] shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
