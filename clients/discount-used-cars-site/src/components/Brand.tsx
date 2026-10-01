import type { CSSProperties } from 'react';

/** The lone star from Vega's emblem. */
export function LoneStar({ size = 18, className = '', style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 2 L29.9 17.9 L46.8 18.6 L33.5 29.1 L38.1 45.4 L24 36 L9.9 45.4 L14.5 29.1 L1.2 18.6 L18.1 17.9 Z" fill="currentColor" />
    </svg>
  );
}

/** Vega's emblem: the gold ring, the Texas flag and the black SS. */
export function Logo({ size = 64, className = '', priority = false }: { size?: number; className?: string; priority?: boolean }) {
  const small = size <= 160;
  const base = small ? '/brand/vegas-logo-sm' : '/brand/vegas-logo';
  return (
    <picture className={`logo ${className}`}>
      <source srcSet={`${base}.webp`} type="image/webp" />
      <img
        src={`${base}.png`}
        alt="Vega's Auto Sales & Glass Co."
        width={size}
        height={Math.round(size * 0.783)}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
    </picture>
  );
}

/** The emblem with the name set wide, as a marque's logotype is. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`wordmark ${compact ? 'wordmark--compact' : ''}`}>
      <Logo size={compact ? 46 : 72} className="wordmark__logo" priority />
      <span className="wordmark__name">VEGA’S</span>
    </span>
  );
}
