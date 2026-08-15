import type { ProfessionalReportExportModel, ProfessionalReportInsight } from "@/lib/reporting/professional-export";

type Row = Record<string, string | number | boolean | null>;
type Section = { title: string; description: string; metrics: Array<{ label: string; value: string | number; sensitive?: boolean }>; rows: Row[] };
type Filters = Record<string, string | undefined>;

const LABELS: Record<string, string> = {
  start: "Début", end: "Fin", productId: "Produit", batchId: "Lot", supplierId: "Fournisseur", userId: "Collaborateur", departmentId: "Département", status: "Statut", category: "Catégorie", criticality: "Criticité", paymentMethod: "Mode de paiement",
  productName: "Produit", batchNumber: "Lot", supplierName: "Fournisseur", userName: "Collaborateur", departmentName: "Département", quantity: "Quantité", amount: "Montant", total: "Total", count: "Nombre", revenue: "Chiffre d’affaires", margin: "Marge", stock: "Stock", remainingQuantity: "Quantité restante", expiryDate: "Péremption", createdAt: "Date", statusLabel: "Statut",
};

function humanize(key: string) {
  return LABELS[key] || key.replace(/Id$/i, "").replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().replace(/^./, (char) => char.toUpperCase());
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s/g, "").replace(/[^0-9,.-]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function visibleValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  return value == null || value === "" ? "—" : String(value);
}

function safeColumns(rows: Row[]) {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return keys.filter((key) => !/(^id$|Id$|uuid|json|token|hash|code$|policy|schema)/i.test(key)).slice(0, 8);
}

export function buildPharmacyProfessionalReport(input: {
  organizationName?: string | null;
  reportType: string;
  section: Section;
  filters: Filters;
}): ProfessionalReportExportModel {
  const columns = safeColumns(input.section.rows);
  const numericColumn = columns.find((column) => input.section.rows.some((row) => numeric(row[column]) != null));
  const labelColumn = columns.find((column) => column !== numericColumn && input.section.rows.some((row) => typeof row[column] === "string")) || columns[0];
  const chart = numericColumn ? input.section.rows.slice(0, 10).map((row, index) => ({
    label: visibleValue(row[labelColumn] ?? `${humanize(numericColumn)} ${index + 1}`),
    value: numeric(row[numericColumn]) || 0,
    displayValue: visibleValue(row[numericColumn]),
  })) : input.section.metrics.map((metric) => ({ label: metric.label, value: numeric(metric.value) || 0, displayValue: String(metric.value) })).filter((point) => point.value !== 0).slice(0, 10);

  const insights: ProfessionalReportInsight[] = [];
  if (!input.section.rows.length && !input.section.metrics.length) {
    insights.push({ title: "Données insuffisantes", body: "Aucune donnée métier n’est disponible pour les filtres sélectionnés. L’interprétation reste volontairement vide plutôt que d’inventer une tendance.", tone: "info" });
  } else {
    const warningMetric = input.section.metrics.find((metric) => /alerte|rupture|faible|péremp|incident|perte|destruction|écart/i.test(metric.label) && (numeric(metric.value) || 0) > 0);
    if (warningMetric) insights.push({ title: "Point d’attention", body: `${warningMetric.label} : ${warningMetric.value}. Ce signal provient directement des données du rapport et mérite une revue opérationnelle.`, tone: "warning" });
    const positiveMetric = input.section.metrics.find((metric) => /vente|revenu|marge|disponible|conforme|validé/i.test(metric.label) && (numeric(metric.value) || 0) > 0);
    if (positiveMetric) insights.push({ title: "Indicateur principal", body: `${positiveMetric.label} atteint ${positiveMetric.value} sur le périmètre sélectionné.`, tone: "success" });
    if (!insights.length) insights.push({ title: "Lecture du périmètre", body: `${input.section.rows.length} ligne(s) détaillée(s) et ${input.section.metrics.length} indicateur(s) sont disponibles. Utilisez les filtres pour comparer un autre périmètre sans modifier les données sources.`, tone: "info" });
  }

  return {
    title: input.section.title || "Rapport pharmacie",
    subtitle: input.section.description || "Analyse professionnelle du périmètre pharmacie",
    organizationName: input.organizationName || "DTSC Platform",
    generatedLabel: `Généré le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`,
    filenameBase: `rapport-pharmacie-${input.reportType.toLowerCase()}`,
    kpis: input.section.metrics.slice(0, 8).map((metric) => ({ label: metric.label, value: String(metric.value), numericValue: numeric(metric.value) })),
    chartTitle: numericColumn ? `${humanize(numericColumn)} — comparaison` : "Comparaison des indicateurs",
    chart,
    columns: columns.map((key) => ({ key, label: humanize(key) })),
    rows: input.section.rows.map((row) => Object.fromEntries(columns.map((key) => [key, visibleValue(row[key])]))),
    insights,
    filters: Object.entries(input.filters).filter(([, value]) => Boolean(value)).map(([key, value]) => ({ label: humanize(key), value: String(value) })),
    accentHex: "#087EA4",
  };
}
