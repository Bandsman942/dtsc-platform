"use client";

import { EnterpriseFinanceCashBankReconciliationWorkspace } from "@/components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace";
import { EnterpriseFinanceInvoicesWorkspace } from "@/components/enterprise/professional/enterprise-finance-invoices-workspace";
import { EnterpriseFinanceOverviewWorkspace } from "@/components/enterprise/professional/enterprise-finance-overview-workspace";
import { EnterpriseFinancePaymentsTreasuryWorkspace } from "@/components/enterprise/professional/enterprise-finance-payments-treasury-workspace";
import { EnterpriseFinanceTreasuryWorkspace } from "@/components/enterprise/professional/enterprise-finance-treasury-workspace";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

export function EnterpriseOperationalFinanceWorkspace(props: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
  canManage: boolean;
}) {
  if (props.definition.code === "FINANCE_OVERVIEW") return <EnterpriseFinanceOverviewWorkspace {...props} />;
  if (["FINANCE_RECEIVABLES", "FINANCE_PAYABLES"].includes(props.definition.code)) return <EnterpriseFinanceInvoicesWorkspace {...props} />;
  if (props.definition.code === "FINANCE_PAYMENTS") return <EnterpriseFinancePaymentsTreasuryWorkspace {...props} />;
  if (props.definition.code === "FINANCE_TREASURY") return <EnterpriseFinanceTreasuryWorkspace {...props} />;
  if (["FINANCE_CASH", "FINANCE_BANK", "FINANCE_RECONCILIATION"].includes(props.definition.code)) return <EnterpriseFinanceCashBankReconciliationWorkspace {...props} />;
  return null;
}
