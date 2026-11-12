"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { downloadProfessionalCsv, downloadProfessionalXlsx, downloadProfessionalPdf, type ProfessionalReportExportModel } from "@/lib/reporting/professional-export";
import { customerFacingError } from "@/lib/customer-facing-language";

type Alert = {
  id: string; warehouse: string; siteId: string; catalogCode: string; catalogName: string;
  lotNumber: string; expiryDate: string; status: "EXPIRED" | "DUE_TODAY" | "EXPIRING_SOON";
  quantityAvailable: string;
};
type AlertPage = { items: Alert[]; page: number; pageCount: number; total: number; policy: { warningDays: number }; lowStock?: Array<{ warehouseId: string; warehouse: string; catalogCode: string; catalogName: string; minimumQuantity: string; quantityAvailable: string }>; lowStockTotal?: number; lowStockPage?: number; lowStockPageCount?: number };

export function RetailExpiryAlertsPanel({ organizationId, locale }: { organizationId: string; locale: "fr" | "en" }) {
  const [page, setPage] = useState(1);
  const [lowStockPage, setLowStockPage] = useState(1);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<AlertPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const en = locale === "en";
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20", lowStockPage: String(lowStockPage), lowStockPageSize: "12" });
      if (search.trim()) params.set("search", search.trim());
      if (severity) params.set("severity", severity);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const response = await fetch(`/api/enterprise/${organizationId}/retail/inventory-alerts?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as (AlertPage & { message?: string }) | null;
      if (!response.ok || !payload?.items) throw new Error(payload?.message || (en ? "The expiry alerts are unavailable." : "Les alertes de péremption sont indisponibles."));
      setData(payload);
    } catch (caught) { setError(customerFacingError(caught, locale)); }
    finally { setLoading(false); }
  }, [organizationId, page, lowStockPage, en, locale, search, severity, from, to]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, search ? 250 : 0); return () => clearTimeout(timer); }, [load, search]);
  async function exportExpiration(format: "csv" | "xlsx" | "pdf") {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const items: Alert[] = [];
      for (let currentPage = 1; ; currentPage++) {
        const params = new URLSearchParams({ page: String(currentPage), pageSize: "100" });
        if (search.trim()) params.set("search", search.trim());
        if (severity) params.set("severity", severity);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const response = await fetch(`/api/enterprise/${organizationId}/retail/inventory-alerts?${params}`, { cache: "no-store" });
        const pageData = await response.json().catch(() => null) as AlertPage | null;
        if (!response.ok || !pageData) throw new Error("Erreur de lecture des alertes.");
        if (pageData.total > 5000) throw new Error("Plus de 5 000 alertes. Affinez vos filtres avant l'export.");
        items.push(...pageData.items);
        if (currentPage >= pageData.pageCount) break;
      }
      const model: ProfessionalReportExportModel = {
        title: en ? "Retail batch expiration monitoring" : "Surveillance des lots et péremptions",
        subtitle: en ? "DTSC Platform — filtered, authorized warehouse balances" : "DTSC Platform — lots filtrés et autorisés par dépôt",
        filenameBase: `dtsc-expiry-${new Date().toLocaleDateString("sv-SE")}`,
        generatedLabel: new Date().toLocaleString(en ? "en-US" : "fr-FR"),
        kpis: [{ label: en ? "Batches" : "Lots", value: String(items.length) }],
        chart: [], insights: [],
        filters: [{ label: "Gravité", value: severity || "Toutes" }, { label: "Du", value: from || "—" }, { label: "Au", value: to || "—" }],
        columns: [{ key: "code", label: "Référence article" }, { key: "name", label: "Article" }, { key: "warehouse", label: "Dépôt" },
          { key: "lot", label: "Numéro de lot" }, { key: "expiry", label: "Péremption" }, { key: "status", label: "Statut" }, { key: "qty", label: "Disponible" }],
        rows: items.map((item) => ({ code: item.catalogCode, name: item.catalogName, warehouse: item.warehouse, lot: item.lotNumber, expiry: item.expiryDate.slice(0, 10), status: item.status, qty: Number(item.quantityAvailable) })),
      };
      if (format === "csv") downloadProfessionalCsv(model);
      else if (format === "xlsx") downloadProfessionalXlsx(model);
      else downloadProfessionalPdf(model);
    } catch (caught) {
      setError(customerFacingError(caught, locale, { fr: "Export des péremptions impossible.", en: "Expiry export failed." }));
    } finally { setExporting(false); }
  }
  return <section data-testid="retail-expiry-alerts" className="min-w-0 max-w-full rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3"><CalendarClock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div className="min-w-0"><h2 className="font-black text-dtsc-ink">{en ? "Batch expiry watch" : "Surveillance des lots et péremptions"}</h2><p className="mt-1 text-sm text-dtsc-muted">{en ? "Available batches approaching their expiry date, by warehouse." : "Lots disponibles dont la date de péremption approche, par dépôt."}</p></div></div>
      <div className="flex flex-wrap gap-2">
        {(["csv","xlsx","pdf"] as const).map((format) => <Button key={format} type="button" size="sm" variant="outline" disabled={exporting || loading} onClick={() => void exportExpiration(format)}>{format.toUpperCase()}</Button>)}
              <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className="h-4 w-4" />{en ? "Refresh" : "Actualiser"}</Button>
      </div>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs font-semibold text-dtsc-muted">Recherche<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setLowStockPage(1); }} placeholder="Article, référence…" className="mt-1 min-h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-3 text-dtsc-ink" /></label>
      <label className="text-xs font-semibold text-dtsc-muted">Gravité<select value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }} className="mt-1 min-h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-3 text-dtsc-ink"><option value="">Toutes</option><option value="EXPIRED">Périmé</option><option value="DUE_TODAY">Aujourd’hui</option><option value="EXPIRING_SOON">À venir</option></select></label>
      <label className="text-xs font-semibold text-dtsc-muted">Expiration du<input type="date" max={to || undefined} value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="mt-1 min-h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-3 text-dtsc-ink" /></label>
      <label className="text-xs font-semibold text-dtsc-muted">Expiration au<input type="date" min={from || undefined} value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="mt-1 min-h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-3 text-dtsc-ink" /></label>
    </div>
    {error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
    {loading ? <p role="status" className="mt-4 text-sm text-dtsc-muted">{en ? "Loading alerts…" : "Chargement des alertes…"}</p> : null}
    {!loading && data ? <>
      <div className="mt-4 rounded-xl border border-orange-500/25 bg-orange-500/5 p-3"><h3 className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><AlertTriangle className="h-4 w-4 text-orange-600" />{en ? "Low-stock alerts" : "Alertes de stock faible"} · {data.lowStockTotal || 0}</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{data.lowStock?.map((item) => <div key={`${item.warehouseId}:${item.catalogCode}`} className="rounded-lg border border-orange-500/20 bg-dtsc-surface p-2 text-xs"><strong className="block break-words text-dtsc-ink">{item.catalogName} · {item.catalogCode}</strong><p className="mt-1 text-dtsc-muted">{item.warehouse}</p><p className="mt-1 font-bold text-orange-700 dark:text-orange-300">{en ? "Available" : "Disponible"}: {item.quantityAvailable} · {en ? "Threshold" : "Seuil"}: {item.minimumQuantity}</p></div>)}{!data.lowStock?.length ? <p className="text-xs text-dtsc-muted">{en ? "No products below the configured threshold." : "Aucun produit sous son seuil configuré."}</p> : null}</div>{(data.lowStockTotal || 0) > (data.lowStock?.length || 0) ? <p className="mt-2 text-xs text-dtsc-muted">{en ? "Additional low-stock alerts can be reviewed on the following pages." : "D’autres alertes de stock faible sont accessibles sur les pages suivantes."}</p> : null}</div>
      <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-semibold text-dtsc-ink"><AlertTriangle className="mr-2 inline h-4 w-4 text-amber-600" />{data.total} {en ? "stock balances within the alert horizon" : "stocks concernés par l'horizon d'alerte"} · {data.policy.warningDays} {en ? "days" : "jours"}</p>
      <div className="mt-3 grid gap-2">
        {data.items.map((alert) => <article key={alert.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-bold text-dtsc-ink">{alert.catalogCode} · {alert.catalogName}</p><p className="mt-1 break-words text-xs text-dtsc-muted">{alert.warehouse} · {en ? "Batch" : "Lot"} {alert.lotNumber} · {en ? "Available" : "Disponible"} {alert.quantityAvailable}</p></div>
          <div className="text-right"><span className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${alert.status === "EXPIRED" ? "bg-red-500/15 text-red-700 dark:text-red-200" : alert.status === "DUE_TODAY" ? "bg-orange-500/15 text-orange-700 dark:text-orange-200" : "bg-amber-500/15 text-amber-700 dark:text-amber-200"}`}>{alert.status === "EXPIRED" ? (en ? "Expired" : "Périmé") : alert.status === "DUE_TODAY" ? (en ? "Due today" : "Expire aujourd'hui") : (en ? "Expiring soon" : "Expire bientôt")}</span><p className="mt-1 text-xs text-dtsc-muted">{new Intl.DateTimeFormat(en ? "en-US" : "fr-FR", { dateStyle: "medium" }).format(new Date(alert.expiryDate))}</p></div>

            <details className="mt-2 w-fit text-xs"><summary className="cursor-pointer rounded-lg border border-dtsc-border px-3 py-1.5 font-bold text-dtsc-blue">⋯ Actions</summary><Link className="mt-1 block rounded-lg border border-dtsc-border bg-dtsc-surface px-3 py-2 text-dtsc-blue" href="/enterprise-modules/INVENTORY_LOGISTICS">{en ? "Open stock and batches" : "Ouvrir stocks et lots"}</Link></details></article>)}
        {!data.items.length ? <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-dtsc-ink">{en ? "No batches are near expiry within the configured horizon." : "Aucun lot n'approche de la péremption dans le délai configuré."}</p> : null}
      </div>
      {(data.lowStockPageCount || 0) > 1 ? <div className="mt-2 flex items-center justify-end gap-2 text-xs text-dtsc-muted"><span>Stock faible : {lowStockPage} / {data.lowStockPageCount}</span><Button type="button" variant="outline" size="sm" disabled={lowStockPage <= 1} onClick={() => setLowStockPage(v => v - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button type="button" variant="outline" size="sm" disabled={lowStockPage >= (data.lowStockPageCount || 1)} onClick={() => setLowStockPage(v => v + 1)}><ChevronRight className="h-4 w-4" /></Button></div> : null}
      {data.pageCount > 1 ? <div className="mt-4 flex items-center justify-between gap-2 text-xs text-dtsc-muted"><span>{en ? "Page" : "Page"} {page} / {data.pageCount}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button type="button" variant="outline" disabled={page >= data.pageCount} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div> : null}
    </> : null}
  </section>;
}
