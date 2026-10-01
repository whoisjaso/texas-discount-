"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClockCounterClockwise, DotsThree as MoreHorizontal, PenNib as Settings, SignOut as LogOut, Signature as FileSignature, Handshake as HandshakeIcon, Timer, X } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { ROLE_LABELS, type TeamRole } from "@/lib/operations/team";
import { roleOpensAdminRoute } from "@/lib/admin/route-permissions";
import { logoutAdmin } from "@/lib/actions/auth";
import type { TeamMember } from "@/lib/operations/types";
import type { AdminWorkspace } from "@/lib/admin/workspace";
import Wordmark from "@/components/site/shared/Wordmark";
import CommandPalette from "@/components/admin/CommandPalette";
import { brand } from "@/lib/dealership-config";

/**
 * Admin navigation.
 *
 * Triple J runs one desk now, so this is a single flat list — no workspace
 * switch, no rental lane, no nested tool drawers. The four things the day
 * actually revolves around sit at the top; everything else is secondary.
 *
 * Desktop is a fixed rail; mobile is a bottom bar with the same four primary
 * destinations and a sheet for the rest.
 */

type NavItem = {
  label: string;
  href: string;
  icon: Icon;
};

/**
 * The things the desk revolves around.
 *
 * "Past Sales" sits directly under "Sale" because they are the two halves of
 * one question and a person asks them in that order: what is open, then what
 * is done. It is named for what it holds rather than for what it does, because
 * a label somebody has to interpret is a label that gets clicked by accident.
 */
const PRIMARY: NavItem[] = [
  { label: "Handle A Sale", href: "/admin/sales", icon: FileSignature },
  { label: "Past Sales", href: "/admin/sales/past", icon: ClockCounterClockwise },
  { label: "Sale Times", href: "/admin/sales/times", icon: Timer },
  { label: "Promises", href: "/admin/sales/promises", icon: HandshakeIcon },
];

/** The desk is the whole admin for now; nothing else to list. */
const SECONDARY: NavItem[] = [];

/**
 * The dealer's saved signature: every packet prints it on the dealer line, so
 * it sits with the identity where a person looks for their own account.
 */
const ACCOUNT: NavItem = {
  label: "Your Signature",
  href: "/admin/account/signature",
  icon: Settings,
};

export default function AdminSidebar({
  currentMember,
  currentRole,
  currentUserEmail,
  currentUserName,
}: {
  currentMember?: TeamMember | null;
  currentRole: TeamRole | null;
  currentUserEmail?: string | null;
  /** The name on the auth account, for a member row that has none yet. */
  currentUserName?: string | null;
  /** Retained for the shell's call signature; only one workspace exists. */
  workspace?: AdminWorkspace | null;
}) {
  const pathname = usePathname();
  // Keyed by pathname so a route change closes the sheet during render rather
  // than through an effect that would cause a second pass.
  const [moreOpenAt, setMoreOpenAt] = useState<string | null>(null);
  const moreOpen = moreOpenAt === pathname;
  const setMoreOpen = (open: boolean) =>
    setMoreOpenAt(open ? pathname : null);
  const moreDialog = useRef<HTMLDialogElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // A navigation sheet is a real modal: the browser contains keyboard focus,
  // handles Escape, and returns focus to the button that opened it.
  useEffect(() => {
    const dialog = moreDialog.current;
    if (!moreOpen || !dialog) return;
    const trigger = moreButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeButton.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [moreOpen]);

  // One authority: the same deny-by-default route table that gates the
  // pages. A sidebar carrying its own permission column disagreed with the
  // gate twice before this - a link is a claim the door opens.
  const allowed = (item: NavItem) => roleOpensAdminRoute(currentRole, item.href);
  const primary = PRIMARY.filter(allowed);
  const secondary = SECONDARY.filter(allowed);

  // The most specific destination owns the selection. Past Sales is inside
  // /sales, but two selected links would claim the reader is in two places.
  const activeHref = [...primary, ...secondary, ACCOUNT]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const isActive = (href: string) => activeHref === href;

  const displayName =
    currentMember?.display_name?.trim() ||
    currentMember?.full_name?.trim() ||
    currentUserName?.trim() ||
    currentUserEmail ||
    "Signed in";
  // Under the name: the handle when one is chosen, the role when not. The
  // address was shown there before, and when the address was also the name
  // the block read the same line twice.
  const handle = currentMember?.username?.trim()
    ? `@${currentMember.username.trim()}`
    : displayName === currentUserEmail
      ? (currentRole ? ROLE_LABELS[currentRole] : "")
      : (currentUserEmail ?? "");
  const avatarUrl = currentMember?.avatar_url?.trim() || null;
  const avatarInitials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "V";

  return (
    <>
      {/* Desktop rail */}
      <aside className="ed-admin-rail fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-[color:var(--tj-line)] bg-[color:var(--tj-plane)] md:flex">
        <div className="ed-admin-brand flex h-[72px] shrink-0 items-center border-b border-[color:var(--tj-line)] px-6">
          <Link href="/admin/sales" aria-label={`${brand.short} admin home`}>
            <Wordmark width={130} tone="dark" emblem />
          </Link>
        </div>

        {/* One keystroke reaches every screen. The button is for the hand that
            is already on the mouse; the shortcut is for the one that is not. */}
        <div className="shrink-0 px-3 pt-4">
          <CommandPalette />
        </div>

        <nav aria-label="Admin" className="tj-admin-rail-scroll flex-1 overflow-y-auto px-3 pb-5 pt-4">
          <ul className="flex flex-col gap-1">
            {primary.map((item) => (
              <li key={item.href}>
                <SidebarLink item={item} active={isActive(item.href)} />
              </li>
            ))}
          </ul>

          {secondary.length > 0 ? (
            <>
              <p className="ed-nav-section ed-fine mt-7 mb-2 px-3 uppercase tracking-[0.09em] text-[color:var(--tj-muted)]">
                More
              </p>
              <ul className="ed-nav-secondary flex flex-col gap-1">
                {secondary.map((item) => (
                  <li key={item.href}>
                    <SidebarLink item={item} active={isActive(item.href)} muted />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </nav>

        <div className="shrink-0 border-t border-[color:var(--tj-line)] px-3 py-4">
          {/* The face, the name, the handle: one link to the profile that
              edits all three. It used to be a grey line of text with
              nowhere to go. */}
          <div className="ed-nav-identity">
            <span
              className="ed-nav-avatar"
              style={avatarUrl ? { backgroundImage: `url("${avatarUrl.replaceAll('"', "%22")}")` } : undefined}
              aria-hidden="true"
            >
              {avatarUrl ? null : avatarInitials}
            </span>
            <span className="min-w-0">
              <span className="ed-nav-identity-name">{displayName}</span>
              {handle ? <span className="ed-nav-identity-handle">{handle}</span> : null}
            </span>
          </div>
          {allowed(ACCOUNT) ? (
            <div className="mt-2">
              <SidebarLink item={ACCOUNT} active={isActive(ACCOUNT.href)} />
            </div>
          ) : null}
          <form action={logoutAdmin}>
            <button
              type="submit"
              className="ed-nav-item mt-1 w-full" data-muted="true"
            >
              <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Admin"
        className="ed-admin-tabs fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--tj-line)] bg-[color:var(--tj-plane)] md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="grid grid-cols-5">
          {primary.slice(0, 4).map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="ed-tab-item"
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                <item.icon className="h-[19px] w-[19px]" aria-hidden="true" />
                <span className="text-[12px] font-medium">{item.label}</span>
              </Link>
            </li>
          ))}
          <li>
            <button
              ref={moreButton}
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className="ed-tab-item"
            >
              <MoreHorizontal className="h-[19px] w-[19px]" aria-hidden="true" />
              <span className="text-[12px] font-medium">More</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* Mobile sheet */}
      {moreOpen ? (
        <dialog
          ref={moreDialog}
          aria-modal="true"
          aria-label="More admin navigation"
          className="ed-admin-more-dialog fixed inset-0 z-50"
          onCancel={(event) => {
            event.preventDefault();
            setMoreOpen(false);
          }}
        >
          <div
            className="absolute inset-0 bg-[color:var(--tj-ink)]/35"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          {/* The panel is a column: a heading, a list that scrolls, and a
              footer that does not. Settings used to be the last row of the
              scrolling list and fell off the bottom edge of the sheet on a
              390x844 screen, which is the same fault the desktop rail had. */}
          <div className="ed-admin-more absolute inset-x-0 bottom-0 flex max-h-[80svh] flex-col rounded-t-[20px] border-t border-[color:var(--tj-line)] bg-[color:var(--tj-plane)] p-5">
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <span className="ed-fine uppercase tracking-[0.09em] text-[color:var(--tj-muted)]">
                More
              </span>
              <button
                ref={closeButton}
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center text-[color:var(--tj-muted)]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-2">
              {[...primary.slice(4), ...secondary].map((item) => (
                <li key={item.href}>
                  <SidebarLink item={item} active={isActive(item.href)} />
                </li>
              ))}
            </ul>

            <div className="mt-2 shrink-0 border-t border-[color:var(--tj-line)] pt-3">
              {allowed(ACCOUNT) ? (
                <SidebarLink item={ACCOUNT} active={isActive(ACCOUNT.href)} />
              ) : null}
              <form action={logoutAdmin}>
                <button
                  type="submit"
                  className="mt-1 flex min-h-12 w-full items-center gap-3 rounded-[9px] px-3 text-[15px] text-[color:var(--tj-muted)]"
                >
                  <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}

function SidebarLink({
  item,
  active,
  muted = false,
}: {
  item: NavItem;
  active: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="ed-nav-item"
      data-muted={muted && !active ? "true" : undefined}
    >
      <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
