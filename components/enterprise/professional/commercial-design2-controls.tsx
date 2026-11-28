"use client";

import Link from "next/link";
import { ArrowUpRight, SlidersHorizontal } from "lucide-react";
import { FinanceDateFilter, FinanceExportControls, type FinanceExportColumn } from "@/components/enterprise/professional/finance-design2-controls";

export type CommercialStatusChoice = { id: string; label: string };
export type CommercialConnection = { module: string; labelFr: string; labelEn: string };

/** Shared Design 2.0 contract for the five commercial modules.
 * The server owns filtering, permission checks and pagination: this component
 * only sends the user's filters to the canonical module API and exporter.
 */
export function CommercialDesign2Controls({
  locale, organizationName, title, endpoint, filters, reportFilters, columns, from, to,
  onDateChange, choices, status, onStatusChange, disabledExport = false, noteFr, noteEn,
}: {
  locale: "fr" | "en";
  organizationName: string;
  title: string;
  endpoint: string;
  filters: Record<string, string>;
  reportFilters?: { label: string; value: string }[];
  columns: FinanceExportColumn[];
  from: string;
  to: string;
  onDateChange: (from: string, to: string) => void;
  choices?: CommercialStatusChoice[];
  status?: string;
  onStatusChange?: (next: string) => void;
  disabledExport?: boolean;
  noteFr?: string;
  noteEn?: string;
}) {
  const en = locale === "en";
  return <div data-commercial-design2-filters className="grid min-w-0 w-full gap-3">
    {choices?.length && onStatusChange ? <div data-horizontal-rail
      role="group" aria-label={en ? "Filter by business status" : "Filtrer par statut métier"}
      className="-mx-1 flex max-w-full touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {choices.map((choice) => <button type="button" key={choice.id || "all"} aria-pressed={(status || "") === choice.id}
        onClick={() => onStatusChange(choice.id)}
        className={`min-h-10 shrink-0 rounded-full border px-3 py-2 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${(status || "") === choice.id
          ? "border-cyan-500 bg-cyan-500/15 text-dtsc-blue shadow-sm"
          : "border-dtsc-border bg-dtsc-surface text-dtsc-muted hover:border-cyan-500/50 hover:text-dtsc-ink"}`}>{choice.label}</button>)}
    </div> : null}
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
      <FinanceDateFilter locale={locale} from={from} to={to} onChange={onDateChange} />
      <FinanceExportControls locale={locale} endpoint={endpoint} filters={filters} reportFilters={reportFilters} columns={columns}
        organizationName={organizationName} title={title} disabled={disabledExport}
        subtitleFr="DTSC Platform · Gestion commerciale & traçabilité"
        subtitleEn="DTSC Platform · Business operations & traceability" />
    </div>
    {noteFr || noteEn ? <div className="flex min-w-0 items-start gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-2.5 text-xs text-dtsc-muted">
      <SlidersHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-600" />
      <p className="min-w-0 leading-5">{en ? (noteEn || noteFr) : (noteFr || noteEn)}</p>
    </div> : null}
  </div>;
}

/** Navigate to the existing ERP source of truth, never produce synthetic data. */
export function CommercialDesign2Connections({ locale, items }: { locale: "fr" | "en"; items: CommercialConnection[] }) {
  return <nav aria-label={locale === "en" ? "Related ERP modules" : "Modules ERP associés"}
    data-commercial-erp-links className="flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-3">
    <span className="mr-1 text-xs font-black uppercase tracking-wider text-dtsc-muted">{locale === "en" ? "Connected" : "Connecté à"}</span>
    {items.map(({ module, labelFr, labelEn }) => <Link
      key={module} href={`/enterprise-modules/${encodeURIComponent(module)}`}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-xs font-bold text-dtsc-blue transition hover:border-cyan-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
      {locale === "en" ? labelEn : labelFr}<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
    </Link>)}
  </nav>;
}
