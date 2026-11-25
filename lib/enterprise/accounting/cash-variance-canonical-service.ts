import { Prisma } from "@prisma/client";
import type { EnterpriseCashDiscrepancy, EnterpriseCashSession } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { idempotencyKey, money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { cashVarianceCanonicalProofMatches } from "@/lib/enterprise/accounting/cash-variance-canonical-proof";
import { formatEnterpriseBusinessDate, getEnterpriseBusinessContext } from "@/lib/enterprise/business-context";
import { fundingPostingEvent, paymentPostingEvent } from "@/lib/enterprise/accounting/source-posting-events";

export async function resolveCashVarianceCanonicalProofTx(
  tx: Prisma.TransactionClient, organizationId: string,
  session: EnterpriseCashSession, discrepancy: EnterpriseCashDiscrepancy,
  transactionId: string, actorUserId: string, lock = false,
) {
  let transaction = await tx.enterpriseTreasuryTransaction.findFirst({where:{organizationId,id:transactionId},include:{payment:true,fundingOperation:true}});
  if(lock && transaction) {
    if(transaction.paymentId) await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id=${transaction.paymentId} AND "organizationId"=${organizationId} FOR UPDATE`);
    if(transaction.fundingOperationId) await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFundingOperation" WHERE id=${transaction.fundingOperationId} AND "organizationId"=${organizationId} FOR UPDATE`);
    if(transaction.transferId) await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAccountTransfer" WHERE id=${transaction.transferId} AND "organizationId"=${organizationId} FOR UPDATE`);
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseTreasuryTransaction" WHERE id=${transactionId} AND "organizationId"=${organizationId} FOR UPDATE`);
    transaction = await tx.enterpriseTreasuryTransaction.findFirst({where:{organizationId,id:transactionId},include:{payment:true,fundingOperation:true}});
  }
  if (!transaction || !session.submittedAt) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
  const transfer = transaction.transferId ? await tx.enterpriseAccountTransfer.findFirst({where:{organizationId,id:transaction.transferId}}) : null;
  const source = transaction.fundingOperation || transaction.payment || transfer;
  if (!source || source.organizationId !== organizationId) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
  const sourceEntityType = transaction.fundingOperationId ? "EnterpriseFundingOperation" : transaction.paymentId ? "EnterprisePayment" : "EnterpriseAccountTransfer";
  const sourceFilter=transaction.fundingOperationId?{fundingOperationId:source.id}:transaction.paymentId?{paymentId:source.id}:{transferId:source.id};
  if(await tx.enterpriseTreasuryTransaction.count({where:{organizationId,financialAccountId:session.financialAccountId,...sourceFilter}})!==1) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
  // A corrected operation is booked through its own workflow after the count.
  // Never attach an already-counted movement or infer a source by reference text.
  const included = await tx.enterpriseCashMovement.findFirst({where:{organizationId,cashSessionId:session.id,
    OR:[...(transaction.paymentId?[{paymentId:transaction.paymentId}]:[]),...(transaction.fundingOperationId?[{fundingOperationId:transaction.fundingOperationId}]:[])]},select:{id:true}});
  if(lock) await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFinancialAccount" WHERE id=${session.financialAccountId} AND "organizationId"=${organizationId} FOR UPDATE`);
  const account = await tx.enterpriseFinancialAccount.findFirst({where:{organizationId,id:session.financialAccountId,status:"ACTIVE",archivedAt:null,accountType:"CASH"}});
  const {timezone} = await getEnterpriseBusinessContext(tx,organizationId);
  const sourceCount = Number(Boolean(transaction.paymentId))+Number(Boolean(transaction.fundingOperationId))+Number(Boolean(transaction.transferId));
  if (!account || (session.siteId && account.siteId !== session.siteId) || !cashVarianceCanonicalProofMatches({
    accountId:account.id,currencyCode:account.currencyCode,amount:discrepancy.amount,submittedAt:session.submittedAt,
    firstBusinessDate:formatEnterpriseBusinessDate(session.openedAt,timezone),lastBusinessDate:formatEnterpriseBusinessDate(session.submittedAt,timezone),
    transaction,transactionBusinessDate:formatEnterpriseBusinessDate(transaction.transactionDate,timezone),
    sourceStatus:source.status,confirmedAt:source.confirmedAt,alreadyIncluded:Boolean(included),sourceReferenceCount:sourceCount,
  })) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
  if (transaction.payment && (transaction.transactionType !== transaction.payment.paymentType || transaction.payment.financialAccountId !== account.id || transaction.payment.currencyCode !== account.currencyCode || !transaction.payment.amount.equals(transaction.amount) || transaction.payment.direction !== transaction.direction)) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
  if (transaction.fundingOperation && (transaction.transactionType !== "FUNDING" || transaction.direction !== "INBOUND" || transaction.fundingOperation.financialAccountId !== account.id || transaction.fundingOperation.currencyCode !== account.currencyCode || !transaction.fundingOperation.amount.equals(transaction.amount))) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
  if (transfer) {
    const inbound=transaction.direction === "INBOUND";
    if (transaction.transactionType !== "TRANSFER" || (inbound?transfer.targetFinancialAccountId:transfer.sourceFinancialAccountId)!==account.id || (inbound?transfer.targetCurrencyCode:transfer.sourceCurrencyCode)!==account.currencyCode || !(inbound?transfer.targetAmount:transfer.sourceAmount).equals(transaction.amount)) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
  }
  assertIndependentActor({actorUserId,relatedUserIds:[source.initiatedByUserId,source.approvedByUserId,transaction.createdByUserId,...("confirmedByUserId" in source?[source.confirmedByUserId]:[])],errorCode:"CASH_VARIANCE_REVIEW_FORBIDDEN"});
  const entries=await tx.enterpriseJournalEntry.findMany({where:{organizationId,sourceEntityType,sourceEntityId:source.id},include:{lines:true},take:2});
  const entry=entries[0];
  if(lock && entry) await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseJournalEntry" WHERE id=${entry.id} AND "organizationId"=${organizationId} FOR UPDATE`);
  if(entries.length!==1 || !entry || entry.status!=="POSTED" || entry.reversedAt || !entry.totalDebit.equals(entry.totalCredit) || entry.totalDebit.isZero()) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
  const postingEvent=transaction.fundingOperation?fundingPostingEvent(transaction.fundingOperation.fundingType):transaction.payment?paymentPostingEvent(transaction.payment.paymentType):null;
  const expectedKey=transfer?`${organizationId}:ACCOUNT_TRANSFER:${source.id}:1`:postingEvent?idempotencyKey({organizationId,sourceEntityType,sourceEntityId:source.id,postingEvent,postingVersion:1}):null;
  if(!expectedKey || entry.idempotencyKey!==expectedKey || (!transfer && entry.postingEvent!==postingEvent) || entry.postingVersion!==1 || entry.sourceModule!==(transaction.payment?"FINANCE_PAYMENTS":"FINANCE_TREASURY") || !entry.postedAt || entry.postedAt<=session.submittedAt) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
  assertIndependentActor({actorUserId,relatedUserIds:[entry.preparedByUserId,entry.approvedByUserId,entry.postedByUserId],errorCode:"CASH_VARIANCE_REVIEW_FORBIDDEN"});
  let journalCurrency = account.currencyCode;
  let journalAmount = transaction.amount;
  if (transfer) {
    // The transfer journal records both legs in functional currency.
    // The booked currency and amount must agree with the original FX snapshot.
    journalCurrency = entry.functionalCurrencyCode;
    journalAmount = transfer.sourceAmount;
    if (transfer.sourceCurrencyCode !== journalCurrency) {
      const rate = await tx.enterpriseExchangeRateSnapshot.findFirst({
        where: { organizationId, sourceEntityType, sourceEntityId: transfer.id, sourceCurrencyCode: transfer.sourceCurrencyCode, targetCurrencyCode: journalCurrency },
        select: { rate: true },
      });
      if (!rate?.rate.greaterThan(0)) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
      journalAmount = money(transfer.sourceAmount.times(rate.rate));
    }
  }
  const cashLines = entry.lines.filter(line => line.ledgerAccountId === account.ledgerAccountId);
  const [cashLine] = cashLines;
  if (cashLines.length !== 1 ||
    cashLine.transactionCurrencyCode !== journalCurrency ||
    !cashLine.transactionAmount?.abs().equals(journalAmount) ||
    (transfer && (cashLine.exchangeRate?.equals(1) !== true ||
      !cashLine.functionalAmount.equals(journalAmount) ||
      !(transaction.direction === "INBOUND" ? cashLine.debit : cashLine.credit).equals(journalAmount))) ||
    (transaction.direction === "INBOUND"
      ? !cashLine.debit.greaterThan(0) || !cashLine.credit.isZero()
      : !cashLine.credit.greaterThan(0) || !cashLine.debit.isZero())
  ) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
  if(await tx.enterpriseCashDiscrepancy.findFirst({where:{organizationId,canonicalTreasuryTransactionId:transaction.id,id:{not:discrepancy.id}},select:{id:true}})) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_ALREADY_USED",409);
  return {transaction,sourceEntityType,sourceEntityId:source.id,number:source.number,journalEntryId:entry.id};
}

export async function listCashVarianceCanonicalCandidates(organizationId:string,sessionId:string,actorUserId:string,page:number) {
  return prisma.$transaction(async tx=>{
    const session=await tx.enterpriseCashSession.findFirst({where:{organizationId,id:sessionId,status:"CLOSED"}});
    if(!session || !session.submittedAt) throw new EnterpriseAccountingError("CASH_SESSION_CONFLICT",409);
    const discrepancy=await tx.enterpriseCashDiscrepancy.findFirst({where:{organizationId,cashSessionId:session.id,status:"PENDING_QUALIFICATION"}});
    if(!discrepancy) return {items:[],hasMore:false};
    const rows=await tx.enterpriseTreasuryTransaction.findMany({where:{organizationId,financialAccountId:session.financialAccountId,status:"CONFIRMED",reversedAt:null,createdAt:{gt:session.submittedAt},amount:discrepancy.amount.abs(),direction:discrepancy.amount.isNegative()?"OUTBOUND":"INBOUND"},orderBy:[{createdAt:"desc"},{id:"asc"}],skip:(page-1)*20,take:21});
    const items=[];
    for(const row of rows.slice(0,20)) {
      try {
        const proof=await resolveCashVarianceCanonicalProofTx(tx,organizationId,session,discrepancy,row.id,actorUserId);
        items.push({id:row.id,number:proof.number,sourceEntityType:proof.sourceEntityType,amount:row.amount,currencyCode:row.currencyCode});
      } catch(error) { if(!(error instanceof EnterpriseAccountingError)) throw error; }
    }
    return {items,hasMore:rows.length>20};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:10000,timeout:30000});
}

/** Source corrections require an explicit independent unlink first. */
export async function assertNoCashVarianceCanonicalLinkTx(tx:Prisma.TransactionClient,organizationId:string,sourceEntityType:string,sourceEntityId:string) {
  const filter=sourceEntityType==="EnterpriseFundingOperation"?{fundingOperationId:sourceEntityId}:sourceEntityType==="EnterprisePayment"?{paymentId:sourceEntityId}:sourceEntityType==="EnterpriseAccountTransfer"?{transferId:sourceEntityId}:null;
  if(filter && await tx.enterpriseCashDiscrepancy.findFirst({where:{organizationId,status:"RESOLVED_CANONICAL",canonicalTreasuryTransaction:{is:{organizationId,...filter}}},select:{id:true}})) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_LINK_ACTIVE",409);
}

export async function recordCashVarianceCanonicalLinkTx(tx:Prisma.TransactionClient,organizationId:string,session:EnterpriseCashSession,discrepancy:EnterpriseCashDiscrepancy,actorUserId:string,input:{decision:string;canonicalTreasuryTransactionId?:string;verifiedCount:string;evidenceReference:string;reason:string}) {
  if(!session.countedClosingAmount?.equals(input.verifiedCount)) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
  if(input.decision==="UNLINK_CANONICAL") {
    if(discrepancy.status!=="RESOLVED_CANONICAL" || !discrepancy.canonicalTreasuryTransactionId || await tx.enterpriseReconciliationSession.findFirst({where:{organizationId,financialAccountId:session.financialAccountId,status:{in:["DRAFT","IN_PROGRESS","PENDING_VALIDATION","COMPLETED"]}},select:{id:true}})) throw new EnterpriseAccountingError("CASH_VARIANCE_REVIEW_CONFLICT",409);
  } else if(discrepancy.status!=="PENDING_QUALIFICATION" || discrepancy.journalEntryId || !input.canonicalTreasuryTransactionId || !session.countedClosingAmount?.equals(input.verifiedCount)) throw new EnterpriseAccountingError("CASH_VARIANCE_CANONICAL_PROOF_REQUIRED",409);
  const verifiedProof=await resolveCashVarianceCanonicalProofTx(tx,organizationId,session,discrepancy,input.decision==="LINK_CANONICAL"?input.canonicalTreasuryTransactionId!:discrepancy.canonicalTreasuryTransactionId!,actorUserId,true);
  const proof=input.decision==="LINK_CANONICAL"?verifiedProof:null;
  const result=await tx.enterpriseCashDiscrepancy.update({where:{id:discrepancy.id},data:{status:proof?"RESOLVED_CANONICAL":"PENDING_QUALIFICATION",canonicalTreasuryTransactionId:proof?.transaction.id||null,approvedByUserId:proof?actorUserId:null}});
  await tx.enterpriseCashSession.update({where:{id:session.id},data:{revision:{increment:1}}});
  await publishFinanceEvent(tx,{organizationId,entityType:"EnterpriseCashDiscrepancy",entityId:discrepancy.id,eventType:proof?"CASH_VARIANCE_CANONICAL_LINKED":"CASH_VARIANCE_CANONICAL_UNLINKED",summary:"Independent canonical cash evidence review",actorUserId,fromStatus:discrepancy.status,toStatus:result.status,metadataJson:{cashSessionId:session.id,treasuryTransactionId:verifiedProof.transaction.id,sourceEntityType:verifiedProof.sourceEntityType,sourceEntityId:verifiedProof.sourceEntityId,journalEntryId:verifiedProof.journalEntryId,reason:input.reason,evidenceReference:input.evidenceReference,verifiedCount:input.verifiedCount}});
  return {discrepancy:result,reversalEntryId:null,treasuryTransactionId:proof?.transaction.id||null};
}
