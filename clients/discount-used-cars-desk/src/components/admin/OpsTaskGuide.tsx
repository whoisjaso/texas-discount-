"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CaretDown as ChevronDown, Check, ClipboardText as ClipboardCheck, Crosshair as LocateFixed, X } from "@phosphor-icons/react";
import { AdminButton, AdminLinkButton } from "@/components/admin/ui";
import { toTitleCaseDisplay } from "@/lib/display/title-case";

const ACTIVE_GUIDE_KEY = "coreconnect-active-ops-task-v1";

interface ActiveOpsGuide {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  tier: string;
  steps: string[];
  destination: string;
  focusKey: string;
  focusLabel: string;
  startedAt: string;
}

const FOCUS_SELECTORS: Record<string, string> = {
  "payments-due":
    '[data-ops-focus="payments-due"], a[href*="/admin/payments/customers"]',
  "rental-folder": '[data-ops-focus="rental-folder"], details summary',
  "rental-expire": '[data-ops-focus="rental-expire"], button[title*="expired"]',
  "document-agreement":
    '[data-ops-focus="document-agreement"], [data-ops-focus="agreement-tracker"]',
  "paperwork-pipeline":
    '[data-ops-focus="paperwork-pipeline"], a[href*="/admin/paperwork/"]',
  "lead-response": '[data-ops-focus="lead-response"], a[href*="/admin/leads/"]',
  "vehicle-photos":
    '[data-ops-focus="vehicle-photos"], input[name="gallery"], input[name="imageUrl"]',
  "message-log": '[data-ops-focus="message-log"]',
  "social-post": '[data-ops-focus="social-post"], [data-ops-focus="lead-response"]',
};

const FALLBACK_STEPS = [
  "Open The Highlighted Starting Point.",
  "Compare The Screen Against The Task Description.",
  "Handle The Next Concrete Action, Then Return To Operations And Mark The Task Done.",
];

function cleanSteps(steps: string[] | undefined): string[] {
  const cleaned =
    steps
      ?.map((step) => step.replace(/^\s*\d+\.\s*/, "").trim())
      .filter(Boolean) ?? [];
  return (cleaned.length > 0 ? cleaned : FALLBACK_STEPS).map(toTitleCaseDisplay);
}

function safeParseGuide(raw: string | null): ActiveOpsGuide | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveOpsGuide;
    return parsed?.id && parsed?.title ? parsed : null;
  } catch {
    return null;
  }
}

export default function OpsTaskGuide() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const taskId = searchParams.get("opsTask");
  const [guide, setGuide] = useState<ActiveOpsGuide | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!taskId) {
        setGuide(null);
        setChecked({});
        return;
      }

      const saved = safeParseGuide(window.sessionStorage.getItem(ACTIVE_GUIDE_KEY));
      if (saved?.id === taskId) {
        setGuide(saved);
        setChecked({});
        return;
      }

      setGuide({
        id: taskId,
        title: searchParams.get("opsTitle") ?? "Ops Task",
        description: "Follow The Highlighted Area, Complete The Action, Then Return To Operations.",
        category: "operations",
        priority: "important",
        tier: "yellow",
        steps: FALLBACK_STEPS,
        destination: pathname,
        focusKey: searchParams.get("opsFocus") ?? "",
        focusLabel: "Starting Point",
        startedAt: new Date().toISOString(),
      });
      setChecked({});
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pathname, searchParams, taskId, searchKey]);

  const steps = useMemo(() => cleanSteps(guide?.steps), [guide]);
  const guideTitle = guide ? toTitleCaseDisplay(guide.title) : "";
  const guideDescription = guide ? toTitleCaseDisplay(guide.description) : "";
  const focusLabel = toTitleCaseDisplay(guide?.focusLabel || "Highlighted Area");
  const focusKey = searchParams.get("opsFocus") ?? guide?.focusKey ?? "";
  const focusSelector = focusKey ? FOCUS_SELECTORS[focusKey] : "";
  const progress = steps.length
    ? Math.round((Object.values(checked).filter(Boolean).length / steps.length) * 100)
    : 0;

  useEffect(() => {
    if (!taskId || !focusSelector) return;

    let target: HTMLElement | null = null;
    const timer = window.setTimeout(() => {
      target = document.querySelector(focusSelector) as HTMLElement | null;
      if (!target) return;

      target.classList.add("ops-guide-highlight");
      target.setAttribute("data-ops-guide-active", "true");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 450);

    return () => {
      window.clearTimeout(timer);
      if (target) {
        target.classList.remove("ops-guide-highlight");
        target.removeAttribute("data-ops-guide-active");
      }
    };
  }, [focusSelector, taskId, pathname]);

  function clearGuide() {
    window.sessionStorage.removeItem(ACTIVE_GUIDE_KEY);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("opsTask");
    next.delete("opsFocus");
    next.delete("opsTitle");
    const suffix = next.toString();
    router.replace(`${pathname}${suffix ? `?${suffix}` : ""}`, { scroll: false });
    setGuide(null);
  }

  function refocus() {
    const target = focusSelector
      ? (document.querySelector(focusSelector) as HTMLElement | null)
      : null;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (!taskId || !guide) return null;

  return (
    <>
      <aside
        data-ops-guide-panel
        className="fixed inset-x-3 bottom-[5.9rem] z-[80] rounded-2xl border border-[color:var(--tj-copper)] bg-[color:var(--tj-plane)]/95 shadow-[0_22px_90px_rgba(0,0,0,0.6)] backdrop-blur-xl md:inset-x-auto md:bottom-5 md:right-5 md:w-[430px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--tj-line)] p-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[color:var(--tj-ink)]">
              {guideTitle}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <AdminButton
              type="button"
              onClick={refocus}
              variant="ghost"
              size="sm"
              className="h-10 min-h-10 w-10 p-0"
              aria-label="Highlight The Starting Point Again"
              data-ops-guide-refocus
            >
              <LocateFixed size={16} />
            </AdminButton>
            <AdminButton
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              variant="ghost"
              size="sm"
              className="h-10 min-h-10 w-10 p-0"
              aria-label={collapsed ? "Expand Task Guide" : "Collapse Task Guide"}
              data-ops-guide-collapse
            >
              <ChevronDown
                size={16}
                className={`transition ${collapsed ? "rotate-180" : ""}`}
              />
            </AdminButton>
            <AdminButton
              type="button"
              onClick={clearGuide}
              variant="ghost"
              size="sm"
              className="h-10 min-h-10 w-10 p-0"
              aria-label="Close Task Guide"
              data-ops-guide-close
            >
              <X size={16} />
            </AdminButton>
          </div>
        </div>

        {!collapsed ? (
          <div className="p-3.5">
            <p className="text-sm leading-relaxed text-[color:var(--tj-muted)]">{guideDescription}</p>

            <div className="mt-3 rounded-xl border border-[color:var(--tj-copper)] bg-[color:var(--tj-surface)]/[0.055] p-3">
              <p className="tj-ui-label text-[11px] font-semibold text-[color:var(--tj-copper)]">
                Start Here
              </p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--tj-ink)]">
                {focusLabel}
              </p>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--tj-surface)]">
              <div
                className="h-full rounded-full bg-[color:var(--tj-surface)] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-3 max-h-[34vh] space-y-2 overflow-y-auto pr-1">
              {steps.map((step, index) => {
                const done = !!checked[index];
                return (
                  <button
                    key={`${guide.id}-${index}-${step}`}
                    type="button"
                    data-ops-guide-step
                    onClick={() =>
                      setChecked((current) => ({
                        ...current,
                        [index]: !current[index],
                      }))
                    }
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                      done
                        ? "border-[#3F5A43]/45 bg-[#3F5A43]/[0.08] text-[#3F5A43]"
                        : "border-[color:var(--tj-line)] bg-[color:var(--tj-surface)] text-[color:var(--tj-muted)] hover:bg-[color:var(--tj-surface)]"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                        done
                          ? "border-[#3F5A43]/45 bg-[#3F5A43]/15"
                          : "border-[color:var(--tj-line)]"
                      }`}
                    >
                      {done ? <Check size={14} /> : index + 1}
                    </span>
                    <span className="text-sm leading-relaxed">{step}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <AdminLinkButton
                href="/admin/operations"
                variant="ghost"
                size="sm"
                className="min-h-[46px]"
                data-ops-guide-ops-link
              >
                <ArrowLeft size={15} />
                Ops
              </AdminLinkButton>
              <AdminButton
                type="button"
                onClick={clearGuide}
                variant="primary"
                size="sm"
                className="min-h-[46px]"
                data-ops-guide-done
              >
                <ClipboardCheck size={16} />
                Done Here
              </AdminButton>
            </div>
          </div>
        ) : null}
      </aside>

      <style jsx global>{`
        @keyframes ops-guide-pulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.28);
          }
          50% {
            box-shadow: 0 0 0 7px rgba(212, 175, 55, 0.04);
          }
        }

        .ops-guide-highlight {
          outline: 3px solid rgba(212, 175, 55, 0.95) !important;
          outline-offset: 4px !important;
          scroll-margin: 128px;
          animation: ops-guide-pulse 1.5s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .ops-guide-highlight {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}
