"use client";

import type { HomeLanguage } from "@/lib/admin/language";

/**
 * EN/ES pill toggle — visually identical to the one on /admin/home so the
 * control reads as "the same switch" everywhere it appears.
 */
export default function LanguageToggle({
  lang,
  onChange,
}: {
  lang: HomeLanguage;
  onChange: (next: HomeLanguage) => void;
}) {
  return (
    <div
      className="flex shrink-0 self-start overflow-hidden rounded-full border border-[color:var(--tj-line)]"
      role="group"
      aria-label="Language"
    >
      {(["en", "es"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          className={`min-h-11 px-4 text-sm font-bold uppercase tracking-wide transition ${
            lang === code
              ? "bg-[color:var(--tj-surface)] text-[color:var(--tj-ink)]"
              : "bg-transparent text-[color:var(--tj-muted)] hover:text-[color:var(--tj-ink)]"
          }`}
        >
          {code === "en" ? "EN" : "ES"}
        </button>
      ))}
    </div>
  );
}
