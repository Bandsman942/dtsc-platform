import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import type { retailReturnCreateSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type RetailReturnInput = z.infer<typeof retailReturnCreateSchema>;

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function money(value: Prisma.Decimal.Value) {
  return decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

function retailReturnReference() {
  return `RET-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function refundAccountTypes(methodType: string) {
  if (methodType === "CASH") return ["CASH"];
  if (methodType === "MOBILE_MONEY") return ["MOBILE_MONEY"];
  if (methodType === "BANK_TRANSFER" || methodType === "CARD") return ["BANK", "CLEARING"];
  return ["CASH", "MOBILE_MONEY", "BANK", "CLEARING"];
}

async function getRefundAccountTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  accountId: string,
  currencyCode: string,
  methodType: string,
) {
  const account = await tx.enterpriseFinancialAccount.findFirst({
    where: { id: accountId, organizationId, currencyCode, accountType: { in: refundAccountTypes(methodType) }, status: "ACTIVE", archivedAt: null },
  });
  if (!account) throw new EnterpriseRetailError("RETAIL_REFUND_ACCOUNT_INVALID", 409, { accountId, methodType, currencyCode });
  return account;
}

async function applyRefundAccountEffectTx(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    actorUserId: string;
    returnId: string;
    returnNumber: string;
    methodType: string;
    account: Awaited<ReturnType<typeof getRefundAccountTx>>;
    amount: Prisma.Decimal;
    reference?: string | null;
    idempotencyKey: string;
  },
) {
  if (!input.amount.isPositive()) throw new EnterpriseRetailError("RETAIL_REFUND_AMOUNT_INVALID", 409);
  if (input.account.operationalBalance.lessThan(input.amount)) {
    throw new EnterpriseRetailError("RETAIL_INSUFFICIENT_BALANCE", 409, {
      financialAccountId: input.account.id,
      requiredAmount: input.amount.toFixed(),
      availableBalance: input.account.operationalBalance.toFixed(),
    });
  }
  const cashSession = input.account.accountType === "CASH"
    ? await tx.enterpriseCashSession.findFirst({
        where: { organizationId: input.organizationId, financialAccountId: input.account.id, cashierUserId: input.actorUserId, status: "OPEN" },
        orderBy: { openedAt: "desc" },
      })
    : null;
  if (input.account.accountType === "CASH" && !cashSession) throw new EnterpriseRetailError("RETAIL_OPEN_CASH_SESSION_REQUIRED", 409, { financialAccountId: input.account.id });

  await tx.enterpriseFinancialAccount.update({ where: { id: input.account.id }, data: { operationalBalance: { decrement: input.amount }, revision: { increment: 1 } } });
  await tx.enterpriseTreasuryTransaction.create({
    data: {
      organizationId: input.organizationId,
      financialAccountId: input.account.id,
      transactionType: "RETAIL_POS_REFUND",
      direction: "OUTBOUND",
      currencyCode: input.account.currencyCode,
      amount: input.amount,
      transactionDate: new Date(),
      reference: input.reference || input.returnNumber,
      createdByUserId: input.actorUserId,
    },
  });
  if (cashSession) {
    await tx.enterpriseCashMovement.create({
      data: {
        organizationId: input.organizationId,
        cashSessionId: cashSession.id,
        movementType: "RETAIL_POS_REFUND",
        direction: "OUTBOUND",
        amount: input.amount,
        currencyCode: input.account.currencyCode,
        reference: input.reference || input.returnNumber,
        reason: `Remboursement ${input.returnNumber}`,
        createdByUserId: input.actorUserId,
      },
    });
  }
  return tx.enterpriseRetailRefund.create({
    data: {
      organizationId: input.organizationId,
      returnId: input.returnId,
      methodType: input.methodType,
      financialAccountId: input.account.id,
      currencyCode: input.account.currencyCode,
      amount: input.amount,
      reference: input.reference || null,
      idempotencyKey: input.idempotencyKey,
      createdByUserId: input.actorUserId,
    },
  });
}

export async function createRetailReturn(
  organizationId: string,
  saleId: string,
  actorUserId: string,
  input: RetailReturnInput,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enterpriseRetailReturn.findFirst({
      where: { organizationId, idempotencyKey: input.idempotencyKey },
      include: { lines: true, refunds: true },
    });
    if (existing) return { retailReturn: existing, idempotent: true };

    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailSale" WHERE id = ${saleId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const sale = await tx.enterpriseRetailSale.findFirst({
      where: { id: saleId, organizationId, status: "COMPLETED" },
      include: { lines: true, tenders: { where: { status: "CONFIRMED" } } },
    });
    if (!sale) throw new EnterpriseRetailError("RETAIL_SALE_NOT_RETURNABLE", 409);
    if (!sale.tenders.length) throw new EnterpriseRetailError("RETAIL_TENDER_TOTAL_MISMATCH", 409);

    const requestedLineIds = input.lines.map((line) => line.saleLineId);
    const saleLineById = new Map(sale.lines.map((line) => [line.id, line]));
    if (requestedLineIds.some((id) => !saleLineById.has(id))) throw new EnterpriseRetailError("RETAIL_RETURN_LINE_INVALID", 409);

    const previousReturns = await tx.enterpriseRetailReturnLine.findMany({
      where: {
        organizationId,
        saleLineId: { in: requestedLineIds },
        return: { saleId, status: "COMPLETED" },
      },
      select: { saleLineId: true, quantity: true },
    });
    const previouslyReturnedByLine = new Map<string, Prisma.Decimal>();
    for (const line of previousReturns) previouslyReturnedByLine.set(line.saleLineId, (previouslyReturnedByLine.get(line.saleLineId) || decimal(0)).plus(line.quantity));

    const prepared = input.lines.map((requested) => {
      const source = saleLineById.get(requested.saleLineId);
      if (!source) throw new EnterpriseRetailError("RETAIL_RETURN_LINE_INVALID", 409);
      const quantity = decimal(requested.quantity);
      const previous = previouslyReturnedByLine.get(source.id) || decimal(0);
      const remaining = source.quantity.minus(previous);
      if (!quantity.isPositive() || quantity.greaterThan(remaining)) {
        throw new EnterpriseRetailError("RETAIL_RETURN_QUANTITY_EXCEEDED", 409, { saleLineId: source.id, requested: quantity.toFixed(), remaining: remaining.toFixed() });
      }
      if (!source.trackInventory && requested.stockDisposition === "RESTOCK") {
        throw new EnterpriseRetailError("RETAIL_RETURN_STOCK_DISPOSITION_INVALID", 409, { saleLineId: source.id });
      }
      const ratio = quantity.div(source.quantity);
      const gross = money(quantity.times(source.unitPrice));
      const discountAmount = money(source.discountAmount.times(ratio));
      const taxAmount = money(source.taxAmount.times(ratio));
      const lineTotal = money(source.lineTotal.times(ratio));
      return { requested, source, quantity, gross, discountAmount, taxAmount, lineTotal };
    });

    const subtotal = money(prepared.reduce((sum, line) => sum.plus(line.gross), decimal(0)));
    const discountTotal = money(prepared.reduce((sum, line) => sum.plus(line.discountAmount), decimal(0)));
    const taxTotal = money(prepared.reduce((sum, line) => sum.plus(line.taxAmount), decimal(0)));
    const grandTotal = money(prepared.reduce((sum, line) => sum.plus(line.lineTotal), decimal(0)));
    if (!grandTotal.isPositive()) throw new EnterpriseRetailError("RETAIL_REFUND_AMOUNT_INVALID", 409);

    const created = await tx.enterpriseRetailReturn.create({
      data: {
        organizationId,
        number: retailReturnReference(),
        saleId: sale.id,
        returnType: input.returnType,
        status: "COMPLETED",
        reason: input.reason,
        currencyCode: sale.currencyCode,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        refundMethod: input.refundMethod,
        refundFinancialAccountId: input.refundFinancialAccountId || null,
        requestedByUserId: actorUserId,
        approvedByUserId: actorUserId,
        completedAt: new Date(),
        idempotencyKey: input.idempotencyKey,
      },
    });

    const createdLines = [];
    for (const line of prepared) {
      const createdLine = await tx.enterpriseRetailReturnLine.create({
        data: {
          organizationId,
          returnId: created.id,
          saleLineId: line.source.id,
          catalogItemId: line.source.catalogItemId,
          inventoryItemId: line.source.inventoryItemId,
          quantity: line.quantity,
          unitPrice: line.source.unitPrice,
          discountAmount: line.discountAmount,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          stockDisposition: line.requested.stockDisposition,
        },
      });
      if (line.requested.stockDisposition === "RESTOCK" && line.source.trackInventory && line.source.inventoryItemId) {
        const movement = await applyStockMovementTx(tx, organizationId, actorUserId, {
          inventoryItemId: line.source.inventoryItemId,
          warehouseId: sale.warehouseId,
          storageLocationId: sale.storageLocationId,
          stockLotId: line.source.stockLotId,
          movementType: "RETURN_IN",
          direction: "IN",
          quantity: Number(line.quantity),
          sourceEntityType: "EnterpriseRetailSale",
          sourceEntityId: sale.id,
          sourceLineId: line.source.id,
          idempotencyKey: `retail-return:${created.id}:${line.source.id}:restock`,
          reason: input.reason,
        });
        await tx.enterpriseRetailReturnLine.update({ where: { id: createdLine.id }, data: { stockMovementId: movement.id } });
        createdLines.push({ ...createdLine, stockMovementId: movement.id });
      } else {
        createdLines.push(createdLine);
      }
    }

    const refunds = [];
    if (input.refundMethod === "ORIGINAL_TENDER") {
      const tenderTotal = sale.tenders.reduce((sum, tender) => sum.plus(tender.amount), decimal(0));
      if (!tenderTotal.equals(sale.grandTotal)) throw new EnterpriseRetailError("RETAIL_TENDER_TOTAL_MISMATCH", 409);
      let allocated = decimal(0);
      for (let index = 0; index < sale.tenders.length; index += 1) {
        const tender = sale.tenders[index];
        const amount = index === sale.tenders.length - 1
          ? money(grandTotal.minus(allocated))
          : money(grandTotal.times(tender.amount).div(tenderTotal));
        allocated = allocated.plus(amount);
        if (!amount.isPositive()) continue;
        const account = await getRefundAccountTx(tx, organizationId, tender.financialAccountId, sale.currencyCode, tender.methodType);
        refunds.push(await applyRefundAccountEffectTx(tx, {
          organizationId,
          actorUserId,
          returnId: created.id,
          returnNumber: created.number,
          methodType: tender.methodType,
          account,
          amount,
          reference: input.refundReference || tender.reference,
          idempotencyKey: `retail-return:${created.id}:refund:${tender.id}`,
        }));
      }
    } else {
      if (!input.refundFinancialAccountId) throw new EnterpriseRetailError("RETAIL_REFUND_ACCOUNT_INVALID", 409);
      const account = await getRefundAccountTx(tx, organizationId, input.refundFinancialAccountId, sale.currencyCode, input.refundMethod);
      refunds.push(await applyRefundAccountEffectTx(tx, {
        organizationId,
        actorUserId,
        returnId: created.id,
        returnNumber: created.number,
        methodType: input.refundMethod,
        account,
        amount: grandTotal,
        reference: input.refundReference,
        idempotencyKey: `retail-return:${created.id}:refund:explicit`,
      }));
    }

    const refundedTotal = money(refunds.reduce((sum, refund) => sum.plus(refund.amount), decimal(0)));
    if (!refundedTotal.equals(grandTotal)) throw new EnterpriseRetailError("RETAIL_REFUND_TOTAL_MISMATCH", 409, { refundedTotal: refundedTotal.toFixed(), grandTotal: grandTotal.toFixed() });

    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseRetailReturn",
      entityId: created.id,
      eventType: "RETAIL_POS_RETURN_COMPLETED",
      summary: `Retour ${created.number}`,
      actorUserId,
      toStatus: "COMPLETED",
      metadataJson: { saleId: sale.id, saleNumber: sale.number, total: grandTotal.toFixed(), currency: sale.currencyCode, refundMethod: input.refundMethod },
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseRetailReturn",
      entityId: created.id,
      eventType: "RETAIL_POS_RETURN_COMPLETED",
      summary: `Retour ${created.number} sur ${sale.number}`,
      actorUserId,
      toStatus: "COMPLETED",
      metadataJson: { saleId: sale.id, lineCount: createdLines.length, total: grandTotal.toFixed(), currency: sale.currencyCode },
    });
    return { retailReturn: { ...created, lines: createdLines, refunds }, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
