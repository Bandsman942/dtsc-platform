"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Printer, RefreshCw, Search } from "lucide-react";
import { RetailInvoicePaymentDialog } from "@/components/enterprise/professional/retail-invoice-payment-dialog";
import { Button } from "@/components/ui/button";
import { customerFacingError } from "@/lib/customer-facing-language";

type Store = { id: string; name: string; code: string };
type Checkout = {
  id: string;
  siteId: string;
  canCollect: boolean;
  invoice: {
    id: string; number: string; status: string; currencyCode: string;
    grandTotal: string; outstandingAmount: string;
    items: { id: string; description: string; quantity: string }[];
  };
  site: Store;
};
type Result = {
  items: Checkout[];
  sites: Store[];
  checkoutReady: boolean;
  pagination: { page: number; pageCount: number; total: number };
  message?: string;
};

const messages = {
  fr: {
    title: "Encaissements au comptoir", intro: "Uniquement les factures émises et non soldées de vos boutiques. Le facturier ne reçoit aucun moyen de paiement dans son panier.",
    noAccess: "Vous n'avez pas le droit d'encaisser pour cette boutique. Demandez une affectation de caisse à l'administrateur.",
    notReady: "Le circuit de facturation et d'encaissement séparés n'est pas encore activé pour cette entreprise. Terminez les prérequis RETAIL et Finance.",
    all: "Toutes mes boutiques", site: "Boutique", search: "Numéro de facture", searchHelp: "Rechercher dans les factures impayées", refresh: "Actualiser",
    empty: "Aucune facture à encaisser pour cette sélection.", loading: "Chargement des factures à encaisser…", failed: "Impossible de consulter les factures à encaisser.",
    total: "Montant facturé", due: "Reste à encaisser", issued: "À encaisser", partial: "Paiement partiel", overdue: "Échue",
    a4: "Facture A4", thermal: "Ticket 80 mm", previous: "Précédente", next: "Suivante", page: "Page",
  },
  en: {
    title: "Checkout collections", intro: "Only issued and outstanding invoices from your stores. Invoicers cannot take payments from their basket.",
    noAccess: "You cannot collect for this store. Ask an administrator to grant you store till access.",
    notReady: "The separate invoice and collection workflow is not yet active for this company. Complete Retail and Finance readiness first.",
    all: "All my stores", site: "Store", search: "Invoice number", searchHelp: "Search outstanding invoices", refresh: "Refresh",
    empty: "No invoices to collect match this selection.", loading: "Loading outstanding invoices…", failed: "Unable to load invoices for collection.",
    total: "Invoiced total", due: "Outstanding", issued: "Awaiting payment", partial: "Partially paid", overdue: "Overdue",
    a4: "A4 invoice", thermal: "80 mm ticket", previous: "Previous", next: "Next", page: "Page",
  },
} as const;

function money(value: string, currency: string, locale: "fr" | "en") {
  return `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;
}

export function RetailInvoiceCashierWorkbench({ organizationId, locale, preferredSiteId }: {
  organizationId: string; locale: "fr" | "en"; preferredSiteId?: string;
}) {
  const t = messages[locale];
  const [result, setResult] = useState<Result | null>(null);
  const [siteId, setSiteId] = useState(preferredSiteId || "");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [notReady, setNotReady] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ view: "collections", page: String(page), pageSize: "10" });
      if (siteId) query.set("siteId", siteId);
      if (debouncedSearch) query.set("q", debouncedSearch);
      const response = await fetch(`/api/enterprise/${organizationId}/retail/invoices?${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as (Result & { error?: string }) | null;
      if (response.status === 403) {
        setNotReady(payload?.error === "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE");
        setForbidden(payload?.error !== "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE");
        setResult(null);
        setError("");
        return;
      }
      if (!response.ok || !payload?.items || !payload.sites) throw new Error(payload?.message || t.failed);
      setResult(payload);
      setForbidden(false);
      setNotReady(false);
      setError("");
    } catch (caught) { setError(customerFacingError(caught, locale)); }
    finally { setLoading(false); }
  }, [debouncedSearch, locale, organizationId, page, siteId, t.failed]);

  useEffect(() => { void load(); }, [load]);

  return <section data-retail-cashier-workbench className="min-w-0 max-w-full space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 shadow-sm sm:p-5">
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><h2 className="flex items-center gap-2 text-lg font-black text-dtsc-ink"><CreditCard className="h-5 w-5 text-emerald-600" />{t.title}</h2><p className="mt-1 text-xs leading-5 text-dtsc-muted">{t.intro}</p></div>
      <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className="h-4 w-4" />{t.refresh}</Button>
    </header>
    {forbidden ? <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">{t.noAccess}</p> : null}
    {notReady ? <p role="status" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">{t.notReady}</p> : null}
    {error ? <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
    {result && !result.checkoutReady ? <p role="status" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">{t.notReady}</p> : null}
    {!forbidden ? <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <label className="min-w-0 text-xs font-bold text-dtsc-ink">{t.site}<select value={siteId} onChange={(event) => { setSiteId(event.target.value); setPage(1); }} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-dtsc-border bg-dtsc-page px-3 text-sm"><option value="">{t.all}</option>{result?.sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label>
      <label className="min-w-0 text-xs font-bold text-dtsc-ink">{t.search}<span className="mt-1 flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-dtsc-border bg-dtsc-page px-3"><Search className="h-4 w-4 shrink-0 text-dtsc-muted"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchHelp} className="w-full min-w-0 bg-transparent text-sm outline-none"/></span></label>
    </div> : null}
    {loading ? <p role="status" className="text-sm text-dtsc-muted">{t.loading}</p> : null}
    {!loading && result && !result.items.length ? <p className="rounded-xl bg-dtsc-page p-4 text-sm text-dtsc-muted">{t.empty}</p> : null}
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">{result?.items.map((entry) => <article key={entry.id} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-black text-dtsc-ink">{entry.invoice.number}</h3><p className="text-xs text-dtsc-muted">{entry.site.name} · {entry.invoice.items.map((item) => `${item.description} × ${Number(item.quantity)}`).join(" · ")}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${entry.invoice.status === "PARTIALLY_PAID" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : entry.invoice.status === "OVERDUE" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-blue-500/10 text-blue-700 dark:text-blue-300"}`}>{entry.invoice.status === "PARTIALLY_PAID" ? t.partial : entry.invoice.status === "OVERDUE" ? t.overdue : t.issued}</span></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-dtsc-muted"><span>{t.total} : {money(entry.invoice.grandTotal, entry.invoice.currencyCode, locale)}</span><strong className="text-sm text-dtsc-ink">{t.due} : {money(entry.invoice.outstandingAmount, entry.invoice.currencyCode, locale)}</strong></div>
      <div data-responsive-actions className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-dtsc-border pt-3">
        <Button type="button" variant="outline" onClick={() => window.open(`/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(entry.invoice.id)}/print?paper=a4&lang=${locale}`, "_blank", "noopener,noreferrer")}><Printer className="h-4 w-4" />{t.a4}</Button>
        <Button type="button" variant="outline" onClick={() => window.open(`/api/enterprise/${organizationId}/retail/invoices/${encodeURIComponent(entry.invoice.id)}/print?paper=thermal&lang=${locale}`, "_blank", "noopener,noreferrer")}><Printer className="h-4 w-4" />{t.thermal}</Button>
        {result?.checkoutReady && entry.canCollect ? <RetailInvoicePaymentDialog organizationId={organizationId} invoiceId={entry.invoice.id} invoiceNumber={entry.invoice.number} siteName={entry.site.name} invoiceStatus={entry.invoice.status} locale={locale} onChanged={() => void load()} /> : null}
      </div>
    </article>)}</div>
    {result && result.pagination.pageCount > 1 ? <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-dtsc-muted"><span>{t.page} {result.pagination.page} / {result.pagination.pageCount} · {result.pagination.total}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>{t.previous}</Button><Button type="button" variant="outline" disabled={loading || page >= result.pagination.pageCount} onClick={() => setPage((current) => current + 1)}>{t.next}</Button></div></div> : null}
  </section>;
}
