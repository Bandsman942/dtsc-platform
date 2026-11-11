"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import {
  downloadProfessionalCsv, downloadProfessionalPdf, downloadProfessionalXlsx,
  type ProfessionalReportColumn, type ProfessionalReportExportModel,
} from "@/lib/reporting/professional-export";
import { toastError, toastSuccess } from "@/lib/client-toast";

type ExportItem = Record<string, unknown>;
type ExportMode = "csv" | "xlsx" | "pdf";
type PageResponse<T> = {
  items?: T[];
  pagination?: { page: number; pageSize: number; total: number; pageCount: number };
  page?: number; pageSize?: number; total?: number; pageCount?: number;
  message?: string;
};

export type RetailProfessionalListExportProps<T extends ExportItem = ExportItem> = {
  sourceUrl: string;
  locale: "fr" | "en";
  organizationName: string;
  title: string;
  filenameBase: string;
  columns: ProfessionalReportColumn[];
  toRow: (value: T) => Record<string, string | number | null | undefined>;
  filters?: Array<{ label: string; value: string }>;
  description?: string;
  maxRows?: number;
};

/**
 * The same server-filtered, permission-checked endpoint feeds the screen and
 * the export. No new client-side authority, no cached private API responses.
 * Large result sets are explicitly marked as partial rather than misrepresented
 * as complete company ledgers.
 */
export function RetailProfessionalListExport<T extends ExportItem = ExportItem>({
  sourceUrl, locale, organizationName, title, filenameBase,
  columns, toRow, filters = [], description, maxRows = 1500,
}: RetailProfessionalListExportProps<T>) {
  const [busy, setBusy] = useState<ExportMode | null>(null);
  const [progress, setProgress] = useState("");
  const en = locale === "en";

  async function exportReport(mode: ExportMode) {
    if (busy) return;
    setBusy(mode);
    setProgress("");
    try {
      const limit = mode === "pdf" ? Math.min(300, maxRows) : maxRows;
      const pageSize = 50;
      const fetched: T[] = [];
      let total = 0;
      let expectedPages = 1;
      let page = 1;
      let exhausted = false;
      // Bounded to avoid infinite loops if a backend returns inconsistent
      // pagination or the dataset changes while being exported.
      const maxPages = Math.max(1, Math.ceil(limit / pageSize) + 1);
      while (page <= maxPages && fetched.length < limit && !exhausted) {
        const url = new URL(sourceUrl, window.location.origin);
        if (url.origin !== window.location.origin) throw new Error("EXPORT_FOREIGN_ORIGIN_FORBIDDEN");
        url.searchParams.set("page", String(page));
        url.searchParams.set("pageSize", String(pageSize));
        const response = await fetch(url.pathname + url.search, { cache: "no-store", credentials: "same-origin" });
        const body = await response.json().catch(() => null) as PageResponse<T> | null;
        if (!response.ok || !body || !Array.isArray(body.items)) throw new Error("RETAIL_EXPORT_READ_FAILED");
        const pagination = body.pagination;
        const thisTotal = Number(pagination?.total ?? body.total ?? body.items.length);
        if (page === 1) {
          total = Number.isFinite(thisTotal) ? Math.max(0, thisTotal) : 0;
          expectedPages = Number(pagination?.pageCount ?? body.pageCount ?? Math.ceil(total / pageSize));
        }
        if (!body.items.length) {
          exhausted = true;
        } else {
          fetched.push(...body.items.slice(0, Math.max(0, limit - fetched.length)));
          exhausted = page >= expectedPages;
        }
        setProgress(en ? `${fetched.length} rows collected` : `${fetched.length} lignes récupérées`);
        page += 1;
      }
      const exported = fetched.length;
      const partial = exported < total;
      const model: ProfessionalReportExportModel = {
        title,
        subtitle: description || (en
          ? "Verified data retrieved from the DTSC Retail server, using current filters and permissions."
          : "Données vérifiées depuis le serveur DTSC Retail avec les filtres et autorisations actifs."),
        organizationName,
        filenameBase: `${filenameBase}-${new Date().toISOString().slice(0, 10)}`,
        generatedLabel: new Date().toISOString(),
        kpis: [
          { label: en ? "Matching records" : "Éléments correspondant aux filtres", value: String(total) },
          { label: en ? "Exported records" : "Éléments exportés", value: String(exported) },
          { label: en ? "Data coverage" : "Couverture des données", value: partial ? (en ? "Partial" : "Partielle") : (en ? "Complete" : "Complète") },
        ],
        columns,
        rows: fetched.map(toRow),
        filters,
        chart: [],
        insights: [
          { title: en ? "Data origin" : "Origine des données",
            body: en
              ? "Access scope, company and store permissions are verified on every API page. Different currencies must not be summed without conversion."
              : "Les autorisations d’entreprise et de boutique sont contrôlées sur chaque page API. Les devises distinctes ne doivent pas être additionnées sans conversion.",
            tone: "info" },
          ...(partial ? [{
            title: en ? "Export is partial" : "Export partiel",
            body: en
              ? `The first ${exported} of ${total} filtered items are included. Narrow the period or filters to obtain a complete file.`
              : `Seuls les ${exported} premiers des ${total} éléments filtrés sont inclus. Réduisez la période ou les filtres pour un document complet.`,
            tone: "warning" as const,
          }] : []),
        ],
        accentHex: "#0891B2",
      };
      if (mode === "xlsx") downloadProfessionalXlsx(model);
      else if (mode === "pdf") downloadProfessionalPdf(model);
      else downloadProfessionalCsv(model);
      toastSuccess(partial
        ? (en ? "Partial export generated. Narrow the filters for full coverage." : "Export partiel généré. Affinez les filtres pour un export complet.")
        : (en ? "Professional report generated." : "Rapport professionnel généré."));
    } catch {
      toastError(en ? "The data export could not be completed. Verify your access and retry." :
        "Impossible de terminer l’export. Vérifiez vos autorisations puis réessayez.");
    } finally {
      setBusy(null);
      setProgress("");
    }
  }

  return <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label={en ? "Professional exports" : "Exports professionnels"}>
    <span className="mr-1 text-xs font-semibold text-dtsc-muted">{en ? "Export" : "Exporter"}</span>
    <button type="button" disabled={Boolean(busy)} onClick={() => void exportReport("xlsx")} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-xs font-bold text-dtsc-blue transition hover:bg-dtsc-soft disabled:opacity-50"><FileSpreadsheet className="h-4 w-4" />Excel</button>
    <button type="button" disabled={Boolean(busy)} onClick={() => void exportReport("csv")} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-xs font-bold text-dtsc-blue transition hover:bg-dtsc-soft disabled:opacity-50"><Download className="h-4 w-4" />CSV</button>
    <button type="button" disabled={Boolean(busy)} onClick={() => void exportReport("pdf")} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-xs font-bold text-dtsc-blue transition hover:bg-dtsc-soft disabled:opacity-50"><FileText className="h-4 w-4" />PDF</button>
    {busy ? <span role="status" className="text-xs text-dtsc-muted">{progress || (en ? "Preparing…" : "Préparation…")}</span> : null}
  </div>;
}
