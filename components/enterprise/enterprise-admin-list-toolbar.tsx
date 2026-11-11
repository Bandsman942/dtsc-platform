"use client";

import { ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { downloadProfessionalCsv, downloadProfessionalXlsx, type ProfessionalReportExportModel } from "@/lib/reporting/professional-export";
import { downloadProfessionalPdfV2 } from "@/lib/reporting/professional-pdf-v2";

export type AdminRailFilter = { value: string; label: string; count?: number };

export function EnterpriseAdminListToolbar({
  search, onSearchChange, searchPlaceholder, filters, filter, onFilterChange, resultCount, locale = "fr", children,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filters: AdminRailFilter[];
  filter: string;
  onFilterChange: (value: string) => void;
  resultCount?: number;
  locale?: string | null;
  children?: ReactNode;
}) {
  const english = locale === "en";
  return (
    <div className="min-w-0 space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-page/70 p-2.5 sm:p-3" data-workspace-toolbar>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1" aria-label={searchPlaceholder}>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
          <input type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={searchPlaceholder}
            className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface pl-10 pr-10 text-sm text-dtsc-ink outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20" />
          {search ? <button type="button" onClick={() => onSearchChange("")} aria-label={english ? "Clear search" : "Effacer la recherche"} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-dtsc-muted hover:bg-dtsc-page"><X className="h-4 w-4" /></button> : null}
        </label>
        {children}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <div role="group" aria-label={english ? "Status filters" : "Filtres de statut"} className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => onFilterChange(item.value)}
            className={`min-h-10 shrink-0 snap-start rounded-xl border px-3 text-xs font-bold transition-colors motion-reduce:transition-none ${filter === item.value ? "border-cyan-500 bg-cyan-500/15 text-dtsc-ink" : "border-dtsc-border bg-dtsc-surface text-dtsc-muted hover:border-cyan-500/50"}`}>
            {item.label}{item.count !== undefined ? <span className="ml-1.5 tabular-nums opacity-75">{item.count}</span> : null}
          </button>)}
        </div>
        {resultCount !== undefined ? <span aria-live="polite" className="shrink-0 text-xs font-bold tabular-nums text-dtsc-muted">{resultCount} {english ? "result(s)" : "résultat(s)"}</span> : null}
      </div>
    </div>
  );
}

export function EnterpriseAdminPagination({ page, pageCount, onPageChange, locale = "fr" }: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  locale?: string | null;
}) {
  if (pageCount <= 1) return null;
  const english = locale === "en";
  return <nav className="flex items-center justify-end gap-2" aria-label={english ? "Pagination" : "Pagination"}>
    <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={english ? "Previous page" : "Page précédente"} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-dtsc-border text-dtsc-ink disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
    <span className="min-w-20 text-center text-xs font-bold tabular-nums text-dtsc-muted">{page} / {pageCount}</span>
    <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label={english ? "Next page" : "Page suivante"} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-dtsc-border text-dtsc-ink disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
  </nav>;
}

export function EnterpriseAdminExportMenu({ model, locale }: { model: ProfessionalReportExportModel; locale?: string | null }) {
  const english = locale === "en";
  return <details className="relative shrink-0">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-xs font-bold text-dtsc-ink focus-visible:ring-2 focus-visible:ring-cyan-500 [&::-webkit-details-marker]:hidden">
      <Download className="h-4 w-4" />{english ? "Export" : "Exporter"}
    </summary>
    <div className="absolute right-0 z-40 mt-2 min-w-40 rounded-xl border border-dtsc-border bg-dtsc-surface p-2 shadow-xl">
      {([
        { label: "Excel", run: () => downloadProfessionalXlsx(model) },
        { label: "CSV", run: () => downloadProfessionalCsv(model) },
        { label: "PDF", run: () => downloadProfessionalPdfV2(model) },
      ] as const).map((item) => <button type="button" key={item.label} onClick={item.run} disabled={!model.rows.length} className="block min-h-10 w-full rounded-lg px-3 text-left text-sm font-bold text-dtsc-ink hover:bg-dtsc-page disabled:opacity-40">{item.label}</button>)}
    </div>
  </details>;
}
