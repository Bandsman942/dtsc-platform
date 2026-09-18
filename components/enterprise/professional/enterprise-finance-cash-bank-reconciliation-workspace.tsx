"use client";

import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { EnterpriseFinanceCashWorkspace } from "@/components/enterprise/professional/enterprise-finance-cash-workspace";
import { EnterpriseFinanceCashBankReconciliationWorkspace as EnterpriseFinanceBankReconciliationWorkspace } from "@/components/enterprise/professional/enterprise-finance-bank-reconciliation-workspace";

export function EnterpriseFinanceCashBankReconciliationWorkspace({
  organizationId,
  organizationName,
  definition,
  locale,
  canManage,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
  canManage: boolean;
}) {
  if (definition.code === "FINANCE_CASH") {
    return (
      <EnterpriseFinanceCashWorkspace
        organizationId={organizationId}
        organizationName={organizationName}
        definition={definition}
        locale={locale}
        canManage={canManage}
      />
    );
  }

  return (
    <EnterpriseFinanceBankReconciliationWorkspace
      organizationId={organizationId}
      organizationName={organizationName}
      definition={definition}
      locale={locale}
      canManage={canManage}
    />
  );
}
