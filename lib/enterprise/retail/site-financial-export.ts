import type { ProfessionalReportExportModel } from "@/lib/reporting/professional-export";
import { RETAIL_EXECUTIVE_METRICS, type RetailExecutiveMetric, type RetailExecutiveSummary } from "@/lib/enterprise/retail/executive-metrics";

export type RetailPostedLedger = {
  currencyCode: string;
  revenue: string;
  otherIncome: string;
  costOfSales: string;
  operatingExpenses: string;
  grossMargin: string;
  operatingResult: string;
  journalLineCount: number;
};

export type RetailPostedStore = {
  code: string;
  name: string;
  postedLedger?: RetailPostedLedger[];
};

type RetailOperationsStore = RetailPostedStore & {
  sales: Array<{ currencyCode: string; total: string; count: number }>;
  collections: Array<{ currencyCode: string; total: string; method: string; count: number }>;
  financeCollections?: Array<{ currencyCode: string; total: string; method: string; count: number }>;
  financeInvoices: Array<{ currencyCode: string; issuedTotal: string; allocatedToDate: string; outstandingToDate: string; count: number }>;
  approvedExpenses: Array<{ currencyCode: string; total: string; count: number }>;
};

/** A full operational KPI export. Channels remain separate: classic POS
 * receipts are NOT summed with Finance invoices or lifetime allocations. */
export function buildRetailOperationsExport(input: {
  sites: RetailOperationsStore[]; from: string; to: string;
  locale: "fr" | "en"; currency?: string; organizationName?: string;
}): ProfessionalReportExportModel {
  const en = input.locale === "en";
  const rows = input.sites.flatMap((site) => {
    const currencies = [...new Set([
      ...site.sales.map((row) => row.currencyCode), ...site.collections.map((row) => row.currencyCode), ...(site.financeCollections || []).map((row) => row.currencyCode),
      ...site.financeInvoices.map((row) => row.currencyCode), ...site.approvedExpenses.map((row) => row.currencyCode),
    ])].filter((currency) => !input.currency || currency === input.currency);
    return currencies.map((currency) => ({
      site: `${site.code} · ${site.name}`, currency,
      posSales: site.sales.filter((row) => row.currencyCode === currency).reduce((sum, row) => sum + Number(row.total), 0),
      posCollections: site.collections.filter((row) => row.currencyCode === currency).reduce((sum, row) => sum + Number(row.total), 0),
      financeCollections: (site.financeCollections || []).filter((row) => row.currencyCode === currency).reduce((sum, row) => sum + Number(row.total), 0),
      issuedInvoices: site.financeInvoices.filter((row) => row.currencyCode === currency).reduce((sum, row) => sum + Number(row.issuedTotal), 0),
      allocatedToDate: site.financeInvoices.filter((row) => row.currencyCode === currency).reduce((sum, row) => sum + Number(row.allocatedToDate), 0),
      outstandingToDate: site.financeInvoices.filter((row) => row.currencyCode === currency).reduce((sum, row) => sum + Number(row.outstandingToDate), 0),
      approvedExpenses: site.approvedExpenses.filter((row) => row.currencyCode === currency).reduce((sum, row) => sum + Number(row.total), 0),
    }));
  });
  const currencies = [...new Set(rows.map((row) => row.currency))];
  return {
    title: en ? "Retail multi-store operational KPIs" : "Indicateurs opérationnels RETAIL — multi-boutiques",
    organizationName: input.organizationName, filenameBase: "retail-store-kpis",
    subtitle: en ? "Operational channels kept separate; not a certified accounting statement." : "Flux opérationnels distincts ; ne constitue pas un état comptable certifié.",
    kpis: [{ label: en ? "Stores" : "Boutiques", value: String(input.sites.length) }, { label: en ? "Currency policy" : "Devises", value: input.currency || (en ? "Separate" : "Séparées") }],
    chartTitle: en ? "POS receipts by store (currency-separated)" : "Encaissements POS par boutique (devises séparées)",
    chart: currencies.length > 1 ? [] : rows.map((row) => ({ label: `${row.site} (${row.currency})`, value: row.posCollections, displayValue: `${row.posCollections.toLocaleString(en ? "en-US" : "fr-FR")} ${row.currency}` })),
    columns: [
      { key: "site", label: en ? "Store" : "Boutique" }, { key: "currency", label: en ? "Currency" : "Devise" },
      { key: "posSales", label: en ? "POS sales" : "Ventes POS" }, { key: "posCollections", label: en ? "POS collected" : "Encaissements POS" },
      { key: "financeCollections", label: en ? "Finance collections during period" : "Encaissements Finance de la période" },
      { key: "issuedInvoices", label: en ? "Finance invoices issued" : "Factures Finance émises" },
      { key: "allocatedToDate", label: en ? "Invoice allocated to date" : "Factures réglées à date" },
      { key: "outstandingToDate", label: en ? "Invoice outstanding to date" : "Factures restantes à date" },
      { key: "approvedExpenses", label: en ? "Approved expenses" : "Dépenses approuvées" },
    ], rows,
    insights: [{ tone: "info", title: en ? "Different accounting bases" : "Bases comptables distinctes", body: en ? "Invoiced/allocated balances are as of today; they are not receipts during the chosen period. No cross-currency totals or double-counting. Choose one currency to enable a directly comparable export chart." : "Les montants facturés/affectés sont des soldes à date, et non des encaissements de la période. Aucun cumul entre devises ou double comptage. Sélectionnez une devise pour activer le graphique comparable dans l'export." }],
    filters: [{ label: en ? "From" : "Du", value: input.from }, { label: en ? "To" : "Au", value: input.to }, { label: en ? "Currency" : "Devise", value: input.currency || (en ? "All (separate)" : "Toutes (séparées)") }],
    accentHex: "#087EA4",
  };
}

/** Exports a disclosure of posted P&L data, never an accounting certification.
 * Each row retains the native functional currency; no cross-currency total is
 * presented or inferred. Missing site attribution remains explicit.
 */
export function buildRetailPostedLedgerExport(input: {
  sites: RetailPostedStore[];
  unallocated: RetailPostedLedger[];
  from: string;
  to: string;
  locale: "fr" | "en";
  organizationName?: string;
}): ProfessionalReportExportModel {
  const en = input.locale === "en";
  const status = en ? "PROVISIONAL — NOT CERTIFIED" : "PROVISOIRE — NON CERTIFIÉ";
  const toRow = (shop: string, entry: RetailPostedLedger, attributed: boolean) => ({
    site: shop, currency: entry.currencyCode, revenue: entry.revenue,
    costOfSales: entry.costOfSales, otherIncome: entry.otherIncome,
    operatingExpenses: entry.operatingExpenses, grossMargin: entry.grossMargin,
    operatingResult: entry.operatingResult, journalLineCount: entry.journalLineCount,
    attribution: attributed ? (en ? "Attributed" : "Attribuée") : (en ? "Unallocated" : "Non attribuée"),
    status,
  });
  const rows: ProfessionalReportExportModel["rows"] = input.sites.flatMap((site) =>
    (site.postedLedger || []).map((entry) => toRow(`${site.code} · ${site.name}`, entry, true)));
  for (const entry of input.unallocated) rows.push(toRow(en ? "Unallocated journal lines" : "Écritures sans boutique", entry, false));
  return {
    title: en ? "Retail posted profit and loss — PROVISIONAL" : "Résultat comptable Retail — PROVISOIRE",
    organizationName: input.organizationName,
    subtitle: en ? "NOT CERTIFIED. Store-level posted journal lines only; no guaranteed completeness or net profit." : "NON CERTIFIÉ. Lignes comptables postées par boutique uniquement ; ni exhaustivité ni bénéfice net garantis.",
    filenameBase: "retail-posted-ledger-provisional",
    generatedLabel: new Date().toISOString(),
    kpis: [
      { label: en ? "Store count" : "Nombre de boutiques", value: String(input.sites.length) },
      { label: en ? "Unallocated P&L lines" : "Écritures non attribuées", value: String(input.unallocated.reduce((sum, row) => sum + row.journalLineCount, 0)) },
      { label: en ? "Certification" : "Certification", value: status },
    ],
    columns: [
      { key: "site", label: en ? "Store" : "Boutique" },
      { key: "currency", label: en ? "Functional currency" : "Devise fonctionnelle" },
      { key: "revenue", label: en ? "Revenue" : "Produits" },
      { key: "costOfSales", label: en ? "Cost of sales" : "Coût des ventes" },
      { key: "grossMargin", label: en ? "Gross margin" : "Marge brute" },
      { key: "otherIncome", label: en ? "Other income" : "Autres produits" },
      { key: "operatingExpenses", label: en ? "Other expenses" : "Autres charges" },
      { key: "operatingResult", label: en ? "Operating result" : "Résultat d'exploitation" },
      { key: "journalLineCount", label: en ? "Journal lines" : "Lignes comptables" },
      { key: "attribution", label: en ? "Store attribution" : "Affectation boutique" },
      { key: "status", label: en ? "Status" : "Statut" },
    ],
    rows,
    chart: [],
    insights: [
      { tone: "warning", title: status, body: en
        ? "Historical entries may lack a store; posting completeness and reconciliation remain open. These amounts are not certified accounts."
        : "Des écritures historiques peuvent manquer de boutique ; exhaustivité et rapprochement restent à vérifier. Ces montants ne sont pas des comptes certifiés." },
      { tone: "info", title: en ? "Currency policy" : "Règle de devise", body: en
        ? "Each row uses its own functional currency. No currency conversion or aggregate profit is presented."
        : "Chaque ligne conserve sa devise fonctionnelle. Aucun bénéfice global ni conversion de devises n'est présenté." },
    ],
    filters: [
      { label: en ? "From" : "Du", value: input.from },
      { label: en ? "To" : "Au", value: input.to },
      { label: en ? "Scope" : "Périmètre", value: "POSTED/REVERSED" },
    ],
    accentHex: "#087EA4",
  };
}

const metricLabels: Record<RetailExecutiveMetric, [string, string]> = {
  posSales: ["Tickets POS historiques", "Legacy POS sales"], posCollections: ["Encaissements POS historiques", "Legacy POS receipts"],
  financeCollections: ["Encaissements Finance (période)", "Finance receipts (period)"],
  invoices: ["Factures émises nettes d'avoirs", "Invoices net of credits"],
  invoiceAllocated: ["Factures de la période réglées à date", "Period invoices paid to date"],
  outstanding: ["Créances totales ouvertes à date", "Current open receivables"], overdue: ["Créances échues à date", "Current overdue receivables"],
  expenses: ["Dépenses approuvées (non forcément payées)", "Approved expenses (not necessarily paid)"],
  postedRevenue: ["Produits comptabilisés provisoires", "Provisional posted revenue"], postedCogs: ["Coût des ventes comptabilisé", "Posted COGS"],
  postedGrossMargin: ["Marge brute comptabilisée provisoire", "Provisional posted gross margin"],
  postedOperatingResult: ["Résultat d'exploitation provisoire", "Provisional operating result"],
  mobileMoneyDeposits: ["Principal dépôts Mobile Money (hors CA)", "Mobile Money deposit principal (not revenue)"],
  mobileMoneyWithdrawals: ["Principal retraits Mobile Money (hors charges)", "Mobile Money withdrawal principal (not expense)"],
  mobileMoneyCommission: ["Commissions Mobile Money", "Mobile Money commissions"], mobileMoneyFees: ["Frais clients Mobile Money", "Mobile Money customer fees"],
  telcoSales: ["Recharges Télécom réalisées", "Completed Telco sales"], telcoCost: ["Coûts opérateur Télécom", "Telco operator costs"], telcoMargin: ["Marge Télécom opérationnelle", "Telco operational margin"],
  treasuryBalance: ["Solde opérationnel trésorerie", "Operational treasury balance"], treasuryReconciled: ["Solde rapproché trésorerie", "Reconciled treasury balance"], treasuryAvailable: ["Trésorerie disponible", "Available treasury"],
};

/** One corporate export model shared by the POS dashboard and the Reporting
 * workspace. Exact Decimal strings are not rounded or converted on export.
 * A long, five-column table is legible in both XLSX and A4 landscape PDF;
 * rendering twenty-two metrics as adjacent PDF columns is not legible. */
export function buildRetailExecutiveExport(input: {
  organizationName: string; locale: "fr" | "en"; from: string; to: string;
  siteFilter: string; currency: string;
  summaries: Array<{ site: string; currencies: RetailExecutiveSummary[] }>;
  consolidated: RetailExecutiveSummary[]; unallocatedLedger: RetailPostedLedger[];
  stockWarnings?: { lowStock: number; expiring: number; expired: number };
}): ProfessionalReportExportModel {
  const en = input.locale === "en";
  const classify = (metric: RetailExecutiveMetric) => metric.startsWith("pos") ? (en ? "Historical POS" : "POS historique")
    : ["financeCollections", "invoices", "invoiceAllocated", "outstanding", "overdue"].includes(metric) ? (en ? "Customer invoicing & collections" : "Facturation et créances")
      : metric === "expenses" ? (en ? "Expenses" : "Dépenses")
        : metric.startsWith("posted") ? (en ? "Posted accounting — provisional" : "Comptabilité postée — provisoire")
          : metric.startsWith("mobileMoney") ? "Mobile Money" : metric.startsWith("telco") ? (en ? "Telco" : "Télécom") : (en ? "Treasury" : "Trésorerie");
  const expand = (scope: string, row: RetailExecutiveSummary) => RETAIL_EXECUTIVE_METRICS.map((metric) => ({
    scope, currency: row.currencyCode, category: classify(metric), indicator: metricLabels[metric][en ? 1 : 0],
    value: row.unavailableMetrics?.includes(metric) ? (en ? "NOT DETERMINED" : "NON DÉTERMINÉ") : row.values[metric],
  }));
  const rows: ProfessionalReportExportModel["rows"] = [
    ...input.consolidated.flatMap((row) => expand(input.siteFilter || (en ? "Company (including unattributed)" : "Entreprise (dont non attribué)"), row)),
    ...input.summaries.flatMap((site) => site.currencies.flatMap((row) => expand(site.site, row))),
  ];
  const singleCurrency = input.currency || (input.consolidated.length === 1 ? input.consolidated[0].currencyCode : "");
  return {
    title: en ? "RETAIL executive financial dashboard" : "Pilotage financier de direction RETAIL",
    organizationName: input.organizationName,
    subtitle: en ? "Company and store breakdown · native currencies · mixed operational and posted sources clearly separated" : "Consolidé et boutiques · devises natives · sources opérationnelles et comptables distinguées",
    filenameBase: `retail-direction-${input.from.slice(0, 10)}-${input.to.slice(0, 10)}${input.currency ? `-${input.currency}` : ""}`,
    generatedLabel: new Date().toISOString(),
    kpis: [{ label: en ? "Stores" : "Boutiques", value: String(input.summaries.length) }, { label: en ? "Currencies" : "Devises", value: input.consolidated.map((row) => row.currencyCode).join(" · ") || "—" }, { label: en ? "Accounting assurance" : "Certification comptable", value: en ? "PROVISIONAL" : "PROVISOIRE" }],
    chartTitle: en ? "Confirmed Finance receipts by store" : "Encaissements Finance confirmés par boutique",
    chart: singleCurrency ? input.summaries.flatMap((site) => site.currencies.filter((row) => row.currencyCode === singleCurrency).map((row) => ({ label: site.site, value: Number(row.values.financeCollections), displayValue: `${row.values.financeCollections} ${singleCurrency}` }))) : [],
    columns: [{ key: "scope", label: en ? "Scope" : "Périmètre" }, { key: "currency", label: en ? "Currency" : "Devise" }, { key: "category", label: en ? "Family" : "Famille" }, { key: "indicator", label: en ? "Indicator" : "Indicateur" }, { key: "value", label: en ? "Exact amount" : "Montant exact" }],
    rows,
    filters: [{ label: en ? "From" : "Du", value: input.from }, { label: en ? "To" : "Au", value: input.to }, { label: en ? "Store" : "Boutique", value: input.siteFilter || (en ? "All stores" : "Toutes les boutiques") }, { label: en ? "Currency" : "Devise", value: input.currency || (en ? "Native currencies kept separate" : "Devises séparées") }],
    insights: [
      { tone: "warning", title: en ? "Posted figures are provisional" : "Comptabilité provisoire", body: en ? "Gross margin and operating result use posted journal lines only. Some lines may have no store; this is not certified profit or a statutory balance sheet." : "Marge brute et résultat d'exploitation proviennent des seules écritures postées. Certaines lignes n'ont pas de boutique ; il ne s'agit ni d'un bénéfice certifié ni d'un bilan légal." },
      { tone: "info", title: en ? "Different time bases" : "Périodes et soldes distincts", body: en ? "Invoices, confirmed collections and approved expenses refer to the period; receivables and account balances refer to the present. Never add POS historical tickets to Finance invoices or Mobile Money principal to turnover." : "Factures, paiements confirmés et dépenses approuvées correspondent à la période ; créances et soldes de compte sont actuels. N'additionnez jamais tickets historiques et factures Finance, ni le principal Mobile Money au chiffre d'affaires." },
      ...(input.stockWarnings ? [{ tone: input.stockWarnings.expired > 0 ? "warning" as const : "info" as const, title: en ? "Inventory alerts" : "Alertes de stock", body: en ? `${input.stockWarnings.lowStock} low-stock items · ${input.stockWarnings.expiring} soon-expiring batches · ${input.stockWarnings.expired} expired batches. Stock counts are not financial valuation.` : `${input.stockWarnings.lowStock} articles en stock bas · ${input.stockWarnings.expiring} lots proches de péremption · ${input.stockWarnings.expired} lots périmés. Ces quantités ne sont pas une valorisation comptable.` }] : []),
      ...(input.unallocatedLedger.length ? [{ tone: "warning" as const, title: en ? "Unattributed posted lines" : "Écritures sans boutique", body: `${input.unallocatedLedger.reduce((count, row) => count + row.journalLineCount, 0)} ${en ? "posted P&L lines excluded from store comparisons" : "lignes de résultat postées exclues des comparaisons par boutique"}.` }] : []),
    ],
    accentHex: "#087EA4",
  };
}
