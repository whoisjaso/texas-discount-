/**
 * Vega's four-point glint: the brightest star in Lyra, and light catching on
 * glass. The same mark the public site uses in its wordmark and loader.
 */
export default function StarGlint({
  size = 14,
  color = "currentColor",
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ display: "inline-block", flex: "none" }}>
      <path
        d="M24 0 C25.2 14 27.4 20.6 48 24 C27.4 27.4 25.2 34 24 48 C22.8 34 20.6 27.4 0 24 C20.6 20.6 22.8 14 24 0 Z"
        fill={color}
      />
    </svg>
  );
}
