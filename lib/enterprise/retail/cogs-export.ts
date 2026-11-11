import type { ProfessionalReportExportModel } from "@/lib/reporting/professional-export";
import type { CogsAnalysis } from "@/lib/enterprise/retail/cogs-analysis";

/** Reused verbatim by the dashboard downloads and saved Reports snapshots. */
export function buildRetailCogsExport(input: {
  analysis: CogsAnalysis; organizationName: string; locale: "fr" | "en";
  from: string; to: string; siteName?: string; currency?: string;
}): ProfessionalReportExportModel {
  const { analysis, organizationName, locale, from, to } = input;
  const en = locale === "en";
  const statusLabels = en
    ? { TRACEABLE: "Inventory-linked", UNMATCHED: "No stock event", AMBIGUOUS: "Link requires review" }
    : { TRACEABLE: "Reliée au stock", UNMATCHED: "Sans événement de stock", AMBIGUOUS: "Lien à vérifier" };
  const rows = analysis.lines.map((line) => ({
    date: line.accountingDate.slice(0, 10), site: line.siteName || (en ? "Unallocated" : "Sans boutique"),
    currency: line.currencyCode, amount: line.amount,
    provenance: [line.journalNumber, line.accountCode, statusLabels[line.status],
      line.reversal ? (en ? "Reversal" : "Contrepassation") : "",
      line.inventoryItemName || "", line.sourceNumber || "", line.stockMovementId || ""].filter(Boolean).join(" · "),
  }));
  const totalRows = analysis.buckets.map((bucket) => ({
    site: bucket.siteName || (en ? "Unallocated" : "Non attribuée"), currency: bucket.currencyCode,
    posted: bucket.posted, traceable: bucket.traceable, untraced: bucket.untraced,
    ambiguous: bucket.ambiguous,
  }));
  return {
    title: en ? "Retail posted cost of sales — traceability" : "Coût des ventes comptabilisé — traçabilité RETAIL",
    organizationName, filenameBase: `retail-cogs-${from}-${to}`,
    subtitle: en ? "Posted GL is authoritative; inventory links are evidence. Provisional and not certified."
      : "Le grand livre posté fait foi ; les liens de stock sont des preuves. Provisoire et non certifié.",
    generatedLabel: new Date().toISOString(),
    kpis: [
      { label: en ? "Posted lines (filtered)" : "Lignes postées (filtrées)", value: String(analysis.totalLines) },
      { label: en ? "Exported detail lines" : "Lignes détaillées exportées", value: String(rows.length) },
      { label: en ? "Currencies (separate)" : "Devises (séparées)", value: [...new Set(analysis.buckets.map((row) => row.currencyCode))].join(" · ") || "—" },
    ],
    columns: [
      { key: "date", label: en ? "Accounting date" : "Date comptable" },
      { key: "site", label: en ? "Store" : "Boutique" },
      { key: "currency", label: en ? "Currency" : "Devise" },
      { key: "amount", label: en ? "GL amount" : "Montant du grand livre" },
      { key: "provenance", label: en ? "Journal · account · stock evidence" : "Journal · compte · preuve de stock" },
    ],
    rows,
    chart: [],
    filters: [
      { label: en ? "From" : "Du", value: from }, { label: en ? "To" : "Au", value: to },
      { label: en ? "Store" : "Boutique", value: input.siteName || (en ? "All" : "Toutes") },
      { label: en ? "Currency" : "Devise", value: input.currency || (en ? "Separate" : "Séparées") },
    ],
    insights: [
      { tone: "info", title: en ? "Reconciliation by store and currency" : "Rapprochement par boutique et devise",
        body: totalRows.map((row) => `${row.site} · ${row.currency}: ${row.posted} = ${row.traceable} + ${row.untraced} + ${row.ambiguous}`).join(" | ") || (en ? "No posted COGS" : "Aucun coût comptabilisé") },
      { tone: "warning", title: en ? "Traceability is not accounting certification" : "Traçabilité ≠ certification comptable",
        body: en ? "Unmatched or ambiguous postings require source review. Inventory valuation is not added to the GL. Reversals retain their sign. Do not add different currencies."
          : "Les écritures sans lien ou ambiguës exigent une revue. La valorisation du stock ne s'ajoute pas au grand livre. Les contrepassations gardent leur signe. Ne cumulez pas les devises." },
      { tone: analysis.totalLines > rows.length ? "warning" : "info",
        title: en ? "Page-based export" : "Export de la page",
        body: en ? `This document contains ${rows.length} of ${analysis.totalLines} matching accounting lines (page ${analysis.page}). Totals and reconciliation above cover the full selected period.`
          : `Ce document contient ${rows.length} des ${analysis.totalLines} lignes comptables filtrées (page ${analysis.page}). Les totaux et rapprochements ci-dessus portent sur toute la période.` },
    ],
    accentHex: "#0891B2",
  };
}
