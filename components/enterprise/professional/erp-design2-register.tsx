"use client";

import type { ReactNode } from "react";
import { AlertTriangle, BadgeCheck, Boxes, CalendarClock, FileText, Gauge, Warehouse } from "lucide-react";
import { FinanceDateFilter, FinanceExportControls, type FinanceExportColumn } from "@/components/enterprise/professional/finance-design2-controls";
import { ModuleMetric } from "@/components/workspace/module-metrics";

export type ErpDesign2Tone = "sky" | "emerald" | "amber" | "rose" | "violet" | "slate" | "teal";

const accent: Record<ErpDesign2Tone, string> = {
  sky: "border-l-sky-500",
  emerald: "border-l-emerald-500",
  amber: "border-l-amber-500",
  rose: "border-l-rose-500",
  violet: "border-l-violet-500",
  slate: "border-l-slate-500",
  teal: "border-l-teal-500",
};
const ink: Record<ErpDesign2Tone, string> = {
  sky: "text-sky-500",
  emerald: "text-emerald-500",
  amber: "text-amber-500",
  rose: "text-rose-500",
  violet: "text-violet-500",
  slate: "text-slate-500",
  teal: "text-teal-500",
};
const glyph = {
  sky: Gauge,
  emerald: BadgeCheck,
  amber: CalendarClock,
  rose: AlertTriangle,
  violet: Boxes,
  slate: FileText,
  teal: Warehouse,
} as const;

/** Shared status-aware and color-coded KPI for DTSC 2.0 ERP registries. */
export function ErpDesign2Metric({ label, value, hint, tone = "sky" }: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: ErpDesign2Tone;
}) {
  const Icon = glyph[tone];
  return <ModuleMetric label={label} value={value} hint={hint} className={accent[tone]}
    icon={<Icon className={`h-4 w-4 ${ink[tone]}`} />} />;
}

/** A register must remain visible: ModuleSection's full-screen dialog is for detail workflows. */
export function ErpDesign2RegisterSection({ title, description, count, action, children, id }: {
  title: ReactNode;
  description?: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return <section data-erp-design2-register id={id}
    className="min-w-0 max-w-full rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 shadow-sm sm:p-5">
    <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-3 border-l-[3px] border-cyan-500 pl-3">
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <h2 className="min-w-0 break-words text-base font-black tracking-tight text-dtsc-ink sm:text-lg">{title}</h2>
        {description ? <p className="mt-1 max-w-4xl break-words text-xs leading-5 text-dtsc-muted sm:text-sm">{description}</p> : null}
      </div>
      {count !== undefined ? <span className="shrink-0 rounded-full border border-dtsc-border bg-dtsc-soft px-2.5 py-1 text-xs font-black text-dtsc-ink">{count}</span> : null}
      {action ? <div data-responsive-actions className="min-w-0 shrink-0">{action}</div> : null}
    </div>
    <div className="min-w-0 max-w-full">{children}</div>
  </section>;
}

export type ErpDesign2StatusOption = { id: string; label: string };

/** All export calls use the original authenticated ERP endpoints and reapply the server filters on every page. */
export function ErpDesign2RegisterTools({
  locale, title, organizationName, endpoint, columns, filters, reportFilters,
  status, statuses, onStatusChange,
  dateFrom, dateTo, onDateChange, dateDisabledReason,
}: {
  locale: "fr" | "en";
  title: string;
  organizationName: string;
  endpoint: string;
  columns: FinanceExportColumn[];
  filters?: Record<string, string>;
  reportFilters?: { label: string; value: string }[];
  status?: string;
  statuses?: ErpDesign2StatusOption[];
  onStatusChange?: (value: string) => void;
  dateFrom?: string;
  dateTo?: string;
  onDateChange?: (from: string, to: string) => void;
  dateDisabledReason?: string;
}) {
  const en = locale === "en";
  return <div data-erp-design2-tools className="grid min-w-0 max-w-full gap-3 border-y border-dtsc-border/80 py-3">
    {statuses && onStatusChange ? <div role="group" aria-label={en ? "Filter by status" : "Filtrer selon le statut"}
      className="flex min-w-0 max-w-full touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {statuses.map((option) => <button type="button" key={option.id || "all"} aria-pressed={status === option.id}
        onClick={() => onStatusChange(option.id)}
        className={`min-h-10 shrink-0 rounded-full border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${status === option.id ? "border-sky-500 bg-sky-500/15 text-dtsc-blue" : "border-dtsc-border bg-dtsc-page text-dtsc-muted hover:border-cyan-500/50 hover:text-dtsc-ink"}`}>
        {option.label}
      </button>)}
    </div> : null}
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
      {onDateChange ? <FinanceDateFilter locale={locale} from={dateFrom || ""} to={dateTo || ""}
        onChange={onDateChange} disabledReason={dateDisabledReason} /> : null}
      <FinanceExportControls endpoint={endpoint} organizationName={organizationName} title={title}
        locale={locale} filters={filters} reportFilters={reportFilters} columns={columns}
        subtitleFr="DTSC Platform · Registre ERP professionnel" subtitleEn="DTSC Platform · Professional ERP register" />
    </div>
    <p className="text-[0.7rem] leading-5 text-dtsc-muted">
      {en ? "Exports include all authorized matching records (up to 1,000), not only the visible page. They do not replace a signed accounting or statutory document."
        : "Les exports reprennent tous les enregistrements autorisés filtrés (1 000 maximum), pas seulement la page affichée. Ils ne remplacent pas une pièce comptable ou légale signée."}
    </p>
  </div>;
}
