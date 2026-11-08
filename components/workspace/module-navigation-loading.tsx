"use client";

import { LoaderCircle } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";

/** Route-level fallback: never fetch private ERP data just to paint a loading state. */
export function ModuleNavigationLoading() {
  const english = useAppLocale() === "en";
  return (
    <main data-module-navigation-loading aria-busy="true" className="w-full min-w-0 max-w-full space-y-4 p-4 sm:p-6">
      <div role="status" aria-live="polite" className="flex min-w-0 items-center gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm font-semibold text-dtsc-muted">
        <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-dtsc-blue" aria-hidden="true" />
        {english ? "Opening your workspace…" : "Ouverture de votre espace de travail…"}
      </div>
      <div aria-hidden="true" className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex min-h-28 min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-dtsc-soft" />
            <div className="min-w-0 flex-1 space-y-3 pt-1">
              <div className="h-4 w-3/4 animate-pulse rounded bg-dtsc-soft" />
              <div className="h-3 w-full animate-pulse rounded bg-dtsc-soft" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-dtsc-soft" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
