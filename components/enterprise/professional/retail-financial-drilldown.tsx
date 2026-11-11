"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileSearch, RefreshCw, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { customerFacingError } from "@/lib/customer-facing-language";
import { buildEnterpriseObjectDeepLink } from "@/lib/enterprise/cross-module/deep-links";
import { RETAIL_METRIC_DEFINITIONS, retailMetricTimeCaption } from "@/lib/enterprise/retail/financial-metric-definitions";
import type { RetailFinancialTrace, RetailTraceResult } from "@/lib/enterprise/retail/financial-drilldown";

const LABELS: Record<RetailFinancialTrace, [string, string]> = {
  financeCollections: ["Encaissements Finance", "Finance receipts"],
  invoices: ["Factures nettes émises", "Net issued invoices"],
  outstanding: ["Créances ouvertes", "Open receivables"],
  overdue: ["Créances échues", "Overdue receivables"],
  postedRevenue: ["Produits comptabilisés", "Posted revenue"],
  postedGrossMargin: ["Marge brute comptabilisée", "Posted gross margin"],
  postedOperatingResult: ["Résultat d'exploitation comptabilisé", "Posted operating result"],
  treasuryAvailable: ["Trésorerie disponible", "Available treasury"],
  expenses: ["Dépenses approuvées", "Approved expenses"],
  mobileMoneyCommission: ["Commissions Mobile Money", "Mobile Money commissions"],
  telcoMargin: ["Marge Télécom", "Telco margin"],
  posSales: ["Ventes POS historiques", "Historical POS sales"],
};
const formatAmount = (value: string | null, currency: string, en: boolean) => value === null
  ? en ? "Not determined" : "Non déterminé"
  : `${new Intl.NumberFormat(en ? "en-US" : "fr-FR", { maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;

export function RetailFinancialDrilldown({ organizationId, locale, period, metric, initialSiteId, initialCurrency, sites, onBack }: {
  organizationId: string; locale: "fr" | "en"; metric: RetailFinancialTrace;
  period: { from: string; to: string }; initialSiteId: string; initialCurrency: string;
  sites: Array<{ id: string; name: string }>; onBack: () => void;
}) {
  const en = locale === "en";
  const [from, setFrom] = useState(period.from.slice(0, 10));
  const [to, setTo] = useState(period.to.slice(0, 10));
  const [siteId, setSiteId] = useState(initialSiteId);
  const [currency, setCurrency] = useState(initialCurrency);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<RetailTraceResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const definition = RETAIL_METRIC_DEFINITIONS[metric];
  const currentBalance = definition.timeBasis === "CURRENT_BALANCE";

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const qs = new URLSearchParams({ metric, from, to, page: String(page), pageSize: String(pageSize) });
      if (siteId) qs.set("siteId", siteId);
      if (currency) qs.set("currency", currency);
      if (submittedSearch) qs.set("search", submittedSearch);
      const response = await fetch(`/api/enterprise/${organizationId}/retail/financial-drilldown?${qs}`, { cache: "no-store", signal });
      const result = await response.json().catch(() => null) as (RetailTraceResult & { message?: string }) | null;
      if (!response.ok || !result?.buckets) throw new Error(result?.message || (en ? "Unable to read the source records." : "Impossible de consulter les opérations sources."));
      if (!signal?.aborted) setData(result);
    } catch (caught) { if (!signal?.aborted) { setData(null); setError(customerFacingError(caught, locale)); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [organizationId, metric, from, to, page, pageSize, siteId, currency, submittedSearch, en, locale]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const allSites = [...sites, ...(data?.buckets || []).filter((item) => item.siteId && !sites.some((site) => site.id === item.siteId))
    .map((item) => ({ id: item.siteId!, name: item.siteName || (en ? "Historical store" : "Boutique historique") }))];
  const uniqueSites = [...new Map(allSites.map((site) => [site.id, site])).values()];
  const currencies = [...new Set([initialCurrency, ...(data?.buckets || []).map((item) => item.currencyCode)].filter(Boolean))].sort();
  const totalPages = Math.max(1, Math.ceil((data?.totalLines || 0) / pageSize));

  return <section className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-5" data-testid="retail-financial-drilldown">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <Button type="button" variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" />{en ? "Back to dashboard" : "Retour au pilotage"}</Button>
        <h2 className="mt-2 flex items-center gap-2 text-lg font-black text-dtsc-ink"><FileSearch className="h-5 w-5 text-cyan-600" />{LABELS[metric][en ? 1 : 0]}</h2>
        <p className="mt-1 max-w-3xl text-xs text-dtsc-muted">{definition.interpretation[locale]}</p>
      </div>
      <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className="h-4 w-4" />{en ? "Refresh" : "Actualiser"}</Button>
    </header>
    <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs text-dtsc-muted">
      <ShieldCheck className="mr-1 inline h-4 w-4 text-cyan-600" />
      {retailMetricTimeCaption(metric, locale)} · {en ? "Read-only source evidence, grouped in original currencies. Never add operational receipts to posted revenue." : "Preuves sources en lecture seule, par devise d'origine. Ne cumulez pas les flux opérationnels avec les produits comptabilisés."}
      {currentBalance ? (en ? " Date filters do not rewind a current balance." : " Les dates ne reconstituent pas un solde passé.") : null}
    </p>
    <form className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-6" onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmittedSearch(search.trim()); }}>
      <label className="text-xs font-semibold text-dtsc-muted">{en ? "From" : "Du"}<input type="date" disabled={currentBalance} required={!currentBalance} value={from} max={to} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm" /></label>
      <label className="text-xs font-semibold text-dtsc-muted">{en ? "To" : "Au"}<input type="date" disabled={currentBalance} required={!currentBalance} value={to} min={from} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm" /></label>
      <label className="text-xs font-semibold text-dtsc-muted">{en ? "Store" : "Boutique"}<select value={siteId} onChange={(event) => { setSiteId(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{en ? "All stores + unallocated" : "Toutes et non attribuées"}</option>{uniqueSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-dtsc-muted">{en ? "Currency" : "Devise"}<select value={currency} onChange={(event) => { setCurrency(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{en ? "All (separate)" : "Toutes (séparées)"}</option>{currencies.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
      <label className="text-xs font-semibold text-dtsc-muted">{en ? "Rows per page" : "Lignes/page"}<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm">{[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
      <div className="min-w-0"><label htmlFor="retail-financial-trace-search" className="text-xs font-semibold text-dtsc-muted">{en ? "Search source" : "Rechercher une pièce"}</label><div className="mt-1 flex gap-1"><input id="retail-financial-trace-search" value={search} maxLength={90} onChange={(event) => setSearch(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm" /><Button type="submit" variant="outline" aria-label={en ? "Search" : "Rechercher"}><Search className="h-4 w-4" /></Button></div></div>
    </form>
    {error ? <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-800 dark:text-rose-200">{error}</p> : null}
    {loading ? <p role="status" className="text-sm text-dtsc-muted">{en ? "Reading authorized sources…" : "Lecture des sources autorisées…"}</p> : null}
    {data ? <>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">{data.buckets.map((bucket) =>
        <article key={`${bucket.siteId || "unallocated"}:${bucket.currencyCode}`} className="rounded-xl border border-dtsc-border bg-dtsc-page p-3">
          <div className="flex items-start justify-between gap-2"><h3 className="text-xs font-bold text-dtsc-ink">{bucket.siteName || (en ? "Unallocated" : "Non attribuée")}</h3><span className="rounded-full bg-cyan-500/10 px-2 py-1 text-xs font-bold text-cyan-700 dark:text-cyan-200">{bucket.currencyCode}</span></div>
          <p className={`mt-2 break-words text-lg font-black tabular-nums ${bucket.amount === null ? "text-amber-800 dark:text-amber-200" : "text-dtsc-ink"}`}>{formatAmount(bucket.amount, bucket.currencyCode, en)}</p>
          <p className="text-[11px] text-dtsc-muted">{bucket.count} {en ? "source lines" : "lignes sources"}{bucket.missingAmounts ? ` · ${bucket.missingAmounts} ${en ? "without available balance" : "sans solde disponible"}` : ""}</p>
        </article>)}</div>
      {!data.buckets.length ? <p role="status" className="rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">{en ? "No authorized source record for these filters." : "Aucune pièce source autorisée pour ces filtres."}</p> : null}
      <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
        <h3 className="text-sm font-black text-dtsc-ink">{en ? "Source record trail" : "Traçabilité des pièces sources"} · {data.totalLines}</h3>
        <div className="mt-2 min-w-0 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead><tr className="border-b border-dtsc-border text-dtsc-muted"><th className="p-2">{en ? "Date" : "Date"}</th><th className="p-2">{en ? "Store" : "Boutique"}</th><th className="p-2">{en ? "Source document" : "Pièce source"}</th><th className="p-2">{en ? "Signed amount" : "Montant signé"}</th><th className="p-2">{en ? "Status" : "Statut"}</th></tr></thead>
            <tbody>{data.lines.map((line) => {
              const href = buildEnterpriseObjectDeepLink({ entityType: line.sourceType, entityId: line.sourceId });
              return <tr key={line.id} className="border-b border-dtsc-border/50 align-top">
                <td className="p-2 text-dtsc-ink">{line.eventDate?.slice(0, 10) || (en ? "Current balance" : "Solde actuel")}</td>
                <td className="p-2 text-dtsc-ink">{line.siteName || (en ? "Unallocated" : "Non attribuée")}</td>
                <td className="p-2"><p className="font-semibold text-dtsc-ink">{line.reference || line.sourceLabel || (en ? "Source event" : "Opération source")}</p>{line.reference && line.sourceLabel ? <p className="mt-1 text-dtsc-muted">{line.sourceLabel}</p> : null}{href ? <Link className="mt-2 inline-flex min-h-9 items-center rounded-lg px-1 text-dtsc-blue underline underline-offset-2" href={href}>{en ? "View authorized record" : "Ouvrir la pièce autorisée"}</Link> : null}</td>
                <td className="p-2 font-bold tabular-nums text-dtsc-ink">{formatAmount(line.amount, line.currencyCode, en)}</td>
                <td className="p-2 text-dtsc-muted">{line.status}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-dtsc-muted">{en ? `Page ${page} of ${totalPages} · source rows are server-paginated` : `Page ${page} sur ${totalPages} · pagination serveur`}</p>
          <div className="flex gap-2"><Button type="button" variant="outline" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>{en ? "Previous" : "Précédent"}</Button><Button type="button" variant="outline" disabled={loading || page >= totalPages} onClick={() => setPage((p) => p + 1)}>{en ? "Next" : "Suivant"}</Button></div>
        </div>
        <p className="mt-2 text-[11px] text-dtsc-muted">{en ? "This is a provisional source trace, not a certified financial statement. Full-volume exports are handled separately in Reports." : "Traçabilité provisoire, non assimilable à un état financier certifié. Les exports volumineux sont traités séparément dans Rapports."}</p>
      </div>
    </> : null}
  </section>;
}
