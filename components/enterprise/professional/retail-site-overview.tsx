"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Landmark, ReceiptText, RefreshCw, ShoppingBasket, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerFacingError } from "@/lib/customer-facing-language";

type Money = { currencyCode: string; total: string; count: number };
type Tender = Money & { method: string };
type FinanceInvoice = { currencyCode: string; count: number; issuedTotal: string; allocatedToDate: string; outstandingToDate: string };
type PostedLedger = { currencyCode: string; revenue: string; otherIncome: string; costOfSales: string; operatingExpenses: string; grossMargin: string; operatingResult: string; journalLineCount: number };
type Site = { id: string; code: string; name: string; sales: Money[]; financeInvoices: FinanceInvoice[]; postedLedger?: PostedLedger[]; approvedExpenses: Money[]; collections: Tender[]; inventory: { balanceRows: number }; cashSessions: Array<{ status: string; count: number }>; dailyCloses: Array<{ status: string; count: number }> };

function currencyAmount(value: string, currency: string, en: boolean) {
  try { return new Intl.NumberFormat(en ? "en-US" : "fr-FR", { maximumFractionDigits: 2 }).format(Number(value)) + " " + currency; }
  catch { return `${value} ${currency}`; }
}

export function RetailSiteOverview({ organizationId, locale }: { organizationId: string; locale: "fr" | "en" }) {
  const [days, setDays] = useState(7);
  const [items, setItems] = useState<Site[]>([]);
  const [unallocatedLedger, setUnallocatedLedger] = useState<PostedLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const en = locale === "en";
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - (days - 1));
      start.setUTCHours(0, 0, 0, 0);
      const query = new URLSearchParams({ from: start.toISOString(), to: new Date().toISOString() });
      const response = await fetch(`/api/enterprise/${organizationId}/retail/site-overview?${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { items?: Site[]; unallocatedPostedLedger?: PostedLedger[]; message?: string } | null;
      if (!response.ok || !payload?.items) throw new Error(payload?.message || (en ? "Store overview is unavailable." : "La vue multi-boutiques est indisponible."));
      setItems(payload.items);
      setUnallocatedLedger(payload.unallocatedPostedLedger || []);
    } catch (caught) { setError(customerFacingError(caught, locale)); }
    finally { setLoading(false); }
  }, [organizationId, days, en, locale]);
  useEffect(() => { void load(); }, [load]);
  return <section data-testid="retail-multisite-overview" className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3"><Building2 className="mt-1 h-5 w-5 shrink-0 text-dtsc-blue" /><div className="min-w-0"><h2 className="font-black text-dtsc-ink">{en ? "Store management overview" : "Pilotage des boutiques"}</h2><p className="mt-1 text-sm text-dtsc-muted">{en ? "Operational activity by store and currency; only the company owner/admin can access this comparison." : "Activités par boutique et par devise, réservées au propriétaire et à l'administration."}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><label className="text-xs font-semibold text-dtsc-muted">{en ? "Period" : "Période"}<select className="ml-2 min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm text-dtsc-ink" value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={1}>{en ? "Today" : "Aujourd'hui"}</option><option value={7}>{en ? "7 days" : "7 jours"}</option><option value={30}>{en ? "30 days" : "30 jours"}</option></select></label><Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" />{en ? "Refresh" : "Actualiser"}</Button></div>
    </div>
    {error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
    {loading ? <p role="status" className="mt-4 text-sm text-dtsc-muted">{en ? "Loading stores…" : "Chargement des boutiques…"}</p> : null}
    {!loading && !items.length ? <p className="mt-4 rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">{en ? "No active store has been set up. Create sites and their warehouses from Enterprise master data." : "Aucune boutique active. Créez les sites et leurs dépôts depuis les Référentiels ERP."}</p> : null}
    {!loading && items.length ? <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">{items.map((site) => <article key={site.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-dtsc-blue" /><h3 className="min-w-0 break-words font-black text-dtsc-ink">{site.code} · {site.name}</h3></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><p className="flex items-center gap-2 text-xs font-bold text-dtsc-muted"><ShoppingBasket className="h-4 w-4" />{en ? "Completed sales" : "Ventes réalisées"}</p>{site.sales.length ? site.sales.map((sale) => <p key={sale.currencyCode} className="mt-2 break-words text-sm font-black text-dtsc-ink">{currencyAmount(sale.total, sale.currencyCode, en)} <span className="font-normal text-dtsc-muted">({sale.count})</span></p>) : <p className="mt-2 text-sm text-dtsc-muted">0</p>}</div>
        <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><p className="flex items-center gap-2 text-xs font-bold text-dtsc-muted"><Wallet className="h-4 w-4" />{en ? "POS collections" : "Encaissements POS"}</p>{site.collections.length ? site.collections.map((tender) => <p key={`${tender.currencyCode}:${tender.method}`} className="mt-2 break-words text-sm font-semibold text-dtsc-ink">{currencyAmount(tender.total, tender.currencyCode, en)} <span className="text-xs font-normal text-dtsc-muted">· {tender.method}</span></p>) : <p className="mt-2 text-sm text-dtsc-muted">0</p>}</div>
      </div>
      <div className="mt-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
        <p className="flex items-center gap-2 text-xs font-bold text-dtsc-muted"><ReceiptText className="h-4 w-4" />{en ? "Issued Finance invoices — distinct from POS sales" : "Factures Finance émises — distinctes des ventes POS"}</p>
        {(site.financeInvoices || []).length ? site.financeInvoices.map((entry) =>
          <div key={entry.currencyCode} className="mt-2 min-w-0 border-t border-dtsc-border/60 pt-2 first:border-0 first:pt-0">
            <p className="text-sm font-bold text-dtsc-ink">{currencyAmount(entry.issuedTotal, entry.currencyCode, en)} <span className="font-normal text-dtsc-muted">({entry.count})</span></p>
            <p className="mt-1 text-xs text-dtsc-muted">{en ? "Allocated to date" : "Paiements affectés à date"}: {currencyAmount(entry.allocatedToDate, entry.currencyCode, en)} · {en ? "Outstanding to date" : "Solde dû à date"}: {currencyAmount(entry.outstandingToDate, entry.currencyCode, en)}</p>
          </div>) : <p className="mt-2 text-sm text-dtsc-muted">0</p>}
        <p className="mt-2 text-xs text-dtsc-muted">{en ? "Invoice amounts are grouped by issue date, while allocated/outstanding figures reflect the current balance. These are not collections received during this period." : "Montants regroupés par date d’émission ; affectations et soldes à date. Ce ne sont pas les encaissements reçus pendant la période."}</p>
      </div>
      <div className="mt-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><p className="text-xs font-bold text-dtsc-muted">{en ? "Approved expenses attributed to this store" : "Dépenses approuvées affectées à cette boutique"}</p><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{site.approvedExpenses.length ? site.approvedExpenses.map((expense) => <p key={expense.currencyCode} className="text-sm font-semibold text-dtsc-ink">{currencyAmount(expense.total, expense.currencyCode, en)} <span className="font-normal text-dtsc-muted">({expense.count})</span></p>) : <p className="text-sm text-dtsc-muted">0</p>}</div></div>
      <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-xs font-black text-dtsc-ink">{en ? "Posted ledger indicators — provisional" : "Indicateurs du grand livre — provisoires"}</p>
        {(site.postedLedger || []).length ? site.postedLedger?.map((entry) => <div key={entry.currencyCode} className="mt-3 border-t border-amber-500/20 pt-2 first:border-0 first:pt-0">
          <p className="text-xs font-bold text-dtsc-muted">{entry.currencyCode} · {entry.journalLineCount} {en ? "posted P&L lines" : "lignes de résultat postées"}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
            <div><dt className="text-dtsc-muted">{en ? "Revenue" : "Produits"}</dt><dd className="font-bold text-emerald-700 dark:text-emerald-300">{currencyAmount(entry.revenue, entry.currencyCode, en)}</dd></div>
            <div><dt className="text-dtsc-muted">{en ? "Cost of sales" : "Coût des ventes"}</dt><dd className="font-bold text-dtsc-ink">{currencyAmount(entry.costOfSales, entry.currencyCode, en)}</dd></div>
            <div><dt className="text-dtsc-muted">{en ? "Other expenses" : "Autres charges"}</dt><dd className="font-bold text-dtsc-ink">{currencyAmount(entry.operatingExpenses, entry.currencyCode, en)}</dd></div>
            <div><dt className="text-dtsc-muted">{en ? "Other income" : "Autres produits"}</dt><dd className="font-bold text-dtsc-ink">{currencyAmount(entry.otherIncome, entry.currencyCode, en)}</dd></div>
            <div><dt className="text-dtsc-muted">{en ? "Gross margin" : "Marge brute"}</dt><dd className="font-black text-dtsc-blue">{currencyAmount(entry.grossMargin, entry.currencyCode, en)}</dd></div>
            <div><dt className="text-dtsc-muted">{en ? "Operating result" : "Résultat d'exploitation"}</dt><dd className="font-black text-dtsc-ink">{currencyAmount(entry.operatingResult, entry.currencyCode, en)}</dd></div>
          </dl>
        </div>) : <p className="mt-2 text-xs text-dtsc-muted">{en ? "No posted profit-and-loss journal lines for this period." : "Aucune ligne de résultat postée pour cette période."}</p>}
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{en ? "Not certified: historical site allocation, accounting completeness and exports remain to be verified." : "Non certifié : affectation historique des boutiques, exhaustivité comptable et exports à vérifier."}</p>
      </div>
      <p className="mt-3 text-xs text-dtsc-muted">{site.inventory.balanceRows} {en ? "inventory balance rows" : "lignes de stock"} · {site.cashSessions.filter((row) => row.status === "OPEN").reduce((sum, row) => sum + row.count, 0)} {en ? "open cash sessions" : "sessions de caisse ouvertes"}</p>
    </article>)}</div> : null}
    {unallocatedLedger.length ? <p role="status" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">{en ? "Some posted profit-and-loss lines have no store assignment. They are excluded from store results until reconciled:" : "Certaines écritures de résultat postées n'ont pas de boutique attribuée. Elles restent exclues des résultats par boutique jusqu'au rapprochement :"} {unallocatedLedger.map((row) => `${row.journalLineCount} (${row.currencyCode})`).join(" · ")}</p> : null}
    <p className="mt-4 text-xs text-dtsc-muted">{en ? "Operational overview only. Financial margin and net profit require verified posted accounting entries and expense attribution by store." : "Vue opérationnelle uniquement. Les marges et bénéfices nets exigent les écritures comptables validées et l'affectation des dépenses par boutique."}</p>
  </section>;
}
