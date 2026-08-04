import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { ENTERPRISE_REPORT_TYPES } from "@/lib/enterprise/finance/constants";
import { enterpriseMoney, enterpriseMoneyZero } from "@/lib/enterprise/finance/money";
import { addEnterpriseOperationalEvent, createEnterpriseLink, nullable, requireEnterpriseSourceReference } from "@/lib/enterprise/procurement/shared";
import type { enterpriseReportActionSchema, enterpriseReportGenerateSchema } from "@/lib/enterprise/finance/validators";
import { prisma } from "@/lib/prisma";
import { calculateBudgetMetrics, getReportCatalogEntry, getReportMetricCodes } from "@/lib/enterprise/reporting/metric-registry";

type ReportGenerateInput = z.infer<typeof enterpriseReportGenerateSchema>;
type ReportActionInput = z.infer<typeof enterpriseReportActionSchema>;
type Tx = Prisma.TransactionClient;

function reportReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `RPT-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function dateOrUndefined(value?: string | null) { return value ? new Date(value) : undefined; }
function moneyString(value: Prisma.Decimal.Value) { return enterpriseMoney(value).toFixed(2); }

function periodWhere(periodStart?: string | null, periodEnd?: string | null) {
  const start = dateOrUndefined(periodStart);
  const end = dateOrUndefined(periodEnd);
  return { start, end };
}

async function budgetVsActualSnapshot(tx: Tx, organizationId: string, input: ReportGenerateInput) {
  const { start, end } = periodWhere(input.periodStart, input.periodEnd);
  const where: Prisma.EnterpriseBudgetLineWhereInput = {
    organizationId,
    ...(input.departmentId ? { OR: [{ departmentId: input.departmentId }, { budget: { departmentId: input.departmentId } }] } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.budgetId ? { budgetId: input.budgetId } : {}),
    budget: {
      organizationId,
      archivedAt: null,
      ...(input.currency ? { currency: input.currency } : {}),
      ...(start ? { periodEnd: { gte: start } } : {}),
      ...(end ? { periodStart: { lte: end } } : {}),
    },
  };
  const [totalLineCount, lines] = await Promise.all([
    tx.enterpriseBudgetLine.count({ where }),
    tx.enterpriseBudgetLine.findMany({
      where,
      select: { id: true, code: true, name: true, category: true, departmentId: true, plannedAmount: true, budget: { select: { id: true, reference: true, title: true, status: true, currency: true, periodStart: true, periodEnd: true } } },
      orderBy: [{ budgetId: "asc" }, { createdAt: "asc" }],
      take: 500,
    }),
  ]);
  const ids = lines.map((line) => line.id);
  const [commitments, actuals] = ids.length ? await Promise.all([
    tx.enterpriseBudgetCommitment.groupBy({ by: ["budgetLineId"], where: { organizationId, budgetLineId: { in: ids } }, _sum: { committedAmount: true, realizedAmount: true, releasedAmount: true } }),
    tx.enterpriseExpense.groupBy({ by: ["budgetLineId"], where: { organizationId, budgetLineId: { in: ids }, status: "APPROVED", archivedAt: null, ...(start || end ? { expenseDate: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}) }, _sum: { amount: true } }),
  ]) : [[], []];
  const commitmentMap = new Map(commitments.map((item) => [item.budgetLineId, item]));
  const actualMap = new Map(actuals.map((item) => [item.budgetLineId, enterpriseMoney(item._sum.amount || 0)]));
  const currencyBuckets = new Map<string, { planned: Prisma.Decimal; committedRemaining: Prisma.Decimal; actual: Prisma.Decimal; available: Prisma.Decimal }>();
  const detail = lines.map((line) => {
    const sums = commitmentMap.get(line.id)?._sum;
    const committed = enterpriseMoney(sums?.committedAmount || 0);
    const realized = enterpriseMoney(sums?.realizedAmount || 0);
    const released = enterpriseMoney(sums?.releasedAmount || 0);
    const committedRemaining = Prisma.Decimal.max(enterpriseMoneyZero(), committed.sub(realized).sub(released)).toDecimalPlaces(2);
    const actual = actualMap.get(line.id) || enterpriseMoneyZero();
    const planned = enterpriseMoney(line.plannedAmount);
    const metrics = calculateBudgetMetrics({ planned, committed: committedRemaining, actual });
    const available = metrics.available;
    const bucket = currencyBuckets.get(line.budget.currency) || { planned: enterpriseMoneyZero(), committedRemaining: enterpriseMoneyZero(), actual: enterpriseMoneyZero(), available: enterpriseMoneyZero() };
    bucket.planned = bucket.planned.add(planned).toDecimalPlaces(2); bucket.committedRemaining = bucket.committedRemaining.add(committedRemaining).toDecimalPlaces(2); bucket.actual = bucket.actual.add(actual).toDecimalPlaces(2); bucket.available = bucket.available.add(available).toDecimalPlaces(2); currencyBuckets.set(line.budget.currency, bucket);
    return { budgetId: line.budget.id, budgetReference: line.budget.reference, budgetTitle: line.budget.title, budgetStatus: line.budget.status, budgetLineId: line.id, code: line.code, name: line.name, category: line.category, departmentId: line.departmentId, currency: line.budget.currency, planned: moneyString(planned), committed: moneyString(committedRemaining), actual: moneyString(actual), available: moneyString(available), variance: moneyString(metrics.variance), utilizationPercent: metrics.consumptionRate.toNumber(), deepLink: `/enterprise-modules/FINANCE_BUDGETS?budgetId=${encodeURIComponent(line.budget.id)}&lineId=${encodeURIComponent(line.id)}` };
  });
  return { schema: "budget-vs-actual/v1", truncated: totalLineCount > lines.length, totalLineCount, currencies: [...currencyBuckets.entries()].map(([currency, value]) => ({ currency, planned: moneyString(value.planned), committed: moneyString(value.committedRemaining), actual: moneyString(value.actual), available: moneyString(value.available), utilizationPercent: value.planned.gt(0) ? value.actual.div(value.planned).mul(100).toDecimalPlaces(2).toNumber() : 0 })), lines: detail };
}

async function expenseSummarySnapshot(tx: Tx, organizationId: string, input: ReportGenerateInput) {
  const { start, end } = periodWhere(input.periodStart, input.periodEnd);
  const where: Prisma.EnterpriseExpenseWhereInput = { organizationId, archivedAt: null, status: "APPROVED", ...(input.currency ? { currency: input.currency } : {}), ...(input.departmentId ? { departmentId: input.departmentId } : {}), ...(input.supplierId ? { supplierId: input.supplierId } : {}), ...(input.budgetId ? { budgetLine: { budgetId: input.budgetId } } : {}), ...(input.category ? { category: input.category } : {}), ...(start || end ? { expenseDate: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}) };
  const [byCurrency, byCategory, byDepartment, bySupplier, unbudgeted] = await Promise.all([
    tx.enterpriseExpense.groupBy({ by: ["currency"], where, _sum: { amount: true }, _count: { _all: true }, orderBy: { currency: "asc" } }),
    tx.enterpriseExpense.groupBy({ by: ["currency", "category"], where, _sum: { amount: true }, _count: { _all: true }, orderBy: [{ currency: "asc" }, { category: "asc" }] }),
    tx.enterpriseExpense.groupBy({ by: ["currency", "departmentId"], where, _sum: { amount: true }, _count: { _all: true }, orderBy: [{ currency: "asc" }, { departmentId: "asc" }] }),
    tx.enterpriseExpense.groupBy({ by: ["currency", "supplierId"], where, _sum: { amount: true }, _count: { _all: true }, orderBy: [{ currency: "asc" }, { supplierId: "asc" }], take: 200 }),
    tx.enterpriseExpense.groupBy({ by: ["currency"], where: { ...where, budgetLineId: null }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const supplierIds = bySupplier.map((item) => item.supplierId).filter((id): id is string => Boolean(id));
  const suppliers = supplierIds.length ? await tx.enterpriseSupplier.findMany({ where: { organizationId, id: { in: supplierIds } }, select: { id: true, legalName: true, displayName: true } }) : [];
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier.displayName || supplier.legalName]));
  return { schema: "expense-summary/v1", currencies: byCurrency.map((item) => ({ currency: item.currency, amount: moneyString(item._sum.amount || 0), count: item._count._all })), byCategory: byCategory.map((item) => ({ currency: item.currency, category: item.category || "UNCATEGORIZED", amount: moneyString(item._sum.amount || 0), count: item._count._all })), byDepartment: byDepartment.map((item) => ({ currency: item.currency, departmentId: item.departmentId, amount: moneyString(item._sum.amount || 0), count: item._count._all })), bySupplier: bySupplier.map((item) => ({ currency: item.currency, supplierId: item.supplierId, supplier: item.supplierId ? supplierMap.get(item.supplierId) || null : null, amount: moneyString(item._sum.amount || 0), count: item._count._all })), unbudgeted: unbudgeted.map((item) => ({ currency: item.currency, amount: moneyString(item._sum.amount || 0), count: item._count._all })) };
}

async function procurementSummarySnapshot(tx: Tx, organizationId: string, input: ReportGenerateInput) {
  const { start, end } = periodWhere(input.periodStart, input.periodEnd);
  const purchaseWhere: Prisma.EnterprisePurchaseWhereInput = { organizationId, archivedAt: null, ...(input.currency ? { currency: input.currency } : {}), ...(input.departmentId ? { departmentId: input.departmentId } : {}), ...(input.supplierId ? { supplierId: input.supplierId } : {}), ...(start || end ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}) };
  const [byStatus, bySupplier, unbudgeted, receipts] = await Promise.all([
    tx.enterprisePurchase.groupBy({ by: ["currency", "status"], where: purchaseWhere, _sum: { totalAmount: true }, _count: { _all: true }, orderBy: [{ currency: "asc" }, { status: "asc" }] }),
    tx.enterprisePurchase.groupBy({ by: ["currency", "supplierId"], where: purchaseWhere, _sum: { totalAmount: true }, _count: { _all: true }, orderBy: [{ currency: "asc" }, { supplierId: "asc" }], take: 200 }),
    tx.enterprisePurchase.groupBy({ by: ["currency"], where: { ...purchaseWhere, budgetLineId: null }, _sum: { totalAmount: true }, _count: { _all: true } }),
    tx.enterprisePurchaseReceipt.count({ where: { organizationId, ...(start || end ? { receivedAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}) } }),
  ]);
  const supplierIds = bySupplier.map((item) => item.supplierId).filter((id): id is string => Boolean(id));
  const suppliers = supplierIds.length ? await tx.enterpriseSupplier.findMany({ where: { organizationId, id: { in: supplierIds } }, select: { id: true, legalName: true, displayName: true } }) : [];
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier.displayName || supplier.legalName]));
  return { schema: "procurement-summary/v1", byStatus: byStatus.map((item) => ({ currency: item.currency, status: item.status, amount: moneyString(item._sum.totalAmount || 0), count: item._count._all })), bySupplier: bySupplier.map((item) => ({ currency: item.currency, supplierId: item.supplierId, supplier: item.supplierId ? supplierMap.get(item.supplierId) || null : null, amount: moneyString(item._sum.totalAmount || 0), count: item._count._all })), unbudgeted: unbudgeted.map((item) => ({ currency: item.currency, amount: moneyString(item._sum.totalAmount || 0), count: item._count._all })), receiptCount: receipts };
}

async function financeOverviewSnapshot(tx: Tx, organizationId: string, input: ReportGenerateInput) {
  const [budget, expenses, procurement] = await Promise.all([budgetVsActualSnapshot(tx, organizationId, input), expenseSummarySnapshot(tx, organizationId, input), procurementSummarySnapshot(tx, organizationId, input)]);
  return { schema: "finance-overview/v1", budgetCurrencies: budget.currencies, expenseCurrencies: expenses.currencies, procurementByStatus: procurement.byStatus, unbudgetedExpenses: expenses.unbudgeted, unbudgetedPurchases: procurement.unbudgeted };
}

async function buildSnapshot(tx: Tx, organizationId: string, input: ReportGenerateInput) {
  if (input.reportType === "BUDGET_VS_ACTUAL") return budgetVsActualSnapshot(tx, organizationId, input);
  if (input.reportType === "EXPENSE_SUMMARY") return expenseSummarySnapshot(tx, organizationId, input);
  if (input.reportType === "PROCUREMENT_SUMMARY") return procurementSummarySnapshot(tx, organizationId, input);
  if (input.reportType === "FINANCE_OVERVIEW") return financeOverviewSnapshot(tx, organizationId, input);
  throw new EnterpriseCoreV2Error("Type de rapport non pris en charge.", 400, "INVALID_REPORT_TYPE");
}

export async function generateEnterpriseReport(organizationId: string, actorUserId: string, input: ReportGenerateInput) {
  if (!ENTERPRISE_REPORT_TYPES.includes(input.reportType)) throw new EnterpriseCoreV2Error("Type de rapport non pris en charge.", 400, "INVALID_REPORT_TYPE");
  return prisma.$transaction(async (tx) => {
    const source = await requireEnterpriseSourceReference(tx, organizationId, input);
    if (input.budgetId) {
      const budget = await tx.enterpriseBudget.findFirst({ where: { id: input.budgetId, organizationId, archivedAt: null }, select: { id: true, currency: true } });
      if (!budget) throw new EnterpriseCoreV2Error("Le budget du rapport n’appartient pas à cette entreprise.", 400, "INVALID_REPORT_BUDGET");
      if (input.currency && budget.currency !== input.currency) throw new EnterpriseCoreV2Error("Le filtre de devise ne correspond pas au budget sélectionné.", 400, "REPORT_CURRENCY_MISMATCH");
    }
    const rawSnapshot = await buildSnapshot(tx, organizationId, input);
    const generatedAt = new Date();
    const catalog = getReportCatalogEntry(input.reportType);
    const metricCodes = getReportMetricCodes(input.reportType);
    const snapshot = {
      meta: {
        reportCode: input.reportType,
        sourcePolicyCode: catalog?.sourcePolicyCode || "CANONICAL_ENTERPRISE_DATA",
        freshnessPolicyCode: catalog?.freshnessPolicyCode || "REQUEST_TIME",
        freshnessAt: generatedAt.toISOString(),
        periodStart: input.periodStart || null,
        periodEnd: input.periodEnd || null,
        currency: input.currency || null,
        unitCode: input.currency ? `CURRENCY:${input.currency}` : "MIXED_OR_CONTEXTUAL",
        roundingPolicyCode: "HALF_UP_2",
        metricDefinitionCodes: metricCodes,
        missingValuesPolicy: "NULL_IS_NOT_ZERO",
      },
      data: rawSnapshot,
    };
    const filters = { periodStart: input.periodStart || null, periodEnd: input.periodEnd || null, currency: input.currency || null, departmentId: input.departmentId || null, supplierId: input.supplierId || null, budgetId: input.budgetId || null, category: input.category || null };
    const report = await tx.enterpriseReport.create({ data: { organizationId, reference: reportReference(), title: input.title, description: nullable(input.description), reportType: input.reportType, status: "GENERATED", periodStart: dateOrUndefined(input.periodStart) || null, periodEnd: dateOrUndefined(input.periodEnd) || null, currency: nullable(input.currency), unitCode: input.currency ? `CURRENCY:${input.currency}` : null, roundingPolicyCode: "HALF_UP_2", sourcePolicyCode: catalog?.sourcePolicyCode || "CANONICAL_ENTERPRISE_DATA", metricDefinitionCodesJson: metricCodes as Prisma.InputJsonValue, freshnessAt: generatedAt, generatedByUserId: actorUserId, generatedAt, sourceModule: source?.sourceModule || null, sourceEntityType: source?.sourceEntityType || null, sourceEntityId: source?.sourceEntityId || null, schemaVersion: 1, filtersJson: filters as Prisma.InputJsonValue, snapshotJson: snapshot as unknown as Prisma.InputJsonValue } });
    if (input.budgetId) await createEnterpriseLink(tx, { organizationId, sourceModule: "FINANCE_BUDGETS", sourceEntityType: "EnterpriseBudget", sourceEntityId: input.budgetId, targetModule: "REPORTS", targetEntityType: "EnterpriseReport", targetEntityId: report.id, linkType: "REPORT_SOURCE", createdById: actorUserId });
    if (source) await createEnterpriseLink(tx, { organizationId, sourceModule: source.sourceModule, sourceEntityType: source.sourceEntityType, sourceEntityId: source.sourceEntityId, targetModule: "REPORTS", targetEntityType: "EnterpriseReport", targetEntityId: report.id, linkType: "REPORT_SOURCE", createdById: actorUserId });
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseReport", entityId: report.id, eventType: "ENTERPRISE_REPORT_GENERATED", summary: "Rapport généré depuis les données ERP réelles.", actorUserId, toStatus: "GENERATED", metadata: { reportType: report.reportType, schemaVersion: report.schemaVersion, freshnessAt: generatedAt.toISOString(), metricCodes } });
    return report;
  });
}

export async function transitionEnterpriseReport(organizationId: string, reportId: string, actorUserId: string, input: ReportActionInput) {
  return prisma.$transaction(async (tx) => {
    const report = await tx.enterpriseReport.findFirst({ where: { id: reportId, organizationId, archivedAt: null } });
    if (!report) throw new EnterpriseCoreV2Error("Rapport introuvable.", 404, "REPORT_NOT_FOUND");
    const expected = input.action === "PUBLISH" ? "GENERATED" : report.status;
    if (input.action === "PUBLISH" && report.status !== "GENERATED") throw new EnterpriseCoreV2Error("Seul un rapport généré peut être publié.", 409, "INVALID_REPORT_TRANSITION");
    if (input.action === "ARCHIVE" && report.status === "ARCHIVED") throw new EnterpriseCoreV2Error("Ce rapport est déjà archivé.", 409, "INVALID_REPORT_TRANSITION");
    const updated = await tx.enterpriseReport.updateMany({ where: { id: reportId, organizationId, status: expected, revision: input.revision, archivedAt: null }, data: { status: input.action === "PUBLISH" ? "PUBLISHED" : "ARCHIVED", ...(input.action === "ARCHIVE" ? { archivedAt: new Date() } : {}), revision: { increment: 1 } } });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("Le rapport a été modifié simultanément.", 409, "REVISION_CONFLICT");
    await addEnterpriseOperationalEvent(tx, { organizationId, entityType: "EnterpriseReport", entityId: reportId, eventType: input.action === "PUBLISH" ? "ENTERPRISE_REPORT_PUBLISHED" : "ENTERPRISE_REPORT_ARCHIVED", summary: input.action === "PUBLISH" ? "Rapport publié." : "Rapport archivé.", actorUserId, fromStatus: report.status, toStatus: input.action === "PUBLISH" ? "PUBLISHED" : "ARCHIVED" });
    return tx.enterpriseReport.findFirst({ where: { id: reportId, organizationId } });
  });
}
