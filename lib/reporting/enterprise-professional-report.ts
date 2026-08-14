import type { ProfessionalReportExportModel, ProfessionalReportInsight } from "@/lib/reporting/professional-export";

type Dict = Record<string, unknown>;

type BuildInput = {
  locale?: string | null;
  organizationName?: string | null;
  reference: string;
  title: string;
  reportType: string;
  reportTypeLabel: string;
  generatedAt: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  currency?: string | null;
  snapshot: unknown;
  filters?: unknown;
};

const FR = {
  generated: "Généré",
  period: "Période",
  currency: "Devise",
  category: "Catégorie",
  department: "Département",
  supplier: "Fournisseur",
  budget: "Budget",
  line: "Ligne",
  planned: "Planifié",
  committed: "Engagé",
  actual: "Réalisé",
  available: "Disponible",
  variance: "Écart",
  utilization: "Utilisation",
  amount: "Montant",
  count: "Nombre",
  status: "Statut",
  receipts: "Réceptions",
  currencies: "Devises",
  lines: "Lignes",
  noDataTitle: "Données insuffisantes",
  noDataBody: "Le périmètre sélectionné ne contient pas encore assez de données pour produire une interprétation fiable.",
  overBudgetTitle: "Dépassement du budget",
  overBudgetBody: (pct: string) => `Le réalisé atteint ${pct} du montant planifié sur ce périmètre.`,
  attentionTitle: "Consommation budgétaire élevée",
  attentionBody: (pct: string) => `Le réalisé atteint déjà ${pct} du montant planifié. Une revue des engagements et dépenses à venir est recommandée.`,
  controlledTitle: "Budget sous contrôle",
  controlledBody: (pct: string) => `Le taux de réalisation est de ${pct}. Le disponible reste positif sur le périmètre observé.`,
  concentrationTitle: "Principal poste",
  concentrationBody: (label: string, value: string) => `${label} représente le montant le plus élevé du périmètre avec ${value}.`,
  unbudgetedTitle: "Éléments non budgétés",
  unbudgetedBody: (value: string) => `${value} sont rattachés à des opérations sans ligne budgétaire sur le périmètre sélectionné.`,
  multiCurrencyTitle: "Lecture multi-devise",
  multiCurrencyBody: "Les montants de devises différentes restent séparés. Les comparaisons monétaires croisées ne sont pas agrégées sans taux de change historique explicite.",
  truncatedTitle: "Rapport volumineux",
  truncatedBody: "La vue détaillée est bornée pour préserver les performances. Les totaux et le nombre de lignes indiquent le périmètre complet disponible côté serveur.",
};

const EN = {
  generated: "Generated",
  period: "Period",
  currency: "Currency",
  category: "Category",
  department: "Department",
  supplier: "Supplier",
  budget: "Budget",
  line: "Line",
  planned: "Planned",
  committed: "Committed",
  actual: "Actual",
  available: "Available",
  variance: "Variance",
  utilization: "Utilization",
  amount: "Amount",
  count: "Count",
  status: "Status",
  receipts: "Receipts",
  currencies: "Currencies",
  lines: "Lines",
  noDataTitle: "Insufficient data",
  noDataBody: "The selected scope does not yet contain enough data to produce a reliable interpretation.",
  overBudgetTitle: "Budget overrun",
  overBudgetBody: (pct: string) => `Actual spending reaches ${pct} of the planned amount for this scope.`,
  attentionTitle: "High budget consumption",
  attentionBody: (pct: string) => `Actual spending already reaches ${pct} of the planned amount. Upcoming commitments and expenses should be reviewed.`,
  controlledTitle: "Budget under control",
  controlledBody: (pct: string) => `The realization rate is ${pct}. Available budget remains positive for the observed scope.`,
  concentrationTitle: "Largest item",
  concentrationBody: (label: string, value: string) => `${label} is the largest amount in the selected scope at ${value}.`,
  unbudgetedTitle: "Unbudgeted items",
  unbudgetedBody: (value: string) => `${value} is linked to operations without a budget line in the selected scope.`,
  multiCurrencyTitle: "Multi-currency reading",
  multiCurrencyBody: "Amounts in different currencies remain separated. Cross-currency monetary comparisons are not aggregated without an explicit historical exchange rate.",
  truncatedTitle: "Large report",
  truncatedBody: "The detailed view is bounded to preserve performance. Totals and line count reflect the complete server-side scope.",
};

function isEnglish(locale?: string | null) { return String(locale || "fr").toLowerCase().startsWith("en"); }
function record(value: unknown): Dict { return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : {}; }
function list(value: unknown) { return Array.isArray(value) ? value.map(record) : []; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function text(value: unknown, fallback = "—") { return value == null || value === "" ? fallback : String(value); }
function pct(value: unknown, locale?: string | null) { return `${number(value).toLocaleString(isEnglish(locale) ? "en-US" : "fr-FR", { maximumFractionDigits: 1 })}%`; }
function money(value: unknown, currency: string | null | undefined, locale?: string | null) {
  const amount = number(value);
  if (!currency) return amount.toLocaleString(isEnglish(locale) ? "en-US" : "fr-FR", { maximumFractionDigits: 2 });
  try { return new Intl.NumberFormat(isEnglish(locale) ? "en-US" : "fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${amount.toLocaleString(isEnglish(locale) ? "en-US" : "fr-FR", { maximumFractionDigits: 2 })} ${currency}`; }
}
function date(value: string | null | undefined, locale?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(isEnglish(locale) ? "en-GB" : "fr-FR", { dateStyle: "medium" }).format(parsed);
}
function status(value: unknown, en: boolean) {
  const key = String(value || "");
  const labels: Record<string, [string, string]> = {
    DRAFT: ["Brouillon", "Draft"], PENDING_APPROVAL: ["En attente d’approbation", "Pending approval"], ACTIVE: ["Actif", "Active"], APPROVED: ["Approuvé", "Approved"],
    ORDERED: ["Commandé", "Ordered"], PARTIALLY_RECEIVED: ["Partiellement réceptionné", "Partially received"], RECEIVED: ["Réceptionné", "Received"], CLOSED: ["Clôturé", "Closed"], CANCELLED: ["Annulé", "Cancelled"],
  };
  return labels[key]?.[en ? 1 : 0] || key.replace(/_/g, " ").toLowerCase().replace(/^./, (char) => char.toUpperCase());
}
function filterRows(filters: unknown, locale?: string | null) {
  const en = isEnglish(locale); const t = en ? EN : FR; const source = record(filters);
  const labels: Record<string, string> = { periodStart: t.period, periodEnd: en ? "Period end" : "Fin de période", currency: t.currency, departmentId: t.department, supplierId: t.supplier, budgetId: t.budget, category: t.category };
  return Object.entries(source).filter(([key, value]) => labels[key] && value != null && value !== "").map(([key, value]) => ({ label: labels[key], value: key.toLowerCase().includes("period") ? date(String(value), locale) : text(value) }));
}
function noDataInsight(locale?: string | null): ProfessionalReportInsight { const t = isEnglish(locale) ? EN : FR; return { title: t.noDataTitle, body: t.noDataBody, tone: "info" }; }
function multiCurrencyInsight(locale?: string | null): ProfessionalReportInsight { const t = isEnglish(locale) ? EN : FR; return { title: t.multiCurrencyTitle, body: t.multiCurrencyBody, tone: "info" }; }

export function buildEnterpriseProfessionalReport(input: BuildInput): ProfessionalReportExportModel {
  const en = isEnglish(input.locale); const t = en ? EN : FR;
  const envelope = record(input.snapshot); const data = record(envelope.data || input.snapshot);
  const schema = String(data.schema || "");
  const filters = filterRows(input.filters, input.locale);
  if (input.periodStart || input.periodEnd) filters.unshift({ label: t.period, value: `${date(input.periodStart, input.locale)} → ${date(input.periodEnd, input.locale)}` });
  if (input.currency && !filters.some((item) => item.label === t.currency)) filters.push({ label: t.currency, value: input.currency });
  const base = {
    title: input.title,
    subtitle: `${input.reportTypeLabel} · ${input.reference}`,
    organizationName: input.organizationName || "DTSC Platform",
    generatedLabel: `${t.generated}: ${date(input.generatedAt, input.locale)}`,
    filenameBase: `${input.reference}-${input.title}`,
    filters,
    accentHex: "#087EA4",
  };

  if (schema.startsWith("budget-vs-actual")) {
    const currencies = list(data.currencies); const lines = list(data.lines); const singleCurrency = currencies.length === 1 ? text(currencies[0].currency, input.currency || "") : null;
    const first = currencies[0] || {};
    const insights: ProfessionalReportInsight[] = [];
    if (!currencies.length && !lines.length) insights.push(noDataInsight(input.locale));
    if (currencies.length > 1) insights.push(multiCurrencyInsight(input.locale));
    if (singleCurrency) {
      const utilization = number(first.utilizationPercent);
      insights.push(utilization > 100 ? { title: t.overBudgetTitle, body: t.overBudgetBody(pct(utilization, input.locale)), tone: "danger" } : utilization >= 85 ? { title: t.attentionTitle, body: t.attentionBody(pct(utilization, input.locale)), tone: "warning" } : { title: t.controlledTitle, body: t.controlledBody(pct(utilization, input.locale)), tone: "success" });
    }
    if (data.truncated === true) insights.push({ title: t.truncatedTitle, body: t.truncatedBody, tone: "warning" });
    const chart = singleCurrency ? [
      { label: t.planned, value: number(first.planned), displayValue: money(first.planned, singleCurrency, input.locale) },
      { label: t.actual, value: number(first.actual), displayValue: money(first.actual, singleCurrency, input.locale) },
      { label: t.committed, value: number(first.committed), displayValue: money(first.committed, singleCurrency, input.locale) },
      { label: t.available, value: number(first.available), displayValue: money(first.available, singleCurrency, input.locale) },
    ] : currencies.map((item) => ({ label: text(item.currency), value: number(item.utilizationPercent), displayValue: pct(item.utilizationPercent, input.locale) }));
    return { ...base,
      kpis: singleCurrency ? [
        { label: t.planned, value: money(first.planned, singleCurrency, input.locale), numericValue: number(first.planned) },
        { label: t.actual, value: money(first.actual, singleCurrency, input.locale), numericValue: number(first.actual), comparison: `${pct(first.utilizationPercent, input.locale)} ${en ? "of planned" : "du planifié"}` },
        { label: t.committed, value: money(first.committed, singleCurrency, input.locale), numericValue: number(first.committed) },
        { label: t.available, value: money(first.available, singleCurrency, input.locale), numericValue: number(first.available) },
      ] : [
        { label: t.lines, value: text(data.totalLineCount, "0"), numericValue: number(data.totalLineCount) },
        { label: t.currencies, value: String(currencies.length), numericValue: currencies.length },
        { label: t.period, value: input.periodStart || input.periodEnd ? `${date(input.periodStart, input.locale)} → ${date(input.periodEnd, input.locale)}` : (en ? "All available" : "Toutes disponibles") },
      ],
      chartTitle: singleCurrency ? (en ? `Budget position · ${singleCurrency}` : `Position budgétaire · ${singleCurrency}`) : (en ? "Utilization by currency (%)" : "Utilisation par devise (%)"), chart,
      columns: [{ key: "budget", label: t.budget }, { key: "line", label: t.line }, { key: "currency", label: t.currency }, { key: "planned", label: t.planned }, { key: "actual", label: t.actual }, { key: "available", label: t.available }, { key: "utilization", label: t.utilization }],
      rows: lines.map((item) => ({ budget: text(item.budgetTitle || item.budgetReference), line: text(item.name || item.code), currency: text(item.currency), planned: money(item.planned, text(item.currency, ""), input.locale), actual: money(item.actual, text(item.currency, ""), input.locale), available: money(item.available, text(item.currency, ""), input.locale), utilization: pct(item.utilizationPercent, input.locale) })), insights };
  }

  if (schema.startsWith("expense-summary")) {
    const currencies = list(data.currencies); const categories = list(data.byCategory); const singleCurrency = currencies.length === 1 ? text(currencies[0].currency, input.currency || "") : null;
    const rows = categories.map((item) => ({ category: text(item.category, en ? "Uncategorized" : "Non catégorisé"), currency: text(item.currency), amount: money(item.amount, text(item.currency, ""), input.locale), count: number(item.count) }));
    const comparable = singleCurrency ? categories.filter((item) => text(item.currency) === singleCurrency).sort((a, b) => number(b.amount) - number(a.amount)) : [];
    const insights: ProfessionalReportInsight[] = currencies.length > 1 ? [multiCurrencyInsight(input.locale)] : [];
    if (!currencies.length) insights.push(noDataInsight(input.locale));
    if (comparable[0]) insights.push({ title: t.concentrationTitle, body: t.concentrationBody(text(comparable[0].category), money(comparable[0].amount, singleCurrency, input.locale)), tone: "info" });
    const unbudgeted = list(data.unbudgeted).find((item) => !singleCurrency || text(item.currency) === singleCurrency);
    if (singleCurrency && unbudgeted && number(unbudgeted.amount) > 0) insights.push({ title: t.unbudgetedTitle, body: t.unbudgetedBody(money(unbudgeted.amount, singleCurrency, input.locale)), tone: "warning" });
    return { ...base,
      kpis: singleCurrency ? [{ label: t.amount, value: money(currencies[0].amount, singleCurrency, input.locale), numericValue: number(currencies[0].amount) }, { label: t.count, value: text(currencies[0].count, "0"), numericValue: number(currencies[0].count) }, { label: t.category, value: String(categories.filter((item) => text(item.currency) === singleCurrency).length) }] : [{ label: t.currencies, value: String(currencies.length) }, { label: t.category, value: String(categories.length) }],
      chartTitle: singleCurrency ? (en ? `Expenses by category · ${singleCurrency}` : `Dépenses par catégorie · ${singleCurrency}`) : (en ? "Number of expenses by currency" : "Nombre de dépenses par devise"),
      chart: singleCurrency ? comparable.slice(0, 10).map((item) => ({ label: text(item.category), value: number(item.amount), displayValue: money(item.amount, singleCurrency, input.locale) })) : currencies.map((item) => ({ label: text(item.currency), value: number(item.count), displayValue: text(item.count, "0") })),
      columns: [{ key: "category", label: t.category }, { key: "currency", label: t.currency }, { key: "amount", label: t.amount }, { key: "count", label: t.count }], rows, insights };
  }

  if (schema.startsWith("procurement-summary")) {
    const statuses = list(data.byStatus); const suppliers = list(data.bySupplier); const currencySet = [...new Set(statuses.map((item) => text(item.currency, "")))].filter(Boolean); const singleCurrency = currencySet.length === 1 ? currencySet[0] : null;
    const comparable = singleCurrency ? statuses.filter((item) => text(item.currency) === singleCurrency).sort((a, b) => number(b.amount) - number(a.amount)) : [];
    const insights: ProfessionalReportInsight[] = currencySet.length > 1 ? [multiCurrencyInsight(input.locale)] : [];
    if (!statuses.length) insights.push(noDataInsight(input.locale));
    if (comparable[0]) insights.push({ title: t.concentrationTitle, body: t.concentrationBody(status(comparable[0].status, en), money(comparable[0].amount, singleCurrency, input.locale)), tone: "info" });
    const unbudgeted = list(data.unbudgeted).find((item) => !singleCurrency || text(item.currency) === singleCurrency);
    if (singleCurrency && unbudgeted && number(unbudgeted.amount) > 0) insights.push({ title: t.unbudgetedTitle, body: t.unbudgetedBody(money(unbudgeted.amount, singleCurrency, input.locale)), tone: "warning" });
    return { ...base,
      kpis: [{ label: t.receipts, value: text(data.receiptCount, "0"), numericValue: number(data.receiptCount) }, { label: t.supplier, value: String(suppliers.length) }, { label: t.currencies, value: String(currencySet.length || (input.currency ? 1 : 0)) }],
      chartTitle: singleCurrency ? (en ? `Purchases by status · ${singleCurrency}` : `Achats par statut · ${singleCurrency}`) : (en ? "Purchase count by status" : "Nombre d’achats par statut"),
      chart: singleCurrency ? comparable.map((item) => ({ label: status(item.status, en), value: number(item.amount), displayValue: money(item.amount, singleCurrency, input.locale) })) : statuses.map((item) => ({ label: `${status(item.status, en)} · ${text(item.currency)}`, value: number(item.count), displayValue: text(item.count, "0") })),
      columns: [{ key: "status", label: t.status }, { key: "currency", label: t.currency }, { key: "amount", label: t.amount }, { key: "count", label: t.count }],
      rows: statuses.map((item) => ({ status: status(item.status, en), currency: text(item.currency), amount: money(item.amount, text(item.currency, ""), input.locale), count: number(item.count) })), insights };
  }

  if (schema.startsWith("finance-overview")) {
    const budgets = list(data.budgetCurrencies); const expenses = list(data.expenseCurrencies); const currencies = [...new Set([...budgets, ...expenses].map((item) => text(item.currency, "")))].filter(Boolean); const singleCurrency = currencies.length === 1 ? currencies[0] : null;
    const budget = singleCurrency ? budgets.find((item) => text(item.currency) === singleCurrency) : undefined; const expense = singleCurrency ? expenses.find((item) => text(item.currency) === singleCurrency) : undefined;
    const insights: ProfessionalReportInsight[] = currencies.length > 1 ? [multiCurrencyInsight(input.locale)] : [];
    if (!budgets.length && !expenses.length) insights.push(noDataInsight(input.locale));
    if (budget) { const utilization = number(budget.utilizationPercent); insights.push(utilization > 100 ? { title: t.overBudgetTitle, body: t.overBudgetBody(pct(utilization, input.locale)), tone: "danger" } : utilization >= 85 ? { title: t.attentionTitle, body: t.attentionBody(pct(utilization, input.locale)), tone: "warning" } : { title: t.controlledTitle, body: t.controlledBody(pct(utilization, input.locale)), tone: "success" }); }
    return { ...base,
      kpis: singleCurrency ? [{ label: t.planned, value: money(budget?.planned, singleCurrency, input.locale) }, { label: t.actual, value: money(budget?.actual, singleCurrency, input.locale), comparison: budget ? pct(budget.utilizationPercent, input.locale) : null }, { label: en ? "Approved expenses" : "Dépenses approuvées", value: money(expense?.amount, singleCurrency, input.locale) }, { label: t.currency, value: singleCurrency }] : [{ label: t.currencies, value: String(currencies.length) }, { label: en ? "Budget buckets" : "Positions budgétaires", value: String(budgets.length) }, { label: en ? "Expense buckets" : "Positions de dépenses", value: String(expenses.length) }],
      chartTitle: singleCurrency ? (en ? `Finance overview · ${singleCurrency}` : `Vue financière · ${singleCurrency}`) : (en ? "Budget utilization by currency (%)" : "Utilisation budgétaire par devise (%)"),
      chart: singleCurrency ? [{ label: t.planned, value: number(budget?.planned), displayValue: money(budget?.planned, singleCurrency, input.locale) }, { label: t.actual, value: number(budget?.actual), displayValue: money(budget?.actual, singleCurrency, input.locale) }, { label: en ? "Expenses" : "Dépenses", value: number(expense?.amount), displayValue: money(expense?.amount, singleCurrency, input.locale) }] : budgets.map((item) => ({ label: text(item.currency), value: number(item.utilizationPercent), displayValue: pct(item.utilizationPercent, input.locale) })),
      columns: [{ key: "currency", label: t.currency }, { key: "planned", label: t.planned }, { key: "actual", label: t.actual }, { key: "available", label: t.available }],
      rows: budgets.map((item) => ({ currency: text(item.currency), planned: money(item.planned, text(item.currency, ""), input.locale), actual: money(item.actual, text(item.currency, ""), input.locale), available: money(item.available, text(item.currency, ""), input.locale) })), insights };
  }

  const arrays = Object.entries(data).filter(([, value]) => Array.isArray(value)); const primary = arrays[0]; const genericRows = primary ? list(primary[1]) : [];
  const keys = genericRows.length ? Object.keys(genericRows[0]).filter((key) => !/(id|code|schema|policy|json)/i.test(key)).slice(0, 6) : [];
  return { ...base, kpis: [{ label: en ? "Records" : "Enregistrements", value: String(genericRows.length) }], chartTitle: en ? "Available comparable metrics" : "Métriques comparables disponibles", chart: [], columns: keys.map((key) => ({ key, label: key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase()) })), rows: genericRows.map((item) => Object.fromEntries(keys.map((key) => [key, text(item[key])]))), insights: [noDataInsight(input.locale)] };
}
