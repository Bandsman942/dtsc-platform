"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FileClock, FilePlus2, RefreshCw, Search, ShieldAlert, ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { customerFacingError } from "@/lib/customer-facing-language";

type Store = { id: string; code: string; name: string; warehouses: { id: string; code: string; name: string }[] };
type InvoiceItem = { id: string; description: string; quantity: string; totalAmount: string };
type Checkout = {
  id: string;
  siteId: string;
  warehouseId: string;
  stockPostedAt: string | null;
  invoice: { id: string; number: string; status: string; currencyCode: string; grandTotal: string; outstandingAmount: string; items: InvoiceItem[] };
  site: { id: string; name: string; code: string };
};
type InvoiceResponse = {
  items: Checkout[];
  sites: Store[];
  checkoutReady: boolean;
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  message?: string;
};
type Product = { id: string; name: string; code: string; currency: string | null; inventoryItemId: string | null; trackInventory: boolean; availableQuantity: string | null };
type Line = { catalogItemId: string; name: string; quantity: number; currencyCode: string; inventoryItemId: string | null; stockLotId: string | null };
type Lot = { id: string; inventoryItemId: string; lotNumber: string; expiryDate: string | null; quantityAvailable: string };

const language = {
  fr: {
    title: "Factures et encaissements par boutique", lead: "Préparation commerciale et suivi de la facture Finance unique, avec remise du stock seulement après paiement intégral.",
    disabled: "Ce circuit est encore en validation. Les tickets POS actuels ne sont pas modifiés ; la préparation de nouvelles factures demeure désactivée.",
    warehouse: "Boutique et dépôt", chooseWarehouse: "Choisir un dépôt", product: "Rechercher un article", search: "Nom, référence ou code article", quantity: "Quantité", add: "Ajouter l'article", lines: "Articles à facturer", prepare: "Préparer la facture impayée", preparing: "Préparation…", clear: "Vider le panier", removed: "Retirer", lot: "Lot de stock", chooseLot: "Choisir un lot", noLines: "Ajoutez un ou plusieurs articles.",
    list: "Factures Retail", all: "Toutes les boutiques", refresh: "Actualiser", loading: "Chargement du registre…", empty: "Aucune facture Retail préparée pour cette sélection.",
    date: "Préparée", outstanding: "Reste dû", paid: "Payée", draft: "Brouillon", pending: "À valider", approved: "Approuvée", issued: "Émise", partial: "Partiellement payée", cancelled: "Annulée", voided: "Invalidée", overdue: "Échue", credited: "Avoir comptabilisé", unknown: "Statut à vérifier", delivered: "Stock délivré", stockPending: "Stock non encore délivré", finance: "Les validations et affectations de paiement sont réalisées dans le module Finance commun, avec les droits de chaque intervenant.",
    pagePrev: "Précédente", pageNext: "Suivante", currencyMismatch: "Une facture ne peut pas mélanger plusieurs devises. Préparez un autre panier pour cet article.", ready: "Circuit en cours d'activation contrôlée", failed: "Impossible de consulter les factures Retail.", saved: "Facture préparée. Elle attend les étapes de validation Finance.", duplicate: "Une facture existe déjà pour cette référence ; son état a été actualisé.",
  },
  en: {
    title: "Store invoices and collections", lead: "Prepare sales and track the single Finance invoice, with inventory released only after complete settlement.",
    disabled: "This workflow is still under validation. Existing POS receipts are unaffected; new invoice preparation remains disabled.",
    warehouse: "Store and warehouse", chooseWarehouse: "Choose a warehouse", product: "Find an item", search: "Item name, reference or code", quantity: "Quantity", add: "Add item", lines: "Invoice items", prepare: "Prepare unpaid invoice", preparing: "Preparing…", clear: "Clear basket", removed: "Remove", lot: "Stock batch", chooseLot: "Choose a batch", noLines: "Add one or more items.",
    list: "Retail invoices", all: "All stores", refresh: "Refresh", loading: "Loading invoices…", empty: "No Retail invoices in this selection.",
    date: "Prepared", outstanding: "Outstanding", paid: "Paid", draft: "Draft", pending: "Awaiting approval", approved: "Approved", issued: "Issued", partial: "Partially paid", cancelled: "Cancelled", voided: "Voided", overdue: "Overdue", credited: "Credit note posted", unknown: "Check status", delivered: "Inventory delivered", stockPending: "Inventory not yet delivered", finance: "Approvals and payment allocations are performed in the common Finance module under each actor's permissions.",
    pagePrev: "Previous", pageNext: "Next", currencyMismatch: "An invoice cannot mix currencies. Create another basket for this item.", ready: "Controlled activation in progress", failed: "Retail invoices are unavailable.", saved: "Invoice prepared. It is awaiting Finance approval stages.", duplicate: "An invoice already exists for this reference; its status has been refreshed.",
  },
} as const;

function invoiceStatus(status: string, lang: typeof language.fr | typeof language.en) {
  const values: Record<string, string> = {
    DRAFT: lang.draft, PENDING_APPROVAL: lang.pending, APPROVED: lang.approved, ISSUED: lang.issued,
    PARTIALLY_PAID: lang.partial, PAID: lang.paid, CANCELLED: lang.cancelled, VOIDED: lang.voided, OVERDUE: lang.overdue, CREDIT_NOTE: lang.credited,
  };
  return values[status] || lang.unknown;
}

function money(value: string, currency: string, locale: "fr" | "en") {
  return `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;
}

export function RetailInvoiceFlowWorkbench({ organizationId, locale }: { organizationId: string; locale: "fr" | "en" }) {
  const copy = language[locale];
  const [data, setData] = useState<InvoiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [siteFilter, setSiteFilter] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [selection, setSelection] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [lines, setLines] = useState<Line[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string>("");
  const warehouses = useMemo(() => (data?.sites || []).flatMap((site) => site.warehouses.map((warehouse) => ({ ...warehouse, siteId: site.id, siteName: site.name }))), [data?.sites]);
  const chosenWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId);
  const chosenProduct = products.find((product) => product.id === selection);
  const currencyCode = lines[0]?.currencyCode || chosenProduct?.currency || "CDF";
  const currencyMismatch = Boolean(chosenProduct && lines.length && lines[0].currencyCode !== (chosenProduct.currency || "CDF"));

  const load = useCallback(async (nextPage = page, site = siteFilter) => {
    setLoading(true);
    try {
      const queryString = new URLSearchParams({ page: String(nextPage), pageSize: "10", ...(site ? { siteId: site } : {}) });
      const response = await fetch(`/api/enterprise/${organizationId}/retail/invoices?${queryString}`, { cache: "no-store" });
      if (response.status === 403) { setForbidden(true); return; }
      const payload = await response.json().catch(() => null) as InvoiceResponse | null;
      if (!response.ok || !payload?.items || !payload.sites) throw new Error(payload?.message || copy.failed);
      setData(payload);
      setForbidden(false);
      setError("");
    } catch (caught) { setError(customerFacingError(caught, locale)); }
    finally { setLoading(false); }
  }, [copy.failed, locale, organizationId, page, siteFilter]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!data?.checkoutReady || !warehouseId || !query.trim()) { setProducts([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      void fetch(`/api/enterprise/${organizationId}/retail/products/search?${new URLSearchParams({ q: query.trim(), warehouseId, pageSize: "20" })}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => { const payload = await response.json() as { items?: Product[] }; if (!response.ok) throw new Error(); if (!controller.signal.aborted) setProducts(payload.items || []); })
        .catch(() => { if (!controller.signal.aborted) setProducts([]); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [data?.checkoutReady, organizationId, warehouseId, query]);

  useEffect(() => {
    const ids = [...new Set(lines.map((line) => line.inventoryItemId).filter((id): id is string => Boolean(id)))];
    if (!ids.length || !warehouseId) { setLots([]); return; }
    const controller = new AbortController();
    void fetch(`/api/enterprise/${organizationId}/retail/stock-lots?${new URLSearchParams({ warehouseId, inventoryItemIds: ids.join(",") })}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json() as { items?: Lot[] }; if (!response.ok) throw new Error(); if (!controller.signal.aborted) setLots(payload.items || []); })
      .catch(() => { if (!controller.signal.aborted) setLots([]); });
    return () => controller.abort();
  }, [lines, organizationId, warehouseId]);

  function addProduct() {
    if (!chosenProduct || !Number.isFinite(quantity) || quantity <= 0 || lines.some((line) => line.catalogItemId === chosenProduct.id)) return;
    if (lines.length && lines[0].currencyCode !== (chosenProduct.currency || "CDF")) return;
    setLines((current) => [...current, { catalogItemId: chosenProduct.id, inventoryItemId: chosenProduct.inventoryItemId, name: chosenProduct.name, quantity, currencyCode: chosenProduct.currency || "CDF", stockLotId: null }]);
    idempotencyKey.current = "";
    setSelection(""); setQuery(""); setQuantity(1);
  }

  async function prepare() {
    if (!data?.checkoutReady || !chosenWarehouse || !lines.length || submitting) return;
    setSubmitting(true);
    try {
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
      const response = await fetch(`/api/enterprise/${organizationId}/retail/invoices`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current, siteId: chosenWarehouse.siteId, warehouseId,
          currencyCode,
          lines: lines.map((line) => ({ catalogItemId: line.catalogItemId, stockLotId: line.stockLotId, quantity: line.quantity })),
        }),
      });
      const payload = await response.json().catch(() => null) as { message?: string; idempotent?: boolean } | null;
      if (!response.ok) throw new Error(payload?.message || copy.failed);
      toastSuccess(payload?.idempotent ? copy.duplicate : copy.saved);
      setLines([]); setLots([]); idempotencyKey.current = "";
      await load(1, siteFilter);
    } catch (caught) { const message = customerFacingError(caught, locale); setError(message); toastError(message); }
    finally { setSubmitting(false); }
  }

  if (forbidden) return null;
  return <section data-testid="retail-invoice-flow-workbench" className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3"><FileClock className="mt-0.5 h-5 w-5 shrink-0 text-dtsc-blue" aria-hidden="true" /><div className="min-w-0"><h2 className="font-black text-dtsc-ink">{copy.title}</h2><p className="mt-1 text-sm leading-6 text-dtsc-muted">{copy.lead}</p></div></div>
      <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className="h-4 w-4" />{copy.refresh}</Button>
    </header>
    {error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
    {data && !data.checkoutReady ? <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-200"><ShieldAlert className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />{copy.disabled}</p> : null}
    {data?.checkoutReady ? <div className="mt-4 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4">
      <h3 className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><FilePlus2 className="h-4 w-4 text-dtsc-blue" />{copy.prepare}</h3>
      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="min-w-0 text-xs font-bold text-dtsc-ink">{copy.warehouse}<select className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-surface p-2 text-sm" value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setLines([]); setSelection(""); idempotencyKey.current = ""; }}><option value="">{copy.chooseWarehouse}</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.siteName} · {warehouse.name}</option>)}</select></label>
        <label className="min-w-0 text-xs font-bold text-dtsc-ink">{copy.product}<span className="mt-1 flex min-h-11 items-center gap-2 rounded-lg border border-dtsc-border bg-dtsc-surface px-3"><Search className="h-4 w-4 shrink-0 text-dtsc-muted" /><input className="w-full min-w-0 bg-transparent text-sm outline-none" value={query} onChange={(event) => { setQuery(event.target.value); setSelection(""); }} placeholder={copy.search} disabled={!warehouseId} /></span><select className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-surface p-2 text-sm" value={selection} onChange={(event) => setSelection(event.target.value)} disabled={!products.length}><option value="">{searching ? "…" : copy.search}</option>{products.filter((item) => !lines.some((line) => line.catalogItemId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code} ({item.currency || "CDF"})</option>)}</select></label>
        <div className="flex min-w-0 items-end gap-2"><label className="min-w-0 flex-1 text-xs font-bold text-dtsc-ink">{copy.quantity}<input aria-label={copy.quantity} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-surface p-2 text-sm" type="number" step="0.001" min="0.001" max="1000000" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><Button type="button" variant="outline" disabled={!selection || quantity <= 0 || currencyMismatch} onClick={addProduct}><ShoppingBasket className="h-4 w-4" />{copy.add}</Button></div>
      </div>
      {currencyMismatch ? <p role="alert" className="mt-2 text-xs text-amber-800 dark:text-amber-200">{copy.currencyMismatch}</p> : null}
      <div className="mt-4 space-y-2"><h4 className="text-xs font-black uppercase tracking-wide text-dtsc-muted">{copy.lines}</h4>{lines.length ? lines.map((line) => <div key={line.catalogItemId} className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-dtsc-border bg-dtsc-surface p-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-bold text-dtsc-ink">{line.name}</p><p className="text-xs text-dtsc-muted">{copy.quantity} : {line.quantity} · {line.currencyCode}</p></div>{line.inventoryItemId && lots.some((lot) => lot.inventoryItemId === line.inventoryItemId) ? <label className="min-w-0 text-xs font-semibold text-dtsc-muted">{copy.lot}<select value={line.stockLotId || ""} onChange={(event) => { idempotencyKey.current = ""; setLines((current) => current.map((entry) => entry.catalogItemId === line.catalogItemId ? { ...entry, stockLotId: event.target.value || null } : entry)); }} className="mt-1 block min-h-11 max-w-full rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{copy.chooseLot}</option>{lots.filter((lot) => lot.inventoryItemId === line.inventoryItemId && Number(lot.quantityAvailable) > 0).map((lot) => <option key={lot.id} value={lot.id}>{lot.lotNumber} · {lot.quantityAvailable}</option>)}</select></label> : null}<Button type="button" variant="outline" onClick={() => { idempotencyKey.current = ""; setLines((current) => current.filter((entry) => entry.catalogItemId !== line.catalogItemId)); }}>{copy.removed}</Button></div>) : <p className="text-sm text-dtsc-muted">{copy.noLines}</p>}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="min-w-0 text-xs leading-5 text-dtsc-muted">{copy.finance}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!lines.length || submitting} onClick={() => { setLines([]); idempotencyKey.current = ""; }}>{copy.clear}</Button><Button type="button" disabled={!chosenWarehouse || !lines.length || submitting} onClick={() => void prepare()}><ArrowRight className="h-4 w-4" />{submitting ? copy.preparing : copy.prepare}</Button></div></div>
    </div> : null}
    <div className="mt-5 border-t border-dtsc-border pt-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-black text-dtsc-ink">{copy.list}</h3>{data?.sites.length ? <select aria-label={copy.warehouse} className="min-h-11 max-w-full rounded-lg border border-dtsc-border bg-dtsc-page px-2 text-sm" value={siteFilter} onChange={(event) => { setSiteFilter(event.target.value); setPage(1); }}><option value="">{copy.all}</option>{data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select> : null}</div>
      {loading ? <p role="status" className="mt-3 text-sm text-dtsc-muted">{copy.loading}</p> : null}
      {!loading && data && !data.items.length ? <p className="mt-3 rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">{copy.empty}</p> : null}
      <div className="mt-3 grid min-w-0 gap-2">{data?.items.map((entry) => <article key={entry.id} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3"><div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-black text-dtsc-ink">{entry.invoice.number} · {entry.site.name}</p><p className="mt-1 text-xs text-dtsc-muted">{entry.invoice.items.map((item) => item.description).join(" · ")}</p></div><span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">{invoiceStatus(entry.invoice.status, copy)}</span></div><div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-dtsc-muted"><span>{copy.outstanding} : <strong className="text-dtsc-ink">{money(entry.invoice.outstandingAmount, entry.invoice.currencyCode, locale)}</strong></span><span>{entry.stockPostedAt ? copy.delivered : copy.stockPending}</span></div></article>)}</div>
      {data && data.pagination.pageCount > 1 ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-dtsc-muted"><span>{data.pagination.page} / {data.pagination.pageCount} · {data.pagination.total}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>{copy.pagePrev}</Button><Button type="button" variant="outline" disabled={page >= data.pagination.pageCount || loading} onClick={() => setPage((current) => current + 1)}>{copy.pageNext}</Button></div></div> : null}
    </div>
  </section>;
}
