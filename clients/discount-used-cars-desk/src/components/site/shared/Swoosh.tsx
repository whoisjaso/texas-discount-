import { brand } from "@/lib/dealership-config";

/** The swoosh artwork's proportions (public/brand/discount-mark.png, 640 × 87). */
export const SWOOSH_ASPECT = 640 / 87;

/**
 * The red car swoosh from the top of the Discount Used Cars and Trucks logo,
 * on its own. The drawn wordmark sets it over the name, the way the public
 * site's header does. `ink` is the black version for paper: a photocopier
 * turns the red to mud.
 *
 * Decorative: the name beside it carries the accessible label.
 */
export default function Swoosh({
  width = 120,
  tone = "color",
  className,
}: {
  width?: number;
  tone?: "color" | "ink";
  className?: string;
}) {
  const src = tone === "ink" ? brand.markInk : brand.mark;
  if (!src) return null;
  const height = Math.round(width / SWOOSH_ASPECT);
  return (
    // Plain img: it renders in the rail, the signing pages and print.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={width}
      height={height}
      className={className}
      style={{ display: "block", flex: "none", width, height }}
    />
  );
}
