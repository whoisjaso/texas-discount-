/**
 * The dealership's crest, when it has one.
 *
 * Returns `null` when `brand.logo` is null, which is a supported state rather
 * than an error: the drawn `Wordmark` is a complete mark on its own, and a
 * dealership that has not commissioned a crest should render nothing here, not
 * a broken image. Every call site must tolerate the null.
 *
 * A plain `img` rather than `next/image` on purpose. These marks are 28px to
 * 72px, so the optimisation is worth nothing, and three of the call sites are
 * print or portal documents where lazy loading means the crest is missing from
 * the printed page. One element, one behaviour, everywhere it appears.
 */

import { brand } from "@/lib/dealership-config";

type Props = {
  /** Rendered edge length in px. The mark is square. */
  size: number;
  className?: string;
  /** Accessible name. Leave empty when adjacent text already names the business. */
  alt?: string;
};

export default function BrandLogo({ size, className, alt = "" }: Props) {
  if (!brand.logo) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand.logo}
      alt={alt}
      width={size}
      height={size}
      className={className}
    />
  );
}
