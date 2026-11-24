import { Prisma } from "@prisma/client";
import { datedReconciliationBalanceTx, reconciliationTreasuryWindow } from "@/lib/enterprise/accounting/reconciliation-dated-balance";
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
  const window = await reconciliationTreasuryWindow(tx,organizationId,session.periodStart,session.periodEnd);
  const bookBalance = await datedReconciliationBalanceTx(tx,organizationId,session.financialAccountId,session.periodStart,session.periodEnd,session.id);
  if(!bookBalance.equals(session.bookBalance)) throw new EnterpriseAccountingError("RECONCILIATION_BOOK_BALANCE_UNVERIFIED",409);
  if (await tx.enterpriseReconciliationMatch.findFirst({where:{organizationId,reconciliationSessionId:session.id,status:"CONFIRMED"},select:{id:true}})) throw new EnterpriseAccountingError("RECONCILIATION_LEGACY_REVIEW_REQUIRED",409);
  const [lines,transactions,allocations] = await Promise.all([
    tx.enterpriseBankStatementLine.findMany({where:{organizationId,bankStatementId:statement.id},select:{id:true,debit:true,credit:true,currencyCode:true,reconciliationStatus:true}}),
    tx.enterpriseTreasuryTransaction.findMany({where:{organizationId,financialAccountId:session.financialAccountId,status:"CONFIRMED",transactionDate:window},select:{id:true,amount:true,direction:true,currencyCode:true,paymentId:true,reconciliationStatus:true}}),
    tx.enterpriseReconciliationMatch.findMany({where:{organizationId,reconciliationSessionId:session.id,status:"RESERVED"},select:{bankStatementLineId:true,treasuryTransactionId:true,paymentId:true,matchedAmount:true}}),
  ]);
  if(!lines.length || lines.some(line=>line.reconciliationStatus!=="UNMATCHED") || transactions.some(transaction=>transaction.reconciliationStatus!=="UNRECONCILED")) throw new EnterpriseAccountingError("RECONCILIATION_EVIDENCE_REQUIRED",409);
  const paymentIds=[...new Set(transactions.flatMap(transaction=>transaction.paymentId?[transaction.paymentId]:[]))].sort();
  for(const id of paymentIds) await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`);
  const payments=await tx.enterprisePayment.findMany({where:{organizationId,financialAccountId:session.financialAccountId,id:{in:paymentIds},status:"CONFIRMED"},select:{id:true,amount:true,currencyCode:true,direction:true}});
  const paymentMap=new Map(payments.map(payment=>[payment.id,payment]));
  const paymentTotals=new Map<string,Prisma.Decimal>();
  const lineMap = new Map(lines.map(line=>[line.id,line]));
  const transactionMap = new Map(transactions.map(transaction=>[transaction.id,transaction]));
  const lineTotals = new Map<string,Prisma.Decimal>(), transactionTotals = new Map<string,Prisma.Decimal>();
  for(const allocation of allocations) {
    const line = allocation.bankStatementLineId ? lineMap.get(allocation.bankStatementLineId) : null;
    const transaction = allocation.treasuryTransactionId ? transactionMap.get(allocation.treasuryTransactionId) : null;
    if(!line || !transaction || !allocation.matchedAmount.greaterThan(0) || line.currencyCode !== transaction.currencyCode || (line.credit.greaterThan(0)&&line.debit.isZero()?"INBOUND":line.debit.greaterThan(0)&&line.credit.isZero()?"OUTBOUND":null)!==transaction.direction) throw new EnterpriseAccountingError("RECONCILIATION_EVIDENCE_REQUIRED",409);
    if((allocation.paymentId||null)!==(transaction.paymentId||null)) throw new EnterpriseAccountingError("RECONCILIATION_EVIDENCE_REQUIRED",409);
    if(transaction.paymentId){const payment=paymentMap.get(transaction.paymentId);if(!payment||payment.direction!==transaction.direction||payment.currencyCode!==transaction.currencyCode)throw new EnterpriseAccountingError("RECONCILIATION_EVIDENCE_REQUIRED",409);paymentTotals.set(payment.id,paymentTotals.get(payment.id)?.plus(allocation.matchedAmount)||allocation.matchedAmount);}
    lineTotals.set(line.id,lineTotals.get(line.id)?.plus(allocation.matchedAmount) || allocation.matchedAmount);
    transactionTotals.set(transaction.id,transactionTotals.get(transaction.id)?.plus(allocation.matchedAmount) || allocation.matchedAmount);
  }
  if(payments.length!==paymentIds.length || payments.some(payment=>!paymentTotals.get(payment.id)?.equals(payment.amount)) || lines.some(line=>!lineTotals.get(line.id)?.equals(line.credit.greaterThan(0)?line.credit:line.debit)) || transactions.some(transaction=>!transactionTotals.get(transaction.id)?.equals(transaction.amount))) throw new EnterpriseAccountingError("RECONCILIATION_EVIDENCE_REQUIRED",409);
}

/** Only called in the same serializable transaction after complete coverage is proven. */
export async function finalizeReconciliationEvidenceTx(tx:Prisma.TransactionClient,organizationId:string,session:{id:string;bankStatementId:string|null;financialAccountId:string}){
  if(!session.bankStatementId)return;
  const reserved=await tx.enterpriseReconciliationMatch.findMany({where:{organizationId,reconciliationSessionId:session.id,status:"RESERVED"},select:{bankStatementLineId:true,treasuryTransactionId:true,paymentId:true}});
  const ids=(key:"bankStatementLineId"|"treasuryTransactionId"|"paymentId")=>[...new Set(reserved.flatMap(match=>match[key]?[match[key]!]:[]))];
  const lineIds=ids("bankStatementLineId"),transactionIds=ids("treasuryTransactionId"),paymentIds=ids("paymentId");
  const lines=await tx.enterpriseBankStatementLine.updateMany({where:{organizationId,bankStatementId:session.bankStatementId,id:{in:lineIds},reconciliationStatus:"UNMATCHED"},data:{reconciliationStatus:"MATCHED"}});
  const transactions=await tx.enterpriseTreasuryTransaction.updateMany({where:{organizationId,financialAccountId:session.financialAccountId,id:{in:transactionIds},status:"CONFIRMED",reconciliationStatus:"UNRECONCILED"},data:{reconciliationStatus:"RECONCILED"}});
  const payments=await tx.enterprisePayment.updateMany({where:{organizationId,financialAccountId:session.financialAccountId,id:{in:paymentIds},status:"CONFIRMED"},data:{status:"RECONCILED",reconciledAt:new Date(),revision:{increment:1}}});
  if(lines.count!==lineIds.length||transactions.count!==transactionIds.length||payments.count!==paymentIds.length)throw new EnterpriseAccountingError("RECONCILIATION_EVIDENCE_REQUIRED",409);
  await tx.enterpriseReconciliationMatch.updateMany({where:{organizationId,reconciliationSessionId:session.id,status:"RESERVED"},data:{status:"CONFIRMED",confirmedAt:new Date()}});
}
