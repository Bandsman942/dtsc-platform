"use client";
import { ErpDesign2RegisterTools, type ErpDesign2StatusOption } from "@/components/enterprise/professional/erp-design2-register";
import type { FinanceExportColumn } from "@/components/enterprise/professional/finance-design2-controls";
import { professionalErpEnumLabel, professionalErpT } from "@/components/enterprise/professional/professional-erp-i18n";

type HrKind = "contracts" | "schedules" | "attendance" | "leave" | "timesheets" | "payroll-runs" | "payroll-periods";
const txt = (value: unknown) => value == null ? "" : String(value);
const date = (value: unknown) => txt(value).slice(0, 10);
const name = (row: Record<string, unknown>, field: "employee" | "payrollPeriod", key: "displayName" | "name") => {
  const obj = row[field];
  return obj && typeof obj === "object" && key in obj ? txt((obj as Record<string, unknown>)[key]) : "";
};
const col = (key: string, labelFr: string, labelEn: string, get?: (row: Record<string, unknown>) => string): FinanceExportColumn =>
  ({ key, labelFr, labelEn, get: get || ((row) => txt(row[key])) });
const employee = col("employee", "Collaborateur", "Employee", (row) => name(row, "employee", "displayName"));
const status = col("status", "Statut", "Status");
const reference = col("reference", "Référence", "Reference");
const start = (key: string) => col(key, "Début", "Start", (row) => date(row[key]));
const end = (key: string) => col(key, "Fin", "End", (row) => date(row[key]));
const columns: Record<HrKind, FinanceExportColumn[]> = {
  contracts: [reference, employee, col("contractType", "Type de contrat", "Contract type"), status, start("startDate"), end("endDate")],
  schedules: [employee, col("scheduleType", "Type d’horaire", "Schedule type"), start("effectiveFrom"), status, col("timezone", "Fuseau", "Timezone")],
  attendance: [employee, col("attendanceDate", "Date", "Date", (row) => date(row.attendanceDate)), status, col("source", "Origine", "Source")],
  leave: [reference, employee, col("leaveType", "Type de congé", "Leave type"), start("startDate"), end("endDate"), status],
  timesheets: [reference, employee, start("periodStart"), end("periodEnd"), status, col("totalApprovedMinutes", "Minutes approuvées", "Approved minutes")],
  "payroll-runs": [
    reference, col("payrollPeriod", "Période de paie", "Payroll period", (row) => name(row, "payrollPeriod", "name")), status,
    col("employeeCount", "Effectif", "Employees"), col("currency", "Devise", "Currency"),
    col("grossAmount", "Total brut", "Gross total"), col("bonusAmount", "Primes", "Bonuses"),
    col("deductionAmount", "Retenues", "Deductions"), col("netAmount", "Total net", "Net total"),
  ],
  "payroll-periods": [col("code", "Code", "Code"), col("name", "Libellé", "Name"), start("periodStart"), end("periodEnd"), status, col("payDate", "Paiement prévu", "Planned pay date", (row) => date(row.payDate))],
};
const endpoint: Record<HrKind, string> = {
  contracts: "employment-contracts", schedules: "work-schedules", attendance: "attendance",
  leave: "leave-requests", timesheets: "timesheets",
  "payroll-runs": "payroll-runs", "payroll-periods": "payroll-periods",
};
/** Export metadata only, never individual salary terms, payslips, leave reasons or notes. */
export function HrDesign2Tools({ kind, organizationId, organizationName, title, locale, filters, status: current, statuses, onStatusChange, dateFrom, dateTo, onDateChange }: {
  kind: HrKind; organizationId: string; organizationName: string; title: string; locale: "fr" | "en";
  filters: URLSearchParams; status: string; statuses: ErpDesign2StatusOption[];
  onStatusChange: (value: string) => void; dateFrom: string; dateTo: string;
  onDateChange: (from: string, to: string) => void;
}) {
  const exportColumns: FinanceExportColumn[] = columns[kind].map((column) => {
    if (column.key === "status") return {
      ...column,
      get: (row: Record<string, unknown>) => {
        const value = txt(row.status);
        if (kind === "contracts" && row.archivedAt) return locale === "en" ? "Archived" : "Archivé";
        if (!value) return "";
        const known = statuses.find((option) => option.id === value)?.label;
        if (known) return known;
        if (kind === "contracts") return professionalErpEnumLabel(locale, "employmentContractStatus", value);
        if (kind === "payroll-runs" || kind === "payroll-periods") return professionalErpEnumLabel(locale, "payrollStatus", value);
        if (kind === "leave" || kind === "timesheets") return professionalErpEnumLabel(locale, "timeStatus", value);
        return professionalErpT(locale, "common.valueToReview");
      },
    };
    if (kind === "leave" && column.key === "leaveType") return {
      ...column,
      get: (row: Record<string, unknown>) => {
        const value = txt(row.leaveType);
        return value ? professionalErpEnumLabel(locale, "leaveType", value) : "";
      },
    };
    return column;
  });
  return <ErpDesign2RegisterTools
    locale={locale} title={title} organizationName={organizationName}
    endpoint={`/api/enterprise/${organizationId}/${endpoint[kind]}`}
    filters={Object.fromEntries(filters.entries())} columns={exportColumns}
    status={current} statuses={statuses} onStatusChange={onStatusChange}
    dateFrom={dateFrom} dateTo={dateTo} onDateChange={onDateChange}
  />;
}
