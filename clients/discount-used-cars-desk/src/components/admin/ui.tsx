import Link from "next/link";
import {
  Children,
  cloneElement,
  isValidElement,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
} from "react";
import { toTitleCaseDisplay } from "@/lib/display/title-case";

/**
 * Triple J Admin Design System — shared primitives.
 *
 * The admin surface spans ~12 top-level pages built across Phases 14–27.
 * To avoid the "every phase ships its own CSS" drift, this file is the
 * single source for the four primitives every data page needs:
 *
 *   <AdminShell>       root wrapper (padding, max-width, no bg)
 *   <AdminPageHeader>  H1 + subtitle + action slot
 *   <AdminCard>        data container (border + bg + radius)
 *   <AdminButton>      primary / secondary / ghost action triggers
 *   <AdminBadge>       status + eligibility pills
 *
 * Dominant pattern honored across /admin, /admin/analytics,
 * /admin/inventory, /admin/leads, /admin/paperwork, /admin/payments,
 * /admin/pipeline (the canonical set).
 *
 * Design tokens (confirm with src/app/globals.css + tailwind.config):
 *   Root bg           --tj-warm-white (the desk runs on paper)
 *   Surface           --tj-white
 *   Surface hover     --tj-surface
 *   Border            --tj-line
 *   Text primary      --tj-ink
 *   Text secondary    --tj-muted
 *   Text tertiary     --tj-muted-light
 *   Accent            --tj-copper, for live figures only
 */

// ─────────────────────────────────────────────────────────────────
// <AdminShell> — root wrapper
// ─────────────────────────────────────────────────────────────────
export function AdminShell({
  children,
  size = "default",
}: {
  children: ReactNode;
  size?: "default" | "narrow" | "wide";
}) {
  const maxW =
    size === "narrow" ? "max-w-3xl"
    : size === "wide" ? "max-w-7xl"
    : "max-w-6xl";
  return (
    <div className={`ed-admin-page mx-auto min-w-0 w-full overflow-x-clip px-3 py-3 pb-28 md:px-6 md:py-6 ${maxW}`}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// <AdminPageHeader> — title + subtitle + action slot
// ─────────────────────────────────────────────────────────────────
export function AdminPageHeader({
  title,
  subtitle,
  actions,
  mobileVisibility = "visible",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  mobileVisibility?: "visible" | "sr-only";
}) {
  const headerClass =
    mobileVisibility === "sr-only"
      ? "sr-only md:not-sr-only md:mb-5 md:flex md:min-w-0 md:items-start md:justify-between md:gap-4"
      : "mb-4 flex min-w-0 flex-col gap-3 md:mb-5 md:flex-row md:items-start md:justify-between md:gap-4";

  return (
    <div className={`ed-admin-page-header ${headerClass}`} data-print-hide>
      <div className="min-w-0">
        <h1 className="text-balance break-words font-[family-name:var(--font-display)] text-[1.42rem] leading-[1.05] tracking-[-0.03em] text-[color:var(--tj-ink)] md:text-[2rem]">
          {toTitleCaseDisplay(title)}
        </h1>
        {/* The title capitalises every word. The subtitle is a sentence, and
            a sentence in title case reads like a ransom note: the videos page
            was rendering "Sending Via SMS Generates A 7-Day Signed Link" at a
            reader. Headings are titles, subtitles are copy. */}
        {subtitle ? (
          <p className="mt-1 hidden max-w-2xl text-sm leading-relaxed text-[color:var(--tj-muted)] md:block">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(9.25rem,1fr))] items-stretch gap-2 md:flex md:w-auto md:shrink-0 md:flex-wrap md:items-center">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// <AdminCard> — data container
// ─────────────────────────────────────────────────────────────────
export function AdminCard({
  children,
  className = "",
  as: As = "div",
  emphasis = "default",
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  emphasis?: "default" | "gold";
  id?: string;
}) {
  const base =
    emphasis === "gold"
      // "Emphasis" is a copper hairline, not a filled panel — on paper the
      // difference reads without shouting.
      ? "rounded-2xl border border-[color:var(--tj-copper)] bg-[color:var(--tj-plane)]"
      : "rounded-2xl border border-[color:var(--tj-line)] bg-[color:var(--tj-plane)]";
  return <As id={id} className={`ed-admin-card ${base} min-w-0 ${className}`.trim()}>{children}</As>;
}

// ─────────────────────────────────────────────────────────────────
// <AdminButton> — primary filled gold, secondary tinted outline,
// ghost transparent. Works as <button>, <a>, or <Link>.
// ─────────────────────────────────────────────────────────────────
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

function buttonClasses(variant: ButtonVariant, size: ButtonSize): string {
  return `tj-action-base tj-action-${variant} tj-action-${size}`;
}

function titleCaseAdminNode(node: ReactNode): ReactNode {
  if (typeof node === "string") return toTitleCaseDisplay(node);
  if (Array.isArray(node)) return Children.map(node, titleCaseAdminNode);
  if (isValidElement<{ children?: ReactNode }>(node)) {
    const childProps = node.props;
    if (!("children" in childProps)) return node;
    return cloneElement(node, {
      children: titleCaseAdminNode(childProps.children),
    });
  }
  return node;
}

function shouldRenderNativeAnchor(href: string, external: boolean): boolean {
  return external || /^(tel|sms|mailto):/i.test(href);
}

export function AdminButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const feedbackAttribute = variant === "primary" ? { "data-admin-feedback": "confirm" } : {};
  return (
    <button
      {...feedbackAttribute}
      data-admin-button
      data-admin-button-size={size}
      data-admin-button-variant={variant}
      className={`${buttonClasses(variant, size)} ${className}`.trim()}
      {...rest}
    >
      {titleCaseAdminNode(children)}
    </button>
  );
}

export function AdminLinkButton({
  variant = "primary",
  size = "md",
  className = "",
  href,
  external = false,
  feedback = "none",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href: string;
  external?: boolean;
  feedback?: "confirm" | "none";
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const cls = `${buttonClasses(variant, size)} ${className}`.trim();
  const feedbackAttribute = feedback === "confirm" ? { "data-admin-feedback": "confirm" } : {};
  if (shouldRenderNativeAnchor(href, external)) {
    return (
      <a
        {...feedbackAttribute}
        data-admin-button
        data-admin-button-size={size}
        data-admin-button-variant={variant}
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={cls}
        {...rest}
      >
        {titleCaseAdminNode(children)}
      </a>
    );
  }
  return (
    <Link
      href={href}
      {...feedbackAttribute}
      data-admin-button
      data-admin-button-size={size}
      data-admin-button-variant={variant}
      className={cls}
      {...rest}
    >
      {titleCaseAdminNode(children)}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────
// <AdminBadge> — small pill for status + eligibility + counts
// ─────────────────────────────────────────────────────────────────
type BadgeVariant =
  | "gold-filled"
  | "gold-outline"
  | "neutral"
  | "success"
  | "warning"
  | "danger";

export function AdminActionLabel({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      data-admin-button
      data-admin-button-size={size}
      data-admin-button-variant={variant}
      className={`${buttonClasses(variant, size)} ${className}`.trim()}
      {...rest}
    >
      {titleCaseAdminNode(children)}
    </label>
  );
}

export function AdminBadge({
  variant = "neutral",
  children,
  className = "",
  ...rest
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLSpanElement>) {
  const variantCls =
    variant === "gold-filled"
      ? "bg-[color:var(--tj-surface)] text-[color:var(--tj-copper)]"
      : variant === "gold-outline"
      ? "border border-[color:var(--tj-copper)] text-[color:var(--tj-copper)]"
      : variant === "success"
      ? "bg-[#3F5A43]/15 text-[#3F5A43]"
      : variant === "warning"
      ? "bg-[#8A4F2B]/15 text-[#8A4F2B]"
      : variant === "danger"
      ? "bg-[#8A3A1C]/15 text-[#8A3A1C]"
      : /* neutral */ "bg-[color:var(--tj-surface)] text-[color:var(--tj-muted)]";

  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center justify-center rounded-full px-2 py-0.5 text-center text-[11px] font-semibold leading-tight tracking-normal md:text-[11px] ${variantCls} ${className}`.trim()}
      {...rest}
    >
      <span className="min-w-0 break-words [overflow-wrap:anywhere]">
        {titleCaseAdminNode(children)}
      </span>
    </span>
  );
}
