import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { formatEnterpriseBusinessDate, getEnterpriseBusinessContext } from "@/lib/enterprise/business-context";
import { civilMidnightUtc, followingCivilDate } from "@/lib/enterprise/retail/civil-date";

type Db = Pick<Prisma.TransactionClient,"organization"|"enterpriseFinanceConfiguration">;
export async function reconciliationTreasuryWindow(db: Db, organizationId: string, periodStart: Date, periodEnd: Date) {
  const {timezone} = await getEnterpriseBusinessContext(db, organizationId);
  const first = formatEnterpriseBusinessDate(periodStart,"UTC");
  const last = formatEnterpriseBusinessDate(periodEnd,"UTC");
  return {gte:civilMidnightUtc(first,timezone),lt:civilMidnightUtc(followingCivilDate(last),timezone)};
}

/** Reconstruct the operational book balance, not the current wallet balance.
 * Historical in-place reversals inside the selected period need a separate
 * movement representation; refuse certification rather than invent it. */
export async function datedReconciliationBalanceTx(tx: Prisma.TransactionClient, organizationId: string, financialAccountId: string, periodStart: Date, periodEnd: Date, sessionId?: string) {
  await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFinancialAccount" WHERE id = ${financialAccountId} AND "organizationId" = ${organizationId} FOR UPDATE`);
  const account = await tx.enterpriseFinancialAccount.findFirst({where:{id:financialAccountId,organizationId,status:"ACTIVE",archivedAt:null}});
  if(!account || !["BANK","MOBILE_MONEY"].includes(account.accountType)) throw new EnterpriseAccountingError("RECONCILIATION_ACCOUNT_INVALID",409);
  const window = await reconciliationTreasuryWindow(tx,organizationId,periodStart,periodEnd);
  const previous = await tx.enterpriseReconciliationSession.findFirst({where:{organizationId,financialAccountId,status:"COMPLETED",...(sessionId?{id:{not:sessionId}}:{}),periodEnd:{gte:periodStart}},select:{id:true}});
  if(previous) throw new EnterpriseAccountingError("RECONCILIATION_PERIOD_MISMATCH",409);
  if(await tx.enterpriseTreasuryTransaction.findFirst({where:{organizationId,financialAccountId,status:"REVERSED",OR:[{reversedAt:null},{reversedAt:window},{transactionDate:window}]},select:{id:true}})) throw new EnterpriseAccountingError("RECONCILIATION_HISTORICAL_REVERSAL_REVIEW_REQUIRED",409);
  const groups = await tx.enterpriseTreasuryTransaction.groupBy({by:["direction","currencyCode"],where:{organizationId,financialAccountId,status:"CONFIRMED"},_sum:{amount:true}});
  const past = await tx.enterpriseTreasuryTransaction.groupBy({by:["direction","currencyCode"],where:{organizationId,financialAccountId,transactionDate:{lt:window.lt},OR:[{status:"CONFIRMED"},{status:"REVERSED",reversedAt:{gte:window.lt}}]},_sum:{amount:true}});
  function balance(rows: typeof groups) {
    let result = account!.openingBalance;
    for(const row of rows) {
      if(row.currencyCode !== account!.currencyCode || !["INBOUND","OUTBOUND"].includes(row.direction)) throw new EnterpriseAccountingError("RECONCILIATION_EVIDENCE_REQUIRED",409);
      const amount = row._sum.amount || new Prisma.Decimal(0);
      result = row.direction === "INBOUND" ? result.plus(amount) : result.minus(amount);
    }
    return result;
  }
  if(!balance(groups).equals(account.operationalBalance)) throw new EnterpriseAccountingError("RECONCILIATION_BOOK_BALANCE_UNVERIFIED",409);
  return balance(past);
}
