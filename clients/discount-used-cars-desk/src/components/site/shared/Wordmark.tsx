/**
 * The wordmark. Discount Used Cars and Trucks has a full logo but no separate
 * wordmark artwork, so the name is drawn as the public site sets it:
 * "DISCOUNT" in wide grotesk capitals (letter-spacing .42em), with the red car
 * swoosh from the logo over it, the way the site's header stacks them.
 *
 * - `emblem` on a dark ground (`tone="light"`, the black rail): the colour
 *   swoosh over the name in white.
 * - `emblem` on a light ground (`tone="dark"`, the signing pages): the full
 *   colour logo itself, which already carries the name.
 * - no `emblem` (the document header, print): the name alone, in ink.
 *
 * This component is the single place the mark renders: the admin rail, the
 * signing pages and the document headers all pick it up from here.
 * `withSubline` is kept for call-site compatibility; the sub-line is drawn
 * whenever `brand.subline` is set.
 */

import { brand } from "@/lib/dealership-config";
import Swoosh from "@/components/site/shared/Swoosh";

type Props = {
  /** Rendered width in px. Height follows the mark's aspect. */
  width?: number;
  /** `light` for dark surfaces (white), `dark` for light/print (ink). */
  tone?: "light" | "dark";
  /** Kept for call-site compatibility; the sub-line is part of the mark. */
  withSubline?: boolean;
  className?: string;
  /** Accessible name. Omit when adjacent visible text already names it. */
  title?: string;
  /** Screen only: the full-colour logo (light ground) or swoosh (dark ground). */
  emblem?: boolean;
};

/** Proportions of wordmark artwork supplied through the environment. */
const ASPECT = 1925 / 473;
/** The colour logo (public/brand/discount-logo-sm.png, 480 × 185), width over height. */
const LOGO_ASPECT = 480 / 185;

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
    const label = title ?? brand.full;

    // A light screen ground carries the colour logo: it is the mark and the
    // name at once, so nothing is drawn beside it.
    if (emblem && tone === "dark" && brand.logo) {
      const logoHeight = Math.round(width / LOGO_ASPECT);
      // Inline-flex like the drawn mark, so a centred card centres it (the
      // reset makes a bare img a block).
      return (
        <span className={className} role="img" aria-label={label} style={{ display: "inline-flex" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logo} alt="" width={width} height={logoHeight}
            style={{ width, height: logoHeight, flex: "none" }} />
        </span>
      );
    }

    // No artwork on file: draw the name as the public site sets it, wide
    // capitals in the site's grotesk. Ink on print (`tone="dark"` reads the
    // ink role), white on dark screens.
    const ink = tone === "light" ? "#ffffff" : "var(--tj-ink)";
    // "DISCOUNT" is eight wide capitals: this fills the width.
    const size = width / 7.6;
    return (
      <span className={className} role="img" aria-label={label}
        style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: Math.max(4, Math.round(size * 0.35)), minWidth: width, color: ink }}>
        {emblem ? <Swoosh width={width} /> : null}
        <span style={{ display: "inline-block", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: size, lineHeight: 1, letterSpacing: "0.42em", marginRight: "-0.42em" }}>
          {brand.wordmark.replace(/'/g, "’")}
        </span>
        {brand.subline ? (
          <span style={{ display: "block", fontFamily: "var(--font-body)", fontSize: Math.max(8, Math.round(width / 22)), letterSpacing: ".28em", textTransform: "uppercase", whiteSpace: "nowrap", opacity: 0.7 }}>
            {brand.subline}
          </span>
        ) : null}
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
