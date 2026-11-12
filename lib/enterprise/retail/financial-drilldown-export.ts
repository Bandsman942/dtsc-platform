import type { ProfessionalReportExportModel } from "@/lib/reporting/professional-export";
import type { RetailFinancialTrace, RetailTraceResult } from "@/lib/enterprise/retail/financial-drilldown";
import { RETAIL_METRIC_DEFINITIONS, retailMetricTimeCaption } from "@/lib/enterprise/retail/financial-metric-definitions";

const TITLES: Record<RetailFinancialTrace, [string, string]> = {
  financeCollections: ["Encaissements Finance", "Finance collections"],
  invoices: ["Factures nettes émises", "Net issued invoices"],
  outstanding: ["Créances ouvertes", "Open receivables"],
  overdue: ["Créances échues", "Overdue receivables"],
  postedRevenue: ["Produits comptabilisés", "Posted revenue"],
  postedGrossMargin: ["Marge brute comptabilisée", "Posted gross margin"],
  postedOperatingResult: ["Résultat d'exploitation comptabilisé", "Posted operating result"],
  treasuryAvailable: ["Trésorerie disponible", "Available treasury"],
  expenses: ["Dépenses approuvées", "Approved expenses"],
  mobileMoneyCommission: ["Commissions prestataire", "Provider commissions"],
  telcoMargin: ["Marge Télécom opérationnelle", "Operational Telco margin"],
  posSales: ["Ventes POS historiques", "Historical POS sales"],
};

/** Disclosure export of the currently authorized, SERVER-paginated source evidence.
 * Aggregate totals cover the filtered SQL scope, never just the current page.
 * Null unknown treasury balances must never become an invented numeric zero.
 */
export function buildRetailFinancialDrilldownExport(input: {
  analysis: RetailTraceResult;
  organizationName: string;
  locale: "fr" | "en";
  from: string;
  to: string;
  siteName?: string;
  currency?: string;
  search?: string;
}): ProfessionalReportExportModel {
  const { analysis, locale } = input;
  const en = locale === "en";
  const definition = RETAIL_METRIC_DEFINITIONS[analysis.metric];
  const rows = analysis.lines.map((row) => ({
    date: row.eventDate?.slice(0, 10) || (en ? "Current balance" : "Solde actuel"),
    site: row.siteName || (en ? "Unallocated" : "Non attribué"),
    currency: row.currencyCode,
    amount: row.amount === null ? (en ? "NOT DETERMINED" : "NON DÉTERMINÉ") : row.amount,
    provenance: [row.reference || row.sourceLabel || row.sourceType, row.status, row.sourceType, row.sourceId].join(" · "),
  }));
  const summary = analysis.buckets.map((row) => ({
    site: row.siteName || (en ? "Unallocated" : "Non attribué"),
    currency: row.currencyCode,
    value: row.amount === null ? (en ? "NOT DETERMINED" : "NON DÉTERMINÉ") : row.amount,
    count: row.count,
    missing: row.missingAmounts,
  }));
  return {
    title: `${TITLES[analysis.metric][en ? 1 : 0]} — ${en ? "source trace" : "traçabilité"}`,
    organizationName: input.organizationName,
    filenameBase: `retail-${analysis.metric}-${input.from}-${input.to}-p${analysis.page}`,
    subtitle: `${retailMetricTimeCaption(analysis.metric, locale)} · ${definition.interpretation[locale]}`,
    generatedLabel: new Date().toISOString(),
    kpis: [
      { label: en ? "Matching source records" : "Pièces sources filtrées", value: String(analysis.totalLines) },
      { label: en ? "Records exported" : "Pièces exportées", value: String(rows.length) },
      { label: en ? "Currency basis" : "Devise de référence", value: input.currency || (en ? "Native separate" : "Natives séparées") },
    ],
    columns: [
      { key: "date", label: en ? "Date / basis" : "Date / référence" },
      { key: "site", label: en ? "Store" : "Boutique" },
      { key: "currency", label: en ? "Currency" : "Devise" },
      { key: "amount", label: en ? "Signed source amount" : "Montant source signé" },
      { key: "provenance", label: en ? "Reference / source / status" : "Référence / source / statut" },
    ],
    rows,
    chart: [],
    filters: [
      { label: en ? "From" : "Du", value: definition.timeBasis === "CURRENT_BALANCE" ? (en ? "Current state" : "État actuel") : input.from },
      { label: en ? "To" : "Au", value: definition.timeBasis === "CURRENT_BALANCE" ? (en ? "Current state" : "État actuel") : input.to },
      { label: en ? "Store" : "Boutique", value: input.siteName || (en ? "All incl. unallocated" : "Toutes dont non attribuées") },
      { label: en ? "Currency" : "Devise", value: input.currency || (en ? "Native separate" : "Natives séparées") },
      { label: en ? "Search" : "Recherche", value: input.search || "—" },
    ],
    insights: [
      {
        tone: "info",
        title: en ? "Source totals by store and currency" : "Totaux sources par boutique et devise",
        body: summary.map((row) => `${row.site} · ${row.currency}: ${row.value} (${row.count} ${en ? "records" : "pièces"}${row.missing ? `; ${row.missing} ${en ? "unknown amounts" : "montants indéterminés"}` : ""})`).join(" | ") || (en ? "No matching records" : "Aucune pièce correspondante"),
      },
      {
        tone: "warning",
        title: en ? "Provisional, not certified" : "Provisoire, non certifié",
        body: en
          ? "Only authorized source data; accounting totals require reconciliations and formal sign-off. No FX conversion, no unverified balance substitution, no channel double count."
          : "Uniquement les données sources autorisées ; les montants comptables exigent rapprochement et validation formelle. Aucune conversion FX, disponibilité estimée ou double comptage entre canaux.",
      },
      {
        tone: analysis.totalLines > rows.length ? "warning" : "info",
        title: en ? "This is a page export" : "Export de la page",
        body: en
          ? `Exported ${rows.length} / ${analysis.totalLines} matching source records (page ${analysis.page}, page size ${analysis.pageSize}); totals above cover the complete filtered SQL scope.`
          : `Export de ${rows.length} / ${analysis.totalLines} pièces sources filtrées (page ${analysis.page}, ${analysis.pageSize} lignes/page) ; les totaux ci-dessus couvrent tout le périmètre SQL filtré.`,
      },
    ],
    accentHex: "#0891B2",
  };
}
