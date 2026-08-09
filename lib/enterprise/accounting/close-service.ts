import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent, serializeFinanceValue } from "@/lib/enterprise/accounting/helpers";

export async function calculateFinancialCloseChecklist(organizationId: string, fiscalPeriodId: string) {
  const period = await prisma.enterpriseFiscalPeriod.findFirst({ where: { id: fiscalPeriodId, organizationId }, include: { fiscalYear: true } });
  if (!period) throw new EnterpriseAccountingError("FISCAL_PERIOD_NOT_FOUND", 404);
  const [unbalancedRows, journalDrafts, failedPostings, openCashSessions, openReconciliations, salesDrafts, supplierDrafts, unreconciledTreasury, approvedPayrollRows, clearingRows] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "EnterpriseJournalEntry" WHERE "organizationId" = ${organizationId} AND status = 'POSTED' AND "accountingDate" BETWEEN ${period.startDate} AND ${period.endDate} AND "totalDebit" <> "totalCredit"`),
    prisma.enterpriseJournalEntry.count({ where: { organizationId, accountingDate: { gte: period.startDate, lte: period.endDate }, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } } }),
    prisma.enterprisePostingBatch.count({ where: { organizationId, createdAt: { gte: period.startDate, lte: period.endDate }, status: "FAILED" } }),
    prisma.enterpriseCashSession.count({ where: { organizationId, openedAt: { lte: period.endDate }, status: { in: ["OPEN", "CLOSING", "PENDING_VALIDATION"] } } }),
    prisma.enterpriseReconciliationSession.count({ where: { organizationId, periodEnd: { lte: period.endDate }, status: { not: "COMPLETED" } } }),
    prisma.enterpriseSalesInvoice.count({ where: { organizationId, invoiceDate: { gte: period.startDate, lte: period.endDate }, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } } }),
    prisma.enterpriseSupplierInvoice.count({ where: { organizationId, invoiceDate: { gte: period.startDate, lte: period.endDate }, status: { in: ["DRAFT", "PENDING_REVIEW", "PENDING_APPROVAL", "APPROVED"] } } }),
    prisma.enterpriseTreasuryTransaction.count({ where: { organizationId, transactionDate: { gte: period.startDate, lte: period.endDate }, status: "CONFIRMED", reconciliationStatus: "UNRECONCILED" } }),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "EnterprisePayrollRun" run
      INNER JOIN "EnterprisePayrollPeriod" period
        ON period.id = run."payrollPeriodId"
        AND period."organizationId" = run."organizationId"
      WHERE run."organizationId" = ${organizationId}
        AND run.status = 'APPROVED'
        AND period."periodStart" <= ${period.endDate}
        AND period."periodEnd" >= ${period.startDate}
        AND NOT EXISTS (
          SELECT 1
          FROM "EnterpriseJournalEntry" entry
          WHERE entry."organizationId" = run."organizationId"
            AND entry."sourceEntityType" = 'EnterprisePayrollRun'
            AND entry."sourceEntityId" = run.id
            AND entry."postingEvent" = 'PAYROLL_APPROVED'
            AND entry.status = 'POSTED'
        )
    `),
    prisma.$queryRaw<Array<{ accountId: string; balance: Prisma.Decimal }>>(Prisma.sql`
      SELECT a.id AS "accountId", COALESCE(SUM(l.debit - l.credit), 0) AS balance
      FROM "EnterpriseLedgerAccount" a
      LEFT JOIN "EnterpriseJournalLine" l ON l."ledgerAccountId" = a.id AND l."organizationId" = a."organizationId"
      LEFT JOIN "EnterpriseJournalEntry" e ON e.id = l."journalEntryId" AND e."organizationId" = l."organizationId" AND e.status = 'POSTED' AND e."accountingDate" <= ${period.endDate}
      WHERE a."organizationId" = ${organizationId} AND a."accountSubtype" = 'CLEARING'
      GROUP BY a.id
      HAVING ABS(COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.debit - l.credit ELSE 0 END), 0)) > 0.000001
    `),
  ]);
  const blockers = {
    unbalancedPostedEntries: Number(unbalancedRows[0]?.count || 0),
    criticalJournalDrafts: journalDrafts,
    failedPostingBatches: failedPostings,
    openCashSessions,
    pendingReconciliations: openReconciliations,
    nonFinalSalesInvoices: salesDrafts,
    nonFinalSupplierInvoices: supplierDrafts,
    unreconciledTreasuryTransactions: unreconciledTreasury,
    approvedPayrollRuns: Number(approvedPayrollRows[0]?.count || 0),
    unresolvedClearingAccounts: clearingRows.length,
  };
  const checklist = {
    balancedEntries: blockers.unbalancedPostedEntries === 0,
    noCriticalDrafts: blockers.criticalJournalDrafts === 0,
    postingErrorsResolved: blockers.failedPostingBatches === 0,
    cashClosed: blockers.openCashSessions === 0,
    reconciliationsComplete: blockers.pendingReconciliations === 0 && blockers.unreconciledTreasuryTransactions === 0,
    invoicesFinalized: blockers.nonFinalSalesInvoices === 0 && blockers.nonFinalSupplierInvoices === 0,
    payrollReviewed: blockers.approvedPayrollRuns === 0,
    clearingAccountsResolved: blockers.unresolvedClearingAccounts === 0,
  };
  return { period, checklist, blockers, ready: Object.values(checklist).every(Boolean) };
}

export async function prepareFinancialClose(organizationId: string, fiscalPeriodId: string, actorUserId: string) {
  const result = await calculateFinancialCloseChecklist(organizationId, fiscalPeriodId);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseFinancialClose.findFirst({ where: { organizationId, fiscalPeriodId, status: { notIn: ["REJECTED", "REOPENED"] } } });
    if (existing) return existing;
    const close = await tx.enterpriseFinancialClose.create({ data: { organizationId, fiscalPeriodId, status: "DRAFT", checklistJson: serializeFinanceValue(result.checklist) as Prisma.InputJsonValue, blockersJson: serializeFinanceValue(result.blockers) as Prisma.InputJsonValue, requestedByUserId: actorUserId } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseFinancialClose", entityId: close.id, eventType: "FINANCIAL_CLOSE_PREPARED", summary: `Close prepared for ${result.period.code}`, actorUserId, toStatus: "DRAFT", metadataJson: { ready: result.ready } });
    return close;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function transitionFinancialClose(
  organizationId: string,
  closeId: string,
  actorUserId: string,
  input: { action: "SUBMIT" | "APPROVE" | "CLOSE" | "REOPEN"; reason?: string; revision: number },
) {
  if (input.action === "SUBMIT") {
    const close = await prisma.enterpriseFinancialClose.findFirst({ where: { id: closeId, organizationId } });
    if (!close) throw new EnterpriseAccountingError("FINANCIAL_CLOSE_NOT_FOUND", 404);
    const fresh = await calculateFinancialCloseChecklist(organizationId, close.fiscalPeriodId);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFinancialClose" WHERE id = ${closeId} AND "organizationId" = ${organizationId} FOR UPDATE`);
      const current = await tx.enterpriseFinancialClose.findFirst({ where: { id: closeId, organizationId } });
      if (!current || current.status !== "DRAFT" || current.revision !== input.revision) throw new EnterpriseAccountingError("FINANCIAL_CLOSE_CONFLICT", 409);
      const updated = await tx.enterpriseFinancialClose.update({ where: { id: current.id }, data: { status: fresh.ready ? "PENDING_APPROVAL" : "BLOCKED", checklistJson: serializeFinanceValue(fresh.checklist) as Prisma.InputJsonValue, blockersJson: serializeFinanceValue(fresh.blockers) as Prisma.InputJsonValue, requestedAt: new Date(), revision: { increment: 1 } } });
      await tx.enterpriseFiscalPeriod.update({ where: { id: current.fiscalPeriodId }, data: { status: fresh.ready ? "SOFT_CLOSED" : "OPEN", softClosedAt: fresh.ready ? new Date() : null, updatedByUserId: actorUserId, revision: { increment: 1 } } });
      await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseFinancialClose", entityId: current.id, eventType: fresh.ready ? "FINANCIAL_CLOSE_SUBMITTED" : "FINANCIAL_CLOSE_BLOCKED", summary: fresh.ready ? "Financial close submitted" : "Financial close blocked", actorUserId, fromStatus: current.status, toStatus: updated.status, metadataJson: { blockers: fresh.blockers } as Prisma.InputJsonValue });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFinancialClose" WHERE id = ${closeId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const close = await tx.enterpriseFinancialClose.findFirst({ where: { id: closeId, organizationId }, include: { fiscalPeriod: true } });
    if (!close) throw new EnterpriseAccountingError("FINANCIAL_CLOSE_NOT_FOUND", 404);
    if (close.revision !== input.revision) throw new EnterpriseAccountingError("FINANCIAL_CLOSE_REVISION_CONFLICT", 409, { currentRevision: close.revision });
    if (input.action === "APPROVE") {
      if (close.status !== "PENDING_APPROVAL") throw new EnterpriseAccountingError("FINANCIAL_CLOSE_NOT_SUBMITTED", 409);
      assertIndependentActor({ actorUserId, relatedUserIds: [close.requestedByUserId], errorCode: "FINANCIAL_CLOSE_SELF_APPROVAL_FORBIDDEN" });
      const updated = await tx.enterpriseFinancialClose.update({ where: { id: close.id }, data: { status: "APPROVED", approvedByUserId: actorUserId, approvedAt: new Date(), revision: { increment: 1 } } });
      await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseFinancialClose", entityId: close.id, eventType: "FINANCIAL_CLOSE_APPROVED", summary: `Close approved for ${close.fiscalPeriod.code}`, actorUserId, fromStatus: close.status, toStatus: "APPROVED" });
      return updated;
    }
    if (input.action === "CLOSE") {
      if (close.status !== "APPROVED") throw new EnterpriseAccountingError("FINANCIAL_CLOSE_NOT_APPROVED", 409);
      assertIndependentActor({ actorUserId, relatedUserIds: [close.requestedByUserId], errorCode: "FINANCIAL_CLOSE_SELF_CLOSE_FORBIDDEN" });
      const freshUnbalanced = await tx.enterpriseJournalEntry.count({ where: { organizationId, fiscalPeriodId: close.fiscalPeriodId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } } });
      if (freshUnbalanced > 0) throw new EnterpriseAccountingError("FINANCIAL_CLOSE_NEW_BLOCKERS", 409);
      const updated = await tx.enterpriseFinancialClose.update({ where: { id: close.id }, data: { status: "CLOSED", closedByUserId: actorUserId, closedAt: new Date(), revision: { increment: 1 } } });
      await tx.enterpriseFiscalPeriod.update({ where: { id: close.fiscalPeriodId }, data: { status: "CLOSED", closedAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } } });
      await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseFinancialClose", entityId: close.id, eventType: "FINANCIAL_CLOSE_COMPLETED", summary: `Period ${close.fiscalPeriod.code} closed`, actorUserId, fromStatus: close.status, toStatus: "CLOSED" });
      return updated;
    }
    if (input.action === "REOPEN") {
      if (close.status !== "CLOSED" || close.fiscalPeriod.status === "LOCKED") throw new EnterpriseAccountingError("FINANCIAL_PERIOD_NOT_REOPENABLE", 409);
      if (!input.reason) throw new EnterpriseAccountingError("FINANCIAL_REOPEN_REASON_REQUIRED", 409);
      assertIndependentActor({ actorUserId, relatedUserIds: [close.requestedByUserId, close.closedByUserId], errorCode: "FINANCIAL_CLOSE_SELF_REOPEN_FORBIDDEN" });
      const updated = await tx.enterpriseFinancialClose.update({ where: { id: close.id }, data: { status: "REOPENED", reopenedAt: new Date(), reopenReason: input.reason, revision: { increment: 1 } } });
      await tx.enterpriseFiscalPeriod.update({ where: { id: close.fiscalPeriodId }, data: { status: "OPEN", reopenedAt: new Date(), reopenedReason: input.reason, updatedByUserId: actorUserId, revision: { increment: 1 } } });
      await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseFinancialClose", entityId: close.id, eventType: "FINANCIAL_PERIOD_REOPENED", summary: `Period ${close.fiscalPeriod.code} reopened`, actorUserId, fromStatus: "CLOSED", toStatus: "REOPENED", metadataJson: { reason: input.reason.slice(0, 500) } });
      return updated;
    }
    throw new EnterpriseAccountingError("FINANCIAL_CLOSE_ACTION_INVALID", 400);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
