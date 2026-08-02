"use client";

import { EnterpriseFinanceCashBankReconciliationWorkspace } from "@/components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace";
import { EnterpriseFinanceInvoicesWorkspace } from "@/components/enterprise/professional/enterprise-finance-invoices-workspace";
import { EnterpriseFinanceOverviewWorkspace } from "@/components/enterprise/professional/enterprise-finance-overview-workspace";
import { EnterpriseFinancePaymentsTreasuryWorkspace } from "@/components/enterprise/professional/enterprise-finance-payments-treasury-workspace";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

export const OPERATIONAL_FINANCE_MODULE_CODES = new Set([
  "FINANCE_OVERVIEW",
  "FINANCE_RECEIVABLES",
  "FINANCE_PAYABLES",
  "FINANCE_PAYMENTS",
  "FINANCE_TREASURY",
  "FINANCE_CASH",
  "FINANCE_BANK",
  "FINANCE_RECONCILIATION",
]);

export function EnterpriseOperationalFinanceWorkspace(props: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
  canManage: boolean;
}) {
  if (props.definition.code === "FINANCE_OVERVIEW") return <EnterpriseFinanceOverviewWorkspace {...props} />;
  if (["FINANCE_RECEIVABLES", "FINANCE_PAYABLES"].includes(props.definition.code)) return <EnterpriseFinanceInvoicesWorkspace {...props} />;
  if (["FINANCE_PAYMENTS", "FINANCE_TREASURY"].includes(props.definition.code)) return <EnterpriseFinancePaymentsTreasuryWorkspace {...props} />;
  if (["FINANCE_CASH", "FINANCE_BANK", "FINANCE_RECONCILIATION"].includes(props.definition.code)) return <EnterpriseFinanceCashBankReconciliationWorkspace {...props} />;
  return null;
}
