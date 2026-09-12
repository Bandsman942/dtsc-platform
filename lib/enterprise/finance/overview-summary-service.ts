import { prisma } from "@/lib/prisma";
import {
  invalidateTenantReadCache,
  withTenantReadCache,
  type TenantReadCacheSource,
} from "@/lib/scalability/tenant-read-cache";

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

const FINANCE_OVERVIEW_CACHE = {
  projection: "finance-overview-summary",
  schemaVersion: "v1",
  ttlSeconds: 30,
} as const;

const FINANCE_OVERVIEW_INVALIDATION_ENTITY_TYPES = new Set<string>([
  ...FINANCE_APPROVAL_TARGETS,
  "EnterpriseReceivable",
  "EnterprisePayable",
  "EnterpriseApproval",
]);

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

export type EnterpriseFinanceOverviewSummaryRead = {
  summary: EnterpriseFinanceOverviewSummary;
  source: TenantReadCacheSource;
};

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isEnterpriseFinanceOverviewSummary(value: unknown): value is EnterpriseFinanceOverviewSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Record<string, unknown>;
  const breakdown = summary.invoiceBreakdown;
  if (!breakdown || typeof breakdown !== "object") return false;
  const invoiceBreakdown = breakdown as Record<string, unknown>;

  return [
    summary.openReceivables,
    summary.openPayables,
    summary.unallocatedPayments,
    summary.openCashSessions,
    summary.pendingReconciliations,
    summary.invoicesToPost,
    summary.pendingApprovals,
    invoiceBreakdown.sales,
    invoiceBreakdown.suppliers,
  ].every(isNonNegativeInteger);
}

async function loadEnterpriseFinanceOverviewSummary(organizationId: string): Promise<EnterpriseFinanceOverviewSummary> {
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

export async function getEnterpriseFinanceOverviewSummaryCached(
  organizationId: string,
): Promise<EnterpriseFinanceOverviewSummaryRead> {
  const cached = await withTenantReadCache<EnterpriseFinanceOverviewSummary>({
    ...FINANCE_OVERVIEW_CACHE,
    organizationId,
    validate: isEnterpriseFinanceOverviewSummary,
    load: () => loadEnterpriseFinanceOverviewSummary(organizationId),
  });

  return { summary: cached.value, source: cached.source };
}

export async function getEnterpriseFinanceOverviewSummary(organizationId: string) {
  return (await getEnterpriseFinanceOverviewSummaryCached(organizationId)).summary;
}

export async function invalidateEnterpriseFinanceOverviewSummaryCacheForDomainEvent(input: {
  organizationId: string;
  entityType: string;
}) {
  if (!FINANCE_OVERVIEW_INVALIDATION_ENTITY_TYPES.has(input.entityType)) return false;
  return invalidateTenantReadCache({
    projection: FINANCE_OVERVIEW_CACHE.projection,
    schemaVersion: FINANCE_OVERVIEW_CACHE.schemaVersion,
    organizationId: input.organizationId,
  });
}
