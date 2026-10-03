/**
 * The dealership's logo on a printed document, when it has one.
 *
 * Returns `null` when no logo is configured, which is a supported state rather
 * than an error: the drawn `Wordmark` is a complete mark on its own, and a
 * dealership without a logo should render nothing here, not a broken image.
 * Every call site must tolerate the null.
 *
 * Its one call site is a printed agreement, so it sets the black-ink logo
 * (`brand.logoInk`): a photocopier turns Discount's red and navy to mud. It
 * falls back to the colour logo only when no ink version is configured.
 *
 * A plain `img` rather than `next/image` on purpose. These marks are 28px to
 * 96px, so the optimisation is worth nothing, and on a print document lazy
 * loading means the logo is missing from the printed page.
 */

import { brand } from "@/lib/dealership-config";

type Props = {
  /** Rendered edge length in px of the square box the logo is fitted into. */
  size: number;
  className?: string;
  /** Accessible name. Leave empty when adjacent text already names the business. */
  alt?: string;
};

export default function BrandLogo({ size, className, alt = "" }: Props) {
  const src = brand.logoInk ?? brand.logo;
  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
    />
  );
}
