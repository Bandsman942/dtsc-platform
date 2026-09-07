import { prisma } from "@/lib/prisma";
import { readThroughTenantCache } from "@/lib/read-cache";
import {
  FINANCE_OVERVIEW_CACHE_NAMESPACE,
  FINANCE_OVERVIEW_CACHE_SCHEMA_VERSION,
  FINANCE_OVERVIEW_CACHE_TTL_SECONDS,
} from "@/lib/enterprise/finance/overview-read-cache";

const FINANCE_APPROVAL_TARGETS = [
  "EnterpriseBudget",
  "EnterpriseExpense",
  "EnterprisePayment",
  "EnterpriseSalesInvoice",
  "EnterpriseSupplierInvoice",
  "EnterpriseJournalEntry",
  "EnterpriseCashSession",
  "EnterpriseReconciliationSession",
  "EnterpriseFinancialClose",
] as const;

export type EnterpriseFinanceOverviewSummary = {
  openReceivables: number;
  openPayables: number;
  unallocatedPayments: number;
  openCashSessions: number;
  pendingReconciliations: number;
  invoicesToPost: number;
  pendingApprovals: number;
  invoiceBreakdown: {
    sales: number;
    suppliers: number;
  };
};

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isEnterpriseFinanceOverviewSummary(value: unknown): value is EnterpriseFinanceOverviewSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<EnterpriseFinanceOverviewSummary>;
  const breakdown = summary.invoiceBreakdown;
  return isCount(summary.openReceivables)
    && isCount(summary.openPayables)
    && isCount(summary.unallocatedPayments)
    && isCount(summary.openCashSessions)
    && isCount(summary.pendingReconciliations)
    && isCount(summary.invoicesToPost)
    && isCount(summary.pendingApprovals)
    && Boolean(breakdown)
    && isCount(breakdown?.sales)
    && isCount(breakdown?.suppliers)
    && summary.invoicesToPost === (breakdown?.sales || 0) + (breakdown?.suppliers || 0);
}

export async function loadCanonicalEnterpriseFinanceOverviewSummary(organizationId: string): Promise<EnterpriseFinanceOverviewSummary> {
  const [
    openReceivables,
    openPayables,
    unallocatedPayments,
    openCashSessions,
    pendingReconciliations,
    salesInvoicesToPost,
    supplierInvoicesToPost,
    pendingApprovals,
  ] = await Promise.all([
    prisma.enterpriseReceivable.count({ where: { organizationId, status: "OPEN" } }),
    prisma.enterprisePayable.count({ where: { organizationId, status: "OPEN" } }),
    prisma.enterprisePayment.count({
      where: {
        organizationId,
        status: { in: ["CONFIRMED", "RECONCILED"] },
        unallocatedAmount: { gt: 0 },
      },
    }),
    prisma.enterpriseCashSession.count({ where: { organizationId, status: "OPEN" } }),
    prisma.enterpriseReconciliationSession.count({ where: { organizationId, status: "SUBMITTED" } }),
    prisma.enterpriseSalesInvoice.count({ where: { organizationId, status: "APPROVED", archivedAt: null } }),
    prisma.enterpriseSupplierInvoice.count({ where: { organizationId, status: "APPROVED", archivedAt: null } }),
    prisma.enterpriseApproval.count({
      where: {
        organizationId,
        status: "PENDING",
        archivedAt: null,
        targetEntityType: { in: [...FINANCE_APPROVAL_TARGETS] },
      },
    }),
  ]);

  return {
    openReceivables,
    openPayables,
    unallocatedPayments,
    openCashSessions,
    pendingReconciliations,
    invoicesToPost: salesInvoicesToPost + supplierInvoicesToPost,
    pendingApprovals,
    invoiceBreakdown: {
      sales: salesInvoicesToPost,
      suppliers: supplierInvoicesToPost,
    },
  };
}

export async function getEnterpriseFinanceOverviewSummaryCached(organizationId: string) {
  return readThroughTenantCache({
    namespace: FINANCE_OVERVIEW_CACHE_NAMESPACE,
    organizationId,
    schemaVersion: FINANCE_OVERVIEW_CACHE_SCHEMA_VERSION,
    ttlSeconds: FINANCE_OVERVIEW_CACHE_TTL_SECONDS,
    validate: isEnterpriseFinanceOverviewSummary,
    loader: () => loadCanonicalEnterpriseFinanceOverviewSummary(organizationId),
  });
}

export async function getEnterpriseFinanceOverviewSummary(organizationId: string) {
  const result = await getEnterpriseFinanceOverviewSummaryCached(organizationId);
  return result.value;
}
