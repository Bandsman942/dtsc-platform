import type { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

/** Do not certify an equal balance without matching evidence. */
export async function assertReconciliationEvidenceTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  session: { id: string; financialAccountId: string; bankStatementId: string | null; periodStart: Date; periodEnd: Date },
) {
  if (!session.bankStatementId) throw new EnterpriseAccountingError("RECONCILIATION_EVIDENCE_REQUIRED", 409);
  const statement = await tx.enterpriseBankStatement.findFirst({
    where: { organizationId, id: session.bankStatementId, financialAccountId: session.financialAccountId, status: "IMPORTED" },
    select: { id: true, periodStart: true, periodEnd: true },
  });
  if (!statement || statement.periodStart.getTime() !== session.periodStart.getTime() || statement.periodEnd.getTime() !== session.periodEnd.getTime()) throw new EnterpriseAccountingError("RECONCILIATION_PERIOD_MISMATCH", 409);
  const [total, verified, unmatchedTransactions] = await Promise.all([
    tx.enterpriseBankStatementLine.count({ where: { organizationId, bankStatementId: statement.id } }),
    tx.enterpriseBankStatementLine.count({ where: { organizationId, bankStatementId: statement.id, reconciliationStatus: "MATCHED" } }),
    tx.enterpriseTreasuryTransaction.count({ where: { organizationId, financialAccountId: session.financialAccountId, status: "CONFIRMED", transactionDate: { gte: session.periodStart, lte: session.periodEnd }, reconciliationStatus: { not: "RECONCILED" } } }),
  ]);
  const distinctLines = await tx.enterpriseReconciliationMatch.groupBy({
    by: ["bankStatementLineId"],
    where: { organizationId, reconciliationSessionId: session.id, status: "CONFIRMED", bankStatementLineId: { not: null } },
  });
  if (!total || verified !== total || distinctLines.length !== total || unmatchedTransactions !== 0) throw new EnterpriseAccountingError("RECONCILIATION_EVIDENCE_REQUIRED", 409);
}
