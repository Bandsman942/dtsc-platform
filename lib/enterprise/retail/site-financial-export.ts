import type { ProfessionalReportExportModel } from "@/lib/reporting/professional-export";

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
