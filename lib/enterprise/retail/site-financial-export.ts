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
