import { prisma } from "@/lib/prisma";

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

export async function getEnterpriseFinanceOverviewSummary(organizationId: string) {
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
