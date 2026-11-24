import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { reverseJournalEntryTx } from "@/lib/enterprise/accounting/reversal-service";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";

export type CashVarianceReviewInput = {
  discrepancyId: string; revision: number; evidenceReference: string; reason: string;
  verifiedCount: string; decision: "CORRECT_COUNT" | "REAL_VARIANCE"; attest: true;
};

/** The initial declaration is evidence, not a mutable cash balance. Review is separate,
 * independent and atomic; only a real, supported variance affects operational cash. */
export async function reviewCashVariance(organizationId: string, sessionId: string, actorUserId: string, input: CashVarianceReviewInput) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseCashSession" WHERE id = ${sessionId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const session = await tx.enterpriseCashSession.findFirst({ where: { organizationId, id: sessionId }, include: { financialAccount: true } });
    if (!session || session.status !== "CLOSED" || session.revision !== input.revision || session.expectedClosingAmount == null || session.countedClosingAmount == null) throw new EnterpriseAccountingError("CASH_SESSION_CONFLICT",409);
    const scope = await retailFinanceReadSiteScope(organizationId, actorUserId, "CLOSE_CASH", tx);
    if (scope !== null && (!session.siteId || !scope.includes(session.siteId))) throw new EnterpriseAccountingError("CASH_VARIANCE_REVIEW_FORBIDDEN",403);
    if (session.siteId && session.financialAccount.siteId && session.siteId !== session.financialAccount.siteId) throw new EnterpriseAccountingError("CASH_ACCOUNT_SITE_MISMATCH",409);
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseCashDiscrepancy" WHERE id = ${input.discrepancyId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const discrepancy = await tx.enterpriseCashDiscrepancy.findFirst({ where: { organizationId, id: input.discrepancyId, cashSessionId: session.id } });
    if (!discrepancy || !["PENDING_QUALIFICATION","APPROVED"].includes(discrepancy.status)) throw new EnterpriseAccountingError("CASH_VARIANCE_REVIEW_CONFLICT",409);
    assertIndependentActor({ actorUserId, relatedUserIds:[session.cashierUserId,session.validatedByUserId,discrepancy.createdByUserId,discrepancy.approvedByUserId], errorCode:"CASH_VARIANCE_REVIEW_FORBIDDEN" });
    if (discrepancy.amount.isZero() || !session.countedClosingAmount.minus(session.expectedClosingAmount).equals(discrepancy.amount)) throw new EnterpriseAccountingError("CASH_VARIANCE_REVIEW_CONFLICT",409);
    const verifiedCount = new Prisma.Decimal(input.verifiedCount);
    const originalEntries = await tx.enterpriseJournalEntry.findMany({ where: { organizationId, sourceEntityType: "EnterpriseCashDiscrepancy", sourceEntityId: discrepancy.id, postingEvent: "CASH_VARIANCE_POSTED" }, include: { lines: true }, take: 2 });
    const account = session.financialAccount;
    const adjustmentReference = "CASH-VARIANCE:" + discrepancy.id;
    let journalEntryId: string | null = null;
    let reversalEntryId: string | null = null;
    let treasuryTransactionId: string | null = null;
    let nextStatus: string;
    if (input.decision === "CORRECT_COUNT") {
      if (!verifiedCount.equals(session.expectedClosingAmount)) throw new EnterpriseAccountingError("CASH_VARIANCE_CORRECTED_COUNT_MISMATCH",409);
      if (discrepancy.status === "APPROVED") {
        // Legacy journals came from the old closing code, which did not create a treasury adjustment.
        // Refuse ambiguous source/linkage; the user must attest the corrected count/no cash movement.
        const original = originalEntries[0];
        if (originalEntries.length !== 1 || !original || original.status !== "POSTED" || original.sourceModule !== "FINANCE_CASH" || (discrepancy.journalEntryId && discrepancy.journalEntryId !== original.id) || original.lines.filter(line => line.ledgerAccountId === account.ledgerAccountId).length !== 1) throw new EnterpriseAccountingError("CASH_VARIANCE_LEGACY_PROOF_REQUIRED",409);
        const cashLine = original.lines.find(line => line.ledgerAccountId === account.ledgerAccountId)!;
        if (cashLine.transactionCurrencyCode !== account.currencyCode || !cashLine.transactionAmount?.abs().equals(discrepancy.amount.abs())) throw new EnterpriseAccountingError("CASH_VARIANCE_LEGACY_PROOF_REQUIRED",409);
        if (await tx.enterpriseTreasuryTransaction.findFirst({ where: { organizationId, financialAccountId: account.id, reference: { in:[adjustmentReference, original.number] } }, select: { id: true } })) throw new EnterpriseAccountingError("CASH_VARIANCE_LEGACY_PROOF_REQUIRED",409);
        assertIndependentActor({ actorUserId, relatedUserIds:[original.preparedByUserId,original.approvedByUserId,original.postedByUserId], errorCode:"JOURNAL_ENTRY_SELF_REVERSAL_FORBIDDEN" });
        const reversal = await reverseJournalEntryTx(tx, organizationId, original.id, actorUserId, {reason:input.reason, accountingDate:new Date()}, {authorization:"CASH_VARIANCE_REVIEW"});
        journalEntryId = original.id; reversalEntryId = reversal.id; nextStatus = "LEGACY_REVERSED";
      } else {
        if (originalEntries.length || discrepancy.journalEntryId) throw new EnterpriseAccountingError("CASH_VARIANCE_LEGACY_PROOF_REQUIRED",409);
        nextStatus = "RESOLVED_COUNT_ERROR";
      }
    } else {
      if (discrepancy.status !== "PENDING_QUALIFICATION" || originalEntries.length || discrepancy.journalEntryId || !verifiedCount.equals(session.countedClosingAmount)) throw new EnterpriseAccountingError("CASH_VARIANCE_REVIEW_CONFLICT",409);
      if (account.status !== "ACTIVE" || account.archivedAt || account.accountType !== "CASH") throw new EnterpriseAccountingError("CASH_ACCOUNT_INVALID",409);
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFinancialAccount" WHERE id = ${account.id} AND "organizationId" = ${organizationId} FOR UPDATE`);
      const freshAccount = await tx.enterpriseFinancialAccount.findFirstOrThrow({where:{organizationId,id:account.id}});
      if (freshAccount.status !== "ACTIVE" || freshAccount.archivedAt || freshAccount.operationalBalance.plus(discrepancy.amount).isNegative()) throw new EnterpriseAccountingError("CASH_VARIANCE_REVIEW_CONFLICT",409);
      if (await tx.enterpriseTreasuryTransaction.findFirst({where:{organizationId,financialAccountId:account.id,reference:adjustmentReference},select:{id:true}})) throw new EnterpriseAccountingError("CASH_VARIANCE_REVIEW_CONFLICT",409);
      await tx.enterpriseCashDiscrepancy.update({where:{id:discrepancy.id},data:{status:"QUALIFIED_REAL",approvedByUserId:actorUserId}});
      const posting = await postBusinessEventTx(tx,organizationId,actorUserId,{postingEvent:"CASH_VARIANCE_POSTED",sourceEntityType:"EnterpriseCashDiscrepancy",sourceEntityId:discrepancy.id},{cashVarianceQualification:true});
      if (posting.idempotent) throw new EnterpriseAccountingError("CASH_VARIANCE_REVIEW_CONFLICT",409);
      journalEntryId = posting.entry.id;
      await tx.enterpriseFinancialAccount.update({where:{id:account.id},data:{operationalBalance:{increment:discrepancy.amount},revision:{increment:1}}});
      const movement = await tx.enterpriseTreasuryTransaction.create({data:{organizationId,financialAccountId:account.id,transactionType:"CASH_VARIANCE",direction:discrepancy.amount.isNegative()?"OUTBOUND":"INBOUND",currencyCode:account.currencyCode,amount:discrepancy.amount.abs(),transactionDate:new Date(),reference:adjustmentReference,createdByUserId:actorUserId}});
      treasuryTransactionId = movement.id; nextStatus = "POSTED";
    }
    const result = await tx.enterpriseCashDiscrepancy.update({where:{id:discrepancy.id},data:{status:nextStatus,approvedByUserId:actorUserId,journalEntryId}});
    // The historical count, expected balance and original store close remain immutable.
    await tx.enterpriseCashSession.update({where:{id:session.id},data:{revision:{increment:1}}});
    await publishFinanceEvent(tx,{organizationId,entityType:"EnterpriseCashDiscrepancy",entityId:discrepancy.id,eventType:"CASH_VARIANCE_REVIEWED",summary:"Independent cash variance review",actorUserId,fromStatus:discrepancy.status,toStatus:nextStatus,metadataJson:{cashSessionId:session.id,decision:input.decision,reason:input.reason,evidenceReference:input.evidenceReference,verifiedCount:verifiedCount.toFixed(),originalCount:session.countedClosingAmount.toFixed(),expectedCount:session.expectedClosingAmount.toFixed(),journalEntryId,reversalEntryId,treasuryTransactionId}});
    return { discrepancy: result, reversalEntryId, treasuryTransactionId };
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:30000});
}
