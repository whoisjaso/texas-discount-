/** The logo's proportions (1402 × 540). */
const LOGO_RATIO = 540 / 1402;
/** The car swoosh's proportions (640 × 87). */
const MARK_RATIO = 87 / 640;

/**
 * The Discount Used Cars and Trucks logo: the red car swoosh, DISCOUNT in red,
 * the name in navy and the road. `reverse` swaps the navy for white so it
 * reads on black.
 */
export function Logo({
  width = 160,
  reverse = false,
  className = '',
  priority = false,
}: {
  width?: number;
  reverse?: boolean;
  className?: string;
  priority?: boolean;
}) {
  const small = width <= 480;
  const base = `/brand/discount-logo${reverse ? '-reverse' : ''}${small ? '-sm' : ''}`;
  return (
    <picture className={`logo ${className}`}>
      <source srcSet={`${base}.webp`} type="image/webp" />
      <img
        src={`${base}.png`}
        alt="Discount Used Cars and Trucks"
        width={width}
        height={Math.round(width * LOGO_RATIO)}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
    </picture>
  );
}

/** The red car swoosh from the top of the logo. */
export function Mark({ width = 120, className = '', priority = false }: { width?: number; className?: string; priority?: boolean }) {
  return (
    <picture className={`mark ${className}`}>
      <source srcSet="/brand/discount-mark.webp" type="image/webp" />
      <img
        src="/brand/discount-mark.png"
        alt=""
        width={width}
        height={Math.round(width * MARK_RATIO)}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
    </picture>
  );
}

/** The swoosh over the name set wide, as a marque's logotype is. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`wordmark wordmark--stack ${compact ? 'wordmark--compact' : ''}`}>
      <Mark width={compact ? 132 : 176} className="wordmark__mark" priority />
      <span className="wordmark__name">DISCOUNT</span>
    </span>
  );
}
