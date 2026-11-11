"use client";

import Link from "next/link";
import { RetailProfessionalListExport } from "@/components/enterprise/professional/retail-professional-list-export";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerFacingError } from "@/lib/customer-facing-language";
import { toastSuccess, toastError } from "@/lib/client-toast";

type Alert = {
  id: string; warehouseId: string; warehouse: string; siteId: string;
  catalogCode: string; catalogName: string; lotNumber: string;
  expiryDate: string; status: "EXPIRED" | "DUE_TODAY" | "EXPIRING_SOON"; quantityAvailable: string;
};
type LowStock = { warehouseId: string; warehouse: string; catalogCode: string; catalogName: string; minimumQuantity: string; quantityAvailable: string };
type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
type AlertPage = {
  items: Alert[]; page: number; pageCount: number; total: number;
  policy: { warningDays: number };
  lowStock?: LowStock[]; lowStockTotal?: number; lowStockPagination?: Pagination;
};
type Warehouse = { id: string; name: string; site?: { name: string } };
export function RetailExpiryAlertsPanel({ organizationId, locale, organizationName }: { organizationId: string; locale: "fr" | "en"; organizationName: string }) {
  const en = locale === "en";
  const [page, setPage] = useState(1);
  const [lowStockPage, setLowStockPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [data, setData] = useState<AlertPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    fetch("/api/enterprise/" + organizationId + "/retail/dashboard?moduleCode=RETAIL_POS", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (active) setWarehouses(body?.warehouses || []); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [organizationId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize),
        lowStockPage: String(lowStockPage), lowStockPageSize: String(pageSize) });
      if (debouncedSearch) query.set("search", debouncedSearch);
      if (status) query.set("status", status);
      if (warehouseId) query.set("warehouseId", warehouseId);
      if (dateFrom) query.set("dateFrom", dateFrom);
      if (dateTo) query.set("dateTo", dateTo);
      const response = await fetch("/api/enterprise/" + organizationId + "/retail/inventory-alerts?" + query.toString(), { cache: "no-store" });
      const payload = await response.json().catch(() => null) as (AlertPage & { message?: string }) | null;
      if (!response.ok || !payload?.items) throw new Error(payload?.message || (en ? "Expiry alerts unavailable." : "Alertes de péremption indisponibles."));
      setData(payload);
    } catch (caught) { setError(customerFacingError(caught, locale)); }
    finally { setLoading(false); }
  }, [organizationId, page, lowStockPage, pageSize, debouncedSearch, status, warehouseId, dateFrom, dateTo, en, locale]);
  useEffect(() => { void load(); }, [load]);
  const resetPages = () => { setPage(1); setLowStockPage(1); };
  const clear = () => { setSearch(""); setStatus(""); setWarehouseId(""); setDateFrom(""); setDateTo(""); resetPages(); };
  const dateLabel = (value: string) => new Intl.DateTimeFormat(en ? "en-US" : "fr-FR", { dateStyle: "medium" }).format(new Date(value));
  async function copyLot(lot: string) {
    try { await navigator.clipboard.writeText(lot); toastSuccess(en ? "Lot number copied." : "Numéro de lot copié."); }
    catch { toastError(en ? "Clipboard unavailable." : "Presse-papiers indisponible."); }
  }

  return <section data-testid="retail-expiry-alerts" className="min-w-0 max-w-full space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /><div><h2 className="font-black text-dtsc-ink">{en ? "Expiry & stock alerts" : "Alertes de péremption et de stock"}</h2><p className="mt-1 text-sm text-dtsc-muted">{en ? "Monitor dated lots, low stock and inventory risk by store." : "Surveillez les lots datés et les seuils de stock par boutique."}</p></div></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className="h-4 w-4" />{en ? "Refresh" : "Actualiser"}</Button><Link href="/enterprise-modules/RETAIL_POS?section=inventory" className="inline-flex min-h-10 items-center rounded-xl border border-dtsc-border px-3 text-xs font-bold text-dtsc-blue">{en ? "Stock policy" : "Règles de stock"}</Link></div>
    </header>
    <div className="grid gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3 md:grid-cols-2 xl:grid-cols-6">
      <label className="text-xs font-bold text-dtsc-muted xl:col-span-2">{en ? "Smart search" : "Recherche intelligente"}<span className="mt-1 flex h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><Search className="h-4 w-4" /><input className="w-full min-w-0 bg-transparent text-sm text-dtsc-ink outline-none" value={search} onChange={(event) => { setSearch(event.target.value); resetPages(); }} placeholder={en ? "Item, code, lot" : "Article, code, lot"} /></span></label>
      <label className="text-xs font-bold text-dtsc-muted">{en ? "Warehouse" : "Dépôt"}<select className="mt-1 h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm" value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); resetPages(); }}><option value="">{en ? "All" : "Tous"}</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.site?.name ? item.site.name + " · " : ""}{item.name}</option>)}</select></label>
      <label className="text-xs font-bold text-dtsc-muted">{en ? "From" : "Du"}<input className="mt-1 h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); resetPages(); }} /></label>
      <label className="text-xs font-bold text-dtsc-muted">{en ? "To" : "Au"}<input className="mt-1 h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); resetPages(); }} /></label>
      <label className="text-xs font-bold text-dtsc-muted">{en ? "Per page" : "Par page"}<select className="mt-1 h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); resetPages(); }}>{[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label={en ? "Expiry status" : "Filtres des péremptions"}>
      {["", "EXPIRED", "DUE_TODAY", "EXPIRING_SOON"].map((item) => <button type="button" key={item || "ALL"} className={"rounded-full border px-3 py-2 text-xs font-bold " + (status === item ? "border-cyan-500 bg-cyan-500/15 text-dtsc-blue" : "border-dtsc-border text-dtsc-ink")} onClick={() => { setStatus(item); resetPages(); }}>{item === "" ? (en ? "All" : "Tous") : item === "EXPIRED" ? (en ? "Expired" : "Périmés") : item === "DUE_TODAY" ? (en ? "Today" : "Aujourd’hui") : (en ? "Soon" : "Bientôt")}</button>)}
      <button type="button" onClick={clear} className="rounded-full border border-dtsc-border px-3 py-2 text-xs font-bold text-dtsc-blue">{en ? "Clear" : "Effacer"}</button>
    </div>
    <div className="flex flex-wrap gap-3">
      <RetailProfessionalListExport<Alert> organizationName={organizationName} locale={locale}
        title={en ? "Expiry watch — Retail" : "Surveillance des lots et péremptions"}
        filenameBase="retail-expiry"
        sourceUrl={`/api/enterprise/${organizationId}/retail/inventory-alerts?${new URLSearchParams({
          ...(search ? { search } : {}), ...(status ? { status } : {}), ...(warehouseId ? { warehouseId } : {}),
          ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}),
        })}`}
        columns={[{ key: "item", label: en ? "Product" : "Article" }, { key: "code", label: "Code" },
          { key: "warehouse", label: en ? "Warehouse" : "Dépôt" }, { key: "lot", label: "Lot" },
          { key: "expiry", label: en ? "Expiry" : "Péremption" }, { key: "available", label: en ? "Available" : "Disponible" },
          { key: "status", label: en ? "Status" : "Statut" }]}
        toRow={(item) => ({ item: item.catalogName, code: item.catalogCode, warehouse: item.warehouse,
          lot: item.lotNumber, expiry: item.expiryDate.slice(0, 10), available: Number(item.quantityAvailable), status: item.status })}
        filters={[{ label: en ? "From" : "Du", value: dateFrom || "—" },
          { label: en ? "To" : "Au", value: dateTo || "—" }]} />
      <RetailProfessionalListExport<LowStock> organizationName={organizationName} locale={locale}
        itemsKey="lowStock" pageParam="lowStockPage"
        title={en ? "Low-stock warnings — Retail" : "Alertes de stock faible"}
        filenameBase="retail-low-stock"
        sourceUrl={`/api/enterprise/${organizationId}/retail/inventory-alerts?${new URLSearchParams({
          ...(search ? { search } : {}), ...(warehouseId ? { warehouseId } : {}),
        })}`}
        columns={[{ key: "item", label: en ? "Product" : "Article" }, { key: "code", label: "Code" },
          { key: "warehouse", label: en ? "Warehouse" : "Dépôt" }, { key: "available", label: en ? "Available" : "Disponible" },
          { key: "minimum", label: en ? "Threshold" : "Seuil" }]}
        toRow={(item) => ({ item: item.catalogName, code: item.catalogCode, warehouse: item.warehouse,
          available: Number(item.quantityAvailable), minimum: Number(item.minimumQuantity) })}
        filters={[{ label: en ? "Warehouse" : "Dépôt", value: warehouses.find((w) => w.id === warehouseId)?.name || (en ? "All" : "Tous") }]} />
    </div>
    {error ? <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
    {loading ? <p role="status" className="text-sm text-dtsc-muted">{en ? "Loading alerts…" : "Chargement des alertes…"}</p> : null}
    {!loading && data ? <>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"><span className="text-xs font-bold text-dtsc-muted">{en ? "Expiry alerts" : "Alertes de péremption"}</span><strong className="mt-1 block text-xl text-dtsc-ink">{data.total}</strong></div>
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3"><span className="text-xs font-bold text-dtsc-muted">{en ? "Low stock" : "Stock faible"}</span><strong className="mt-1 block text-xl text-dtsc-ink">{data.lowStockTotal || 0}</strong></div>
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3"><span className="text-xs font-bold text-dtsc-muted">{en ? "Warning horizon" : "Horizon d'alerte"}</span><strong className="mt-1 block text-xl text-dtsc-ink">{data.policy.warningDays} {en ? "days" : "jours"}</strong></div>
      </div>
      <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-3">
        <h3 className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><AlertTriangle className="h-4 w-4 text-orange-600" />{en ? "Low-stock alerts" : "Alertes de stock faible"} · {data.lowStockTotal || 0}</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{data.lowStock?.map((item) => <article key={item.warehouseId + ":" + item.catalogCode} className="rounded-lg border border-orange-500/20 bg-dtsc-surface p-3 text-xs"><strong className="block break-words text-dtsc-ink">{item.catalogName} · {item.catalogCode}</strong><p className="mt-1 text-dtsc-muted">{item.warehouse}</p><p className="mt-1 font-bold text-orange-700 dark:text-orange-300">{en ? "Available" : "Disponible"} : {item.quantityAvailable} · {en ? "Threshold" : "Seuil"} : {item.minimumQuantity}</p></article>)}{!data.lowStock?.length ? <p className="text-xs text-dtsc-muted">{en ? "No matching low-stock alerts." : "Aucune alerte de stock faible pour ces filtres."}</p> : null}</div>
        {data.lowStockPagination && data.lowStockPagination.pageCount > 1 ? <div className="mt-3 flex items-center justify-between text-xs"><span>{data.lowStockPagination.page}/{data.lowStockPagination.pageCount}</span><div className="flex gap-2"><Button size="sm" type="button" variant="outline" disabled={lowStockPage <= 1} onClick={() => setLowStockPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button size="sm" type="button" variant="outline" disabled={lowStockPage >= data.lowStockPagination!.pageCount} onClick={() => setLowStockPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div> : null}
      </div>
      <h3 className="text-sm font-black text-dtsc-ink">{en ? "Dated lots" : "Lots suivis en péremption"}</h3>
      <div className="grid gap-2 md:grid-cols-2">{data.items.map((item) => <article key={item.id} className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-bold text-dtsc-ink">{item.catalogCode} · {item.catalogName}</p><p className="mt-1 text-xs text-dtsc-muted">{item.warehouse} · {en ? "Lot" : "Lot"} {item.lotNumber} · {en ? "Available" : "Disponible"} {item.quantityAvailable}</p><p className="mt-1 text-xs text-dtsc-muted">{dateLabel(item.expiryDate)}</p></div>
        <div className="flex flex-col items-end gap-2"><span className={"rounded-lg px-2 py-1 text-xs font-bold " + (item.status === "EXPIRED" ? "bg-red-500/15 text-red-600" : item.status === "DUE_TODAY" ? "bg-orange-500/15 text-orange-600" : "bg-amber-500/15 text-amber-600")}>{item.status === "EXPIRED" ? (en ? "Expired" : "Périmé") : item.status === "DUE_TODAY" ? (en ? "Due today" : "Expire aujourd’hui") : (en ? "Expiring soon" : "Expire bientôt")}</span>
        <details className="relative"><summary className="cursor-pointer list-none rounded-lg border border-dtsc-border px-3 py-1.5 text-lg text-dtsc-ink" aria-label={en ? "Lot actions" : "Actions du lot"}>⋯</summary><div className="absolute right-0 z-20 mt-1 min-w-44 rounded-xl border border-dtsc-border bg-dtsc-surface p-2 shadow-xl"><button type="button" onClick={() => void copyLot(item.lotNumber)} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-dtsc-soft">{en ? "Copy lot number" : "Copier le numéro du lot"}</button><Link href="/enterprise-modules/INVENTORY_LOGISTICS" className="block rounded-lg px-3 py-2 text-xs hover:bg-dtsc-soft">{en ? "Open inventory" : "Ouvrir Inventaire"}</Link></div></details></div>
      </article>)}{!data.items.length ? <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-dtsc-ink">{en ? "No lots match the current filters." : "Aucun lot ne correspond aux filtres sélectionnés."}</p> : null}</div>
      {data.pageCount > 1 ? <div className="flex items-center justify-between gap-2 text-xs text-dtsc-muted"><span>{en ? "Page" : "Page"} {page} / {data.pageCount} · {data.total}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button type="button" variant="outline" disabled={page >= data.pageCount} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div> : null}
    </> : null}
  </section>;
}
