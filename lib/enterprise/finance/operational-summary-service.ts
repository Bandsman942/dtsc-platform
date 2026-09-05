import { prisma } from "@/lib/prisma";

export type OperationalFinanceModuleCode = "FINANCE_RECEIVABLES" | "FINANCE_PAYABLES" | "FINANCE_PAYMENTS";
export type FinanceAgeBucket = "TO_DUE" | "D1_30" | "D31_60" | "D61_90" | "D90_PLUS";

function startOfUtcDay(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  const copy = new Date(value);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function ageingWindows(now = new Date()) {
  const today = startOfUtcDay(now);
  return {
    today,
    d30: addUtcDays(today, -30),
    d60: addUtcDays(today, -60),
    d90: addUtcDays(today, -90),
  };
}

async function getReceivablesSummary(organizationId: string) {
  const { today, d30, d60, d90 } = ageingWindows();
  const [openCount, overdueCount, pendingApprovalCount, toDue, d1_30, d31_60, d61_90, d90Plus] = await Promise.all([
    prisma.enterpriseReceivable.count({ where: { organizationId, status: "OPEN" } }),
    prisma.enterpriseReceivable.count({ where: { organizationId, status: "OPEN", dueDate: { lt: today } } }),
    prisma.enterpriseSalesInvoice.count({ where: { organizationId, status: "PENDING_APPROVAL" } }),
    prisma.enterpriseReceivable.count({ where: { organizationId, status: "OPEN", OR: [{ dueDate: null }, { dueDate: { gte: today } }] } }),
    prisma.enterpriseReceivable.count({ where: { organizationId, status: "OPEN", dueDate: { gte: d30, lt: today } } }),
    prisma.enterpriseReceivable.count({ where: { organizationId, status: "OPEN", dueDate: { gte: d60, lt: d30 } } }),
    prisma.enterpriseReceivable.count({ where: { organizationId, status: "OPEN", dueDate: { gte: d90, lt: d60 } } }),
    prisma.enterpriseReceivable.count({ where: { organizationId, status: "OPEN", dueDate: { lt: d90 } } }),
  ]);
  return {
    moduleCode: "FINANCE_RECEIVABLES" as const,
    openCount,
    overdueCount,
    pendingApprovalCount,
    ageing: { TO_DUE: toDue, D1_30: d1_30, D31_60: d31_60, D61_90: d61_90, D90_PLUS: d90Plus },
  };
}

async function getPayablesSummary(organizationId: string) {
  const { today, d30, d60, d90 } = ageingWindows();
  const [openCount, overdueCount, pendingReviewCount, pendingApprovalCount, toDue, d1_30, d31_60, d61_90, d90Plus] = await Promise.all([
    prisma.enterprisePayable.count({ where: { organizationId, status: "OPEN" } }),
    prisma.enterprisePayable.count({ where: { organizationId, status: "OPEN", dueDate: { lt: today } } }),
    prisma.enterpriseSupplierInvoice.count({ where: { organizationId, status: "PENDING_REVIEW" } }),
    prisma.enterpriseSupplierInvoice.count({ where: { organizationId, status: "PENDING_APPROVAL" } }),
    prisma.enterprisePayable.count({ where: { organizationId, status: "OPEN", OR: [{ dueDate: null }, { dueDate: { gte: today } }] } }),
    prisma.enterprisePayable.count({ where: { organizationId, status: "OPEN", dueDate: { gte: d30, lt: today } } }),
    prisma.enterprisePayable.count({ where: { organizationId, status: "OPEN", dueDate: { gte: d60, lt: d30 } } }),
    prisma.enterprisePayable.count({ where: { organizationId, status: "OPEN", dueDate: { gte: d90, lt: d60 } } }),
    prisma.enterprisePayable.count({ where: { organizationId, status: "OPEN", dueDate: { lt: d90 } } }),
  ]);
  return {
    moduleCode: "FINANCE_PAYABLES" as const,
    openCount,
    overdueCount,
    pendingReviewCount,
    pendingApprovalCount,
    pendingDecisionCount: pendingReviewCount + pendingApprovalCount,
    ageing: { TO_DUE: toDue, D1_30: d1_30, D31_60: d31_60, D61_90: d61_90, D90_PLUS: d90Plus },
  };
}

async function getPaymentsSummary(organizationId: string) {
  const [totalCount, inboundCount, outboundCount, unallocatedCount, pendingApprovalCount] = await Promise.all([
    prisma.enterprisePayment.count({ where: { organizationId } }),
    prisma.enterprisePayment.count({ where: { organizationId, direction: "INBOUND" } }),
    prisma.enterprisePayment.count({ where: { organizationId, direction: "OUTBOUND" } }),
    prisma.enterprisePayment.count({ where: { organizationId, status: { in: ["CONFIRMED", "RECONCILED"] }, unallocatedAmount: { gt: 0 } } }),
    prisma.enterprisePayment.count({ where: { organizationId, status: "PENDING_APPROVAL" } }),
  ]);
  return {
    moduleCode: "FINANCE_PAYMENTS" as const,
    totalCount,
    inboundCount,
    outboundCount,
    unallocatedCount,
    pendingApprovalCount,
  };
}

export async function getOperationalFinanceSummary(organizationId: string, moduleCode: OperationalFinanceModuleCode) {
  if (moduleCode === "FINANCE_RECEIVABLES") return getReceivablesSummary(organizationId);
  if (moduleCode === "FINANCE_PAYABLES") return getPayablesSummary(organizationId);
  return getPaymentsSummary(organizationId);
}
