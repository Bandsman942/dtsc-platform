"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { financeMoney, financeStatusLabel } from "@/components/enterprise/professional/finance-professional-ui";
import { Input } from "@/components/ui/input";
import { notifyToast } from "@/lib/client-toast";
import { downloadProfessionalCsv, downloadProfessionalPdf, downloadProfessionalXlsx, type ProfessionalReportExportModel } from "@/lib/reporting/professional-export";

type Locale = "fr" | "en";
type DateMode = "all" | "today" | "week" | "month" | "exact" | "range";

function localToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

/** Calendar dates are business days, never UTC instants on the client. */
export function FinanceDateFilter({ locale, from, to, onChange, disabledReason }: {
  locale: Locale;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  disabledReason?: string;
}) {
  const [mode, setMode] = useState<DateMode>(from && from === to ? "exact" : from || to ? "range" : "all");
  useEffect(() => { if (!from && !to) setMode("all"); }, [from, to]);
  const en = locale === "en";
  function choose(next: DateMode) {
    setMode(next);
    const today = localToday();
    if (next === "all") onChange("", "");
    if (next === "today" || next === "exact") onChange(today, today);
    if (next === "week") {
      const date = new Date(`${today}T12:00:00`);
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      const start = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      onChange(start, today);
    }
    if (next === "month") onChange(`${today.slice(0, 7)}-01`, today);
    if (next === "range") onChange(from || today, to || today);
  }
  return <div className="flex min-w-0 flex-wrap items-end gap-2" aria-label={en ? "Business date filters" : "Filtres de dates métier"}>
    <label className="grid min-w-0 gap-1 text-xs font-bold text-dtsc-muted">
      <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{en ? "Period" : "Période"}</span>
      <select aria-label={en ? "Choose date filter" : "Choisir un filtre de date"} className="h-10 min-w-36 rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" value={mode} disabled={Boolean(disabledReason)} onChange={(event) => choose(event.target.value as DateMode)}>
        <option value="all">{en ? "All dates" : "Toutes les dates"}</option>
        <option value="today">{en ? "Today" : "Aujourd’hui"}</option>
        <option value="week">{en ? "This week" : "Cette semaine"}</option>
        <option value="month">{en ? "This month" : "Ce mois"}</option>
        <option value="exact">{en ? "Exact date" : "Date précise"}</option>
        <option value="range">{en ? "Custom range" : "Intervalle personnalisé"}</option>
      </select>
    </label>
    {mode === "exact" || mode === "range" ? <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{mode === "exact" ? (en ? "Date" : "Date") : (en ? "From" : "Du")}
      <Input className="h-10 min-w-0 sm:w-40" aria-label={en ? "Start date calendar" : "Calendrier de la date de début"} type="date" value={from} max={mode === "range" && to ? to : undefined} onChange={(event) => onChange(event.target.value, mode === "exact" ? event.target.value : to)} />
    </label> : null}
    {mode === "range" ? <label className="grid gap-1 text-xs font-bold text-dtsc-muted">{en ? "To" : "Au"}
      <Input className="h-10 min-w-0 sm:w-40" aria-label={en ? "End date calendar" : "Calendrier de la date de fin"} type="date" value={to} min={from || undefined} onChange={(event) => onChange(from, event.target.value)} />
    </label> : null}
    {disabledReason ? <span className="max-w-64 text-xs text-amber-700 dark:text-amber-300">{disabledReason}</span> : null}
  </div>;
}

export type FinanceFilteredTotal = { currencyCode: string; metric: "debit" | "credit" | "original" | "outstanding" | "inbound" | "outbound" | "invoiceTotal" | "paid" | "credited" | "creditTotal" | "tax"; amount: string; status?: string };
const filteredMetricLabels = {
  debit: { fr: "Total débit", en: "Total debit" },
  credit: { fr: "Total crédit", en: "Total credit" },
  invoiceTotal: { fr: "Total des factures", en: "Invoice total" },
  paid: { fr: "Montants réglés", en: "Paid amounts" },
  credited: { fr: "Montants crédités", en: "Credited amounts" },
  creditTotal: { fr: "Total des avoirs", en: "Credit note total" },
  tax: { fr: "Taxes", en: "Taxes" },
  original: { fr: "Montant initial", en: "Original amount" },
  outstanding: { fr: "Solde restant dû", en: "Outstanding balance" },
  inbound: { fr: "Montants entrants", en: "Inbound amounts" },
  outbound: { fr: "Montants sortants", en: "Outbound amounts" },
} as const;
function filteredMetricLabel(row: FinanceFilteredTotal, locale: Locale) {
  return [filteredMetricLabels[row.metric][locale], row.status ? financeStatusLabel(row.status, locale) : "", row.currencyCode].filter(Boolean).join(" · ");
}
export function FinanceFilteredTotals({ rows, locale }: { rows: FinanceFilteredTotal[]; locale: Locale }) {
  if (!rows.length) return null;
  const label = locale === "fr" ? "Sous-totaux filtrés (toutes pages)" : "Filtered subtotals (all pages)";
  return <div className="min-w-0"><p className="text-xs font-semibold text-dtsc-muted">{label}</p><ModuleMetrics label={label}>{rows.map(row => <ModuleMetric key={[row.metric,row.status,row.currencyCode].join(":")} label={filteredMetricLabel(row, locale)} value={financeMoney(row.amount,row.currencyCode,locale)} />)}</ModuleMetrics></div>;
}

export type FinanceExportColumn = { key: string; labelFr: string; labelEn: string; get: (row: Record<string, unknown>) => string | number };

/** Downloads the FULL authorized, filtered result up to the safe export cap; never silently exports only the visible page. */
export function FinanceExportControls({ endpoint, organizationName, title, locale, filters, reportFilters, columns, disabled, subtitleFr, subtitleEn }: {
  endpoint: string;
  organizationName: string;
  title: string;
  locale: Locale;
  filters?: Record<string, string>;
  reportFilters?: { label: string; value: string }[];
  columns: FinanceExportColumn[];
  disabled?: boolean;
  subtitleFr?: string;
  subtitleEn?: string;
}) {
  const [busy, setBusy] = useState<"CSV" | "Excel" | "PDF" | null>(null);
  const en = locale === "en";
  const tr = (fr: string, english: string) => en ? english : fr;
  async function exportFile(format: "CSV" | "Excel" | "PDF") {
    if (busy) return;
    setBusy(format);
    try {
      const params = new URLSearchParams({ ...filters, page: "1", pageSize: "100" });
      const first = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}${params}`, { cache: "no-store" });
      const body = await first.json().catch(() => null) as { items?: Record<string, unknown>[]; pagination?: { pageCount?: number; total?: number }; filteredTotals?: FinanceFilteredTotal[]; physicalTotals?: Array<{ unitId: string; unit: string; value: string; precisionMismatch: boolean }>; message?: string } | null;
      if (!first.ok || !body || !Array.isArray(body.items)) throw new Error(body?.message || tr("L’export des données a échoué.", "Data export failed."));
      const total = body.pagination?.total ?? body.items.length;
      const pages = body.pagination?.pageCount ?? 1;
      // Some Finance APIs cap pageSize at 50; still retrieve every eligible row.
      if (total > 1000 || pages > 200) throw new Error(tr(`Le résultat contient ${total} lignes. Affinez les dates ou la recherche (limite de 1 000 lignes par export).`, `There are ${total} rows. Narrow the date or search filters (1,000 rows per export).`));
      const all = [...body.items];
      const summarySignature = (value: { filteredTotals?: FinanceFilteredTotal[]; physicalTotals?: Array<{ unitId: string; unit: string; value: string; precisionMismatch: boolean }> }) => JSON.stringify([...(value.filteredTotals || []).map(row => JSON.stringify([row.metric, row.currencyCode, row.status || "", row.amount])), ...(value.physicalTotals || []).map(row => JSON.stringify([row.unitId,row.value,row.precisionMismatch]))].sort());
      const firstSummary = summarySignature(body);
      for (let start = 2; start <= pages; start += 3) {
        const batch = await Promise.all(Array.from({ length: Math.min(3, pages - start + 1) }, (_, index) => {
          const query = new URLSearchParams(params);
          query.set("page", String(start + index));
          return fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}${query}`, { cache: "no-store" }).then(async (response) => {
            const result = await response.json().catch(() => null) as { items?: Record<string, unknown>[]; pagination?: { total?: number }; filteredTotals?: FinanceFilteredTotal[]; physicalTotals?: Array<{ unitId: string; unit: string; value: string; precisionMismatch: boolean }>; message?: string } | null;
            if (!response.ok || !Array.isArray(result?.items)) throw new Error(result?.message || tr("L’extraction a été interrompue.", "The export was interrupted."));
            if ((result.pagination?.total ?? total) !== total || summarySignature(result) !== firstSummary) throw new Error(tr("Les données ont changé pendant l’export. Réessayez.", "Data changed during export. Retry."));
            return result.items;
          });
        }));
        all.push(...batch.flat());
      }
      const ids = all.map(row => row.id).filter((id): id is string => typeof id === "string" && Boolean(id));
      if (all.length !== total || new Set(ids).size !== ids.length) throw new Error(tr("Les données ont changé pendant l’export. Réessayez.", "Data changed during export. Retry."));
      // Date/status filters are validated and enforced by each module API, not a browser-only projection.
      const now = new Intl.DateTimeFormat(en ? "en-GB" : "fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date());
      const model: ProfessionalReportExportModel = {
        organizationName, title, subtitle: tr(subtitleFr || "DTSC Platform · Comptabilité & conformité", subtitleEn || "DTSC Platform · Accounting & compliance"),
        filenameBase: `DTSC-${title.replace(/\s+/g, "-")}-${localToday()}`,
        generatedLabel: `${tr("Édité le", "Generated on")} ${now}`,
        kpis: [{ label: tr("Enregistrements", "Records"), value: String(all.length), numericValue: all.length }, ...(Array.isArray(body.filteredTotals) ? body.filteredTotals.filter(row => row.metric in filteredMetricLabels).map(row => ({ label: `${tr("Sous-total filtré", "Filtered subtotal")} · ${filteredMetricLabel(row, locale)}`, value: financeMoney(row.amount,row.currencyCode,locale) })) : []), ...(body.physicalTotals || []).map(row => ({ label: `${tr("Sous-total physique filtré", "Filtered on-hand subtotal")} · ${row.unit}`, value: `${row.value} ${row.unit}${row.precisionMismatch ? tr(" · Précision à vérifier", " · Precision needs review") : ""}` }))],
        includeCompleteSummary: Boolean(body.filteredTotals?.length || body.physicalTotals?.length),
        chart: [], insights: [],
        filters: reportFilters ?? Object.entries(filters || {}).filter(([, value]) => value).map(([key, value]) => ({ label: key, value })),
        columns: columns.map((column) => ({ key: column.key, label: en ? column.labelEn : column.labelFr })),
        rows: all.map((row) => Object.fromEntries(columns.map((column) => [column.key, column.get(row)]))),
        accentHex: "#087EA4",
      };
      if (format === "CSV") downloadProfessionalCsv(model);
      else if (format === "Excel") downloadProfessionalXlsx(model);
      else downloadProfessionalPdf(model);
      notifyToast(tr(`${all.length} lignes « ${title} » téléchargées en ${format}.`, `${all.length} “${title}” records downloaded as ${format}.`), "success");
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : tr("Export impossible.", "Export unavailable."), "error");
    } finally { setBusy(null); }
  }
  return <div className="flex flex-wrap items-center gap-1.5" aria-label={tr("Exporter les données filtrées", "Export filtered data")}>
    <Button type="button" size="sm" variant="outline" disabled={disabled || Boolean(busy)} onClick={() => void exportFile("Excel")}><FileSpreadsheet className="mr-1 h-4 w-4 text-emerald-600" />{busy === "Excel" ? "…" : "Excel"}</Button>
    <Button type="button" size="sm" variant="outline" disabled={disabled || Boolean(busy)} onClick={() => void exportFile("CSV")}><Download className="mr-1 h-4 w-4 text-sky-600" />{busy === "CSV" ? "…" : "CSV"}</Button>
    <Button type="button" size="sm" variant="outline" disabled={disabled || Boolean(busy)} onClick={() => void exportFile("PDF")}><FileText className="mr-1 h-4 w-4 text-rose-600" />{busy === "PDF" ? "…" : "PDF"}</Button>
  </div>;
}
