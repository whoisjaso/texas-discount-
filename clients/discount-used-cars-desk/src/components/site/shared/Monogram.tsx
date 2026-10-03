import { brand } from "@/lib/dealership-config";

/**
 * The single mark where a screen or a page has room for one shape: the
 * sign-in leaf, the request-received seal and the document letterhead.
 *
 * Discount Used Cars and Trucks has no monogram artwork, so its logo stands
 * in, in the version each ground needs:
 *
 * - `copper` (light screen grounds): the full-colour logo;
 * - `cream` (dark screen grounds): the logo with the navy turned white;
 * - `ink` (print): the black-ink logo, because a photocopier turns the red
 *   and navy to mud.
 *
 * The tone names are the reference desk's; the artwork is this dealer's.
 */

type Props = {
  /** Rendered height in px. Width follows the artwork's aspect. */
  height?: number;
  tone?: "copper" | "cream" | "ink";
  className?: string;
  /** Accessible name. Omit when adjacent visible text already names it. */
  title?: string;
};

/** Proportions of monogram artwork supplied through the environment (w:h). */
const ASPECT = 740 / 1122;
/** The logo (public/brand/discount-logo-*-sm.png, 480 × 185), width over height. */
const LOGO_ASPECT = 480 / 185;

export default function Monogram({
  height = 44,
  tone = "copper",
  className,
  title,
}: Props) {
  const artwork = brand.monogramArtwork[tone];
  const logo = tone === "ink" ? brand.logoInk : tone === "cream" ? brand.logoReverse : brand.logo;
  const src = artwork || logo;
  if (!src) return null;
  const width = Math.round(height * (artwork ? ASPECT : LOGO_ASPECT));
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
