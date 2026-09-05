"use client";

import { EnterpriseFinanceCashBankReconciliationWorkspace } from "@/components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace";
import { EnterpriseFinanceInvoicesWorkspaceHotfix } from "@/components/enterprise/professional/enterprise-finance-invoices-workspace-hotfix";
import { EnterpriseFinanceOverviewWorkspace } from "@/components/enterprise/professional/enterprise-finance-overview-workspace";
import { EnterpriseFinancePaymentsWorkspaceHotfix } from "@/components/enterprise/professional/enterprise-finance-payments-workspace-hotfix";
import { EnterpriseFinanceTreasuryWorkspace } from "@/components/enterprise/professional/enterprise-finance-treasury-workspace";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

export type EnterpriseOperationalFinanceCapabilities = {
  canCreate: boolean;
  canSubmit: boolean;
  canWrite: boolean;
  canApprove: boolean;
  canManage: boolean;
};

export function EnterpriseOperationalFinanceWorkspace(props: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
} & EnterpriseOperationalFinanceCapabilities) {
  if (props.definition.code === "FINANCE_OVERVIEW") return <EnterpriseFinanceOverviewWorkspace {...props} />;
  if (["FINANCE_RECEIVABLES", "FINANCE_PAYABLES"].includes(props.definition.code)) return <EnterpriseFinanceInvoicesWorkspaceHotfix {...props} />;
  if (props.definition.code === "FINANCE_PAYMENTS") return <EnterpriseFinancePaymentsWorkspaceHotfix {...props} />;
  if (props.definition.code === "FINANCE_TREASURY") return <EnterpriseFinanceTreasuryWorkspace {...props} />;
  if (["FINANCE_CASH", "FINANCE_BANK", "FINANCE_RECONCILIATION"].includes(props.definition.code)) return <EnterpriseFinanceCashBankReconciliationWorkspace {...props} />;
  return null;
}
