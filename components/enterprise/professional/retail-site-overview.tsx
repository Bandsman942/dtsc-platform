"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Building2, FileSpreadsheet, FileText, GitBranch, Landmark, ReceiptText, RefreshCw, Settings2, ShoppingBasket, Wallet } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { customerFacingError } from "@/lib/customer-facing-language";
import { buildRetailOperationsExport, buildRetailPostedLedgerExport, type RetailPostedLedger } from "@/lib/enterprise/retail/site-financial-export";
import { downloadProfessionalCsv, downloadProfessionalXlsx } from "@/lib/reporting/professional-export";
import { downloadProfessionalPdfV2 } from "@/lib/reporting/professional-pdf-v2";
import { RETAIL_EXECUTIVE_METRICS, type RetailExecutiveMetric, type RetailExecutiveSummary } from "@/lib/enterprise/retail/executive-metrics";
import { retailMetricTimeCaption } from "@/lib/enterprise/retail/financial-metric-definitions";
import type { RetailFinancialTrace } from "@/lib/enterprise/retail/financial-drilldown";
import { DEFAULT_RETAIL_DASHBOARD_PREFERENCES, type RetailDashboardPreferences } from "@/lib/enterprise/retail/dashboard-preferences";
import { buildRetailExecutiveExport } from "@/lib/enterprise/retail/site-financial-export";
import { notifyToast } from "@/lib/client-toast";
const RetailCogsWorkspace = dynamic(() => import("@/components/enterprise/professional/retail-cogs-workspace").then((module) => module.RetailCogsWorkspace));
const RetailFinancialDrilldown = dynamic(() => import("@/components/enterprise/professional/retail-financial-drilldown").then((view) => view.RetailFinancialDrilldown));

type Money = { currencyCode: string; total: string; count: number };
type Tender = Money & { method: string };
type FinanceInvoice = { currencyCode: string; count: number; issuedTotal: string; allocatedToDate: string; outstandingToDate: string };
type Site = { id: string; code: string; name: string; status: string; archivedAt: string | null; sales: Money[]; financeInvoices: FinanceInvoice[]; postedLedger?: RetailPostedLedger[]; approvedExpenses: Money[]; collections: Tender[]; financeCollections: Tender[]; mobileMoney: Array<{ currencyCode: string; transactionType: string; principal: string; commission: string; fees: string; count: number }>; telco: Array<{ currencyCode: string; total: string; operatorCost: string; margin: string; count: number }>; treasury: Array<{ currencyCode: string; total: string; reconciled: string; available: string | null; accountType: string; count: number }>; receivables: Array<{ currencyCode: string; total: string; overdue: string; count: number }>; stockAlerts: { lowStock: number; expiring: number; expired: number }; inventory: { balanceRows: number }; cashSessions: Array<{ status: string; count: number }>; dailyCloses: Array<{ status: string; count: number }> };
type Trend = { siteId: string | null; currencyCode: string; day: string; metric: string; total: string };
const METRIC_COPY: Record<RetailExecutiveMetric, [string, string, string, string]> = {
  posSales: ["Ventes POS historiques", "Historical POS sales", "Tickets clôturés avant le circuit Finance ; ne pas cumuler avec les factures.", "Closed tickets from the legacy POS channel; do not add to Finance invoices."],
  posCollections: ["Encaissements POS historiques", "Historical POS receipts", "Règlements des tickets historiques, distincts des paiements Finance.", "Legacy till payments, separate from Finance collections."],
  financeCollections: ["Encaissements Finance", "Finance receipts", "Paiements confirmés et affectés à des factures Retail pendant la période.", "Confirmed payments allocated to Retail invoices during the period."],
  invoices: ["Factures nettes émises", "Net invoices issued", "TTC facturé dans la période après avoir déduit les avoirs enregistrés.", "VAT-inclusive issued amounts net of recorded credit notes during the period."],
  invoiceAllocated: ["Règlements à date des factures de la période", "Paid to date on period invoices", "Solde cumulé à ce jour sur les seules factures émises dans la période.", "Current cumulative payments on invoices issued in the period only."],
  outstanding: ["Créances Retail ouvertes", "Open Retail receivables", "Soldes impayés actuels de toutes les factures Retail, quelle que soit leur date d'émission.", "Current unpaid balances of all Retail invoices, regardless of issue date."],
  overdue: ["Créances échues", "Overdue receivables", "Créances encore impayées dont l'échéance est dépassée à date.", "Outstanding receivables with a past due date as of now."],
  expenses: ["Dépenses approuvées", "Approved expenses", "Engagements approuvés sur la période ; ne constituent pas un décaissement prouvé.", "Approved expenses in period, not necessarily paid."],
  postedRevenue: ["Produits comptabilisés", "Posted revenue", "Produits des écritures postées, provisoires tant que l'attribution boutique n'est pas exhaustive.", "Revenue from posted ledger, provisional until store attribution is complete."],
  postedCogs: ["Coût des ventes comptabilisé", "Posted cost of goods sold", "Charges des ventes dans les écritures comptables postées.", "Cost of sales in posted journal entries."],
  postedGrossMargin: ["Marge brute comptabilisée", "Posted gross margin", "Produits moins coût des ventes ; comptabilité postée seulement, encore provisoire.", "Posted revenue less cost of sales, still provisional."],
  postedOperatingResult: ["Résultat d'exploitation comptabilisé", "Posted operating result", "Produits et autres produits moins coût des ventes et charges ; résultat partiel non certifié.", "Posted operating result; provisional, not certified net profit."],
  mobileMoneyDeposits: ["Dépôts Mobile Money", "Mobile Money deposits", "Principal traité pour les clients ; ce n'est pas un chiffre d'affaires.", "Customer principal handled, not company revenue."],
  mobileMoneyWithdrawals: ["Retraits Mobile Money", "Mobile Money withdrawals", "Principal remis aux clients ; ce n'est pas une charge d'exploitation.", "Customer principal paid out, not an operating expense."],
  mobileMoneyCommission: ["Commissions prestataire", "Provider commissions", "Commissions dues par les prestataires sur opérations confirmées, non nécessairement encaissées.", "Provider commissions on confirmed operations, not necessarily settled."],
  mobileMoneyFees: ["Frais clients Mobile Money", "Mobile Money customer fees", "Frais clients comptabilisés opérationnellement, distincts du principal.", "Operational customer fees, separate from principal."],
  telcoSales: ["Ventes Télécom", "Telco top-up sales", "Valeur des recharges réussies, pas une écriture comptable certifiée.", "Value of completed top-ups, not certified posted revenue."],
  telcoCost: ["Coûts opérateur Télécom", "Telco operator costs", "Coût opérateur lié aux recharges réussies.", "Provider cost of completed top-ups."],
  telcoMargin: ["Marge Télécom opérationnelle", "Telco operational margin", "Prix de vente moins coût opérateur, non équivalent au bénéfice comptable.", "Sale price less operator cost, not accounting profit."],
  treasuryBalance: ["Solde opérationnel de trésorerie", "Operational treasury position", "Soldes courants des comptes actifs par boutique, avant éventuel rapprochement.", "Current active financial account balances, potentially unreconciled."],
  treasuryReconciled: ["Solde rapproché", "Reconciled balances", "Partie rapprochée des soldes des comptes financiers actifs.", "Reconciled positions across active financial accounts."],
  treasuryAvailable: ["Trésorerie disponible", "Available treasury", "Solde disponible déclaré par les comptes financiers ; contrôlez les mouvements non rapprochés.", "Available financial account balance; verify unreconciled movements."],
};
const HIGHLIGHT_METRICS: RetailExecutiveMetric[] = ["financeCollections", "invoices", "outstanding", "overdue", "postedRevenue", "postedCogs", "postedGrossMargin", "postedOperatingResult", "treasuryAvailable", "expenses", "mobileMoneyCommission", "telcoMargin", "posSales"];

function currencyAmount(value: string, currency: string, en: boolean) {
  try { return new Intl.NumberFormat(en ? "en-US" : "fr-FR", { maximumFractionDigits: 2 }).format(Number(value)) + " " + currency; }
  catch { return `${value} ${currency}`; }
}

export function RetailSiteOverview({ organizationId, organizationName, locale, timezone }: { organizationId: string; organizationName: string; locale: "fr" | "en"; timezone: string }) {
  const [days, setDays] = useState(7);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [chartMetric, setChartMetric] = useState<RetailExecutiveMetric>("financeCollections");
  const [activeBar, setActiveBar] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [cogsOpen, setCogsOpen] = useState(false);
  const [cogsSite, setCogsSite] = useState("");
  const [cogsCurrency, setCogsCurrency] = useState("");
  const [traceMetric, setTraceMetric] = useState<RetailFinancialTrace | null>(null);
  const [traceSite, setTraceSite] = useState("");
  const [traceCurrency, setTraceCurrency] = useState("");
  const [prefsRevision, setPrefsRevision] = useState(0);
  const [preferences, setPreferences] = useState<RetailDashboardPreferences>(DEFAULT_RETAIL_DASHBOARD_PREFERENCES);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [trend, setTrend] = useState<Trend[]>([]);
  const [summaries, setSummaries] = useState<Array<{ siteId: string; currencies: RetailExecutiveSummary[] }>>([]);
  const [corporate, setCorporate] = useState<RetailExecutiveSummary[]>([]);
  const [unallocated, setUnallocated] = useState<{ mobileMoney: Site["mobileMoney"]; telco: Site["telco"]; treasury: Site["treasury"] }>({ mobileMoney: [], telco: [], treasury: [] });
  const [sourceAvailability, setSourceAvailability] = useState({ agency: false, telco: false, treasury: false, inventory: false, accounting: false, financeReceivables: false, financePayments: false, financeBudgets: false, reports: false, reportCreate: false });
  const [items, setItems] = useState<Site[]>([]);
  const [unallocatedLedger, setUnallocatedLedger] = useState<RetailPostedLedger[]>([]);
  const [reportPeriod, setReportPeriod] = useState({ from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const en = locale === "en";
  const orderedHighlightMetrics = [...HIGHLIGHT_METRICS].sort((first, second) => Number(preferences.favoriteMetrics.includes(second)) - Number(preferences.favoriteMetrics.includes(first)));

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/enterprise/${organizationId}/retail/dashboard-preferences`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { revision: number; preferences: RetailDashboardPreferences };
      if (!controller.signal.aborted) { setPreferences(payload.preferences); setPrefsRevision(payload.revision); setDays(payload.preferences.defaultDays); setChartMetric(payload.preferences.defaultMetric); setPrefsLoaded(true); }
    }).catch(() => {});
    return () => controller.abort();
  }, [organizationId]);
  const savePreferences = async () => {
    setSavingSettings(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/dashboard-preferences`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: prefsRevision, preferences }) });
      const payload = await response.json().catch(() => null) as { revision?: number; message?: string } | null;
      if (!response.ok || !payload?.revision) throw new Error(payload?.message || (en ? "Unable to save the dashboard preferences." : "Paramètres non enregistrés."));
      setPrefsRevision(payload.revision); setDays(preferences.defaultDays); setChartMetric(preferences.defaultMetric); setShowSettings(false);
      notifyToast(en ? "Dashboard preferences saved" : "Préférences du pilotage enregistrées", "success");
    } catch (caught) { notifyToast({ title: en ? "Settings unchanged" : "Paramètres inchangés", description: customerFacingError(caught, locale), tone: "error" }); }
    finally { setSavingSettings(false); }
  };
  const saveToReports = async () => {
    setSavingReport(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/retail/site-overview/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: reportPeriod.from, to: reportPeriod.to, ...(siteFilter ? { siteId: siteFilter } : {}), ...(currencyFilter ? { currency: currencyFilter } : {}) }) });
      const body = await response.json().catch(() => null) as { message?: string; reference?: string } | null;
      if (!response.ok) throw new Error(body?.message || (en ? "Unable to generate the report." : "Impossible de générer le rapport."));
      notifyToast({ title: en ? "Saved in the Reports module" : "Rapport enregistré dans le module Rapports", description: body?.reference || (en ? "The current, authorized source data was captured." : "Les données sources autorisées ont été enregistrées à date."), tone: "success" });
    } catch (caught) { notifyToast({ title: en ? "Report not generated" : "Rapport non généré", description: customerFacingError(caught, locale), tone: "error" }); }
    finally { setSavingReport(false); }
  };
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date());
      const part = (key: string) => parts.find((item) => item.type === key)?.value || "";
      const today = `${part("year")}-${part("month")}-${part("day")}`;
      const earlier = new Date(`${today}T12:00:00Z`);
      earlier.setUTCDate(earlier.getUTCDate() - (days - 1));
      // This is date-only calendar arithmetic starting from the company's
      // actual civil date, not a UTC timestamp used as a business-day label.
      const earlierDay = `${earlier.getUTCFullYear()}-${String(earlier.getUTCMonth() + 1).padStart(2, "0")}-${String(earlier.getUTCDate()).padStart(2, "0")}`;
      const from = dateFrom || earlierDay;
      const to = dateTo || today;
      if (from > to) throw new Error(en ? "The end date must follow the start date." : "La date de fin doit être postérieure à la date de début.");
      const query = new URLSearchParams({ from, to });
      const response = await fetch(`/api/enterprise/${organizationId}/retail/site-overview?${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { items?: Site[]; unallocatedPostedLedger?: RetailPostedLedger[]; period?: { from: string; to: string }; timeline?: Trend[]; summaries?: typeof summaries; corporate?: RetailExecutiveSummary[]; unallocated?: typeof unallocated; sourceAvailability?: typeof sourceAvailability; message?: string } | null;
      if (!response.ok || !payload?.items) throw new Error(payload?.message || (en ? "Store overview is unavailable." : "La vue multi-boutiques est indisponible."));
      setItems(payload.items);
      setUnallocatedLedger(payload.unallocatedPostedLedger || []);
      setReportPeriod(payload.period || { from: "", to: "" });
      setTrend(payload.timeline || []); setSummaries(payload.summaries || []); setCorporate(payload.corporate || []); setUnallocated(payload.unallocated || { mobileMoney: [], telco: [], treasury: [] });
      setSourceAvailability(payload.sourceAvailability || { agency: false, telco: false, treasury: false, inventory: false, accounting: false, financeReceivables: false, financePayments: false, financeBudgets: false, reports: false, reportCreate: false });
    } catch (caught) { setError(customerFacingError(caught, locale)); }
    finally { setLoading(false); }
  }, [organizationId, days, dateFrom, dateTo, en, locale, timezone]);
  useEffect(() => { void load(); }, [load]);
  const visibleSites = items.filter((site) => !siteFilter || site.id === siteFilter);
  const stockWarnings = visibleSites.reduce((sum, site) => ({ lowStock: sum.lowStock + site.stockAlerts.lowStock, expiring: sum.expiring + site.stockAlerts.expiring, expired: sum.expired + site.stockAlerts.expired }), { lowStock: 0, expiring: 0, expired: 0 });
  const filteredSites = visibleSites.map((site) => ({
    ...site,
    sales: site.sales.filter((row) => !currencyFilter || row.currencyCode === currencyFilter),
    collections: site.collections.filter((row) => !currencyFilter || row.currencyCode === currencyFilter),
    financeCollections: (site.financeCollections || []).filter((row) => !currencyFilter || row.currencyCode === currencyFilter),
    financeInvoices: site.financeInvoices.filter((row) => !currencyFilter || row.currencyCode === currencyFilter),
    approvedExpenses: site.approvedExpenses.filter((row) => !currencyFilter || row.currencyCode === currencyFilter),
    postedLedger: site.postedLedger?.filter((row) => !currencyFilter || row.currencyCode === currencyFilter),
  }));
  const filteredUnallocatedLedger = unallocatedLedger.filter((row) => !currencyFilter || row.currencyCode === currencyFilter);
  const summaryRows = (siteFilter ? summaries.filter((site) => site.siteId === siteFilter).flatMap((site) => site.currencies) : corporate).filter((row) => !currencyFilter || row.currencyCode === currencyFilter);
  const currencies = [...new Set(items.flatMap((site) => [
    ...site.sales.map((entry) => entry.currencyCode), ...site.collections.map((entry) => entry.currencyCode), ...(site.financeCollections || []).map((entry) => entry.currencyCode),
    ...site.financeInvoices.map((entry) => entry.currencyCode), ...site.approvedExpenses.map((entry) => entry.currencyCode),
    ...site.mobileMoney.map((entry) => entry.currencyCode), ...site.telco.map((entry) => entry.currencyCode), ...site.treasury.map((entry) => entry.currencyCode), ...site.receivables.map((entry) => entry.currencyCode), ...(site.postedLedger || []).map((entry) => entry.currencyCode),
  ]).concat(corporate.map((row) => row.currencyCode)))].sort();
  const chartRows = visibleSites.flatMap((site) => currencies.filter((currency) => !currencyFilter || currency === currencyFilter).map((currency) => {
    const summary = summaries.find((row) => row.siteId === site.id)?.currencies.find((row) => row.currencyCode === currency);
    const unavailable = summary?.unavailableMetrics?.includes(chartMetric) ?? false;
    const value = unavailable ? 0 : Number(summary?.values[chartMetric] || 0);
    return { id: `${site.id}:${currency}`, name: site.name, currency, value, unavailable };
  })).filter((row) => !row.unavailable && row.value !== 0);
  const trendRows = trend.filter((row) => row.metric === chartMetric && (!siteFilter || row.siteId === siteFilter) && (!currencyFilter || row.currencyCode === currencyFilter));
  const periodByCurrency = currencies.filter((currency) => !currencyFilter || currency === currencyFilter).map((currency) => ({
    currency, points: [...new Set(trendRows.filter((row) => row.currencyCode === currency).map((row) => row.day))].sort().map((day) => ({ day, value: trendRows.filter((row) => row.currencyCode === currency && (!siteFilter || row.siteId === siteFilter)).reduce((sum, row) => sum + Number(row.total), 0) })),
  })).filter((row) => row.points.length);
  // Bar lengths are normalized *inside each currency*; CDF and USD are not
  // exchange-rate-adjusted and must never share a monetary axis.
  const maximumByCurrency = new Map(currencies.map((currency) => [currency, Math.max(1, ...chartRows.filter((row) => row.currency === currency).map((row) => row.value))]));
  const exportKpis = () => buildRetailOperationsExport({ sites: filteredSites, from: reportPeriod.from, to: reportPeriod.to, locale, currency: currencyFilter, organizationName });
  const exportPostedLedger = () => buildRetailPostedLedgerExport({ sites: filteredSites, unallocated: siteFilter ? [] : filteredUnallocatedLedger, from: reportPeriod.from, to: reportPeriod.to, locale, organizationName });
  const exportExecutive = () => buildRetailExecutiveExport({
    organizationName, locale, from: reportPeriod.from, to: reportPeriod.to,
    siteFilter: siteFilter ? items.find((site) => site.id === siteFilter)?.name || "" : "",
    currency: currencyFilter, summaries: summaries.filter((site) => !siteFilter || site.siteId === siteFilter).map((site) => ({ site: items.find((item) => item.id === site.siteId)?.name || "", currencies: site.currencies.filter((row) => !currencyFilter || row.currencyCode === currencyFilter) })),
    consolidated: summaryRows, unallocatedLedger: siteFilter ? [] : filteredUnallocatedLedger,
    stockWarnings: sourceAvailability.inventory ? stockWarnings : undefined,
  });
  if (cogsOpen) return <RetailCogsWorkspace organizationId={organizationId} organizationName={organizationName} locale={locale}
    period={reportPeriod} initialSiteId={cogsSite} initialCurrency={cogsCurrency}
    sites={items.map((site) => ({ id: site.id, name: site.name }))} canSaveReport={sourceAvailability.reportCreate}
    onBack={() => setCogsOpen(false)} />;
  const canInspectMetric = (value: RetailExecutiveMetric) => {
    if (value === "postedCogs") return sourceAvailability.accounting;
    if (value === "postedRevenue" || value === "postedGrossMargin" || value === "postedOperatingResult") return sourceAvailability.accounting;
    if (value === "financeCollections") return sourceAvailability.financeReceivables && sourceAvailability.financePayments;
    if (value === "invoices" || value === "outstanding" || value === "overdue") return sourceAvailability.financeReceivables;
    if (value === "treasuryAvailable") return sourceAvailability.treasury;
    if (value === "expenses") return sourceAvailability.financeBudgets;
    if (value === "mobileMoneyCommission") return sourceAvailability.agency;
    if (value === "telcoMargin") return sourceAvailability.telco;
    return value === "posSales";
  };
  if (traceMetric) return <RetailFinancialDrilldown organizationId={organizationId} organizationName={organizationName} locale={locale}
    metric={traceMetric} period={reportPeriod} initialSiteId={traceSite} initialCurrency={traceCurrency}
    sites={items.map((site) => ({ id: site.id, name: site.name }))} onBack={() => setTraceMetric(null)} />;
  return <section data-testid="retail-multisite-overview" className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3"><Building2 className="mt-1 h-5 w-5 shrink-0 text-dtsc-blue" /><div className="min-w-0"><h2 className="font-black text-dtsc-ink">{en ? "Store management overview" : "Pilotage des boutiques"}</h2><p className="mt-1 text-sm text-dtsc-muted">{en ? "Operational activity by store and currency; only the company owner/admin can access this comparison." : "Activités par boutique et par devise, réservées au propriétaire et à l'administration."}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><label className="text-xs font-semibold text-dtsc-muted">{en ? "Period" : "Période"}<select className="ml-2 min-h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-2 text-sm text-dtsc-ink" value={days} onChange={(event) => { setDays(Number(event.target.value)); setDateFrom(""); setDateTo(""); }}><option value={1}>{en ? "Today" : "Aujourd'hui"}</option><option value={7}>{en ? "7 days" : "7 jours"}</option><option value={30}>{en ? "30 days" : "30 jours"}</option><option value={90}>{en ? "90 days" : "90 jours"}</option></select></label><Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" />{en ? "Refresh" : "Actualiser"}</Button><Button type="button" variant="outline" onClick={() => downloadProfessionalXlsx(exportKpis())} disabled={loading || !visibleSites.length}><FileSpreadsheet className="h-4 w-4" />Excel KPIs</Button><Button type="button" variant="outline" onClick={() => downloadProfessionalPdfV2(exportKpis())} disabled={loading || !visibleSites.length}><FileText className="h-4 w-4" />PDF KPIs</Button></div>
    </div>
    <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-bold text-dtsc-muted">{en ? "Exact / start date" : "Date précise / début"}<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-2 text-sm" /></label>
      <label className="text-xs font-bold text-dtsc-muted">{en ? "End date" : "Date de fin"}<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-2 text-sm" /></label>
      <label className="text-xs font-bold text-dtsc-muted">{en ? "Store" : "Boutique"}<select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-2 text-sm"><option value="">{en ? "All stores" : "Toutes les boutiques"}</option>{items.map((site) => <option key={site.id} value={site.id}>{site.name}{site.archivedAt || site.status !== "ACTIVE" ? (en ? " · historical" : " · historique") : ""}</option>)}</select></label>
      <label className="text-xs font-bold text-dtsc-muted">{en ? "Currency" : "Devise"}<select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-2 text-sm"><option value="">{en ? "All — separate" : "Toutes — séparées"}</option>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
    </div>
    <div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const part = (key: string) => parts.find((item) => item.type === key)?.value || ""; const date = dateFrom || dateTo || `${part("year")}-${part("month")}-${part("day")}`; setDateFrom(date); setDateTo(date); }}>{en ? "Exact date" : "Date précise"}</Button><Button type="button" variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); }}>{en ? "Clear dates" : "Effacer les dates"}</Button><span className="self-center text-xs text-dtsc-muted">{timezone}</span></div>
    <div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="ghost" disabled={loading || !visibleSites.length} onClick={() => downloadProfessionalXlsx(exportPostedLedger())}><FileSpreadsheet className="h-4 w-4" />{en ? "Provisional ledger · Excel" : "Grand livre provisoire · Excel"}</Button><Button type="button" variant="ghost" disabled={loading || !visibleSites.length} onClick={() => downloadProfessionalPdfV2(exportPostedLedger())}><FileText className="h-4 w-4" />{en ? "Provisional ledger · PDF" : "Grand livre provisoire · PDF"}</Button></div>
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-2">
      <span className="mr-auto flex items-center gap-2 text-xs font-bold text-dtsc-ink"><BarChart3 className="h-4 w-4 text-cyan-600" />{en ? "Executive report · company and stores" : "Rapport de direction · entreprise et boutiques"}</span>
      <Button type="button" variant="outline" disabled={loading || !items.length} onClick={() => downloadProfessionalXlsx(exportExecutive())}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
      <Button type="button" variant="outline" disabled={loading || !items.length} onClick={() => downloadProfessionalCsv(exportExecutive())}>CSV</Button>
      <Button type="button" variant="outline" disabled={loading || !items.length} onClick={() => downloadProfessionalPdfV2(exportExecutive())}><FileText className="h-4 w-4" />PDF</Button>
      {sourceAvailability.reportCreate ? <Button type="button" variant="outline" disabled={loading || savingReport || !summaryRows.length} onClick={() => void saveToReports()}>{savingReport ? en ? "Saving…" : "Enregistrement…" : en ? "Save in Reports" : "Enregistrer dans Rapports"}</Button> : null}
      {sourceAvailability.reports ? <Link className="inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-bold text-dtsc-blue hover:bg-dtsc-page" href="/enterprise-modules/REPORTS">{en ? "Reports module" : "Module Rapports"}</Link> : null}
      <Button type="button" variant="outline" onClick={() => setShowSettings((value) => !value)}><Settings2 className="h-4 w-4" />{en ? "Configure" : "Paramétrer"}</Button>
    </div>
    {showSettings ? <div className="mt-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4" data-testid="retail-dashboard-settings">
      <h3 className="mb-2 font-black text-dtsc-ink">{en ? "Company dashboard preferences" : "Préférences du tableau de bord de l'entreprise"}</h3>
      <p className="mb-3 text-xs text-dtsc-muted">{en ? "Applies to the company. Financial figures and permissions cannot be changed here." : "S'applique à l'entreprise. Ces options ne modifient ni les montants comptables ni les droits d'accès."}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold text-dtsc-muted">{en ? "Default period" : "Période par défaut"}<select className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-2" value={preferences.defaultDays} onChange={(event) => setPreferences((value) => ({ ...value, defaultDays: Number(event.target.value) as RetailDashboardPreferences["defaultDays"] }))}>{[1, 7, 30, 90].map((value) => <option key={value} value={value}>{value} {en ? "days" : "jours"}</option>)}</select></label>
        <label className="text-xs font-bold text-dtsc-muted">{en ? "Default indicator" : "Indicateur par défaut"}<select className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-2" value={preferences.defaultMetric} onChange={(event) => setPreferences((value) => ({ ...value, defaultMetric: event.target.value as RetailDashboardPreferences["defaultMetric"] }))}>{["financeCollections", "invoices", "posSales", "posCollections", "expenses", "postedRevenue", "mobileMoneyCommission", "telcoMargin"].map((key) => <option key={key} value={key}>{METRIC_COPY[key as RetailExecutiveMetric][en ? 1 : 0]}</option>)}</select></label>
        <label className="text-xs font-bold text-dtsc-muted">{en ? "Outstanding warning · default for other currencies" : "Alerte créances · seuil de repli"}<input type="number" min="0" step="1" max="1000000000000" className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-2" value={preferences.warnOutstandingAbove} onChange={(event) => setPreferences((value) => ({ ...value, warnOutstandingAbove: Number(event.target.value) }))} /></label>
        {currencies.map((currency) => <label key={currency} className="text-xs font-bold text-dtsc-muted">{en ? `Outstanding warning · ${currency}` : `Alerte créances · ${currency}`}<input type="number" min="0" step="1" max="1000000000000" className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-2" value={preferences.warnOutstandingByCurrency[currency] ?? preferences.warnOutstandingAbove} onChange={(event) => setPreferences((value) => ({ ...value, warnOutstandingByCurrency: { ...value.warnOutstandingByCurrency, [currency]: Number(event.target.value) } }))} /></label>)}
        <label className="text-xs font-bold text-dtsc-muted">{en ? "Expiry warning days" : "Alerte péremption (jours)"}<input type="number" min="1" max="365" step="1" className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-2" value={preferences.warnStockDays} onChange={(event) => setPreferences((value) => ({ ...value, warnStockDays: Number(event.target.value) }))} /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-dtsc-ink"><input type="checkbox" checked={preferences.showLegacyPos} onChange={(event) => setPreferences((value) => ({ ...value, showLegacyPos: event.target.checked }))} />{en ? "Show historical POS blocks" : "Afficher les flux POS historiques"}</label>
        <fieldset className="min-w-0 sm:col-span-2 lg:col-span-4">
          <legend className="text-xs font-bold text-dtsc-ink">{en ? "Priority indicators · display first" : "Indicateurs prioritaires · affichés en premier"}</legend>
          <p className="mt-1 text-xs text-dtsc-muted">{en ? "Preferences only reorder the cards; they never change amounts or access rights." : "Les favoris modifient uniquement l'ordre des cartes, sans changer les montants ni les droits d'accès."}</p>
          <div className="mt-2 flex flex-wrap gap-2">{HIGHLIGHT_METRICS.map((metric) => <label key={metric} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${preferences.favoriteMetrics.includes(metric) ? "border-cyan-500 bg-cyan-500/10 text-dtsc-ink" : "border-dtsc-border bg-dtsc-surface text-dtsc-muted"}`}>
            <input type="checkbox" checked={preferences.favoriteMetrics.includes(metric)} onChange={(event) => setPreferences((value) => ({ ...value, favoriteMetrics: event.target.checked ? [...value.favoriteMetrics, metric] : value.favoriteMetrics.filter((code) => code !== metric) }))} />
            {METRIC_COPY[metric][en ? 1 : 0]}
          </label>)}</div>
        </fieldset>
      </div>
      <div className="mt-3 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowSettings(false)}>{en ? "Cancel" : "Annuler"}</Button><Button type="button" disabled={savingSettings || !prefsLoaded} onClick={() => void savePreferences()}>{savingSettings ? (en ? "Saving…" : "Enregistrement…") : (en ? "Save settings" : "Enregistrer les paramètres")}</Button></div>
    </div> : null}
    {!loading && visibleSites.length ? <section className="mt-4 space-y-3" aria-label={en ? "Company-wide KPIs" : "Indicateurs de l'entreprise"}>
      <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-cyan-600" /><h3 className="font-black text-dtsc-ink">{siteFilter ? (en ? "Selected store" : "Boutique sélectionnée") : (en ? "Company-wide financial overview" : "Vue financière consolidée de l'entreprise")}</h3></div>
      {sourceAvailability.inventory ? <div className="flex flex-wrap gap-2 text-xs font-bold" aria-label={en ? "Inventory risk alerts" : "Alertes sur les risques de stock"}>
        <span className={`rounded-full px-3 py-2 ${stockWarnings.lowStock ? "bg-orange-500/15 text-orange-800 dark:text-orange-200" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"}`}>{stockWarnings.lowStock} {en ? "low-stock items" : "articles en stock faible"}</span>
        <span className={`rounded-full px-3 py-2 ${stockWarnings.expired ? "bg-red-500/15 text-red-800 dark:text-red-200" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"}`}>{stockWarnings.expired} {en ? "expired batches" : "lots périmés"}</span>
        <span className="rounded-full bg-amber-500/15 px-3 py-2 text-amber-900 dark:text-amber-200">{stockWarnings.expiring} {en ? `batches expiring within ${preferences.warnStockDays} days` : `lots périmant sous ${preferences.warnStockDays} jours`}</span>
      </div> : null}
      {summaryRows.length ? summaryRows.map((bucket) => <div key={bucket.currencyCode} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-black text-cyan-800 dark:text-cyan-200">{bucket.currencyCode}</span><span className="text-xs text-dtsc-muted">{en ? "Native currency · no cross-currency sum" : "Devise d'origine · aucun cumul entre devises"}</span></div>
        <div className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">{orderedHighlightMetrics.filter((metric) => (metric !== "posSales" || preferences.showLegacyPos) && (metric !== "mobileMoneyCommission" || sourceAvailability.agency) && (metric !== "telcoMargin" || sourceAvailability.telco) && (!metric.startsWith("posted") || sourceAvailability.accounting) && (metric !== "treasuryAvailable" || sourceAvailability.treasury)).map((metric) => {
          const raw = bucket.values[metric]; const unavailable = bucket.unavailableMetrics?.includes(metric) ?? false; const warning = unavailable || metric === "overdue" && Number(raw) > 0 || metric === "outstanding" && Number(raw) >= (preferences.warnOutstandingByCurrency[bucket.currencyCode] ?? preferences.warnOutstandingAbove) && Number(raw) > 0;
          return <div key={metric} className={`relative min-w-0 rounded-xl border p-3 ${warning ? "border-amber-500/50 bg-amber-500/10" : metric === "financeCollections" || metric === "postedGrossMargin" ? "border-emerald-500/25 bg-emerald-500/5" : "border-dtsc-border bg-dtsc-surface"}`} title={METRIC_COPY[metric][en ? 3 : 2]}>
            <p className="flex items-start gap-1 text-[11px] font-bold text-dtsc-muted">{warning ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" /> : null}{METRIC_COPY[metric][en ? 1 : 0]}</p>
            <p className={`mt-2 break-words text-base font-black tabular-nums sm:text-lg ${Number(raw) < 0 ? "text-red-600 dark:text-red-300" : "text-dtsc-ink"}`}>{unavailable ? (en ? "Not determined" : "Non déterminé") : currencyAmount(raw, bucket.currencyCode, en)}</p>
            <span className="mt-1 inline-flex rounded-full border border-dtsc-border bg-dtsc-page px-2 py-0.5 text-[10px] font-semibold text-dtsc-muted">{retailMetricTimeCaption(metric, locale)}</span>
            <p className="mt-1 text-[10px] leading-relaxed text-dtsc-muted">{METRIC_COPY[metric][en ? 3 : 2]}</p>
            {canInspectMetric(metric) ? <button type="button" className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-cyan-500 hover:ring-2 hover:ring-cyan-500/60" aria-label={en ? `Inspect ${METRIC_COPY[metric][1]} in ${bucket.currencyCode}` : `Consulter ${METRIC_COPY[metric][0]} en ${bucket.currencyCode}`} onClick={() => { if (metric === "postedCogs") { setCogsSite(siteFilter); setCogsCurrency(bucket.currencyCode); setCogsOpen(true); } else { setTraceMetric(metric as RetailFinancialTrace); setTraceSite(siteFilter); setTraceCurrency(bucket.currencyCode); } }}><span className="sr-only">{en ? "Open source details" : "Ouvrir les pièces sources"}</span></button> : null}
          </div>;
        })}</div>
      </div>) : <p className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-muted">{en ? "No financial event for the selected scope. Balances may still exist in other stores or currencies." : "Aucune opération financière dans ce périmètre. Des soldes peuvent exister dans d'autres boutiques ou devises."}</p>}
      {!siteFilter && (unallocated.mobileMoney.length || unallocated.telco.length || unallocated.treasury.length) ? <div role="status" className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"><AlertTriangle className="mr-1 inline h-4 w-4" />{en ? "Some Mobile Money, Telco or treasury amounts have no store attribution. They are included in company totals but excluded from store comparisons." : "Des opérations Mobile Money, Télécom ou comptes de trésorerie n'ont pas de boutique attribuée. Elles figurent dans les totaux entreprise, mais pas dans les comparaisons entre boutiques."}</div> : null}
      <p className="text-xs text-dtsc-muted">{en ? "Interpretation: invoices and approved expenses are period events; open receivables and treasury are current positions; accounting margins are posted-only and provisional. Mobile Money customer principal is not revenue." : "Lecture : factures et dépenses approuvées = flux de période ; créances et trésorerie = positions actuelles ; marges comptables = écritures postées provisoires. Les dépôts/retraits Mobile Money ne sont pas des revenus."}</p>
    </section> : null}
    {!loading && visibleSites.length ? <div className="mt-4 min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4" data-testid="retail-executive-charts">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><BarChart3 className="h-4 w-4 text-cyan-600" />{en ? "Interactive trends and store comparisons" : "Évolution et comparaison interactive des boutiques"}</h3>
        <select aria-label={en ? "Chart metric" : "Indicateur graphique"} value={chartMetric} onChange={(event) => { setChartMetric(event.target.value as RetailExecutiveMetric); setActiveBar(""); }} className="min-h-11 max-w-full rounded-lg border border-dtsc-border bg-dtsc-surface px-2 text-sm">{RETAIL_EXECUTIVE_METRICS.filter((metric) => (metric !== "posSales" && metric !== "posCollections" || preferences.showLegacyPos) && (!metric.startsWith("mobileMoney") || sourceAvailability.agency) && (!metric.startsWith("telco") || sourceAvailability.telco) && (!metric.startsWith("posted") || sourceAvailability.accounting) && (!metric.startsWith("treasury") || sourceAvailability.treasury)).map((metric) => <option key={metric} value={metric}>{METRIC_COPY[metric][en ? 1 : 0]}</option>)}</select>
      </div>
      <p className="mt-2 rounded-lg bg-dtsc-surface p-2 text-xs text-dtsc-muted">{METRIC_COPY[chartMetric][en ? 3 : 2]}</p>
      {periodByCurrency.length ? <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">{periodByCurrency.map(({ currency, points }) => {
        const maximum = Math.max(1, ...points.map((point) => Math.abs(point.value)));
        return <div key={currency} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><h4 className="mb-2 text-xs font-black text-dtsc-ink">{en ? "Daily trend" : "Évolution quotidienne"} · {currency}</h4>
          <div role="img" aria-label={en ? `Daily financial trend in ${currency}` : `Évolution des montants en ${currency}`} className="flex h-44 min-w-0 items-end gap-1 overflow-x-auto border-b border-dtsc-border pb-1">{points.map((point) => <button key={point.day} type="button" title={`${point.day}: ${currencyAmount(String(point.value), currency, en)}`} onClick={() => setActiveBar(`${point.day}:${currency}`)} aria-pressed={activeBar === `${point.day}:${currency}`} className="flex h-full min-w-3 flex-1 flex-col justify-end gap-1 outline-offset-2 focus-visible:outline-2 focus-visible:outline-cyan-500"><span className={`block min-h-1 rounded-t-md ${activeBar === `${point.day}:${currency}` ? "bg-emerald-500" : point.value < 0 ? "bg-rose-500" : "bg-cyan-500"}`} style={{ height: `${Math.max(3, Math.abs(point.value) / maximum * 95)}%` }} /><span className="truncate text-[8px] text-dtsc-muted">{point.day.slice(5)}</span></button>)}</div>
          <p className="mt-2 text-[11px] text-dtsc-muted">{activeBar.endsWith(`:${currency}`) && activeBar.includes("-") ? points.find((point) => `${point.day}:${currency}` === activeBar)?.day + " · " + currencyAmount(String(points.find((point) => `${point.day}:${currency}` === activeBar)?.value || 0), currency, en) : (en ? "Select a day to inspect its amount; source events are grouped by company time zone." : "Sélectionnez une journée ; les événements sont regroupés selon le fuseau horaire de l'entreprise.")}</p>
        </div>;
      })}</div> : <p className="mt-3 text-xs text-dtsc-muted">{en ? "No dated event for this metric and scope. Current balances are intentionally not represented as a historical trend." : "Aucun événement daté pour cet indicateur. Les soldes actuels ne sont pas présentés comme une évolution historique."}</p>}
      <div className="mt-4 grid max-h-80 gap-2 overflow-auto">{chartRows.length ? chartRows.map((row) => <button key={row.id} type="button" aria-pressed={activeBar === row.id} onClick={() => { setActiveBar(row.id === activeBar ? "" : row.id); setSiteFilter(siteFilter === row.id.split(":")[0] ? "" : row.id.split(":")[0]); }} className={`grid min-w-0 grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-center gap-3 rounded-lg p-1.5 text-left hover:bg-cyan-500/10 ${activeBar === row.id ? "bg-cyan-500/10" : ""}`}><span className="truncate text-xs font-semibold text-dtsc-ink" title={row.name}>{row.name} · {row.currency}</span><span className="relative flex min-h-9 items-center"><span className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-500" style={{ width: `${Math.max(4, (Math.abs(row.value) / (maximumByCurrency.get(row.currency) || 1)) * 100)}%` }} /><span className="relative z-10 pl-2 text-xs font-black text-white drop-shadow-sm">{currencyAmount(String(row.value), row.currency, en)}</span></span></button>) : <p className="text-xs text-dtsc-muted">{en ? "No activity for the filtered period." : "Aucune activité pour cette période et ces filtres."}</p>}</div>
      <p className="mt-2 text-xs text-dtsc-muted">{en ? "Select a bar to filter a store. Each currency uses its own scale and never shares a monetary axis." : "Sélectionnez une barre pour filtrer la boutique. Chaque devise a sa propre échelle ; aucune devise n'est additionnée à une autre."}</p>
    </div> : null}
    {error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</p> : null}
    {loading ? <p role="status" className="mt-4 text-sm text-dtsc-muted">{en ? "Loading stores…" : "Chargement des boutiques…"}</p> : null}
    {!loading && !items.length ? <p className="mt-4 rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">{en ? "No store has been set up. Create sites and their warehouses from Enterprise master data." : "Aucune boutique enregistrée. Créez les sites et leurs dépôts depuis les Référentiels ERP."}</p> : null}
    {!loading && visibleSites.length ? <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">{filteredSites.map((site) => <article key={site.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-dtsc-blue" /><h3 className="min-w-0 break-words font-black text-dtsc-ink">{site.code} · {site.name}</h3>{site.archivedAt || site.status !== "ACTIVE" ? <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-black text-amber-800 dark:text-amber-200">{en ? "Historical store" : "Boutique historique"}</span> : null}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {preferences.showLegacyPos ? <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><p className="flex items-center gap-2 text-xs font-bold text-dtsc-muted"><ShoppingBasket className="h-4 w-4" />{en ? "Historical completed POS sales" : "Ventes POS historiques réalisées"}</p>{site.sales.length ? site.sales.map((sale) => <p key={sale.currencyCode} className="mt-2 break-words text-sm font-black text-dtsc-ink">{currencyAmount(sale.total, sale.currencyCode, en)} <span className="font-normal text-dtsc-muted">({sale.count})</span></p>) : <p className="mt-2 text-sm text-dtsc-muted">0</p>}</div> : null}
        {preferences.showLegacyPos ? <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><p className="flex items-center gap-2 text-xs font-bold text-dtsc-muted"><Wallet className="h-4 w-4" />{en ? "Historical POS collections" : "Encaissements POS historiques"}</p>{site.collections.length ? site.collections.map((tender) => <p key={`${tender.currencyCode}:${tender.method}`} className="mt-2 break-words text-sm font-semibold text-dtsc-ink">{currencyAmount(tender.total, tender.currencyCode, en)} <span className="text-xs font-normal text-dtsc-muted">· {tender.method === "CASH" ? en ? "Cash" : "Espèces" : tender.method === "BANK_TRANSFER" ? en ? "Bank transfer" : "Virement" : tender.method === "MOBILE_MONEY" ? "Mobile Money" : tender.method === "CARD" ? en ? "Card" : "Carte" : en ? "Other" : "Autre"}</span></p>) : <p className="mt-2 text-sm text-dtsc-muted">0</p>}</div> : null}
      </div>
      <div className="mt-3 rounded-xl border border-cyan-500/30 bg-dtsc-surface p-3"><p className="text-xs font-black text-dtsc-muted">{en ? "Finance invoice collections — in selected period" : "Encaissements des factures Finance — sur la période"}</p>{site.financeCollections.length ? site.financeCollections.map((payment) => <p key={`${payment.currencyCode}:${payment.method}`} className="mt-2 text-sm font-bold text-dtsc-ink">{currencyAmount(payment.total, payment.currencyCode, en)} <span className="text-xs font-normal text-dtsc-muted">· {payment.method} · {payment.count}</span></p>) : <p className="mt-2 text-sm text-dtsc-muted">0</p>}<p className="mt-2 text-xs text-dtsc-muted">{en ? "Confirmed Finance payments allocated to Retail invoices by payment date. Kept separate from historic POS tender receipts." : "Paiements Finance confirmés et affectés aux factures Retail, par date de paiement. Séparés des tickets POS historiques."}</p></div>
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
            <div><dt className="text-dtsc-muted">{en ? "Cost of sales" : "Coût des ventes"}</dt><dd><button type="button" className="inline-flex min-h-10 items-center gap-1 rounded-lg text-left font-bold text-dtsc-blue underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-500" onClick={() => { setCogsSite(site.id); setCogsCurrency(entry.currencyCode); setCogsOpen(true); }}>{currencyAmount(entry.costOfSales, entry.currencyCode, en)}<GitBranch className="h-3.5 w-3.5" /></button></dd></div>
            <div><dt className="text-dtsc-muted">{en ? "Other expenses" : "Autres charges"}</dt><dd className="font-bold text-dtsc-ink">{currencyAmount(entry.operatingExpenses, entry.currencyCode, en)}</dd></div>
            <div><dt className="text-dtsc-muted">{en ? "Other income" : "Autres produits"}</dt><dd className="font-bold text-dtsc-ink">{currencyAmount(entry.otherIncome, entry.currencyCode, en)}</dd></div>
            <div><dt className="text-dtsc-muted">{en ? "Gross margin" : "Marge brute"}</dt><dd className="font-black text-dtsc-blue">{currencyAmount(entry.grossMargin, entry.currencyCode, en)}</dd></div>
            <div><dt className="text-dtsc-muted">{en ? "Operating result" : "Résultat d'exploitation"}</dt><dd className="font-black text-dtsc-ink">{currencyAmount(entry.operatingResult, entry.currencyCode, en)}</dd></div>
          </dl>
        </div>) : <p className="mt-2 text-xs text-dtsc-muted">{en ? "No posted profit-and-loss journal lines for this period." : "Aucune ligne de résultat postée pour cette période."}</p>}
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{en ? "Not certified: historical site allocation, accounting completeness and exports remain to be verified." : "Non certifié : affectation historique des boutiques, exhaustivité comptable et exports à vérifier."}</p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {site.receivables.length ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"><h4 className="text-xs font-black text-dtsc-ink">{en ? "Current receivables · all issue dates" : "Créances actuelles · toutes dates d'émission"}</h4>{site.receivables.map((row) => <p key={row.currencyCode} className="mt-2 text-sm font-bold text-dtsc-ink">{currencyAmount(row.total, row.currencyCode, en)} <span className="text-xs text-amber-700 dark:text-amber-200">({en ? "overdue" : "échues"}: {currencyAmount(row.overdue, row.currencyCode, en)})</span></p>)}</div> : null}
        {sourceAvailability.agency && site.mobileMoney.length ? <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3"><h4 className="text-xs font-black text-dtsc-ink">Mobile Money · {en ? "principal ≠ income" : "principal ≠ revenu"}</h4>{site.mobileMoney.map((row) => <p key={`${row.currencyCode}:${row.transactionType}`} className="mt-1 text-xs text-dtsc-ink">{row.transactionType === "DEPOSIT" ? en ? "Deposits" : "Dépôts" : en ? "Withdrawals" : "Retraits"}: {currencyAmount(row.principal, row.currencyCode, en)} · {en ? "Commission" : "Commission"}: {currencyAmount(row.commission, row.currencyCode, en)} · {en ? "Fees" : "Frais"}: {currencyAmount(row.fees, row.currencyCode, en)}</p>)}</div> : null}
        {sourceAvailability.telco && site.telco.length ? <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3"><h4 className="text-xs font-black text-dtsc-ink">Télécom · {en ? "operational margin" : "marge opérationnelle"}</h4>{site.telco.map((row) => <p key={row.currencyCode} className="mt-1 text-xs text-dtsc-ink">{en ? "Sales" : "Ventes"} {currencyAmount(row.total, row.currencyCode, en)} · {en ? "Costs" : "Coûts"} {currencyAmount(row.operatorCost, row.currencyCode, en)} · {en ? "Margin" : "Marge"} {currencyAmount(row.margin, row.currencyCode, en)}</p>)}</div> : null}
        {sourceAvailability.treasury && site.treasury.length ? <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3"><h4 className="text-xs font-black text-dtsc-ink">{en ? "Financial accounts · operational balance" : "Comptes financiers · solde opérationnel"}</h4>{site.treasury.map((row) => <p key={`${row.currencyCode}:${row.accountType}`} className="mt-1 text-xs text-dtsc-ink">{row.currencyCode} · {row.accountType === "CASH" ? en ? "Cash" : "Espèces" : row.accountType === "BANK" ? en ? "Bank" : "Banque" : row.accountType === "MOBILE_MONEY" ? "Mobile Money" : en ? "Other account" : "Autre compte"}: {currencyAmount(row.total, row.currencyCode, en)} · {en ? "reconciled" : "rapproché"} {currencyAmount(row.reconciled, row.currencyCode, en)}</p>)}</div> : null}
      </div>
      {sourceAvailability.inventory ? <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold"><span className={`rounded-full px-2 py-1 ${site.stockAlerts.lowStock ? "bg-orange-500/15 text-orange-700 dark:text-orange-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>{site.stockAlerts.lowStock} {en ? "low-stock items" : "articles en stock faible"}</span><span className={`rounded-full px-2 py-1 ${site.stockAlerts.expired ? "bg-red-500/15 text-red-700 dark:text-red-300" : "bg-dtsc-surface text-dtsc-muted"}`}>{site.stockAlerts.expired} {en ? "expired batches" : "lots périmés"}</span><span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-200">{site.stockAlerts.expiring} {en ? `batches nearing expiry (${preferences.warnStockDays} days)` : `lots à péremption proche (${preferences.warnStockDays} jours)`}</span></div> : null}
      <p className="mt-3 text-xs text-dtsc-muted">{sourceAvailability.inventory ? `${site.inventory.balanceRows} ${en ? "inventory balance rows" : "lignes de stock"} · ` : ""}{site.cashSessions.filter((row) => row.status === "OPEN").reduce((sum, row) => sum + row.count, 0)} {en ? "open cash sessions" : "sessions de caisse ouvertes"} · {site.dailyCloses.filter((row) => row.status === "VALIDATED").reduce((sum, row) => sum + row.count, 0)} {en ? "validated daily closes" : "clôtures quotidiennes validées"}</p>
    </article>)}</div> : null}
    {filteredUnallocatedLedger.length ? <p role="status" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">{en ? "Some posted profit-and-loss lines have no store assignment. They are excluded from store results until reconciled:" : "Certaines écritures de résultat postées n'ont pas de boutique attribuée. Elles restent exclues des résultats par boutique jusqu'au rapprochement :"} {filteredUnallocatedLedger.map((row) => `${row.journalLineCount} (${row.currencyCode})`).join(" · ")}</p> : null}
    <p className="mt-4 text-xs text-dtsc-muted">{en ? "Operational overview only. Financial margin and net profit require verified posted accounting entries and expense attribution by store." : "Vue opérationnelle uniquement. Les marges et bénéfices nets exigent les écritures comptables validées et l'affectation des dépenses par boutique."}</p>
  </section>;
}
