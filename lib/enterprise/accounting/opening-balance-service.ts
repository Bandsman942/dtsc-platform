import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";

export async function createOpeningBalanceImport(
  organizationId: string,
  actorUserId: string,
  input: {
    fiscalPeriodId: string;
    currencyCode: string;
    reference?: string;
    description?: string;
    privateDocumentId?: string;
    lines: Array<{ ledgerAccountId: string; businessPartyId?: string; debit: string; credit: string; currencyCode: string; reference?: string }>;
  },
) {
  return prisma.$transaction(async (tx) => {
    const period = await tx.enterpriseFiscalPeriod.findFirst({ where: { id: input.fiscalPeriodId, organizationId, status: "OPEN" } });
    if (!period) throw new EnterpriseAccountingError("OPENING_PERIOD_INVALID", 409);
    const accounts = await tx.enterpriseLedgerAccount.findMany({ where: { organizationId, id: { in: [...new Set(input.lines.map((line) => line.ledgerAccountId))] }, isActive: true, archivedAt: null } });
    if (accounts.length !== new Set(input.lines.map((line) => line.ledgerAccountId)).size) throw new EnterpriseAccountingError("OPENING_ACCOUNT_INVALID", 409);
    const prepared = input.lines.map((line) => {
      const debit = new Prisma.Decimal(line.debit);
      const credit = new Prisma.Decimal(line.credit);
      if (debit.isNegative() || credit.isNegative() || (debit.isPositive() && credit.isPositive()) || (!debit.isPositive() && !credit.isPositive())) throw new EnterpriseAccountingError("OPENING_LINE_INVALID", 400);
      return { ...line, debit, credit };
    });
    const totalDebit = money(sumDecimals(prepared.map((line) => line.debit)));
    const totalCredit = money(sumDecimals(prepared.map((line) => line.credit)));
    if (!totalDebit.equals(totalCredit)) throw new EnterpriseAccountingError("OPENING_BALANCE_UNBALANCED", 409, { totalDebit: totalDebit.toFixed(), totalCredit: totalCredit.toFixed() });
    const opening = await tx.enterpriseOpeningBalanceImport.create({ data: { organizationId, reference: input.reference || financeReference("OPEN"), description: input.description || null, fiscalPeriodId: period.id, currencyCode: input.currencyCode, privateDocumentId: input.privateDocumentId || null, totalDebit, totalCredit, createdByUserId: actorUserId, lines: { create: prepared.map((line) => ({ ledgerAccountId: line.ledgerAccountId, businessPartyId: line.businessPartyId || null, debit: line.debit, credit: line.credit, currencyCode: line.currencyCode, reference: line.reference || null })) } }, include: { lines: true } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseOpeningBalanceImport", entityId: opening.id, eventType: "OPENING_BALANCE_CREATED", summary: `Opening balance ${opening.reference} created`, actorUserId, toStatus: "DRAFT", metadataJson: { totalDebit: totalDebit.toFixed(), totalCredit: totalCredit.toFixed(), currency: input.currencyCode } });
    return opening;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveAndPostOpeningBalance(organizationId: string, openingId: string, actorUserId: string, revision: number) {
  const approved = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseOpeningBalanceImport" WHERE id = ${openingId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const opening = await tx.enterpriseOpeningBalanceImport.findFirst({ where: { id: openingId, organizationId } });
    if (!opening) throw new EnterpriseAccountingError("OPENING_BALANCE_NOT_FOUND", 404);
    if (opening.status === "POSTED") return opening;
    if (opening.status !== "DRAFT" || opening.revision !== revision) throw new EnterpriseAccountingError("OPENING_BALANCE_CONFLICT", 409);
    assertIndependentActor({ actorUserId, relatedUserIds: [opening.createdByUserId], errorCode: "OPENING_BALANCE_SELF_APPROVAL_FORBIDDEN" });
    return tx.enterpriseOpeningBalanceImport.update({ where: { id: opening.id }, data: { status: "APPROVED", approvedByUserId: actorUserId, approvedAt: new Date(), revision: { increment: 1 } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (approved.status === "POSTED") return approved;
  const posting = await postBusinessEvent(organizationId, actorUserId, { postingEvent: "OPENING_BALANCE_POSTED", sourceEntityType: "EnterpriseOpeningBalanceImport", sourceEntityId: approved.id });
  return prisma.enterpriseOpeningBalanceImport.update({ where: { id: approved.id }, data: { status: "POSTED", postedAt: new Date(), journalEntryId: posting.entry.id, revision: { increment: 1 } } });
}
