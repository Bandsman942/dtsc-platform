import type { ProfessionalReportExportModel, ProfessionalReportInsight } from "@/lib/reporting/professional-export";

type FinanceLocale = "fr" | "en";

type FinancialStatementLike = {
  id?: string;
  statementType?: string | null;
  periodStart?: string | Date | null;
  periodEnd?: string | Date | null;
  currencyCode?: string | null;
  status?: string | null;
  generatedAt?: string | Date | null;
  publishedAt?: string | Date | null;
  snapshotJson?: unknown;
};

type FlatRow = Record<string, unknown>;

const STATEMENT_LABELS: Record<string, { fr: string; en: string }> = {
  TRIAL_BALANCE: { fr: "Balance générale", en: "Trial balance" },
  GENERAL_LEDGER: { fr: "Grand livre", en: "General ledger" },
  JOURNALS: { fr: "Journaux", en: "Journals" },
  INCOME_STATEMENT: { fr: "Compte de résultat", en: "Income statement" },
  BALANCE_SHEET: { fr: "Bilan", en: "Balance sheet" },
  CASH_FLOW: { fr: "Tableau des flux de trésorerie", en: "Cash-flow statement" },
  AR_AGING: { fr: "Ancienneté des créances", en: "Aged receivables" },
  AP_AGING: { fr: "Ancienneté des dettes", en: "Aged payables" },
  TREASURY: { fr: "Situation de trésorerie", en: "Treasury statement" },
  BUDGET_VS_ACTUAL: { fr: "Budget comparé au réalisé", en: "Budget vs actual" },
  TAX: { fr: "Synthèse fiscale", en: "Tax summary" },
  ASSET_REGISTER: { fr: "Registre des immobilisations", en: "Fixed asset register" },
  INVENTORY_VALUATION: { fr: "Valorisation du stock", en: "Inventory valuation" },
};

const FIELD_LABELS: Record<string, { fr: string; en: string }> = {
  code: { fr: "Code", en: "Code" }, accountCode: { fr: "Compte", en: "Account" }, accountName: { fr: "Intitulé", en: "Name" }, nameFr: { fr: "Intitulé", en: "Name" }, nameEn: { fr: "Intitulé", en: "Name" },
  accountType: { fr: "Type de compte", en: "Account type" }, entryNumber: { fr: "Écriture", en: "Entry" }, journalCode: { fr: "Journal", en: "Journal" }, journalType: { fr: "Type de journal", en: "Journal type" },
  accountingDate: { fr: "Date comptable", en: "Accounting date" }, description: { fr: "Description", en: "Description" }, reference: { fr: "Référence", en: "Reference" },
  debit: { fr: "Débit", en: "Debit" }, credit: { fr: "Crédit", en: "Credit" }, balance: { fr: "Solde", en: "Balance" }, statementAmount: { fr: "Montant", en: "Amount" }, amount: { fr: "Montant", en: "Amount" }, value: { fr: "Valeur", en: "Value" },
  revenue: { fr: "Produits", en: "Revenue" }, expenses: { fr: "Charges", en: "Expenses" }, result: { fr: "Résultat", en: "Result" }, currentResult: { fr: "Résultat courant", en: "Current result" },
  assetTotal: { fr: "Total actif", en: "Total assets" }, liabilityTotal: { fr: "Total passif", en: "Total liabilities" }, equityTotal: { fr: "Capitaux propres", en: "Equity" }, difference: { fr: "Écart d’équilibre", en: "Balance difference" },
  budgetName: { fr: "Budget", en: "Budget" }, lineName: { fr: "Ligne budgétaire", en: "Budget line" }, plannedAmount: { fr: "Prévu", en: "Planned" }, committedAmount: { fr: "Engagé", en: "Committed" }, realizedAmount: { fr: "Réalisé", en: "Actual" }, approvedExpenseAmount: { fr: "Dépenses approuvées", en: "Approved expenses" },
  taxableAmount: { fr: "Base taxable", en: "Taxable amount" }, outputTax: { fr: "Taxe collectée", en: "Output tax" }, inputTax: { fr: "Taxe déductible", en: "Input tax" }, netTax: { fr: "Taxe nette", en: "Net tax" },
  quantity: { fr: "Quantité", en: "Quantity" }, currencyCode: { fr: "Devise", en: "Currency" }, dueDate: { fr: "Échéance", en: "Due date" }, daysPastDue: { fr: "Jours de retard", en: "Days past due" }, outstandingAmount: { fr: "Encours", en: "Outstanding" }, bucket: { fr: "Ancienneté", en: "Aging bucket" },
  operationalBalance: { fr: "Solde opérationnel", en: "Operational balance" }, reconciledBalance: { fr: "Solde rapproché", en: "Reconciled balance" }, availableBalance: { fr: "Disponible", en: "Available balance" }, accountTypeLabel: { fr: "Type de compte", en: "Account type" },
};

const ENUM_LABELS: Record<string, { fr: string; en: string }> = {
  ASSET: { fr: "Actif", en: "Asset" }, LIABILITY: { fr: "Passif", en: "Liability" }, EQUITY: { fr: "Capitaux propres", en: "Equity" }, REVENUE: { fr: "Produits", en: "Revenue" }, EXPENSE: { fr: "Charges", en: "Expense" }, OTHER_INCOME: { fr: "Autres produits", en: "Other income" }, OTHER_EXPENSE: { fr: "Autres charges", en: "Other expense" },
  OPERATING: { fr: "Exploitation", en: "Operating" }, INVESTING: { fr: "Investissement", en: "Investing" }, FINANCING: { fr: "Financement", en: "Financing" }, INBOUND: { fr: "Entrant", en: "Inbound" }, OUTBOUND: { fr: "Sortant", en: "Outbound" },
  CURRENT: { fr: "À échoir", en: "Current" }, days1to30: { fr: "1–30 jours", en: "1–30 days" }, days31to60: { fr: "31–60 jours", en: "31–60 days" }, days61to90: { fr: "61–90 jours", en: "61–90 days" }, over90: { fr: "> 90 jours", en: "> 90 days" },
  GENERATED: { fr: "Généré", en: "Generated" }, PUBLISHED: { fr: "Publié", en: "Published" }, POSTED: { fr: "Comptabilisé", en: "Posted" }, CONFIRMED: { fr: "Confirmé", en: "Confirmed" }, OPEN: { fr: "Ouvert", en: "Open" }, CLOSED: { fr: "Clôturé", en: "Closed" },
};

function localeOf(value?: string | null): FinanceLocale { return String(value || "fr").toLowerCase().startsWith("en") ? "en" : "fr"; }
function asRecord(value: unknown): FlatRow | null { return value && typeof value === "object" && !Array.isArray(value) ? value as FlatRow : null; }
function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
function dateLabel(value: unknown, locale: FinanceLocale) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium" }).format(parsed);
}
function money(value: unknown, currency: string, locale: FinanceLocale) {
  const numeric = numberValue(value) || 0;
  try { return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(numeric); }
  catch { return `${numeric.toLocaleString(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 2 })} ${currency}`; }
}
function statementLabel(value: unknown, locale: FinanceLocale) {
  const key = String(value || "");
  return STATEMENT_LABELS[key]?.[locale] || key.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}
function fieldLabel(key: string, locale: FinanceLocale) {
  return FIELD_LABELS[key]?.[locale] || key.replace(/Id$/i, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}
function displayValue(value: unknown, key: string, currency: string, locale: FinanceLocale) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? (locale === "en" ? "Yes" : "Oui") : (locale === "en" ? "No" : "Non");
  const enumLabel = ENUM_LABELS[String(value)]?.[locale];
  if (enumLabel) return enumLabel;
  if (/date|At$/i.test(key)) return dateLabel(value, locale);
  const numeric = numberValue(value);
  if (numeric != null && /(amount|debit|credit|balance|value|cost|revenue|expense|result|tax|total|flow)/i.test(key)) return money(numeric, currency, locale);
  return String(value).replaceAll("_", " ");
}
function safeKeys(rows: FlatRow[]) {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return keys.filter((key) => !/(^id$|Id$|uuid|checksum|hash|json|schema|policy|organizationId|userId|sourceEntity|createdBy|updatedBy)/i.test(key)).slice(0, 9);
}
function rowArrays(snapshot: unknown): Array<{ section?: string; row: FlatRow }> {
  if (Array.isArray(snapshot)) return snapshot.map(asRecord).filter((row): row is FlatRow => Boolean(row)).map((row) => ({ row }));
  const record = asRecord(snapshot);
  if (!record) return [];
  const preferred = ["rows", "lines", "entries", "revenueRows", "expenseRows", "assets", "liabilities", "equity", "schedules", "disposals"];
  const result: Array<{ section?: string; row: FlatRow }> = [];
  for (const key of preferred) {
    const list = record[key];
    if (!Array.isArray(list)) continue;
    for (const value of list) { const row = asRecord(value); if (row) result.push({ section: key, row }); }
  }
  if (!result.length) {
    for (const [key, value] of Object.entries(record)) {
      if (!Array.isArray(value)) continue;
      for (const entry of value) { const row = asRecord(entry); if (row) result.push({ section: key, row }); }
    }
  }
  return result;
}
function scalarMetrics(snapshot: unknown) {
  const record = asRecord(snapshot);
  if (!record) return [] as Array<[string, number]>;
  const result: Array<[string, number]> = [];
  for (const [key, value] of Object.entries(record)) {
    const numeric = numberValue(value);
    if (numeric == null || /(^id$|Id$|year|month|day|count$)/i.test(key)) continue;
    result.push([key, numeric]);
  }
  const totals = asRecord(record.totals);
  if (totals) for (const [key, value] of Object.entries(totals)) { const numeric = numberValue(value); if (numeric != null) result.push([key, numeric]); }
  const buckets = asRecord(record.buckets);
  if (buckets) for (const [key, value] of Object.entries(buckets)) { const numeric = numberValue(value); if (numeric != null) result.push([key, numeric]); }
  return result.slice(0, 8);
}

export function buildFinancialStatementProfessionalReport(input: { statement: FinancialStatementLike; organizationName?: string | null; locale?: string | null }): ProfessionalReportExportModel {
  const locale = localeOf(input.locale);
  const statement = input.statement;
  const currency = statement.currencyCode || "USD";
  const statementType = String(statement.statementType || "FINANCIAL_STATEMENT");
  const rowEntries = rowArrays(statement.snapshotJson);
  const rawRows = rowEntries.map((entry) => entry.row);
  const keys = safeKeys(rawRows);
  const scalar = scalarMetrics(statement.snapshotJson);
  const rows = rowEntries.map((entry) => Object.fromEntries([
    ...(entry.section && rowEntries.some((candidate) => candidate.section !== entry.section) ? [["section", fieldLabel(entry.section, locale)]] : []),
    ...keys.map((key) => [key, displayValue(entry.row[key], key, currency, locale)]),
  ]));
  const columns = [
    ...(rowEntries.some((entry) => entry.section) && new Set(rowEntries.map((entry) => entry.section)).size > 1 ? [{ key: "section", label: locale === "en" ? "Section" : "Section" }] : []),
    ...keys.map((key) => ({ key, label: fieldLabel(key, locale) })),
  ];

  const numericColumns = keys.filter((key) => rawRows.some((row) => numberValue(row[key]) != null));
  const preferredNumeric = numericColumns.find((key) => /(realized|statementAmount|balance|value|outstanding|netTax|netCashFlow|amount|debit|credit)/i.test(key)) || numericColumns[0];
  const preferredLabel = keys.find((key) => key !== preferredNumeric && rawRows.some((row) => typeof row[key] === "string") && /(name|label|code|reference|line|account|journal|bucket|classification)/i.test(key)) || keys.find((key) => key !== preferredNumeric) || keys[0];
  const chart = preferredNumeric ? rawRows.slice(0, 12).map((row, index) => {
    const value = numberValue(row[preferredNumeric]) || 0;
    return { label: displayValue(row[preferredLabel] ?? `${index + 1}`, preferredLabel || "label", currency, locale), value, displayValue: displayValue(value, preferredNumeric, currency, locale) };
  }).filter((point) => point.value !== 0) : scalar.map(([key, value]) => ({ label: fieldLabel(key, locale), value, displayValue: displayValue(value, key, currency, locale) }));

  const kpis = scalar.map(([key, value]) => ({ label: fieldLabel(key, locale), value: displayValue(value, key, currency, locale), numericValue: value }));
  if (!kpis.length) {
    kpis.push({ label: locale === "en" ? "Detailed lines" : "Lignes détaillées", value: String(rawRows.length), numericValue: rawRows.length });
  }
  if (!kpis.some((item) => item.label === (locale === "en" ? "Detailed lines" : "Lignes détaillées"))) kpis.push({ label: locale === "en" ? "Detailed lines" : "Lignes détaillées", value: String(rawRows.length), numericValue: rawRows.length });

  const insights: ProfessionalReportInsight[] = [];
  const snapshot = asRecord(statement.snapshotJson);
  if (statementType === "BUDGET_VS_ACTUAL") {
    const planned = rawRows.reduce((sum, row) => sum + (numberValue(row.plannedAmount) || 0), 0);
    const actual = rawRows.reduce((sum, row) => sum + (numberValue(row.realizedAmount) ?? numberValue(row.approvedExpenseAmount) ?? 0), 0);
    const variance = planned - actual;
    const rate = planned ? actual / planned * 100 : null;
    kpis.unshift(
      { label: locale === "en" ? "Planned" : "Prévu", value: money(planned, currency, locale), numericValue: planned },
      { label: locale === "en" ? "Actual" : "Réalisé", value: money(actual, currency, locale), numericValue: actual, comparison: rate == null ? null : `${rate.toLocaleString(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 1 })}% ${locale === "en" ? "of budget" : "du budget"}` },
      { label: locale === "en" ? "Available variance" : "Écart disponible", value: money(variance, currency, locale), numericValue: variance },
    );
    if (rate != null) insights.push({ title: locale === "en" ? "Budget execution" : "Exécution budgétaire", body: locale === "en" ? `Actual spending represents ${rate.toLocaleString("en-US", { maximumFractionDigits: 1 })}% of the planned amount in the selected scope.` : `Le réalisé représente ${rate.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}% du montant prévu sur le périmètre sélectionné.`, tone: rate > 100 ? "warning" : "info" });
  }
  if (statementType === "BALANCE_SHEET" && snapshot) {
    const difference = numberValue(snapshot.difference);
    if (difference != null) insights.push({ title: locale === "en" ? "Balance equation" : "Équilibre du bilan", body: Math.abs(difference) < 0.000001 ? (locale === "en" ? "Assets equal liabilities plus equity for this generated snapshot." : "L’actif est égal au passif augmenté des capitaux propres pour ce snapshot généré.") : (locale === "en" ? `The balance equation shows a difference of ${money(difference, currency, locale)} that requires review.` : `L’équation du bilan présente un écart de ${money(difference, currency, locale)} qui nécessite une revue.`), tone: Math.abs(difference) < 0.000001 ? "success" : "warning" });
  }
  if (statementType === "INCOME_STATEMENT" && snapshot) {
    const result = numberValue(snapshot.result);
    const revenue = numberValue(snapshot.revenue);
    if (result != null && revenue != null) insights.push({ title: locale === "en" ? "Period result" : "Résultat de la période", body: locale === "en" ? `The generated statement reports a ${result >= 0 ? "profit" : "loss"} of ${money(Math.abs(result), currency, locale)} on revenue of ${money(revenue, currency, locale)}.` : `L’état généré présente ${result >= 0 ? "un bénéfice" : "une perte"} de ${money(Math.abs(result), currency, locale)} pour des produits de ${money(revenue, currency, locale)}.`, tone: result >= 0 ? "success" : "warning" });
  }
  if (["AR_AGING", "AP_AGING"].includes(statementType) && snapshot) {
    const buckets = asRecord(snapshot.buckets);
    if (buckets) {
      const over90 = numberValue(buckets.over90) || 0;
      const total = Object.values(buckets).reduce((sum, value) => sum + (numberValue(value) || 0), 0);
      const share = total ? over90 / total * 100 : 0;
      insights.push({ title: locale === "en" ? "Aging concentration" : "Concentration de l’ancienneté", body: locale === "en" ? `${share.toLocaleString("en-US", { maximumFractionDigits: 1 })}% of the outstanding amount is over 90 days.` : `${share.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}% de l’encours dépasse 90 jours.`, tone: share >= 25 ? "warning" : "info" });
    }
  }
  if (!insights.length) {
    insights.push(rawRows.length ? { title: locale === "en" ? "Data coverage" : "Couverture des données", body: locale === "en" ? `${rawRows.length} detailed line(s) are included in this immutable generated scope. Interpretations are restricted to values present in the snapshot.` : `${rawRows.length} ligne(s) détaillée(s) sont incluses dans ce périmètre généré. Les interprétations restent limitées aux valeurs présentes dans le snapshot.`, tone: "info" } : { title: locale === "en" ? "No detailed data" : "Aucune donnée détaillée", body: locale === "en" ? "The generated scope contains no detailed line. No trend is inferred without source data." : "Le périmètre généré ne contient aucune ligne détaillée. Aucune tendance n’est déduite sans donnée source.", tone: "info" });
  }

  return {
    title: statementLabel(statementType, locale),
    subtitle: `${dateLabel(statement.periodStart, locale)} → ${dateLabel(statement.periodEnd, locale)} · ${currency}`,
    organizationName: input.organizationName || "DTSC Platform",
    generatedLabel: `${locale === "en" ? "Generated" : "Généré"} ${dateLabel(statement.generatedAt, locale)} · ${ENUM_LABELS[String(statement.status || "GENERATED")]?.[locale] || statement.status || (locale === "en" ? "Generated" : "Généré")}`,
    filenameBase: `etat-financier-${statementType.toLowerCase()}`,
    kpis: kpis.slice(0, 8),
    chartTitle: preferredNumeric ? fieldLabel(preferredNumeric, locale) : (locale === "en" ? "Comparable metrics" : "Métriques comparables"),
    chart,
    columns,
    rows,
    insights,
    filters: [{ label: locale === "en" ? "Period" : "Période", value: `${dateLabel(statement.periodStart, locale)} → ${dateLabel(statement.periodEnd, locale)}` }, { label: locale === "en" ? "Currency" : "Devise", value: currency }, { label: locale === "en" ? "Status" : "Statut", value: ENUM_LABELS[String(statement.status || "GENERATED")]?.[locale] || String(statement.status || "") }],
    accentHex: "#087EA4",
  };
}
