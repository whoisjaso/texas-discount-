import type { DealBadge as Badge } from "@/lib/sales/deal-badge";

/**
 * The one line that says what the title lets this sale be.
 *
 * Drawn the same everywhere a deal is shown: a small capitals label with a
 * dot in the badge's tone, and the gloss under it where there is room. The
 * words come in as props so the bilingual corridor can hand over the
 * catalogue's and the English admin pages can hand over the badge's own.
 */
export default function DealBadge({
  badge,
  label,
  gloss,
  compact = false,
}: {
  badge: Pick<Badge, "key" | "tone">;
  label: string;
  gloss?: string;
  compact?: boolean;
}) {
  return (
    <p className="ed-deal-badge" data-tone={badge.tone} data-badge={badge.key} data-compact={compact ? "true" : "false"}>
      <span className="ed-deal-badge-label">
        <span className="ed-deal-badge-dot" aria-hidden="true" />
        {label}
      </span>
      {gloss && !compact ? <span className="ed-deal-badge-gloss">{gloss}</span> : null}
    </p>
  );
}
