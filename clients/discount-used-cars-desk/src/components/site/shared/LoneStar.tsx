/**
 * The lone star from Vega's emblem (the gold ring, the Texas flag and the
 * black SS). The drawn wordmark sets it in place of the apostrophe.
 */
export default function LoneStar({
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
      <path d="M24 2 L29.9 17.9 L46.8 18.6 L33.5 29.1 L38.1 45.4 L24 36 L9.9 45.4 L14.5 29.1 L1.2 18.6 L18.1 17.9 Z" fill={color} />
    </svg>
  );
}
