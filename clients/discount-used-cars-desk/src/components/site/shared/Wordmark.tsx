/**
 * The wordmark. Vega's has an emblem but no wordmark artwork, so the name is
 * drawn as the public site sets it: "VEGA’S" in wide grotesk capitals. On
 * screen, `emblem` sets the emblem (`brand.logo`) beside it.
 *
 * For most of this product's life the mark was drawn as SVG text because
 * there was no logo, and "no crest is a complete answer". There is one
 * now, so this component became the single place it renders: every
 * consumer (site loaders, the menu, the admin sidebar, the login screen,
 * the document letterhead, the portals) picks it up from here.
 *
 * The image bakes in the AUTO INVESTMENT sub-line, so `withSubline` no
 * longer changes what renders; it is kept so call sites did not need to
 * change. `tone` still matters, differently than before: the gold reads
 * on dark and light surfaces alike, and a printed document must survive
 * a photocopier (DESIGN.md), so `tone="dark"`, the value light-surface
 * and print consumers already pass, serves the ink version.
 */

import { brand } from "@/lib/dealership-config";

type Props = {
  /** Rendered width in px. Height follows the image's aspect. */
  width?: number;
  /** `light` for dark surfaces (gold), `dark` for light/print (ink). */
  tone?: "light" | "dark";
  /** Kept for call-site compatibility; the sub-line is part of the mark. */
  withSubline?: boolean;
  className?: string;
  /** Accessible name. Omit when adjacent visible text already names it. */
  title?: string;
  /** Screen only: set the full-colour emblem beside the drawn name. */
  emblem?: boolean;
};

/** The delivered artwork's intrinsic proportions. */
const ASPECT = 1925 / 473;
/** Vega's emblem (public/brand/vegas-logo-sm.png), width over height. */
const EMBLEM_ASPECT = 1285 / 1006;

export default function Wordmark({
  width = 196,
  tone = "light",
  className,
  title,
  emblem = false,
}: Props) {
  const height = Math.round(width / ASPECT);
  const src = brand.wordmarkArtwork[tone];
  if (!src) {
    // No artwork on file: draw the name as the public site sets it, wide
    // capitals in the site's grotesk. Ink on print (`tone="dark"` reads the
    // ink role, which the black rail flips to white), white on dark screens.
    const ink = tone === "light" ? "#ffffff" : "var(--tj-ink)";
    const size = width / 7.2;
    const name = (
      <span className={emblem ? undefined : className} role={emblem ? undefined : "img"} aria-label={emblem ? undefined : title ?? brand.full}
        style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", minWidth: width, color: ink }}>
        <span style={{ display: "inline-block", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: size, lineHeight: 1, letterSpacing: "0.42em", marginRight: "-0.42em" }}>
          {brand.wordmark.replace(/'/g, "’")}
        </span>
        {brand.subline ? (
          <span style={{ display: "block", marginTop: 6, fontFamily: "var(--font-body)", fontSize: Math.max(8, Math.round(width / 22)), letterSpacing: ".28em", textTransform: "uppercase", whiteSpace: "nowrap", opacity: 0.7 }}>
            {brand.subline}
          </span>
        ) : null}
      </span>
    );
    if (!emblem || !brand.logo) return name;
    const emblemHeight = Math.round(size * 2.1);
    return (
      <span className={className} role="img" aria-label={title ?? brand.full}
        style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.5) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logo} alt="" width={Math.round(emblemHeight * EMBLEM_ASPECT)} height={emblemHeight}
          style={{ width: Math.round(emblemHeight * EMBLEM_ASPECT), height: emblemHeight, flex: "none" }} />
        {name}
      </span>
    );
  }

  return (
    // Plain img on purpose: this renders inside loaders, print letterheads
    // and portals where the optimizer's markup has no business.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={width}
      height={height}
      alt={title ?? brand.full}
      // No inline display: consumers hide/show the mark responsively with
      // classes (the site header renders a mobile/desktop pair), and an
      // inline `display: block` would override `hidden` and draw both.
      className={className}
      style={{ width, height }}
    />
  );
}
