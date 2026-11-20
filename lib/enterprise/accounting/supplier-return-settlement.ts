import { Prisma, type EnterpriseSupplierInvoice } from "@prisma/client";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";

const fail = (): never => { throw new EnterpriseDomainError("SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED", 409); };

/** Indicative settlement split for the exact historical credit (including
 * applicable tax). Not an allocation, a receivable or a posting permission.
 * Recompute within the invoice lock before any future settlement mutation. */
export function splitSupplierReturnSettlement(input: {
  creditTotal: Prisma.Decimal; outstandingAmount: Prisma.Decimal;
}) {
  const { creditTotal, outstandingAmount } = input;
  if (!creditTotal.isFinite() || !outstandingAmount.isFinite() ||
      !creditTotal.gt(0) || outstandingAmount.lt(0) ||
      creditTotal.decimalPlaces() > 6 || outstandingAmount.decimalPlaces() > 6) return fail();
  const payableReduction = Prisma.Decimal.min(creditTotal, outstandingAmount);
  const supplierClaim = creditTotal.minus(payableReduction);
  return { payableReduction, supplierClaim, remainingPayable: outstandingAmount.minus(payableReduction),
    requiresSupplierClaim: supplierClaim.gt(0) };
}

type InvoiceSettlement = Pick<EnterpriseSupplierInvoice, "id" | "organizationId" | "supplierId" | "businessPartyId" |
  "currencyCode" | "grandTotal" | "amountPaid" | "amountCredited" | "outstandingAmount">;

/** One source of truth for the preview and mutation preflight. Payment and
 * credit allocations are canonical; invoice/payable balances are projections.
 * This is proof of allocation totals, NOT proof of treasury receipt or a
 * recognized supplier claim. Caller holds a repeatable snapshot or invoice lock. */
export async function readSupplierReturnSettlementTx(
  tx: Prisma.TransactionClient, organizationId: string, invoice: InvoiceSettlement,
  creditTotal: Prisma.Decimal, currencyCode: string,
) {
  if (invoice.organizationId !== organizationId || invoice.currencyCode !== currencyCode) return fail();
  const payable = await tx.enterprisePayable.findFirst({ where: { organizationId, supplierInvoiceId: invoice.id } });
  if (!payable || payable.supplierId !== invoice.supplierId || payable.businessPartyId !== invoice.businessPartyId ||
      payable.currencyCode !== currencyCode || !payable.originalAmount.equals(invoice.grandTotal) ||
      !payable.allocatedAmount.equals(invoice.amountPaid) || !payable.creditedAmount.equals(invoice.amountCredited) ||
      !payable.outstandingAmount.equals(invoice.outstandingAmount) ||
      [payable.originalAmount, payable.allocatedAmount, payable.creditedAmount, payable.outstandingAmount].some(amount => !amount.isFinite() || amount.lt(0)) ||
      !payable.originalAmount.minus(payable.allocatedAmount).minus(payable.creditedAmount).equals(payable.outstandingAmount) ||
      payable.status !== (payable.outstandingAmount.isZero() ? "CLOSED" : "OPEN")) return fail();
  const [groups, invalid] = await Promise.all([
    tx.enterprisePayableAllocation.groupBy({ by: ["sourceType"], where: { organizationId, payableId: payable.id, status: "CONFIRMED", reversedAt: null, sourceType: { in: ["PAYMENT", "SUPPLIER_CREDIT_NOTE"] } }, _sum: { amount: true } }),
    tx.enterprisePayableAllocation.count({ where: { organizationId, payableId: payable.id, status: "CONFIRMED", OR: [
      { reversedAt: { not: null } }, { amount: { lte: 0 } }, { sourceType: { notIn: ["PAYMENT", "SUPPLIER_CREDIT_NOTE"] } },
    ] } }),
  ]);
  const total = (type: string) => groups.find(row => row.sourceType === type)?._sum.amount || new Prisma.Decimal(0);
  if (invalid || !total("PAYMENT").equals(payable.allocatedAmount) || !total("SUPPLIER_CREDIT_NOTE").equals(payable.creditedAmount)) return fail();
  return splitSupplierReturnSettlement({ creditTotal, outstandingAmount: payable.outstandingAmount });
}

/** Do not let a direct API caller create or approve an unfinanceable return.
 * The dispatch gate remains mandatory because payments may intervene later. */
export async function assertSupplierReturnSettlementCoveredTx(
  tx: Prisma.TransactionClient, organizationId: string, invoice: InvoiceSettlement,
  creditTotal: Prisma.Decimal, currencyCode: string,
) {
  const result = await readSupplierReturnSettlementTx(tx, organizationId, invoice, creditTotal, currencyCode);
  if (result.requiresSupplierClaim) throw new EnterpriseDomainError("SUPPLIER_RETURN_PAYABLE_INSUFFICIENT", 409);
  return result;
}

export const SUPPLIER_RETURN_CLAIM_MAPPING = "SUPPLIER_RETURN_CLAIMS";

type FrozenClaimPlan = {
  settlementPayableAmount: Prisma.Decimal | null;
  settlementClaimAmount: Prisma.Decimal | null;
  settlementClaimAccountId: string | null;
};

/** Explicit dedicated asset; no reuse of an advance or treasury account. */
export async function resolveSupplierReturnClaimAccountTx(tx: Prisma.TransactionClient, organizationId: string, currencyCode: string, accountingDate: Date) {
  const { resolveSemanticPostingAccount } = await import("@/lib/enterprise/accounting/semantic-account-resolver");
  const account = await resolveSemanticPostingAccount(tx, { organizationId, mappingKey: SUPPLIER_RETURN_CLAIM_MAPPING, accountingDate });
  if (!account.allowDirectPosting || (account.currencyCode && account.currencyCode !== currencyCode) ||
      await tx.enterpriseAccountMapping.count({where:{organizationId,ledgerAccountId:account.id,isActive:true,mappingKey:{not:SUPPLIER_RETURN_CLAIM_MAPPING}}}) ||
      await tx.enterpriseFinancialAccount.count({where:{organizationId,ledgerAccountId:account.id}})) return fail();
  return account.id;
}

async function proveClaimEligibilityTx(tx: Prisma.TransactionClient, organizationId: string, invoice: InvoiceSettlement, claimAmount: Prisma.Decimal, currencyCode: string, date: Date) {
  // A second claim needs cumulative provenance including future settlements.
  if (await tx.enterpriseSupplierReturnRequest.count({where:{organizationId,supplierInvoiceId:invoice.id,status:"RECONCILED",settlementClaimAmount:{gt:0}}})) {
    throw new EnterpriseDomainError("SUPPLIER_RETURN_PAYABLE_INSUFFICIENT",409);
  }
  const { proveSupplierReturnPaidAmountTx } = await import("@/lib/enterprise/accounting/supplier-return-payment-proof");
  const { EnterpriseAccountingError } = await import("@/lib/enterprise/accounting/errors");
  try {
    await proveSupplierReturnPaidAmountTx(tx,{organizationId,invoiceId:invoice.id,supplierId:invoice.supplierId,businessPartyId:invoice.businessPartyId,
      currencyCode,amountPaid:invoice.amountPaid,claimAmount});
    return await resolveSupplierReturnClaimAccountTx(tx,organizationId,currencyCode,date);
  } catch (error) {
    if (error instanceof EnterpriseAccountingError && error.status === 409) throw new EnterpriseDomainError("SUPPLIER_RETURN_PAYABLE_INSUFFICIENT",409);
    throw error;
  }
}

export async function prepareSupplierReturnClaimPlanTx(tx: Prisma.TransactionClient, organizationId: string, invoice: InvoiceSettlement, creditTotal: Prisma.Decimal, currencyCode: string, date: Date): Promise<FrozenClaimPlan> {
  const split = await readSupplierReturnSettlementTx(tx,organizationId,invoice,creditTotal,currencyCode);
  if (!split.requiresSupplierClaim) return {settlementPayableAmount:null,settlementClaimAmount:null,settlementClaimAccountId:null};
  const accountId=await proveClaimEligibilityTx(tx,organizationId,invoice,split.supplierClaim,currencyCode,date);
  return {settlementPayableAmount:split.payableReduction,settlementClaimAmount:split.supplierClaim,settlementClaimAccountId:accountId};
}

export async function assertFrozenSupplierReturnClaimPlanTx(tx: Prisma.TransactionClient, organizationId: string, invoice: InvoiceSettlement, creditTotal: Prisma.Decimal, currencyCode: string, date: Date, reviewed: Partial<FrozenClaimPlan>) {
  if (!reviewed.settlementClaimAmount?.gt(0)) {
    await assertSupplierReturnSettlementCoveredTx(tx,organizationId,invoice,creditTotal,currencyCode);
    return;
  }
  const split=await readSupplierReturnSettlementTx(tx,organizationId,invoice,creditTotal,currencyCode);
  if (!reviewed.settlementPayableAmount?.equals(split.payableReduction) || !reviewed.settlementClaimAmount.equals(split.supplierClaim) ||
      !split.requiresSupplierClaim || !reviewed.settlementClaimAccountId) return fail();
  const accountId=await proveClaimEligibilityTx(tx,organizationId,invoice,split.supplierClaim,currencyCode,date);
  if (accountId!==reviewed.settlementClaimAccountId) return fail();
}
