"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Lightbulb,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  downloadProfessionalCsv,
  downloadProfessionalXlsx,
  type ProfessionalReportExportModel,
} from "@/lib/reporting/professional-export";
import { downloadProfessionalPdfV2 } from "@/lib/reporting/professional-pdf-v2";

export type ProfessionalReportViewProps = {
  model: ProfessionalReportExportModel;
  locale?: string | null;
  logoUrl?: string | null;
  compact?: boolean;
  showExports?: boolean;
};

function isEnglish(locale?: string | null) {
  return String(locale || "fr").toLowerCase().startsWith("en");
}

function comparisonTone(comparison?: string | null) {
  if (!comparison) return "neutral" as const;
  const value = comparison.trim();
  if (value.startsWith("+") || value.includes("↑")) return "up" as const;
  if (value.startsWith("-") || value.includes("↓")) return "down" as const;
  return "neutral" as const;
}

function insightTone(tone?: "info" | "success" | "warning" | "danger") {
  if (tone === "success") return "border-emerald-500/30 bg-emerald-500/10";
  if (tone === "warning") return "border-amber-500/30 bg-amber-500/10";
  if (tone === "danger") return "border-rose-500/30 bg-rose-500/10";
  return "border-dtsc-blue/25 bg-dtsc-blue/5";
}

function safeInternalDeepLink(value: unknown) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/enterprise-modules/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

export function ProfessionalReportView({
  model,
  locale,
  logoUrl,
  compact = false,
  showExports = true,
}: ProfessionalReportViewProps) {
  const en = isEnglish(locale);
  const [tableQuery, setTableQuery] = useState("");
  const [rowLimit, setRowLimit] = useState(compact ? 8 : 25);
  const [logoFailed, setLogoFailed] = useState(false);
  const normalizedQuery = tableQuery.trim().toLocaleLowerCase(en ? "en" : "fr");
  const filteredRows = useMemo(() => {
    if (!normalizedQuery) return model.rows;
    return model.rows.filter((row) =>
      model.columns.some((column) =>
        String(row[column.key] ?? "")
          .toLocaleLowerCase(en ? "en" : "fr")
          .includes(normalizedQuery),
      ),
    );
  }, [en, model.columns, model.rows, normalizedQuery]);
  const exportModel = useMemo(
    () => ({
      ...model,
      rows: filteredRows,
      filters: normalizedQuery
        ? [
            ...(model.filters || []),
            {
              label: en ? "Detail search" : "Recherche dans le détail",
              value: tableQuery.trim(),
            },
          ]
        : model.filters,
    }),
    [en, filteredRows, model, normalizedQuery, tableQuery],
  );
  const chartMax = Math.max(1, ...model.chart.map((point) => Math.abs(point.value)));
  const visibleColumns = compact ? model.columns.slice(0, 4) : model.columns;
  const visibleRows = filteredRows.slice(0, rowLimit);
  const hasDrillDown = !compact && visibleRows.some((row) => Boolean(safeInternalDeepLink(row.__deepLink)));
  const accent = /^#[0-9a-fA-F]{6}$/.test(model.accentHex || "")
    ? model.accentHex
    : undefined;

  return (
    <section
      data-professional-report
      className="grid min-w-0 max-w-full gap-5 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5"
      style={accent ? { borderTopColor: accent, borderTopWidth: 3 } : undefined}
    >
      <header className="grid min-w-0 gap-4 border-b border-dtsc-border pb-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex min-w-0 items-start gap-3">
          {logoUrl && !logoFailed ? (
            // Organization logos may be hosted on tenant-configured external storage.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              onError={() => setLogoFailed(true)}
              className="h-11 w-11 shrink-0 rounded-xl border border-dtsc-border bg-white object-contain p-1"
            />
          ) : (
            <div
              aria-hidden="true"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-dtsc-blue text-sm font-black text-white"
              style={accent ? { backgroundColor: accent } : undefined}
            >
              DT
            </div>
          )}
          <div className="min-w-0">
            <p
              className="truncate text-xs font-black uppercase tracking-[0.16em] text-dtsc-blue"
              style={accent ? { color: accent } : undefined}
            >
              {model.organizationName || "DTSC Platform"}
            </p>
            <h3 className="mt-1 break-words text-xl font-black text-dtsc-text sm:text-2xl">
              {model.title}
            </h3>
            {model.subtitle ? (
              <p className="mt-1 break-words text-sm leading-5 text-dtsc-muted">{model.subtitle}</p>
            ) : null}
            {model.generatedLabel ? (
              <p className="mt-1 break-words text-xs text-dtsc-muted">{model.generatedLabel}</p>
            ) : null}
          </div>
        </div>
        {showExports ? (
          <div data-report-exports className="flex max-w-full flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadProfessionalCsv(exportModel)}>
              <Download className="h-4 w-4" />CSV
            </Button>
            <Button variant="outline" onClick={() => downloadProfessionalXlsx(exportModel)}>
              <FileSpreadsheet className="h-4 w-4" />Excel
            </Button>
            <Button variant="outline" onClick={() => downloadProfessionalPdfV2(exportModel)}>
              <FileText className="h-4 w-4" />PDF
            </Button>
          </div>
        ) : null}
      </header>

      {model.filters?.length ? (
        <div
          data-report-filters
          className="flex min-w-0 max-w-full flex-wrap items-center gap-2"
          aria-label={en ? "Applied report filters" : "Filtres appliqués au rapport"}
        >
          <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-dtsc-border px-3 text-xs font-black text-dtsc-muted">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {en ? "Scope" : "Périmètre"}
          </span>
          {model.filters.map((filter) => (
            <span
              key={`${filter.label}-${filter.value}`}
              className="inline-flex min-h-9 max-w-full items-center rounded-full bg-dtsc-soft px-3 text-xs font-bold text-dtsc-text"
            >
              <span className="max-w-full break-words">{filter.label}: {filter.value}</span>
            </span>
          ))}
        </div>
      ) : null}

      {model.kpis.length ? (
        <div
          data-report-kpis
          className="flex min-w-0 max-w-full snap-x gap-3 overflow-x-auto overscroll-x-contain pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4"
          aria-label={en ? "Report KPIs" : "KPI du rapport"}
        >
          {model.kpis.map((item) => {
            const tone = comparisonTone(item.comparison);
            return (
              <article
                key={item.label}
                className="min-w-[min(78vw,240px)] max-w-[240px] flex-1 snap-start rounded-2xl border border-dtsc-border bg-dtsc-soft/60 p-4 sm:min-w-0 sm:max-w-none"
              >
                <p className="whitespace-normal break-normal text-xs font-black uppercase leading-4 tracking-wide text-dtsc-muted">{item.label}</p>
                <p className="mt-2 break-words text-2xl font-black leading-tight text-dtsc-text">{item.value}</p>
                {item.comparison ? (
                  <p
                    className={`mt-2 inline-flex items-center gap-1 text-xs font-bold ${
                      tone === "up"
                        ? "text-emerald-600 dark:text-emerald-300"
                        : tone === "down"
                          ? "text-rose-600 dark:text-rose-300"
                          : "text-dtsc-muted"
                    }`}
                  >
                    {tone === "up" ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : tone === "down" ? (
                      <TrendingDown className="h-3.5 w-3.5" />
                    ) : null}
                    {item.comparison}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-dtsc-muted">{en ? "Current scope" : "Périmètre actuel"}</p>
                )}
              </article>
            );
          })}
        </div>
      ) : null}

      {model.chart.length ? (
        <section data-report-chart className="grid min-w-0 gap-3 border-y border-dtsc-border py-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-dtsc-blue" style={accent ? { color: accent } : undefined} />
            <h4 className="min-w-0 break-words font-black text-dtsc-text">{model.chartTitle || (en ? "Comparison" : "Comparaison")}</h4>
          </div>
          <div
            className="grid min-w-0 gap-3"
            role="img"
            aria-label={model.chartTitle || (en ? "Report chart" : "Graphique du rapport")}
          >
            {model.chart.slice(0, 12).map((point) => {
              const width = Math.max(2, Math.min(100, Math.abs(point.value) / chartMax * 100));
              return (
                <div
                  key={`${point.label}-${point.value}`}
                  className="grid min-w-0 gap-1 sm:grid-cols-[minmax(100px,0.8fr)_minmax(0,3fr)_auto] sm:items-center sm:gap-3"
                >
                  <span className="truncate text-xs font-bold text-dtsc-muted" title={point.label}>{point.label}</span>
                  <span className="h-3 min-w-0 overflow-hidden rounded-full bg-dtsc-soft" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-dtsc-blue transition-[width] duration-300"
                      style={{ width: `${width}%`, ...(accent ? { backgroundColor: accent } : {}) }}
                    />
                  </span>
                  <span className="text-right text-xs font-black tabular-nums text-dtsc-text">
                    {point.displayValue || point.value.toLocaleString(en ? "en-US" : "fr-FR")}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-dtsc-border p-4 text-sm text-dtsc-muted">
          {en
            ? "Not enough comparable data to draw a chart for this scope."
            : "Données comparables insuffisantes pour tracer un graphique sur ce périmètre."}
        </div>
      )}

      {model.insights.length ? (
        <section data-report-insights className="grid min-w-0 gap-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-dtsc-blue" style={accent ? { color: accent } : undefined} />
            <h4 className="font-black text-dtsc-text">{en ? "Interpretation" : "Interprétation"}</h4>
          </div>
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            {model.insights.map((insight) => (
              <article
                key={`${insight.title}-${insight.body}`}
                className={`min-w-0 rounded-xl border p-3 ${insightTone(insight.tone)}`}
              >
                <p className="break-words text-sm font-black text-dtsc-text">{insight.title}</p>
                <p className="mt-1 break-words text-sm leading-5 text-dtsc-muted">{insight.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-dtsc-border p-4 text-sm text-dtsc-muted">
          {en
            ? "No reliable interpretation can be produced from the available data yet."
            : "Aucune interprétation fiable ne peut encore être produite à partir des données disponibles."}
        </div>
      )}

      {visibleColumns.length && model.rows.length ? (
        <section data-report-table className="grid min-w-0 max-w-full gap-3">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h4 className="font-black text-dtsc-text">{en ? "Detailed metrics" : "Métriques détaillées"}</h4>
              <p className="break-words text-xs text-dtsc-muted">
                {en
                  ? `${filteredRows.length} of ${model.rows.length} row(s) in the current detail scope.`
                  : `${filteredRows.length} ligne(s) sur ${model.rows.length} dans le détail actuel.`}
              </p>
            </div>
            <div className="flex min-w-0 gap-2 sm:w-[320px]">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
                <Input
                  value={tableQuery}
                  onChange={(event) => { setTableQuery(event.target.value); setRowLimit(compact ? 8 : 25); }}
                  placeholder={en ? "Search detailed rows…" : "Rechercher dans le détail…"}
                  className="pl-9"
                  aria-label={en ? "Search report detail" : "Rechercher dans le détail du rapport"}
                />
              </div>
              {tableQuery ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => { setTableQuery(""); setRowLimit(compact ? 8 : 25); }}
                  aria-label={en ? "Clear detail search" : "Effacer la recherche"}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          {visibleRows.length ? (
            <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-dtsc-border">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-dtsc-soft">
                  <tr>
                    {visibleColumns.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        className="whitespace-nowrap px-3 py-2 text-xs font-black uppercase tracking-wide text-dtsc-muted"
                      >
                        {column.label}
                      </th>
                    ))}
                    {hasDrillDown ? <th scope="col" className="whitespace-nowrap px-3 py-2 text-xs font-black uppercase tracking-wide text-dtsc-muted">{en ? "Source" : "Source"}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, rowIndex) => {
                    const deepLink = safeInternalDeepLink(row.__deepLink);
                    return (
                      <tr key={rowIndex} className="border-t border-dtsc-border">
                        {visibleColumns.map((column) => (
                          <td
                            key={column.key}
                            className="max-w-[300px] whitespace-nowrap px-3 py-2 text-dtsc-text"
                          >
                            {String(row[column.key] ?? "—")}
                          </td>
                        ))}
                        {hasDrillDown ? (
                          <td className="whitespace-nowrap px-3 py-2">
                            {deepLink ? (
                              <a href={deepLink} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-dtsc-border px-2.5 text-xs font-bold text-dtsc-blue hover:bg-dtsc-soft">
                                <ExternalLink className="h-3.5 w-3.5" />
                                {en ? "Open" : "Explorer"}
                              </a>
                            ) : <span className="text-xs text-dtsc-muted">—</span>}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-dtsc-border p-4 text-sm text-dtsc-muted">
              {en ? "No detailed row matches this search." : "Aucune ligne détaillée ne correspond à cette recherche."}
            </div>
          )}

          {filteredRows.length > visibleRows.length ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-dtsc-muted">
              <span>
                {en
                  ? `${filteredRows.length - visibleRows.length} additional matching row(s). PDF, CSV and Excel exports include the complete filtered detail.`
                  : `${filteredRows.length - visibleRows.length} ligne(s) correspondante(s) supplémentaire(s). Les exports PDF, CSV et Excel reprennent tout le détail filtré.`}
              </span>
              {!compact ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setRowLimit((current) => Math.min(filteredRows.length, current + 25))}>
                  {en ? "Show more" : "Afficher plus"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
