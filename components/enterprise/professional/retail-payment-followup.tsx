"use client";

import Link from "next/link";
import { RetailProfessionalListExport } from "@/components/enterprise/professional/retail-professional-list-export";
import { CalendarDays, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  customerFacingError,
  customerFacingPaymentMethod,
  customerFacingPaymentStatus,
  type CustomerFacingLocale,
} from "@/lib/customer-facing-language";

type Capabilities = {
  canManagePayments: boolean;
  canRefundPayments: boolean;
};

type Payment = {
  id: string;
  methodType: string;
  currencyCode: string;
  amount: string;
  status: string;
  clientReference: string;
  createdAt: string;
  updatedAt: string;
};
type CanonicalPayment = {
  id: string; number: string; status: string; amount: string; currencyCode: string;
  methodType: string; createdAt: string; confirmedAt: string | null;
  invoice: { id: string; number: string; status: string; outstandingAmount: string };
  site: { code: string; name: string };
};
type Pagination = { page: number; pageSize: number; total: number; pageCount: number };

const PAYMENT_FILTERS = ["", "INITIATED", "AUTHORIZED", "CAPTURED", "FAILED", "VOIDED", "REFUNDED"] as const;

async function readJson(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_PAYMENT_LIST_FAILED");
  return body;
}

function money(value: string | number, currencyCode: string) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

function statusHelp(status: string, locale: CustomerFacingLocale) {
  const messages: Record<string, { fr: string; en: string }> = {
    INITIATED: {
      fr: "Le paiement est enregistré mais n’est pas encore confirmé.",
      en: "The payment is recorded but has not been confirmed yet.",
    },
    AUTHORIZED: {
      fr: "L’autorisation est obtenue ; la confirmation finale reste à enregistrer.",
      en: "Authorization was received; final confirmation is still pending.",
    },
    CAPTURED: {
      fr: "Le paiement est confirmé.",
      en: "The payment is confirmed.",
    },
    FAILED: {
      fr: "Le paiement n’a pas été confirmé. Vérifiez le moyen de paiement avant une nouvelle tentative.",
      en: "The payment was not confirmed. Check the payment method before trying again.",
    },
    VOIDED: {
      fr: "Le paiement a été annulé avant confirmation finale.",
      en: "The payment was voided before final confirmation.",
    },
    REFUNDED: {
      fr: "Le paiement a été remboursé.",
      en: "The payment was refunded.",
    },
  };
  return messages[status]?.[locale] || (locale === "en" ? "Payment status available." : "État du paiement disponible.");
}

function canonicalStatusLabel(status: string, locale: CustomerFacingLocale) {
  const names: Record<string, { fr: string; en: string }> = {
    DRAFT: { fr: "Brouillon", en: "Draft" },
    PENDING_APPROVAL: { fr: "À approuver", en: "Awaiting approval" },
    CONFIRMED: { fr: "Confirmé", en: "Confirmed" },
    RECONCILED: { fr: "Rapproché", en: "Reconciled" },
    CANCELLED: { fr: "Annulé", en: "Cancelled" },
    REVERSED: { fr: "Extourné", en: "Reversed" },
  };
  return names[status]?.[locale] || status;
}

export function RetailPaymentFollowup({ organizationId, locale, organizationName }: { organizationId: string; locale: CustomerFacingLocale; organizationName: string }) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [canonical, setCanonical] = useState<CanonicalPayment[]>([]);
  const [canonicalActive, setCanonicalActive] = useState(false);
  const [canonicalPage, setCanonicalPage] = useState(1);
  const [canonicalPagination, setCanonicalPagination] = useState<Pagination | null>(null);
  const [canonicalStatus, setCanonicalStatus] = useState("");
  const [canonicalLoading, setCanonicalLoading] = useState(true);
  const [canonicalError, setCanonicalError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [siteId, setSiteId] = useState("");
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = useMemo(() => locale === "en" ? {
    title: "Payment follow-up",
    intro: "Review recent payments and quickly identify those that still need attention.",
    all: "All",
    reference: "Payment reference",
    date: "Created",
    noPayments: "No payment matches this filter.",
    loading: "Loading payments…",
    refresh: "Refresh",
    open: "Open",
    close: "Close",
  } : {
    title: "Suivi des paiements",
    intro: "Consultez les paiements récents et identifiez rapidement ceux qui demandent encore une action.",
    all: "Tous",
    reference: "Référence du paiement",
    date: "Créé le",
    noPayments: "Aucun paiement ne correspond à ce filtre.",
    loading: "Chargement des paiements…",
    refresh: "Actualiser",
    open: "Ouvrir",
    close: "Fermer",
  }, [locale]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    fetch("/api/enterprise/" + organizationId + "/retail/dashboard?moduleCode=RETAIL_POS", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!active) return;
        const unique = new Map<string, { id: string; name: string }>();
        for (const warehouse of body?.warehouses || []) {
          if (warehouse.site?.id) unique.set(warehouse.site.id, warehouse.site);
        }
        setSites([...unique.values()]);
      }).catch(() => undefined);
    return () => { active = false; };
  }, [organizationId]);
  const resetPages = () => { setPage(1); setCanonicalPage(1); };

  const loadPermissions = useCallback(async () => {
    try {
      const data = await fetch(`/api/enterprise/${organizationId}/retail/customer-payment-permissions`, { cache: "no-store" }).then(readJson);
      setCapabilities(data.capabilities);
    } catch (caught) {
      setError(customerFacingError(caught, locale, {
        fr: "Les autorisations de suivi des paiements ne sont pas disponibles pour le moment.",
        en: "Payment follow-up permissions are not available right now.",
      }));
      setCapabilities(null);
      setLoading(false);
    }
  }, [organizationId, locale]);

  const loadPayments = useCallback(async () => {
    if (!capabilities || (!capabilities.canManagePayments && !capabilities.canRefundPayments)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) query.set("status", status);
      if (debouncedSearch) query.set("search", debouncedSearch);
      if (dateFrom) query.set("from", dateFrom);
      if (dateTo) query.set("to", dateTo);
      const data = await fetch(`/api/enterprise/${organizationId}/retail/payments?${query.toString()}`, { cache: "no-store" }).then(readJson);
      setPayments((data.items || []).map((item: Payment) => ({
        id: item.id,
        methodType: item.methodType,
        currencyCode: item.currencyCode,
        amount: item.amount,
        status: item.status,
        clientReference: item.clientReference,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })));
      setPagination(data.pagination || null);
    } catch (caught) {
      setError(customerFacingError(caught, locale, {
        fr: "Le suivi des paiements n’est pas disponible pour le moment.",
        en: "Payment follow-up is not available right now.",
      }));
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [capabilities, organizationId, locale, status, page, pageSize, debouncedSearch, dateFrom, dateTo]);

  const loadCanonical = useCallback(async () => {
    setCanonicalLoading(true);
    setCanonicalError("");
    try {
      const query = new URLSearchParams({ page: String(canonicalPage), pageSize: String(pageSize), ...(canonicalStatus ? { status: canonicalStatus } : {}) });
      if (debouncedSearch) query.set("search", debouncedSearch);
      if (dateFrom) query.set("from", dateFrom);
      if (dateTo) query.set("to", dateTo);
      if (siteId) query.set("siteId", siteId);
      const data = await fetch(`/api/enterprise/${organizationId}/retail/payments/invoices?${query}`, { cache: "no-store" }).then(readJson);
      setCanonicalActive(Boolean(data.active));
      setCanonical(Array.isArray(data.items) ? data.items : []);
      setCanonicalPagination(data.pagination || null);
    } catch (caught) {
      setCanonicalError(customerFacingError(caught, locale, {
        fr: "Impossible de charger les paiements des factures du comptoir.", en: "Cannot load counter invoice payments.",
      }));
      setCanonical([]);
    } finally { setCanonicalLoading(false); }
  }, [organizationId, locale, canonicalPage, canonicalStatus, pageSize, debouncedSearch, dateFrom, dateTo, siteId]);

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => { void loadCanonical(); }, [loadCanonical]);

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 shadow-sm sm:p-4" aria-label={copy.title}>
      <header className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-black text-dtsc-ink">{copy.title}</h2><button type="button" className="min-h-10 rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-blue" onClick={() => { void loadPayments(); void loadCanonical(); }}>{copy.refresh}</button></header>
      <div className="grid gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="min-w-0 text-xs font-bold text-dtsc-muted xl:col-span-2">{locale === "en" ? "Smart search" : "Recherche intelligente"}<span className="mt-1 flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><Search className="h-4 w-4 shrink-0 text-dtsc-blue" /><input className="min-w-0 flex-1 bg-transparent text-sm text-dtsc-ink outline-none" value={search} onChange={(event) => { setSearch(event.target.value); resetPages(); }} placeholder={locale === "en" ? "Invoice, payment, reference, store" : "Facture, paiement, référence, boutique"} /></span></label>
        <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "From" : "Du"}<span className="mt-1 flex min-h-11 items-center gap-1 rounded-xl border border-dtsc-border bg-dtsc-surface px-2"><CalendarDays className="h-4 w-4 shrink-0 text-dtsc-muted" /><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); resetPages(); }} className="w-full min-w-0 bg-transparent text-sm text-dtsc-ink" /></span></label>
        <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "To" : "Au"}<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); resetPages(); }} className="mt-1 h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink" /></label>
        <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "Store" : "Boutique"}<select value={siteId} onChange={(event) => { setSiteId(event.target.value); resetPages(); }} className="mt-1 h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink"><option value="">{locale === "en" ? "All" : "Toutes"}</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        <label className="text-xs font-bold text-dtsc-muted">{locale === "en" ? "Rows per page" : "Éléments/page"}<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); resetPages(); }} className="mt-1 h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-sm text-dtsc-ink">{[10, 20, 50].map((size) => <option value={size} key={size}>{size}</option>)}</select></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-6"><button type="button" className="rounded-full border border-dtsc-border px-3 py-1.5 text-xs font-bold text-dtsc-blue" onClick={() => { const today = new Date().toISOString().slice(0, 10); setDateFrom(today); setDateTo(today); resetPages(); }}>{locale === "en" ? "Today" : "Aujourd’hui"}</button><button type="button" className="rounded-full border border-dtsc-border px-3 py-1.5 text-xs font-bold text-dtsc-blue" onClick={() => { const now = new Date(); const from = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10); setDateFrom(from); setDateTo(now.toISOString().slice(0, 10)); resetPages(); }}>{locale === "en" ? "Last 7 days" : "7 derniers jours"}</button><button type="button" className="rounded-full border border-dtsc-border px-3 py-1.5 text-xs font-bold text-dtsc-blue" onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setSiteId(""); resetPages(); }}>{locale === "en" ? "Clear filters" : "Effacer les filtres"}</button></div>
      </div>
      {canonicalActive || canonicalLoading || canonicalError ? <div className="rounded-xl border border-cyan-500/30 bg-dtsc-page p-3">
        <h3 className="text-sm font-black text-dtsc-ink">{locale === "en" ? "Canonical Finance invoice payments" : "Paiements des factures Finance du comptoir"}</h3>
        <div className="mt-2"><RetailProfessionalListExport<CanonicalPayment>
          organizationName={organizationName} locale={locale}
          title={locale === "en" ? "Retail invoice payments — Finance" : "Paiements des factures RETAIL — Finance"}
          filenameBase="retail-finance-payments"
          sourceUrl={`/api/enterprise/${organizationId}/retail/payments/invoices?${new URLSearchParams({
            ...(canonicalStatus ? { status: canonicalStatus } : {}),
            ...(debouncedSearch ? { search: debouncedSearch } : {}),
            ...(dateFrom ? { from: dateFrom } : {}), ...(dateTo ? { to: dateTo } : {}),
            ...(siteId ? { siteId } : {}),
          })}`}
          columns={[
            { key: "createdAt", label: locale === "en" ? "Created" : "Créé le" },
            { key: "payment", label: locale === "en" ? "Payment" : "Paiement" },
            { key: "invoice", label: locale === "en" ? "Invoice" : "Facture" },
            { key: "site", label: locale === "en" ? "Store" : "Boutique" },
            { key: "amount", label: locale === "en" ? "Amount" : "Montant" },
            { key: "currency", label: locale === "en" ? "Currency" : "Devise" },
            { key: "method", label: locale === "en" ? "Method" : "Moyen" },
            { key: "status", label: locale === "en" ? "Status" : "Statut" },
          ]}
          toRow={(item) => ({ createdAt: new Date(item.createdAt).toLocaleString(locale), payment: item.number,
            invoice: item.invoice.number, site: item.site.name, amount: Number(item.amount),
            currency: item.currencyCode, method: customerFacingPaymentMethod(item.methodType, locale),
            status: canonicalStatusLabel(item.status, locale) })}
          filters={[{ label: locale === "en" ? "From" : "Du", value: dateFrom || "—" },
            { label: locale === "en" ? "To" : "Au", value: dateTo || "—" },
            { label: locale === "en" ? "Status" : "Statut", value: canonicalStatus || (locale === "en" ? "All" : "Tous") },
            { label: locale === "en" ? "Store" : "Boutique", value: sites.find((site) => site.id === siteId)?.name || (locale === "en" ? "All" : "Toutes") }]}
        /></div>
        <p className="mt-1 text-xs text-dtsc-muted">{locale === "en" ? "These are actual Finance payments linked to a Retail invoice, not duplicate Retail transactions. Reconcile them in Collections." : "Il s’agit des paiements Finance réellement rattachés aux factures Retail, et non de transactions Retail en double. Leur traitement se fait dans Encaissements."}</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={locale === "en" ? "Finance payment status" : "Statut des paiements Finance"}>
          {["", "DRAFT", "PENDING_APPROVAL", "CONFIRMED", "RECONCILED", "CANCELLED", "REVERSED"].map((state) => <button key={state || "ALL"} type="button" onClick={() => { setCanonicalStatus(state); setCanonicalPage(1); }} className={`min-h-10 rounded-full border px-3 text-xs font-bold ${canonicalStatus === state ? "border-dtsc-ink bg-dtsc-ink text-white" : "border-dtsc-border text-dtsc-ink"}`}>{state ? canonicalStatusLabel(state, locale) : copy.all}</button>)}
        </div>
        {canonicalError ? <p role="alert" className="mt-3 text-sm text-red-600">{canonicalError}</p> : null}
        {canonicalLoading ? <p role="status" className="mt-3 text-sm text-dtsc-muted">{copy.loading}</p> : null}
        {!canonicalLoading && canonicalActive && !canonical.length ? <p className="mt-3 text-sm text-dtsc-muted">{copy.noPayments}</p> : null}
        <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">{canonical.map((payment) => <article key={payment.id} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><strong className="text-sm text-dtsc-ink">{money(payment.amount, payment.currencyCode)}</strong><span className="rounded-full bg-blue-500/10 px-2 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">{canonicalStatusLabel(payment.status, locale)}</span></div>
          <p className="mt-1 break-all text-xs text-dtsc-muted">{payment.number} · {payment.site.name}</p>
          <p className="mt-1 text-xs text-dtsc-muted">{locale === "en" ? "Invoice" : "Facture"} : {payment.invoice.number} · {customerFacingPaymentMethod(payment.methodType, locale)}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><Link className="inline-flex min-h-10 items-center rounded-lg border border-dtsc-border px-3 text-xs font-bold text-dtsc-blue" href="/enterprise-modules/RETAIL_POS?section=collections">{locale === "en" ? "Open collections" : "Ouvrir les encaissements"}</Link><details className="relative"><summary className="cursor-pointer list-none rounded-lg border border-dtsc-border px-3 py-2 text-lg text-dtsc-ink" aria-label={locale === "en" ? "Payment actions" : "Actions du paiement"}>⋯</summary><div className="absolute right-0 z-20 mt-1 min-w-48 rounded-xl border border-dtsc-border bg-dtsc-surface p-2 shadow-xl"><Link className="block rounded-lg px-3 py-2 text-xs hover:bg-dtsc-soft" href={"/enterprise-modules/RETAIL_POS?section=invoices&q=" + encodeURIComponent(payment.invoice.number)}>{locale === "en" ? "Open invoice" : "Ouvrir la facture"}</Link><Link className="block rounded-lg px-3 py-2 text-xs hover:bg-dtsc-soft" href="/enterprise-modules/FINANCE_RECEIVABLES">{locale === "en" ? "Finance receivables" : "Créances Finance"}</Link></div></details></div>
        </article>)}</div>
        {canonicalPagination && canonicalPagination.pageCount > 1 ? <div className="mt-3 flex items-center justify-between gap-3 text-xs text-dtsc-muted"><span>{canonicalPagination.page} / {canonicalPagination.pageCount} · {canonicalPagination.total}</span><div className="flex gap-2"><button type="button" className="min-h-10 rounded-lg border border-dtsc-border px-3" disabled={canonicalPage <= 1 || canonicalLoading} onClick={() => setCanonicalPage((value) => value - 1)}>{locale === "en" ? "Previous" : "Précédente"}</button><button type="button" className="min-h-10 rounded-lg border border-dtsc-border px-3" disabled={canonicalPage >= canonicalPagination.pageCount || canonicalLoading} onClick={() => setCanonicalPage((value) => value + 1)}>{locale === "en" ? "Next" : "Suivante"}</button></div></div> : null}
      </div> : null}
      {capabilities?.canManagePayments || capabilities?.canRefundPayments ? <details className="group rounded-xl border border-dtsc-border">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-black text-dtsc-ink"><span>{locale === "en" ? "Legacy channel transactions" : "Transactions des canaux historiques"}</span><span className="text-xs text-dtsc-muted">{locale === "en" ? "Expand" : "Déplier"}</span></summary>
      <div className="border-t border-dtsc-border p-3">
      <section aria-label={locale === "en" ? "Legacy payment channels" : "Canaux de paiement historiques"}>
        <RetailProfessionalListExport<Payment>
          organizationName={organizationName} locale={locale}
          title={locale === "en" ? "Historic Retail channel transactions" : "Transactions historiques des canaux RETAIL"}
          filenameBase="retail-historic-payments"
          sourceUrl={`/api/enterprise/${organizationId}/retail/payments?${new URLSearchParams({
            ...(status ? { status } : {}),
            ...(debouncedSearch ? { search: debouncedSearch } : {}),
            ...(dateFrom ? { from: dateFrom } : {}), ...(dateTo ? { to: dateTo } : {}),
          })}`}
          columns={[
            { key: "createdAt", label: locale === "en" ? "Created" : "Créé le" },
            { key: "reference", label: locale === "en" ? "Reference" : "Référence" },
            { key: "amount", label: locale === "en" ? "Amount" : "Montant" },
            { key: "currency", label: locale === "en" ? "Currency" : "Devise" },
            { key: "method", label: locale === "en" ? "Method" : "Moyen" },
            { key: "status", label: locale === "en" ? "Status" : "Statut" },
          ]}
          toRow={(item) => ({ createdAt: new Date(item.createdAt).toLocaleString(locale),
            reference: item.clientReference, amount: Number(item.amount), currency: item.currencyCode,
            method: customerFacingPaymentMethod(item.methodType, locale),
            status: customerFacingPaymentStatus(item.status, locale) })}
          filters={[{ label: locale === "en" ? "From" : "Du", value: dateFrom || "—" },
            { label: locale === "en" ? "To" : "Au", value: dateTo || "—" },
            { label: locale === "en" ? "Status" : "Statut", value: status || (locale === "en" ? "All" : "Tous") }]}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-3xl text-xs leading-5 text-dtsc-muted">{copy.intro}</p>
          <button type="button" onClick={() => void loadPayments()} className="min-h-10 w-full rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-ink hover:bg-black/5 sm:w-auto">
            {copy.refresh}
          </button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [touch-action:pan-x]" aria-label={locale === "en" ? "Payment filters" : "Filtres des paiements"}>
          {PAYMENT_FILTERS.map((filter) => (
            <button
              key={filter || "ALL"}
              type="button"
              onClick={() => { setStatus(filter); setPage(1); }}
              className={`min-h-10 shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${status === filter ? "border-dtsc-ink bg-dtsc-ink text-white" : "border-dtsc-border text-dtsc-ink"}`}
            >
              {filter ? customerFacingPaymentStatus(filter, locale) : copy.all}
            </button>
          ))}
        </div>

        {error ? <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p> : null}

        {loading ? <p className="mt-4 text-sm text-dtsc-muted">{copy.loading}</p> : payments.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {payments.map((payment) => (
              <article key={payment.id} className="min-w-0 rounded-xl border border-dtsc-border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-dtsc-ink">{money(payment.amount, payment.currencyCode)}</p>
                    <p className="mt-1 text-xs font-medium text-dtsc-muted">{customerFacingPaymentMethod(payment.methodType, locale)}</p>
                  </div>
                  <span className="rounded-full border border-dtsc-border px-2 py-1 text-[11px] font-bold text-dtsc-ink">{customerFacingPaymentStatus(payment.status, locale)}</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-dtsc-muted">{statusHelp(payment.status, locale)}</p>
                <dl className="mt-3 space-y-1 text-xs">
                  <div className="flex min-w-0 gap-2">
                    <dt className="shrink-0 text-dtsc-muted">{copy.reference}</dt>
                    <dd className="min-w-0 truncate font-medium text-dtsc-ink">{payment.clientReference}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-dtsc-muted">{copy.date}</dt>
                    <dd className="font-medium text-dtsc-ink">{new Date(payment.createdAt).toLocaleString(locale === "en" ? "en" : "fr")}</dd>
                  </div>
                </dl><details className="relative mt-2"><summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-lg border border-dtsc-border px-3 text-sm font-bold text-dtsc-blue" aria-label={locale === "en" ? "Payment actions" : "Actions du paiement"}>⋯</summary><div className="mt-2 rounded-lg border border-dtsc-border bg-dtsc-surface p-2"><p className="text-xs text-dtsc-muted">{statusHelp(payment.status, locale)}</p></div></details>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-dtsc-border p-4 text-sm text-dtsc-muted">{copy.noPayments}</p>
        )}
      </section>
      {pagination && pagination.pageCount > 1 ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-dtsc-muted"><span>{pagination.page} / {pagination.pageCount} · {pagination.total}</span><div className="flex gap-2"><button type="button" className="min-h-10 rounded-lg border border-dtsc-border px-3" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>{locale === "en" ? "Previous" : "Précédente"}</button><button type="button" className="min-h-10 rounded-lg border border-dtsc-border px-3" disabled={page >= pagination.pageCount || loading} onClick={() => setPage((value) => value + 1)}>{locale === "en" ? "Next" : "Suivante"}</button></div></div> : null}
      </div></details> : null}
    </section>
  );
}
