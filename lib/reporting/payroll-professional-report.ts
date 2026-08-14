import type { ProfessionalReportExportModel, ProfessionalReportInsight } from "@/lib/reporting/professional-export";

type PayrollItem = {
  employee?: { id?: string; displayName?: string | null; firstName?: string | null; lastName?: string | null; employeeNumber?: string | null; position?: { title?: string | null } | null; department?: { name?: string | null } | null } | null;
  baseGrossAmount?: number | string | null;
  bonusAmount?: number | string | null;
  deductionAmount?: number | string | null;
  grossAmount?: number | string | null;
  netAmount?: number | string | null;
};

type PayrollRun = {
  reference: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  payrollPeriod?: { periodStart?: string | null; periodEnd?: string | null } | null;
  status?: string | null;
  currency?: string | null;
  employeeCount?: number | null;
  grossAmount?: number | string | null;
  bonusAmount?: number | string | null;
  deductionAmount?: number | string | null;
  netAmount?: number | string | null;
  items?: PayrollItem[] | null;
};

function n(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function money(value: unknown, currency: string, locale?: string | null) {
  try { return new Intl.NumberFormat(String(locale || "fr").startsWith("en") ? "en-US" : "fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n(value)); }
  catch { return `${n(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency}`; }
}
function date(value?: string | null, locale?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(String(locale || "fr").startsWith("en") ? "en-GB" : "fr-FR", { dateStyle: "medium" }).format(parsed);
}
function employeeName(item: PayrollItem) {
  const employee = item.employee;
  const name = employee?.displayName?.trim() || [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim();
  return name || employee?.employeeNumber || "Collaborateur";
}

export function buildPayrollProfessionalReport(input: {
  organizationName?: string | null;
  run: PayrollRun;
  previousRun?: PayrollRun | null;
  locale?: string | null;
}): ProfessionalReportExportModel {
  const en = String(input.locale || "fr").startsWith("en");
  const run = input.run;
  const currency = run.currency || "USD";
  const previous = input.previousRun && input.previousRun.currency === currency ? input.previousRun : null;
  const periodStart = run.periodStart || run.payrollPeriod?.periodStart || null;
  const periodEnd = run.periodEnd || run.payrollPeriod?.periodEnd || null;
  const gross = n(run.grossAmount);
  const net = n(run.netAmount);
  const deductions = n(run.deductionAmount);
  const bonuses = n(run.bonusAmount);
  const previousGross = n(previous?.grossAmount);
  const previousNet = n(previous?.netAmount);
  const variation = (current: number, old: number) => old ? ((current - old) / Math.abs(old)) * 100 : null;
  const grossVariation = variation(gross, previousGross);
  const netVariation = variation(net, previousNet);
  const deductionShare = gross ? deductions / gross * 100 : null;
  const bonusShare = gross ? bonuses / gross * 100 : null;
  const insights: ProfessionalReportInsight[] = [];

  if (previous && grossVariation != null) insights.push({ title: en ? "Payroll change" : "Évolution de la masse salariale", body: en ? `Gross payroll changed by ${grossVariation.toLocaleString("en-US", { maximumFractionDigits: 1 })}% compared with the previous run in ${currency}.` : `La masse salariale brute varie de ${grossVariation.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}% par rapport à la paie précédente dans la même devise (${currency}).`, tone: Math.abs(grossVariation) >= 10 ? "warning" : "info" });
  if (deductionShare != null) insights.push({ title: en ? "Deduction weight" : "Poids des retenues", body: en ? `Deductions represent ${deductionShare.toLocaleString("en-US", { maximumFractionDigits: 1 })}% of gross payroll for this run.` : `Les retenues représentent ${deductionShare.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}% de la masse salariale brute de cette paie.`, tone: deductionShare >= 30 ? "warning" : "info" });
  if (!run.items?.length) insights.push({ title: en ? "Limited details" : "Détail limité", body: en ? "No employee-level payroll lines are available in the loaded scope. Totals remain based on the authorized payroll run." : "Aucune ligne individuelle de paie n’est disponible dans le périmètre chargé. Les totaux restent ceux de la paie autorisée.", tone: "info" });

  return {
    title: en ? `Payroll report · ${run.reference}` : `Rapport de paie · ${run.reference}`,
    subtitle: `${date(periodStart, input.locale)} → ${date(periodEnd, input.locale)} · ${currency}`,
    organizationName: input.organizationName || "DTSC Platform",
    generatedLabel: en ? `Report prepared from the authorized payroll run · status ${String(run.status || "").replace(/_/g, " ")}` : `Rapport préparé à partir de la paie autorisée · statut ${String(run.status || "").replace(/_/g, " ")}`,
    filenameBase: `paie-${run.reference}`,
    kpis: [
      { label: en ? "Gross payroll" : "Masse salariale brute", value: money(gross, currency, input.locale), numericValue: gross, comparison: grossVariation == null ? null : `${grossVariation >= 0 ? "+" : ""}${grossVariation.toLocaleString(en ? "en-US" : "fr-FR", { maximumFractionDigits: 1 })}%` },
      { label: en ? "Net payroll" : "Masse salariale nette", value: money(net, currency, input.locale), numericValue: net, comparison: netVariation == null ? null : `${netVariation >= 0 ? "+" : ""}${netVariation.toLocaleString(en ? "en-US" : "fr-FR", { maximumFractionDigits: 1 })}%` },
      { label: en ? "Deductions" : "Retenues", value: money(deductions, currency, input.locale), numericValue: deductions, comparison: deductionShare == null ? null : `${deductionShare.toLocaleString(en ? "en-US" : "fr-FR", { maximumFractionDigits: 1 })}% ${en ? "of gross" : "du brut"}` },
      { label: en ? "Employees" : "Collaborateurs", value: String(run.employeeCount ?? run.items?.length ?? 0), numericValue: Number(run.employeeCount ?? run.items?.length ?? 0) },
      { label: en ? "Bonuses" : "Primes", value: money(bonuses, currency, input.locale), numericValue: bonuses, comparison: bonusShare == null ? null : `${bonusShare.toLocaleString(en ? "en-US" : "fr-FR", { maximumFractionDigits: 1 })}% ${en ? "of gross" : "du brut"}` },
    ],
    chartTitle: en ? `Payroll composition · ${currency}` : `Composition de la paie · ${currency}`,
    chart: [
      { label: en ? "Base gross" : "Brut de base", value: Math.max(0, gross - bonuses), displayValue: money(Math.max(0, gross - bonuses), currency, input.locale) },
      { label: en ? "Bonuses" : "Primes", value: bonuses, displayValue: money(bonuses, currency, input.locale) },
      { label: en ? "Deductions" : "Retenues", value: deductions, displayValue: money(deductions, currency, input.locale) },
      { label: en ? "Net" : "Net", value: net, displayValue: money(net, currency, input.locale) },
    ],
    columns: [
      { key: "employee", label: en ? "Employee" : "Collaborateur" },
      { key: "number", label: en ? "Number" : "Matricule" },
      { key: "department", label: en ? "Department" : "Département" },
      { key: "gross", label: en ? "Gross" : "Brut" },
      { key: "bonus", label: en ? "Bonus" : "Prime" },
      { key: "deduction", label: en ? "Deduction" : "Retenue" },
      { key: "net", label: "Net" },
    ],
    rows: (run.items || []).map((item) => ({ employee: employeeName(item), number: item.employee?.employeeNumber || "—", department: item.employee?.department?.name || "—", gross: money(item.grossAmount, currency, input.locale), bonus: money(item.bonusAmount, currency, input.locale), deduction: money(item.deductionAmount, currency, input.locale), net: money(item.netAmount, currency, input.locale) })),
    insights,
    filters: [{ label: en ? "Period" : "Période", value: `${date(periodStart, input.locale)} → ${date(periodEnd, input.locale)}` }, { label: en ? "Currency" : "Devise", value: currency }],
    accentHex: "#087EA4",
  };
}
