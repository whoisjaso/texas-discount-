import { brand } from "@/lib/dealership-config";
import LoneStar from "@/components/site/shared/LoneStar";

/**
 * The royal cypher: the owner's Gothic triple-J monogram, delivered
 * 29 Aug 2026. Copper is the artwork's own color and belongs on paper
 * surfaces; cream carries dark surfaces (the homescreen header per the
 * owner: the cipher alone, never the full name); ink is for print,
 * because copper turns to mud on a photocopier.
 */

type Props = {
  /** Rendered height in px. Width follows the artwork's aspect. */
  height?: number;
  tone?: "copper" | "cream" | "ink";
  className?: string;
  /** Accessible name. Omit when adjacent visible text already names it. */
  title?: string;
};

/** The delivered artwork's intrinsic proportions (w:h). */
const ASPECT = 740 / 1122;
/** Vega's emblem (public/brand/vegas-logo-sm.png), width over height. */
const EMBLEM_ASPECT = 1285 / 1006;

export default function Monogram({
  height = 44,
  tone = "copper",
  className,
  title,
}: Props) {
  // Vega's has no monogram artwork, so the emblem stands in on screen. Print
  // (`ink`) keeps the lone star in ink: a photocopier turns the emblem to mud.
  const emblem = !brand.monogramArtwork[tone] && tone !== "ink" ? brand.logo : null;
  const src = brand.monogramArtwork[tone] || emblem;
  const width = Math.round(height * (emblem ? EMBLEM_ASPECT : ASPECT));
  if (!src) {
    return (
      <span className={className} role={title ? "img" : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}>
        <LoneStar size={Math.round(height * 0.72)} color={tone === "ink" ? "var(--tj-ink)" : "#d9a54e"} />
      </span>
    );
  }
  return (
    // Plain img: this renders in headers, loaders and print letterheads.
    // No inline display so consumers can hide/show responsively.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={width}
      height={height}
      alt={title ?? brand.full}
      className={className}
      style={{ width, height }}
    />
  );
}
