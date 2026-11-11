"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, FileSpreadsheet, FileText, GitBranch, RefreshCw, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { customerFacingError } from "@/lib/customer-facing-language";
import { notifyToast } from "@/lib/client-toast";
import { buildRetailCogsExport } from "@/lib/enterprise/retail/cogs-export";
import type { CogsAnalysis, CogsLinkStatus } from "@/lib/enterprise/retail/cogs-analysis";
import { downloadProfessionalCsv, downloadProfessionalXlsx } from "@/lib/reporting/professional-export";
import { downloadProfessionalPdfV2 } from "@/lib/reporting/professional-pdf-v2";

type SiteOption = { id: string; name: string };
const STATES: Record<CogsLinkStatus, { fr: string; en: string; className: string }> = {
  TRACEABLE: { fr: "Reliée au stock", en: "Inventory-linked", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" },
  UNMATCHED: { fr: "Sans lien de stock", en: "Unmatched", className: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200" },
  AMBIGUOUS: { fr: "À rapprocher", en: "Needs review", className: "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200" },
};
const amount = (value: string, currency: string, en: boolean) => `${new Intl.NumberFormat(en ? "en-US" : "fr-FR", { maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;

export function RetailCogsWorkspace({ organizationId, organizationName, locale, period, initialSiteId, initialCurrency, sites, canSaveReport, onBack }: {
  organizationId: string; organizationName: string; locale: "fr" | "en";
  period: { from: string; to: string }; initialSiteId: string; initialCurrency: string;
  sites: SiteOption[]; canSaveReport: boolean; onBack: () => void;
}) {
  const en = locale === "en";
  const [from, setFrom] = useState(period.from.slice(0, 10));
  const [to, setTo] = useState(period.to.slice(0, 10));
  const [siteId, setSiteId] = useState(initialSiteId);
  const [currency, setCurrency] = useState(initialCurrency);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [analysis, setAnalysis] = useState<CogsAnalysis | null>(null);
  const [inventoryAllowed, setInventoryAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!from || !to) return;
    setLoading(true); setError("");
    try {
      const qs = new URLSearchParams({ from, to, page: String(page), pageSize: String(pageSize) });
      if (siteId) qs.set("siteId", siteId);
      if (currency) qs.set("currency", currency);
      if (status) qs.set("status", status);
      if (query) qs.set("search", query);
      const response = await fetch(`/api/enterprise/${organizationId}/retail/cogs-analysis?${qs}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null) as (CogsAnalysis & { sourceAvailability?: { inventory: boolean }; message?: string }) | null;
      if (!response.ok || !payload?.buckets) throw new Error(payload?.message || (en ? "Unable to read the accounting trace." : "Lecture de la traçabilité comptable impossible."));
      if (signal?.aborted) return;
      setAnalysis(payload); setInventoryAllowed(Boolean(payload.sourceAvailability?.inventory));
    } catch (caught) { if (!signal?.aborted) setError(customerFacingError(caught, locale)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [organizationId, from, to, siteId, currency, status, query, page, pageSize, en, locale]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const resetPage = () => { setPage(1); setSelectedDay(""); };
  const download = (format: "csv" | "xlsx" | "pdf") => {
    if (!analysis) return;
    const model = buildRetailCogsExport({ analysis, organizationName, locale, from, to,
      siteName: sites.find((site) => site.id === siteId)?.name || "", currency });
    if (format === "csv") downloadProfessionalCsv(model);
    else if (format === "xlsx") downloadProfessionalXlsx(model);
    else downloadProfessionalPdfV2(model);
  };
  const saveToReports = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/cogs-analysis/report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, ...(siteId ? { siteId } : {}), ...(currency ? { currency } : {}),
          ...(status ? { status } : {}), ...(query ? { search: query } : {}) }),
      });
      const result = await response.json().catch(() => null) as { reference?: string; message?: string } | null;
      if (!response.ok) throw new Error(result?.message || (en ? "Report not saved." : "Rapport non enregistré."));
      notifyToast({ title: en ? "COGS report saved in Reports" : "Rapport coût des ventes enregistré", description: result?.reference || "", tone: "success" });
    } catch (caught) { notifyToast({ title: en ? "Report not saved" : "Rapport non enregistré", description: customerFacingError(caught, locale), tone: "error" }); }
    finally { setSaving(false); }
  };
  const currencies = [...new Set(analysis?.buckets.map((row) => row.currencyCode) || [])];
  const coverage = (analysis?.coverage || []).filter((row) => !siteId || row.siteId === siteId);
  const coverageDenominator = coverage.reduce((total, row) => total + row.eligibleMovements, 0);
  const coverageNumerator = coverage.reduce((total, row) => total + row.valuedMovements, 0);
  const timeline = (analysis?.daily || []).filter((entry) => !currency || entry.currencyCode === currency);
  const days = [...new Set(timeline.map((row) => row.day))];
  const byDay = days.map((day) => ({ day, rows: timeline.filter((row) => row.day === day) }));
  const maximum = Math.max(1, ...byDay.map((day) => day.rows.reduce((total, item) => total + Math.abs(Number(item.amount)), 0)));
  const pageCount = Math.max(1, Math.ceil((analysis?.totalLines || 0) / pageSize));

  return <section data-testid="retail-cogs-drilldown" className="min-w-0 space-y-4 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><Button type="button" variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" />{en ? "Back to dashboard" : "Retour au pilotage"}</Button>
        <h2 className="mt-2 flex items-center gap-2 text-xl font-black text-dtsc-ink"><GitBranch className="h-5 w-5 text-cyan-600" />{en ? "Posted cost of sales — drilldown" : "Coût des ventes comptabilisé — détail"}</h2>
        <p className="mt-1 max-w-3xl text-xs text-dtsc-muted">{en ? "From accounting journal to inventory valuation, stock movement and sale — without inventing a cost. Posted GL is authoritative."
          : "Du grand livre à la valorisation, au mouvement de stock et à la vente — sans coût estimé. Le grand livre posté fait foi."}</p>
      </div>
      <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className="h-4 w-4" />{en ? "Refresh" : "Actualiser"}</Button>
    </header>
    <form className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-6" onSubmit={(event) => { event.preventDefault(); resetPage(); setQuery(search.trim()); }}>
      <label className="text-xs font-semibold text-dtsc-muted">{en ? "From" : "Du"}<input required type="date" value={from} max={to} onChange={(event) => { setFrom(event.target.value); resetPage(); }} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm" /></label>
      <label className="text-xs font-semibold text-dtsc-muted">{en ? "To" : "Au"}<input required type="date" value={to} min={from} onChange={(event) => { setTo(event.target.value); resetPage(); }} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm" /></label>
      <label className="text-xs font-semibold text-dtsc-muted">{en ? "Store" : "Boutique"}<select value={siteId} onChange={(event) => { setSiteId(event.target.value); resetPage(); }} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{en ? "All and unallocated" : "Toutes et non attribuées"}</option>{sites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-dtsc-muted">{en ? "Currency" : "Devise"}<select value={currency} onChange={(event) => { setCurrency(event.target.value); resetPage(); }} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{en ? "All — separate" : "Toutes — séparées"}</option>{[...new Set([...currencies, ...(initialCurrency ? [initialCurrency] : [])])].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-xs font-semibold text-dtsc-muted">{en ? "Source status" : "Traçabilité"}<select value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm"><option value="">{en ? "All" : "Toutes"}</option>{(Object.keys(STATES) as CogsLinkStatus[]).map((key) => <option key={key} value={key}>{STATES[key][en ? "en" : "fr"]}</option>)}</select></label>
      <div className="min-w-0"><label className="text-xs font-semibold text-dtsc-muted" htmlFor="retail-cogs-search">{en ? "Journal, account, item" : "Journal, compte, article"}</label><div className="mt-1 flex min-w-0 gap-1"><input id="retail-cogs-search" value={search} maxLength={90} onChange={(event) => setSearch(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm" /><Button type="submit" variant="outline" aria-label={en ? "Search" : "Rechercher"}><Search className="h-4 w-4" /></Button></div></div>
    </form>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!analysis || loading} onClick={() => download("xlsx")}><FileSpreadsheet className="h-4 w-4" />Excel</Button><Button type="button" variant="outline" disabled={!analysis || loading} onClick={() => download("csv")}>CSV</Button><Button type="button" variant="outline" disabled={!analysis || loading} onClick={() => download("pdf")}><FileText className="h-4 w-4" />PDF</Button>
      {canSaveReport && inventoryAllowed ? <Button type="button" variant="outline" disabled={!analysis || loading || saving} onClick={() => void saveToReports()}>{saving ? (en ? "Saving…" : "Enregistrement…") : en ? "Save in Reports" : "Enregistrer dans Rapports"}</Button> : null}
      <Link href="/enterprise-modules/REPORTS" className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-dtsc-blue hover:bg-dtsc-page">{en ? "Reports module" : "Module Rapports"}</Link>
    </div>
    {error ? <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-800 dark:text-rose-200">{error}</p> : null}
    {loading ? <p role="status" className="text-sm text-dtsc-muted">{en ? "Checking posted accounting entries…" : "Lecture des écritures comptables postées…"}</p> : null}
    {analysis ? <>
      <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs text-dtsc-muted"><ShieldCheck className="mr-1 inline h-4 w-4 text-cyan-600" />{en
        ? "The sums below are posted debit minus credit in each journal's functional currency. A stock event is lineage evidence, not an amount added again. Unallocated stores and reversals remain visible."
        : "Les montants proviennent des débits moins crédits postés, dans la devise fonctionnelle de chaque journal. L'événement de stock prouve l'origine, il n'est jamais ajouté une seconde fois. Boutiques non attribuées et contrepassations restent visibles."}</p>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">{analysis.buckets.map((bucket) => <article key={`${bucket.siteId}:${bucket.currencyCode}`} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black text-dtsc-ink">{bucket.siteName || (en ? "Unallocated journal lines" : "Écritures sans boutique")}</h3><span className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs font-bold text-cyan-800 dark:text-cyan-200">{bucket.currencyCode}</span></div>
        <p className="mt-2 text-xl font-black tabular-nums text-dtsc-ink">{amount(bucket.posted, bucket.currencyCode, en)}</p>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3"><div className="rounded-lg bg-emerald-500/10 p-2"><dt className="text-emerald-800 dark:text-emerald-200">{en ? "Stock-linked" : "Relié au stock"}</dt><dd className="mt-1 font-black text-dtsc-ink">{amount(bucket.traceable, bucket.currencyCode, en)}</dd></div>
          <div className="rounded-lg bg-amber-500/10 p-2"><dt className="text-amber-900 dark:text-amber-200">{en ? "Unmatched" : "Sans lien"}</dt><dd className="mt-1 font-black text-dtsc-ink">{amount(bucket.untraced, bucket.currencyCode, en)}</dd></div>
          <div className="rounded-lg bg-rose-500/10 p-2"><dt className="text-rose-800 dark:text-rose-200">{en ? "Needs review" : "À rapprocher"}</dt><dd className="mt-1 font-black text-dtsc-ink">{amount(bucket.ambiguous, bucket.currencyCode, en)}</dd></div></dl>
        <p className="mt-2 text-xs text-dtsc-muted">{en ? "Posted = linked + unmatched + ambiguous" : "Comptabilisé = relié + sans lien + à rapprocher"} · {bucket.lines} {en ? "lines" : "lignes"}</p>
        {inventoryAllowed ? <div className={`mt-3 rounded-lg border p-2 text-xs ${Number(bucket.comparableVariance) !== 0 ? "border-rose-500/40 bg-rose-500/10" : "border-emerald-500/30 bg-emerald-500/5"}`}>
          <h4 className="font-bold text-dtsc-ink">{en ? "GL vs. stock valuation (strictly comparable lines)" : "Grand livre vs valorisation (lignes comparables)"}</h4>
          {bucket.comparableLines ? <><p className="mt-1 text-dtsc-ink">{en ? "Posted GL" : "Comptabilisé"}: {amount(bucket.comparablePosted, bucket.currencyCode, en)} · {en ? "Stock valuation" : "Valorisation"}: {amount(bucket.comparableStockValuation, bucket.currencyCode, en)}</p>
            <p className={`mt-1 font-black ${Number(bucket.comparableVariance) !== 0 ? "text-rose-800 dark:text-rose-200" : "text-emerald-800 dark:text-emerald-200"}`}>{en ? "Variance" : "Écart"}: {amount(bucket.comparableVariance, bucket.currencyCode, en)}</p></>
            : <p className="mt-1 text-dtsc-muted">{en ? "No 1:1 valuation in the same currency. Comparison unavailable." : "Aucune valorisation 1:1 de même devise. Comparaison indisponible."}</p>}
          <p className="mt-1 text-dtsc-muted">{bucket.comparableLines} {en ? "comparable lines;" : "lignes comparables ;"} {bucket.nonComparableLinked} {en ? "linked lines excluded (FX/reversal)." : "lignes liées exclues (change/contrepassation)."}</p>
        </div> : null}
      </article>)}</div>
      {!analysis.buckets.length ? <p role="status" className="rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">{en ? "No posted cost-of-sales entry in this accounting scope. This is not a catalog-based zero cost." : "Aucune écriture de coût des ventes postée dans ce périmètre. Ce n'est pas un coût d'achat estimé à zéro."}</p> : null}
      <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><h3 className="text-sm font-black text-dtsc-ink">{en ? "Stock fulfillment valuation coverage" : "Couverture des sorties de stock valorisées"}</h3>
        {!inventoryAllowed ? <p className="mt-2 text-xs text-amber-900 dark:text-amber-200">{en ? "Inventory Logistics access is required to calculate this indicator." : "L'accès au module Logistique et stock est nécessaire pour calculer cet indicateur."}</p> : null}
        <p className="mt-1 text-lg font-black text-dtsc-ink">{coverageDenominator ? `${Math.round(10000 * coverageNumerator / coverageDenominator) / 100} %` : (en ? "N/A" : "Non applicable")} <span className="text-xs font-normal text-dtsc-muted">· {coverageNumerator} / {coverageDenominator}</span></p>
        {coverageDenominator ? <div role="img" aria-label={en ? "Valuation coverage" : "Couverture de valorisation"} className="mt-2 h-2.5 overflow-hidden rounded-full bg-dtsc-surface"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${coverageNumerator / coverageDenominator * 100}%` }} /></div> : null}
        <p className="mt-2 text-xs text-dtsc-muted">{en ? "Only completed outgoing Retail sale/invoice stock movements occurring in the period. A posting may fall on another accounting date. No eligible movement = N/A, not 100%."
          : "Uniquement les mouvements de sortie des ventes et factures Retail sur la période. La comptabilisation peut être datée différemment. Aucun mouvement admissible = non applicable, pas 100 %."}</p>
      </div>
      {byDay.length ? <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><h3 className="text-sm font-black text-dtsc-ink">{en ? "Posted COGS by accounting day" : "Évolution des coûts comptabilisés par jour"}</h3><p className="mt-1 text-xs text-dtsc-muted">{en ? "Green: stock-linked · amber: unmatched · red: needs review. Select a day for its breakdown. Each currency is separate."
        : "Vert : lié au stock · ambre : sans lien · rouge : à rapprocher. Sélectionnez une journée pour son détail. Devises séparées."}</p>
        {currencies.filter((code) => !currency || currency === code).map((code) => <div key={code} className="mt-3"><h4 className="text-xs font-bold text-dtsc-ink">{code}</h4><div className="mt-2 flex h-36 min-w-0 items-end gap-1 overflow-x-auto border-b border-dtsc-border">{byDay.filter((day) => day.rows.some((row) => row.currencyCode === code)).map((day) => {
          const series = day.rows.filter((entry) => entry.currencyCode === code);
          return <button type="button" key={day.day} aria-pressed={selectedDay === `${code}:${day.day}`} title={`${day.day}: ${series.map((r) => amount(r.amount, code, en)).join(" · ")}`} onClick={() => setSelectedDay(selectedDay === `${code}:${day.day}` ? "" : `${code}:${day.day}`)} className={`flex h-full min-w-5 flex-1 flex-col justify-end gap-0.5 rounded-t outline-offset-2 focus-visible:outline-2 focus-visible:outline-cyan-600 ${selectedDay === `${code}:${day.day}` ? "bg-cyan-500/10" : ""}`}>
            {series.map((entry) => <span key={entry.status} className={entry.status === "TRACEABLE" ? "bg-emerald-500" : entry.status === "AMBIGUOUS" ? "bg-rose-500" : "bg-amber-500"} style={{ height: `${Math.max(2, Math.abs(Number(entry.amount)) / maximum * 110)}%` }} />)}<span className="truncate text-[8px] text-dtsc-muted">{day.day.slice(5)}</span>
          </button>;
        })}</div>{selectedDay.startsWith(`${code}:`) ? <p className="mt-2 text-xs text-dtsc-muted">{byDay.find((row) => row.day === selectedDay.split(":")[1])?.rows.filter((row) => row.currencyCode === code).map((row) => `${STATES[row.status][en ? "en" : "fr"]}: ${amount(row.amount, code, en)}`).join(" · ")}</p> : null}</div>)}
      </div> : null}
      <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black text-dtsc-ink">{en ? "Posted journal audit trail" : "Traçabilité des écritures postées"} · {analysis.totalLines}</h3><label className="text-xs text-dtsc-muted">{en ? "Page size" : "Lignes/page"}<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="ml-2 min-h-10 rounded-lg border border-dtsc-border bg-dtsc-surface px-2">{[25, 50, 100].map((value) => <option key={value}>{value}</option>)}</select></label></div>
        <div className="mt-3 min-w-0 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="border-b border-dtsc-border text-dtsc-muted"><tr><th className="p-2">{en ? "Date · journal" : "Date · journal"}</th><th className="p-2">{en ? "Store · GL account" : "Boutique · compte"}</th><th className="p-2">{en ? "Cost of sales" : "Coût comptabilisé"}</th><th className="p-2">{en ? "Source trace" : "Preuve d'origine"}</th><th className="p-2">{en ? "Status" : "Statut"}</th></tr></thead>
          <tbody>{analysis.lines.map((line) => <tr key={line.id} className="border-b border-dtsc-border/50 align-top"><td className="p-2"><span className="font-bold text-dtsc-ink">{line.accountingDate.slice(0, 10)}</span><p className="break-all text-dtsc-muted">{line.journalNumber}</p>{line.reversal ? <span className="text-rose-700 dark:text-rose-300">{en ? "Reversal" : "Contrepassation"}</span> : null}</td>
            <td className="p-2"><span className="font-semibold text-dtsc-ink">{line.siteName || (en ? "Unallocated" : "Non attribuée")}</span><p className="text-dtsc-muted">{line.accountCode} · {en ? line.accountNameEn : line.accountName}</p></td>
            <td className={`p-2 font-black tabular-nums ${Number(line.amount) < 0 ? "text-rose-700 dark:text-rose-300" : "text-dtsc-ink"}`}>{amount(line.amount, line.currencyCode, en)}</td>
            <td className="max-w-64 break-words p-2 text-dtsc-muted">{inventoryAllowed && line.inventoryItemName ? <span className="font-semibold text-dtsc-ink">{line.inventoryItemName}</span> : null}
              {inventoryAllowed && line.sourceNumber ? <p>{en ? "Sale/invoice" : "Vente/facture"} · {line.sourceNumber}</p> : null}
              {inventoryAllowed && line.stockMovementId ? <p title={line.stockMovementId}>{en ? "Stock movement" : "Mouvement de stock"} · {line.stockMovementId.slice(0, 10)}…</p> : null}
              {inventoryAllowed && line.quantity && line.valuationCost ? <p>{en ? "Qty / stock valuation" : "Qté / valorisation de stock"} · {line.quantity} / {amount(line.valuationCost, line.valuationCurrency || line.currencyCode, en)}</p> : null}
              {inventoryAllowed && line.stockMovementId ? <p className="mt-1 flex flex-wrap gap-2"><Link href="/enterprise-modules/INVENTORY_LOGISTICS" className="text-dtsc-blue underline-offset-2 hover:underline">{en ? "Open inventory" : "Voir le stock"}</Link><Link href="/enterprise-modules/SALES_QUOTES_ORDERS" className="text-dtsc-blue underline-offset-2 hover:underline">{en ? "Open sales" : "Voir les ventes"}</Link></p> : null}
              {!inventoryAllowed ? <span>{en ? "Inventory module access required for stock details." : "Accès au module Stock requis pour les détails."}</span> : null}</td>
            <td className="p-2"><span className={`inline-flex rounded-full border px-2 py-1 font-bold ${STATES[line.status].className}`}>{STATES[line.status][en ? "en" : "fr"]}</span></td></tr>)}</tbody>
        </table></div>
        {!analysis.lines.length ? <p className="p-3 text-xs text-dtsc-muted">{en ? "No matching journal lines. Try removing a search/status filter." : "Aucune ligne correspondante. Essayez sans filtre de statut ou de recherche."}</p> : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-dtsc-muted">{en ? "Page" : "Page"} {page} / {pageCount} · {analysis.totalLines} {en ? "lines" : "lignes"}</p><div className="flex gap-2"><Button type="button" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>{en ? "Previous" : "Précédent"}</Button><Button type="button" variant="outline" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>{en ? "Next" : "Suivant"}</Button></div></div>
      </div>
      <p className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0" />{en ? "Provisional reconciliation: posted financial entries are grouped exactly, but not all entries necessarily have inventory lineage or a store. A green link does not certify GL–stock valuation equality. Exports show the current detail page; full-scope aggregates are always computed on the server."
        : "Rapprochement provisoire : écritures postées regroupées exactement, mais certaines peuvent manquer de mouvement de stock ou de boutique. Un lien vert ne certifie pas l'égalité entre grand livre et valorisation. Les exports détaillent la page courante ; les totaux couvrent toujours le périmètre complet côté serveur."}</p>
    </> : null}
  </section>;
}
