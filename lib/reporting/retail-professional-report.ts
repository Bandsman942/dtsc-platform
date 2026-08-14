import type { ProfessionalReportExportModel, ProfessionalReportInsight } from "@/lib/reporting/professional-export";

type Locale = "fr" | "en";
type NativeSales = { currencyCode: string; amount: string | number; count: number };
type NativeMobileMoney = { currencyCode: string; deposits: string | number; withdrawals: string | number; commission?: string | number; count?: number };
type NativeTelco = { currencyCode: string; revenue: string | number; margin: string | number; count?: number };
type RetailNative = { sales: NativeSales[]; mobileMoney: NativeMobileMoney[]; telco: NativeTelco[] };
type Consolidated = {
  complete: boolean;
  targetCurrencyCode?: string | null;
  metrics?: {
    sales: { amount: string | number };
    mobileMoney: { deposits: string | number; withdrawals: string | number; commission: string | number };
    telco: { revenue: string | number; margin: string | number };
  } | null;
  missingRates: Array<{ sourceCurrencyCode: string; targetCurrencyCode: string; at: string | Date; count: number }>;
};

function numeric(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function money(value: unknown, currency: string, locale: Locale) {
  try { return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(numeric(value)); }
  catch { return `${numeric(value).toLocaleString(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 2 })} ${currency}`; }
}
function date(value: Date, locale: Locale) { return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium" }).format(value); }

export function buildRetailProfessionalReport(input: {
  organizationName: string;
  locale: Locale;
  periodLabel: string;
  from: Date;
  to: Date;
  native: RetailNative;
  consolidated: Consolidated;
}): ProfessionalReportExportModel {
  const { locale, consolidated, native } = input;
  const en = locale === "en";
  const currency = consolidated.targetCurrencyCode || "USD";
  const metrics = consolidated.metrics;
  const sales = numeric(metrics?.sales.amount);
  const deposits = numeric(metrics?.mobileMoney.deposits);
  const withdrawals = numeric(metrics?.mobileMoney.withdrawals);
  const commissions = numeric(metrics?.mobileMoney.commission);
  const telcoRevenue = numeric(metrics?.telco.revenue);
  const telcoMargin = numeric(metrics?.telco.margin);
  const nativeCurrencies = Array.from(new Set([...native.sales.map((row) => row.currencyCode), ...native.mobileMoney.map((row) => row.currencyCode), ...native.telco.map((row) => row.currencyCode)]));
  const insights: ProfessionalReportInsight[] = [];

  if (consolidated.complete && metrics) {
    const marginRate = telcoRevenue ? telcoMargin / telcoRevenue * 100 : null;
    insights.push({ title: en ? "Consolidation reliability" : "Fiabilité de la consolidation", body: en ? `All amounts in the consolidated view use historical exchange rates applicable on each operation date. The reporting currency is ${currency}.` : `Tous les montants de la vue consolidée utilisent les taux de change historiques applicables à la date de chaque opération. La devise de reporting est ${currency}.`, tone: "success" });
    if (marginRate != null) insights.push({ title: en ? "Telco margin" : "Marge Télécom", body: en ? `Telco margin represents ${marginRate.toLocaleString("en-US", { maximumFractionDigits: 1 })}% of Telco revenue over this period.` : `La marge Télécom représente ${marginRate.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}% du chiffre d’affaires Télécom sur cette période.`, tone: marginRate < 0 ? "warning" : "info" });
    if (withdrawals > deposits) insights.push({ title: en ? "Mobile Money flow" : "Flux Mobile Money", body: en ? "Withdrawals exceed deposits for the selected period. Review liquidity requirements before the next operating window." : "Les retraits dépassent les dépôts sur la période sélectionnée. Vérifiez le besoin de liquidité avant la prochaine fenêtre d’exploitation.", tone: "warning" });
  } else {
    const operations = consolidated.missingRates.reduce((sum, item) => sum + Number(item.count || 0), 0);
    insights.push({ title: en ? "Consolidation withheld" : "Consolidation suspendue", body: en ? `${consolidated.missingRates.length} historical exchange-rate gap(s) affect ${operations} operation(s). DTSC does not present a partial monetary consolidation.` : `${consolidated.missingRates.length} manque(s) de taux historique affectent ${operations} opération(s). DTSC ne présente pas de consolidation monétaire partielle.`, tone: "warning" });
  }
  if (nativeCurrencies.length > 1) insights.push({ title: en ? "Native-currency integrity" : "Intégrité multi-devise", body: en ? `Native amounts remain separated across ${nativeCurrencies.length} currencies and are never summed without a valid historical conversion.` : `Les montants natifs restent séparés sur ${nativeCurrencies.length} devises et ne sont jamais additionnés sans conversion historique valide.`, tone: "info" });

  const nativeRows: Array<Record<string, string | number>> = [
    ...native.sales.map((row) => ({ activity: en ? "POS sales" : "Ventes POS", currency: row.currencyCode, primary: money(row.amount, row.currencyCode, locale), secondary: `${row.count} ${en ? "tickets" : "tickets"}` })),
    ...native.mobileMoney.map((row) => ({ activity: "Mobile Money", currency: row.currencyCode, primary: `${en ? "Deposits" : "Dépôts"}: ${money(row.deposits, row.currencyCode, locale)}`, secondary: `${en ? "Withdrawals" : "Retraits"}: ${money(row.withdrawals, row.currencyCode, locale)}` })),
    ...native.telco.map((row) => ({ activity: en ? "Telco sales" : "Ventes Télécom", currency: row.currencyCode, primary: money(row.revenue, row.currencyCode, locale), secondary: `${en ? "Margin" : "Marge"}: ${money(row.margin, row.currencyCode, locale)}` })),
  ];
  const missingRows = consolidated.missingRates.map((row) => ({ activity: en ? "Missing exchange rate" : "Taux de change manquant", currency: `${row.sourceCurrencyCode} → ${row.targetCurrencyCode}`, primary: new Intl.DateTimeFormat(en ? "en-GB" : "fr-FR", { dateStyle: "medium" }).format(new Date(row.at)), secondary: `${row.count} ${en ? "operation(s)" : "opération(s)"}` }));

  return {
    title: en ? "Retail consolidated performance report" : "Rapport consolidé de performance Retail",
    subtitle: `${input.periodLabel} · ${date(input.from, locale)} → ${date(input.to, locale)}${consolidated.complete && consolidated.targetCurrencyCode ? ` · ${currency}` : ""}`,
    organizationName: input.organizationName,
    generatedLabel: en ? "Historical FX policy · operation-date conversion" : "Politique de change historique · conversion à la date d’opération",
    filenameBase: `retail-consolide-${input.periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kpis: consolidated.complete && metrics ? [
      { label: en ? "POS sales" : "Ventes POS", value: money(sales, currency, locale), numericValue: sales },
      { label: en ? "Mobile Money deposits" : "Dépôts Mobile Money", value: money(deposits, currency, locale), numericValue: deposits },
      { label: en ? "Mobile Money withdrawals" : "Retraits Mobile Money", value: money(withdrawals, currency, locale), numericValue: withdrawals },
      { label: en ? "Mobile Money commissions" : "Commissions Mobile Money", value: money(commissions, currency, locale), numericValue: commissions },
      { label: en ? "Telco sales" : "Ventes Télécom", value: money(telcoRevenue, currency, locale), numericValue: telcoRevenue },
      { label: en ? "Telco margin" : "Marge Télécom", value: money(telcoMargin, currency, locale), numericValue: telcoMargin },
    ] : [
      { label: en ? "Currencies represented" : "Devises représentées", value: String(nativeCurrencies.length), numericValue: nativeCurrencies.length },
      { label: en ? "Missing rate dates" : "Dates sans taux", value: String(consolidated.missingRates.length), numericValue: consolidated.missingRates.length },
      { label: en ? "Affected operations" : "Opérations affectées", value: String(consolidated.missingRates.reduce((sum, item) => sum + Number(item.count || 0), 0)) },
    ],
    chartTitle: consolidated.complete && metrics ? (en ? `Activity comparison · ${currency}` : `Comparaison des activités · ${currency}`) : (en ? "Native data coverage" : "Couverture des données natives"),
    chart: consolidated.complete && metrics ? [
      { label: en ? "POS sales" : "Ventes POS", value: sales, displayValue: money(sales, currency, locale) },
      { label: en ? "MM deposits" : "Dépôts MM", value: deposits, displayValue: money(deposits, currency, locale) },
      { label: en ? "MM withdrawals" : "Retraits MM", value: withdrawals, displayValue: money(withdrawals, currency, locale) },
      { label: en ? "Telco sales" : "Ventes Télécom", value: telcoRevenue, displayValue: money(telcoRevenue, currency, locale) },
      { label: en ? "Telco margin" : "Marge Télécom", value: telcoMargin, displayValue: money(telcoMargin, currency, locale) },
    ] : nativeCurrencies.map((item) => ({ label: item, value: nativeRows.filter((row) => row.currency === item).length, displayValue: `${nativeRows.filter((row) => row.currency === item).length} ${en ? "activity rows" : "lignes d’activité"}` })),
    columns: [{ key: "activity", label: en ? "Activity" : "Activité" }, { key: "currency", label: en ? "Currency / pair" : "Devise / paire" }, { key: "primary", label: en ? "Primary metric" : "Métrique principale" }, { key: "secondary", label: en ? "Additional metric" : "Métrique complémentaire" }],
    rows: missingRows.length ? [...nativeRows, ...missingRows] : nativeRows,
    insights,
    filters: [{ label: en ? "Period" : "Période", value: input.periodLabel }, { label: en ? "Consolidation" : "Consolidation", value: consolidated.complete ? (en ? "Complete" : "Complète") : (en ? "Withheld until rates are complete" : "Suspendue jusqu’à complétude des taux") }],
    accentHex: "#087EA4",
  };
}
