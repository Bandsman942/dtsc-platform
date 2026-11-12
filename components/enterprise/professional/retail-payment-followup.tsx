"use client";

import Link from "next/link";
import { downloadProfessionalCsv, downloadProfessionalPdf, downloadProfessionalXlsx, type ProfessionalReportExportModel } from "@/lib/reporting/professional-export";
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

export function RetailPaymentFollowup({ organizationId, locale }: { organizationId: string; locale: CustomerFacingLocale }) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [status, setStatus] = useState("");
  const [legacySearch, setLegacySearch] = useState("");
  const [legacyFrom, setLegacyFrom] = useState("");
  const [legacyTo, setLegacyTo] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [canonical, setCanonical] = useState<CanonicalPayment[]>([]);
  const [canonicalActive, setCanonicalActive] = useState(false);
  const [canonicalPage, setCanonicalPage] = useState(1);
  const [canonicalPagination, setCanonicalPagination] = useState<Pagination | null>(null);
  const [canonicalStatus, setCanonicalStatus] = useState("");
  const [canonicalSearch, setCanonicalSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [canonicalLoading, setCanonicalLoading] = useState(true);
  const [canonicalError, setCanonicalError] = useState("");
  const [exporting, setExporting] = useState(false);
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
      const query = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (status) query.set("status", status);
      if (legacySearch.trim()) query.set("search", legacySearch.trim());
      if (legacyFrom) query.set("from", legacyFrom);
      if (legacyTo) query.set("to", legacyTo);
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
  }, [capabilities, organizationId, locale, status, page, legacySearch, legacyFrom, legacyTo]);

  const loadCanonical = useCallback(async () => {
    setCanonicalLoading(true);
    setCanonicalError("");
    try {
      const query = new URLSearchParams({ page: String(canonicalPage), pageSize: "20", ...(canonicalStatus ? { status: canonicalStatus } : {}) });
      if (canonicalSearch.trim()) query.set("search", canonicalSearch.trim());
      if (dateFrom) query.set("from", dateFrom);
      if (dateTo) query.set("to", dateTo);
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
  }, [organizationId, locale, canonicalPage, canonicalStatus, canonicalSearch, dateFrom, dateTo]);

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadPayments(); }, legacySearch ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadPayments, legacySearch]);

  useEffect(() => { const timer = setTimeout(() => { void loadCanonical(); }, canonicalSearch ? 250 : 0); return () => clearTimeout(timer); }, [loadCanonical, canonicalSearch]);

  async function exportRegister(kind: "FINANCE" | "LEGACY", format: "csv" | "xlsx" | "pdf") {
    if (exporting) return;
    setExporting(true);
    try {
      const rows: Array<CanonicalPayment | Payment> = [];
      let nextPage = 1;
      let total = 0;
      const maxRows = 5000;
      while (true) {
        const params = new URLSearchParams({ page: String(nextPage), pageSize: "100" });
        if (kind === "FINANCE") {
          if (canonicalStatus) params.set("status", canonicalStatus);
          if (canonicalSearch.trim()) params.set("search", canonicalSearch.trim());
          if (dateFrom) params.set("from", dateFrom);
          if (dateTo) params.set("to", dateTo);
        } else {
          if (status) params.set("status", status);
          if (legacySearch.trim()) params.set("search", legacySearch.trim());
          if (legacyFrom) params.set("from", legacyFrom);
          if (legacyTo) params.set("to", legacyTo);
        }
        const url = kind === "FINANCE" ? "payments/invoices" : "payments";
        const result = await fetch(`/api/enterprise/${organizationId}/retail/${url}?${params}`, { cache: "no-store" }).then(readJson);
        total = result.pagination?.total ?? 0;
        if (total > maxRows) {
          throw new Error(locale === "en" ? "This report exceeds 5,000 rows. Narrow the search period or filters." : "Ce rapport dépasse 5 000 lignes. Réduisez la période ou les filtres.");
        }
        rows.push(...(Array.isArray(result.items) ? result.items : []));
        if (!result.pagination || nextPage >= result.pagination.pageCount || rows.length >= total) break;
        nextPage++;
      }
      const isFinance = kind === "FINANCE";
      const model: ProfessionalReportExportModel = {
        title: isFinance ? (locale === "en" ? "Finance invoice payments" : "Paiements des factures Finance") : (locale === "en" ? "Historical channel transactions" : "Transactions des canaux historiques"),
        subtitle: locale === "en" ? "DTSC Platform — Retail POS · Authorized and server-filtered data" : "DTSC Platform — Point de vente · Données autorisées et filtrées côté serveur",
        filenameBase: `dtsc-retail-${isFinance ? "finance-payments" : "historical-payments"}-${new Date().toLocaleDateString("sv-SE")}`,
        generatedLabel: new Date().toLocaleString(locale === "en" ? "en-US" : "fr-FR"),
        kpis: [{ label: locale === "en" ? "Payments" : "Paiements", value: String(rows.length) }],
        chart: [], insights: [],
        filters: [
          { label: locale === "en" ? "Status" : "Statut", value: isFinance ? canonicalStatus || "Tous" : status || "Tous" },
          { label: locale === "en" ? "From" : "Du", value: isFinance ? dateFrom || "—" : legacyFrom || "—" },
          { label: locale === "en" ? "To" : "Au", value: isFinance ? dateTo || "—" : legacyTo || "—" },
        ],
        columns: isFinance ? [
          { key: "number", label: "N° paiement" }, { key: "invoice", label: "Facture" }, { key: "site", label: "Boutique" },
          { key: "amount", label: "Montant" }, { key: "currency", label: "Devise" }, { key: "method", label: "Moyen" }, { key: "status", label: "Statut" }, { key: "date", label: "Créé le" },
        ] : [
          { key: "number", label: "Référence" }, { key: "amount", label: "Montant" }, { key: "currency", label: "Devise" },
          { key: "method", label: "Moyen" }, { key: "status", label: "Statut" }, { key: "date", label: "Créé le" },
        ],
        rows: isFinance ? (rows as CanonicalPayment[]).map((row) => ({
          number: row.number, invoice: row.invoice.number, site: row.site.name, amount: Number(row.amount),
          currency: row.currencyCode, method: customerFacingPaymentMethod(row.methodType, locale),
          status: canonicalStatusLabel(row.status, locale), date: new Date(row.createdAt).toLocaleString(locale === "en" ? "en-US" : "fr-FR"),
        })) : (rows as Payment[]).map((row) => ({
          number: row.clientReference, amount: Number(row.amount), currency: row.currencyCode,
          method: customerFacingPaymentMethod(row.methodType, locale),
          status: customerFacingPaymentStatus(row.status, locale), date: new Date(row.createdAt).toLocaleString(locale === "en" ? "en-US" : "fr-FR"),
        })),
      };
      if (format === "csv") downloadProfessionalCsv(model);
      else if (format === "xlsx") downloadProfessionalXlsx(model);
      else downloadProfessionalPdf(model);
    } catch (caught) {
      setCanonicalError(customerFacingError(caught, locale, {
        fr: "Export impossible. Vérifiez les permissions et la période sélectionnée.",
        en: "Export failed. Check permissions and selected date range.",
      }));
    } finally { setExporting(false); }
  }

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 shadow-sm sm:p-4" aria-label={copy.title}>
      <header className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-black text-dtsc-ink">{copy.title}</h2><button type="button" className="min-h-10 rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-blue" onClick={() => { void loadPayments(); void loadCanonical(); }}>{copy.refresh}</button></header>
      {canonicalActive || canonicalLoading || canonicalError ? <div className="rounded-xl border border-cyan-500/30 bg-dtsc-page p-3">
        <h3 className="text-sm font-black text-dtsc-ink">{locale === "en" ? "Canonical Finance invoice payments" : "Paiements des factures Finance du comptoir"}</h3>
        <div className="mt-2 flex flex-wrap gap-2 text-xs" aria-label={locale === "en" ? "Finance payment exports" : "Exports des paiements Finance"}>
          {(["csv","xlsx","pdf"] as const).map((format) => <button key={format} type="button" disabled={exporting || canonicalLoading} onClick={() => void exportRegister("FINANCE", format)} className="min-h-9 rounded-lg border border-dtsc-border px-3 font-bold uppercase text-dtsc-blue disabled:opacity-50">{format}</button>)}
          <span className="self-center text-dtsc-muted">{locale === "en" ? "All matching authorized rows, up to 5,000." : "Toutes les lignes autorisées filtrées, jusqu’à 5 000."}</span>
        </div>
        <p className="mt-1 text-xs text-dtsc-muted">{locale === "en" ? "These are actual Finance payments linked to a Retail invoice, not duplicate Retail transactions. Reconcile them in Collections." : "Il s’agit des paiements Finance réellement rattachés aux factures Retail, et non de transactions Retail en double. Leur traitement se fait dans Encaissements."}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-xs font-semibold text-dtsc-muted">Recherche<input type="search" placeholder="N° paiement, facture, boutique" className="mt-1 min-h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" value={canonicalSearch} onChange={(event) => { setCanonicalSearch(event.target.value); setCanonicalPage(1); }} /></label>
          <label className="text-xs font-semibold text-dtsc-muted">Du<input type="date" className="mt-1 min-h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" max={dateTo || undefined} value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setCanonicalPage(1); }} /></label>
          <label className="text-xs font-semibold text-dtsc-muted">Au<input type="date" className="mt-1 min-h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-surface px-3 text-dtsc-ink" min={dateFrom || undefined} value={dateTo} onChange={(event) => { setDateTo(event.target.value); setCanonicalPage(1); }} /></label>
        </div>
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
          <details className="relative mt-2 inline-block text-xs"><summary aria-label={locale === "en" ? "Payment actions" : "Actions du paiement"} className="min-h-10 cursor-pointer list-none rounded-lg border border-dtsc-border px-3 py-2 font-bold text-dtsc-blue">⋯ <span className="sr-only">Actions</span></summary>
            <div className="absolute left-0 z-20 mt-1 min-w-56 space-y-1 rounded-xl border border-dtsc-border bg-dtsc-surface p-2 shadow-lg">
              <Link className="block rounded-lg px-2 py-2 hover:bg-dtsc-soft" href="/enterprise-modules/RETAIL_POS?section=collections">{locale === "en" ? "Open collections" : "Ouvrir les encaissements"}</Link>
              <Link className="block rounded-lg px-2 py-2 hover:bg-dtsc-soft" href={`/enterprise-modules/RETAIL_POS?section=invoices&q=${encodeURIComponent(payment.invoice.number)}`}>{locale === "en" ? "Open invoice" : "Consulter la facture"}</Link>
            </div>
          </details>
        </article>)}</div>
        {canonicalPagination && canonicalPagination.pageCount > 1 ? <div className="mt-3 flex items-center justify-between gap-3 text-xs text-dtsc-muted"><span>{canonicalPagination.page} / {canonicalPagination.pageCount} · {canonicalPagination.total}</span><div className="flex gap-2"><button type="button" className="min-h-10 rounded-lg border border-dtsc-border px-3" disabled={canonicalPage <= 1 || canonicalLoading} onClick={() => setCanonicalPage((value) => value - 1)}>{locale === "en" ? "Previous" : "Précédente"}</button><button type="button" className="min-h-10 rounded-lg border border-dtsc-border px-3" disabled={canonicalPage >= canonicalPagination.pageCount || canonicalLoading} onClick={() => setCanonicalPage((value) => value + 1)}>{locale === "en" ? "Next" : "Suivante"}</button></div></div> : null}
      </div> : null}
      {capabilities?.canManagePayments || capabilities?.canRefundPayments ? <details className="group rounded-xl border border-dtsc-border">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-black text-dtsc-ink"><span>{locale === "en" ? "Legacy channel transactions" : "Transactions des canaux historiques"}</span><span className="text-xs text-dtsc-muted">{locale === "en" ? "Expand" : "Déplier"}</span></summary>
      <div className="border-t border-dtsc-border p-3">
      <section aria-label={locale === "en" ? "Legacy payment channels" : "Canaux de paiement historiques"}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-3xl text-xs leading-5 text-dtsc-muted">{copy.intro}</p>
          <button type="button" onClick={() => void loadPayments()} className="min-h-10 w-full rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-ink hover:bg-black/5 sm:w-auto">
            {copy.refresh}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs" aria-label={locale === "en" ? "Historical payment exports" : "Exports des paiements historiques"}>
          {(["csv","xlsx","pdf"] as const).map((format) => <button key={format} type="button" disabled={exporting || loading} onClick={() => void exportRegister("LEGACY", format)} className="min-h-9 rounded-lg border border-dtsc-border px-3 font-bold uppercase text-dtsc-blue disabled:opacity-50">{format}</button>)}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-xs font-semibold text-dtsc-muted">Recherche historique<input type="search" className="mt-1 min-h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-3 text-dtsc-ink" placeholder="Référence" value={legacySearch} onChange={(e) => { setLegacySearch(e.target.value); setPage(1); }} /></label>
          <label className="text-xs font-semibold text-dtsc-muted">Du<input type="date" className="mt-1 min-h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-3 text-dtsc-ink" max={legacyTo || undefined} value={legacyFrom} onChange={(e) => { setLegacyFrom(e.target.value); setPage(1); }} /></label>
          <label className="text-xs font-semibold text-dtsc-muted">Au<input type="date" className="mt-1 min-h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-3 text-dtsc-ink" min={legacyFrom || undefined} value={legacyTo} onChange={(e) => { setLegacyTo(e.target.value); setPage(1); }} /></label>
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
                </dl>
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
