import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import type { retailReturnCreateSchema, retailReturnDecisionSchema } from "@/lib/enterprise/retail/commercial-schemas";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type RetailReturnInput = z.infer<typeof retailReturnCreateSchema>;
type RetailReturnDecisionInput = z.infer<typeof retailReturnDecisionSchema>;

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

async function prepareReturnLinesTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sale: {
    id: string;
    lines: Array<{
      id: string;
      catalogItemId: string;
      inventoryItemId: string | null;
      stockLotId: string | null;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      trackInventory: boolean;
    }>;
  },
  requestedLines: RetailReturnInput["lines"],
) {
  const requestedLineIds = requestedLines.map((line) => line.saleLineId);
  const saleLineById = new Map(sale.lines.map((line) => [line.id, line]));
  if (requestedLineIds.some((id) => !saleLineById.has(id))) throw new EnterpriseRetailError("RETAIL_RETURN_LINE_INVALID", 409);
  const previousReturns = await tx.enterpriseRetailReturnLine.findMany({
    where: {
      organizationId,
      saleLineId: { in: requestedLineIds },
      return: { saleId: sale.id, status: { in: ["PENDING_APPROVAL", "COMPLETED"] } },
    },
    select: { saleLineId: true, quantity: true },
  });
  const reservedByLine = new Map<string, Prisma.Decimal>();
  for (const line of previousReturns) reservedByLine.set(line.saleLineId, (reservedByLine.get(line.saleLineId) || decimal(0)).plus(line.quantity));

  return requestedLines.map((requested) => {
    const source = saleLineById.get(requested.saleLineId);
    if (!source) throw new EnterpriseRetailError("RETAIL_RETURN_LINE_INVALID", 409);
    const quantity = decimal(requested.quantity);
    const reserved = reservedByLine.get(source.id) || decimal(0);
    const remaining = source.quantity.minus(reserved);
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
}

export async function createRetailReturnRequest(
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
    const sale = await tx.enterpriseRetailSale.findFirst({ where: { id: saleId, organizationId, status: "COMPLETED" }, include: { lines: true } });
    if (!sale) throw new EnterpriseRetailError("RETAIL_SALE_NOT_RETURNABLE", 409);
    if (input.returnType === "EXCHANGE") {
      if (!input.exchangeSaleId || input.exchangeSaleId === sale.id) throw new EnterpriseRetailError("RETAIL_EXCHANGE_SALE_INVALID", 409);
      const replacement = await tx.enterpriseRetailSale.findFirst({
        where: { id: input.exchangeSaleId, organizationId, status: "COMPLETED", currencyCode: sale.currencyCode },
        select: { id: true, customerBusinessPartyId: true },
      });
      if (!replacement) throw new EnterpriseRetailError("RETAIL_EXCHANGE_SALE_INVALID", 409);
      if (sale.customerBusinessPartyId && replacement.customerBusinessPartyId && sale.customerBusinessPartyId !== replacement.customerBusinessPartyId) {
        throw new EnterpriseRetailError("RETAIL_EXCHANGE_SALE_INVALID", 409, { reason: "CUSTOMER_MISMATCH" });
      }
    }

    const prepared = await prepareReturnLinesTx(tx, organizationId, sale, input.lines);
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
        status: "PENDING_APPROVAL",
        reason: input.reason,
        currencyCode: sale.currencyCode,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        refundMethod: input.refundMethod,
        refundFinancialAccountId: input.refundFinancialAccountId || null,
        requestedByUserId: actorUserId,
        idempotencyKey: input.idempotencyKey,
        lines: {
          create: prepared.map((line) => ({
            organizationId,
            saleLineId: line.source.id,
            catalogItemId: line.source.catalogItemId,
            inventoryItemId: line.source.inventoryItemId,
            quantity: line.quantity,
            unitPrice: line.source.unitPrice,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            stockDisposition: line.requested.stockDisposition,
          })),
        },
      },
      include: { lines: true, refunds: true },
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseRetailReturn",
      entityId: created.id,
      eventType: "RETAIL_POS_RETURN_REQUESTED",
      summary: `Retour ${created.number} demandé sur ${sale.number}`,
      actorUserId,
      toStatus: "PENDING_APPROVAL",
      metadataJson: {
        saleId: sale.id,
        exchangeSaleId: input.exchangeSaleId || null,
        lineConditions: input.lines.map((line) => ({ saleLineId: line.saleLineId, productCondition: line.productCondition, stockDisposition: line.stockDisposition })),
        total: grandTotal.toFixed(),
        currency: sale.currencyCode,
        refundMethod: input.refundMethod,
      },
    });
    return { retailReturn: created, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function decideRetailReturn(
  organizationId: string,
  returnId: string,
  actorUserId: string,
  input: RetailReturnDecisionInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseRetailReturn" WHERE id = ${returnId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const retailReturn = await tx.enterpriseRetailReturn.findFirst({
      where: { id: returnId, organizationId },
      include: {
        lines: true,
        refunds: true,
        sale: { include: { tenders: { where: { status: "CONFIRMED" } }, lines: true } },
      },
    });
    if (!retailReturn) throw new EnterpriseRetailError("RETAIL_RETURN_NOT_FOUND", 404);
    if (retailReturn.status === "COMPLETED" && input.decision === "APPROVE") return { retailReturn, idempotent: true };
    if (retailReturn.status === "REJECTED" && input.decision === "REJECT") return { retailReturn, idempotent: true };
    if (retailReturn.status !== "PENDING_APPROVAL" || retailReturn.revision !== input.revision) throw new EnterpriseRetailError("RETAIL_RETURN_CONFLICT", 409);
    if (retailReturn.requestedByUserId === actorUserId) throw new EnterpriseRetailError("RETAIL_RETURN_SELF_APPROVAL_FORBIDDEN", 403);

    if (input.decision === "REJECT") {
      const rejected = await tx.enterpriseRetailReturn.update({ where: { id: retailReturn.id }, data: { status: "REJECTED", revision: { increment: 1 } }, include: { lines: true, refunds: true } });
      await publishEnterpriseEvent(tx, {
        organizationId,
        entityType: "EnterpriseRetailReturn",
        entityId: retailReturn.id,
        eventType: "RETAIL_POS_RETURN_REJECTED",
        summary: `Retour ${retailReturn.number} refusé`,
        actorUserId,
        fromStatus: "PENDING_APPROVAL",
        toStatus: "REJECTED",
        metadataJson: { reason: input.reason || null },
      });
      return { retailReturn: rejected, idempotent: false };
    }

    for (const line of retailReturn.lines) {
      const source = retailReturn.sale.lines.find((saleLine) => saleLine.id === line.saleLineId);
      if (!source) throw new EnterpriseRetailError("RETAIL_RETURN_LINE_INVALID", 409);
      if (line.stockDisposition === "RESTOCK" && source.trackInventory && source.inventoryItemId) {
        const movement = await applyStockMovementTx(tx, organizationId, actorUserId, {
          inventoryItemId: source.inventoryItemId,
          warehouseId: retailReturn.sale.warehouseId,
          storageLocationId: retailReturn.sale.storageLocationId,
          stockLotId: source.stockLotId,
          movementType: "RETURN_IN",
          direction: "IN",
          quantity: Number(line.quantity),
          sourceEntityType: "EnterpriseRetailSale",
          sourceEntityId: retailReturn.sale.id,
          sourceLineId: source.id,
          idempotencyKey: `retail-return:${retailReturn.id}:${source.id}:restock`,
          reason: retailReturn.reason,
        });
        await tx.enterpriseRetailReturnLine.update({ where: { id: line.id }, data: { stockMovementId: movement.movement.id } });
      }
    }

    const refundAccountId = input.refundFinancialAccountId || retailReturn.refundFinancialAccountId;
    const refunds = [];
    if (retailReturn.refundMethod === "ORIGINAL_TENDER") {
      const tenderTotal = retailReturn.sale.tenders.reduce((sum, tender) => sum.plus(tender.amount), decimal(0));
      if (!tenderTotal.equals(retailReturn.sale.grandTotal)) throw new EnterpriseRetailError("RETAIL_TENDER_TOTAL_MISMATCH", 409);
      let allocated = decimal(0);
      for (let index = 0; index < retailReturn.sale.tenders.length; index += 1) {
        const tender = retailReturn.sale.tenders[index];
        const amount = index === retailReturn.sale.tenders.length - 1
          ? money(retailReturn.grandTotal.minus(allocated))
          : money(retailReturn.grandTotal.times(tender.amount).div(tenderTotal));
        allocated = allocated.plus(amount);
        if (!amount.isPositive()) continue;
        const account = await getRefundAccountTx(tx, organizationId, tender.financialAccountId, retailReturn.currencyCode, tender.methodType);
        refunds.push(await applyRefundAccountEffectTx(tx, {
          organizationId,
          actorUserId,
          returnId: retailReturn.id,
          returnNumber: retailReturn.number,
          methodType: tender.methodType,
          account,
          amount,
          reference: input.refundReference || tender.reference,
          idempotencyKey: `retail-return:${retailReturn.id}:refund:${tender.id}`,
        }));
      }
    } else {
      if (!refundAccountId) throw new EnterpriseRetailError("RETAIL_REFUND_ACCOUNT_INVALID", 409);
      const account = await getRefundAccountTx(tx, organizationId, refundAccountId, retailReturn.currencyCode, retailReturn.refundMethod);
      refunds.push(await applyRefundAccountEffectTx(tx, {
        organizationId,
        actorUserId,
        returnId: retailReturn.id,
        returnNumber: retailReturn.number,
        methodType: retailReturn.refundMethod,
        account,
        amount: retailReturn.grandTotal,
        reference: input.refundReference,
        idempotencyKey: `retail-return:${retailReturn.id}:refund:explicit`,
      }));
    }

    const refundedTotal = money(refunds.reduce((sum, refund) => sum.plus(refund.amount), decimal(0)));
    if (!refundedTotal.equals(retailReturn.grandTotal)) throw new EnterpriseRetailError("RETAIL_REFUND_TOTAL_MISMATCH", 409, { refundedTotal: refundedTotal.toFixed(), grandTotal: retailReturn.grandTotal.toFixed() });
    const completed = await tx.enterpriseRetailReturn.update({
      where: { id: retailReturn.id },
      data: {
        status: "COMPLETED",
        approvedByUserId: actorUserId,
        completedAt: new Date(),
        refundFinancialAccountId: refundAccountId || retailReturn.refundFinancialAccountId,
        revision: { increment: 1 },
      },
      include: { lines: true, refunds: true },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseRetailReturn",
      entityId: completed.id,
      eventType: "RETAIL_POS_RETURN_COMPLETED",
      summary: `Retour ${completed.number}`,
      actorUserId,
      fromStatus: "PENDING_APPROVAL",
      toStatus: "COMPLETED",
      metadataJson: { saleId: retailReturn.saleId, saleNumber: retailReturn.sale.number, total: completed.grandTotal.toFixed(), currency: completed.currencyCode, refundMethod: completed.refundMethod },
    });
    await publishEnterpriseEvent(tx, {
      organizationId,
      entityType: "EnterpriseRetailReturn",
      entityId: completed.id,
      eventType: "RETAIL_POS_RETURN_APPROVED",
      summary: `Retour ${completed.number} validé`,
      actorUserId,
      fromStatus: "PENDING_APPROVAL",
      toStatus: "COMPLETED",
      metadataJson: { saleId: retailReturn.saleId, lineCount: completed.lines.length, total: completed.grandTotal.toFixed(), currency: completed.currencyCode },
    });
    return { retailReturn: completed, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
