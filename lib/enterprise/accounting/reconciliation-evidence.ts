import type { Prisma } from "@prisma/client";
import { assertCashPhysicalEvidenceTx } from "@/lib/enterprise/accounting/cash-physical-reconciliation";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

/** Do not certify an equal balance without matching evidence. */
export async function assertReconciliationEvidenceTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  session: { id: string; financialAccountId: string; bankStatementId: string | null; periodStart: Date; periodEnd: Date; physicalEvidenceJson: Prisma.JsonValue | null; bookBalance: Prisma.Decimal; statementBalance: Prisma.Decimal },
  actorUserId?: string,
) {
  if (!session.bankStatementId && session.physicalEvidenceJson) return assertCashPhysicalEvidenceTx(tx, organizationId, session, actorUserId);
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
  const [lines,transactions,allocations] = await Promise.all([
    tx.enterpriseBankStatementLine.findMany({where:{organizationId,bankStatementId:statement.id},select:{id:true,debit:true,credit:true,currencyCode:true}}),
    tx.enterpriseTreasuryTransaction.findMany({where:{organizationId,financialAccountId:session.financialAccountId,status:"CONFIRMED",transactionDate:{gte:session.periodStart,lte:session.periodEnd}},select:{id:true,amount:true,direction:true,currencyCode:true}}),
    tx.enterpriseReconciliationMatch.findMany({where:{organizationId,reconciliationSessionId:session.id,status:"CONFIRMED"},select:{bankStatementLineId:true,treasuryTransactionId:true,matchedAmount:true}}),
  ]);
  const lineMap = new Map(lines.map(line=>[line.id,line]));
  const transactionMap = new Map(transactions.map(transaction=>[transaction.id,transaction]));
  const lineTotals = new Map<string,Prisma.Decimal>(), transactionTotals = new Map<string,Prisma.Decimal>();
  for(const allocation of allocations) {
    const line = allocation.bankStatementLineId ? lineMap.get(allocation.bankStatementLineId) : null;
    const transaction = allocation.treasuryTransactionId ? transactionMap.get(allocation.treasuryTransactionId) : null;
    if(!line || !transaction || !allocation.matchedAmount.greaterThan(0) || line.currencyCode !== transaction.currencyCode || (line.credit.greaterThan(0)&&line.debit.isZero()?"INBOUND":line.debit.greaterThan(0)&&line.credit.isZero()?"OUTBOUND":null)!==transaction.direction) throw new EnterpriseAccountingError("RECONCILIATION_EVIDENCE_REQUIRED",409);
    lineTotals.set(line.id,lineTotals.get(line.id)?.plus(allocation.matchedAmount) || allocation.matchedAmount);
    transactionTotals.set(transaction.id,transactionTotals.get(transaction.id)?.plus(allocation.matchedAmount) || allocation.matchedAmount);
  }
  if(lines.some(line=>!lineTotals.get(line.id)?.equals(line.credit.greaterThan(0)?line.credit:line.debit)) || transactions.some(transaction=>!transactionTotals.get(transaction.id)?.equals(transaction.amount))) throw new EnterpriseAccountingError("RECONCILIATION_EVIDENCE_REQUIRED",409);
}
