import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { idempotencyKey, money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { valueInventoryIssueTx } from "@/lib/enterprise/accounting/inventory-accounting-service";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { prisma } from "@/lib/prisma";

async function getRetailSaleAccountingSourceTx(tx: Prisma.TransactionClient, organizationId: string, saleId: string) {
  const sale = await tx.enterpriseRetailSale.findFirst({
    where: { id: saleId, organizationId, status: { in: ["COMPLETED", "REVERSED"] } },
    select: { id: true, number: true, status: true, currencyCode: true },
  });
  if (!sale) throw new EnterpriseAccountingError("RETAIL_POS_SALE_ACCOUNTING_SOURCE_INVALID", 409);
  return sale;
}

async function getRetailSaleStockMovementsTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  saleId: string,
  input: { movementType: "SALE_FULFILLMENT" | "RETURN_IN"; direction: "OUT" | "IN" },
) {
  return tx.enterpriseStockMovement.findMany({
    where: {
      organizationId,
      sourceEntityType: "EnterpriseRetailSale",
      sourceEntityId: saleId,
      movementType: input.movementType,
      direction: input.direction,
    },
    orderBy: { createdAt: "asc" },
  });
}

async function resolveRetailIssueValuationCurrencyTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  movement: { inventoryItemId: string; warehouseId: string },
  saleCurrencyCode: string,
) {
  const currencies = await tx.enterpriseInventoryCostLayer.findMany({
    where: {
      organizationId,
      inventoryItemId: movement.inventoryItemId,
      warehouseId: movement.warehouseId,
      remainingQuantity: { gt: 0 },
    },
    distinct: ["currencyCode"],
    select: { currencyCode: true },
  });
  if (!currencies.length) throw new EnterpriseAccountingError("RETAIL_INVENTORY_COST_LAYER_REQUIRED", 409, { inventoryItemId: movement.inventoryItemId });
  if (currencies.some((row) => row.currencyCode === saleCurrencyCode)) return saleCurrencyCode;
  if (currencies.length === 1) return currencies[0].currencyCode;
  throw new EnterpriseAccountingError("RETAIL_INVENTORY_VALUATION_CURRENCY_AMBIGUOUS", 409, {
    inventoryItemId: movement.inventoryItemId,
    currencies: currencies.map((row) => row.currencyCode),
  });
}

/** Retail omnichannel deliveries must book cost of sales in the same transaction as physical fulfillment. */
export async function valueRetailOmnichannelFulfillmentIssuesTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  movementIds: string[],
  orderCurrencyCode: string,
) {
  for (const movementId of movementIds) {
    const movement = await tx.enterpriseStockMovement.findFirst({
      where: { id: movementId, organizationId, sourceEntityType: "EnterpriseFulfillment", movementType: "SALE_FULFILLMENT", direction: "OUT" },
    });
    if (!movement) throw new EnterpriseAccountingError("RETAIL_OMNICHANNEL_FULFILLMENT_MOVEMENT_INVALID", 409);
    const currencyCode = await resolveRetailIssueValuationCurrencyTx(tx, organizationId, movement, orderCurrencyCode);
    await valueInventoryIssueTx(tx, organizationId, movementId, actorUserId, { currencyCode });
  }
}

export async function finalizeRetailSaleAccountingTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  saleId: string,
) {
  const sale = await getRetailSaleAccountingSourceTx(tx, organizationId, saleId);
  const salePosting = await postBusinessEventTx(tx, organizationId, actorUserId, {
    postingEvent: "RETAIL_POS_SALE_POSTED",
    sourceEntityType: "EnterpriseRetailSale",
    sourceEntityId: sale.id,
  });
  const stockMovements = await getRetailSaleStockMovementsTx(tx, organizationId, sale.id, {
    movementType: "SALE_FULFILLMENT",
    direction: "OUT",
  });
  const inventoryPostings = [];
  for (const movement of stockMovements) {
    const currencyCode = await resolveRetailIssueValuationCurrencyTx(tx, organizationId, movement, sale.currencyCode);
    const valuation = await valueInventoryIssueTx(tx, organizationId, movement.id, actorUserId, { currencyCode });
    inventoryPostings.push({
      stockMovementId: movement.id,
      valuationEventId: valuation.event.id,
      journalEntryId: valuation.posting.entry.id,
      idempotent: valuation.posting.idempotent,
      currencyCode,
    });
  }
  return {
    saleId: sale.id,
    saleNumber: sale.number,
    saleJournalEntryId: salePosting.entry.id,
    salePostingIdempotent: salePosting.idempotent,
    inventoryPostings,
  };
}

export async function finalizeRetailSaleAccounting(
  organizationId: string,
  actorUserId: string,
  saleId: string,
) {
  return prisma.$transaction(
    (tx) => finalizeRetailSaleAccountingTx(tx, organizationId, actorUserId, saleId),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
  );
}

export async function valueRetailInventoryReturnTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  stockMovementId: string,
  actorUserId: string,
  options?: { originalStockMovementId: string },
) {
  await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseStockMovement" WHERE id = ${stockMovementId} AND "organizationId" = ${organizationId} FOR UPDATE`);
  const movement = await tx.enterpriseStockMovement.findFirst({
    where: {
      id: stockMovementId,
      organizationId,
      direction: "IN",
      movementType: "RETURN_IN",
      sourceEntityType: { in: ["EnterpriseRetailSale", "EnterpriseRetailOmnichannelReturn"] },
    },
  });
  if (!movement?.sourceEntityId || !movement.sourceLineId) {
    throw new EnterpriseAccountingError("RETAIL_INVENTORY_RETURN_MOVEMENT_INVALID", 409);
  }
  const omnichannel = movement.sourceEntityType === "EnterpriseRetailOmnichannelReturn";
  if (omnichannel !== Boolean(options?.originalStockMovementId)) {
    throw new EnterpriseAccountingError("RETAIL_INVENTORY_RETURN_ORIGIN_REQUIRED", 409);
  }
  let omnichannelOriginalLineId: string | null = null;
  if (omnichannel) {
    const returnLine = await tx.enterpriseRetailOmnichannelReturnLine.findFirst({
      where: {
        id: movement.sourceLineId,
        organizationId,
        returnId: movement.sourceEntityId,
        stockDisposition: "RESTOCK",
        retailReturn: { status: { in: ["FINANCE_PENDING", "COMPLETED"] } },
      },
      select: { salesOrderItemId: true, retailReturn: { select: { salesOrderId: true } } },
    });
    if (!returnLine) throw new EnterpriseAccountingError("RETAIL_INVENTORY_RETURN_MOVEMENT_INVALID", 409);
    omnichannelOriginalLineId = returnLine.salesOrderItemId;
    const original = await tx.enterpriseStockMovement.findFirst({
      where: { id: options!.originalStockMovementId, organizationId, sourceEntityType: "EnterpriseFulfillment",
        movementType: "SALE_FULFILLMENT", direction: "OUT", sourceLineId: returnLine.salesOrderItemId },
      select: { sourceEntityId: true },
    });
    const fulfillment = original?.sourceEntityId ? await tx.enterpriseFulfillment.findFirst({
      where: { id: original.sourceEntityId, organizationId, salesOrderId: returnLine.retailReturn.salesOrderId },
      select: { id: true },
    }) : null;
    if (!fulfillment) throw new EnterpriseAccountingError("RETAIL_ORIGINAL_ISSUE_MOVEMENT_REQUIRED", 409);
  }
  const originalMovement = await tx.enterpriseStockMovement.findFirst({
    where: omnichannel ? {
      id: options!.originalStockMovementId,
      organizationId,
      sourceEntityType: "EnterpriseFulfillment",
      sourceLineId: omnichannelOriginalLineId!,
      movementType: "SALE_FULFILLMENT", direction: "OUT",
    } : {
      organizationId,
      sourceEntityType: "EnterpriseRetailSale",
      sourceEntityId: movement.sourceEntityId,
      sourceLineId: movement.sourceLineId,
      movementType: "SALE_FULFILLMENT", direction: "OUT",
    },
  });
  if (!originalMovement) throw new EnterpriseAccountingError("RETAIL_ORIGINAL_ISSUE_MOVEMENT_REQUIRED", 409);
  if (omnichannel && (originalMovement.inventoryItemId !== movement.inventoryItemId ||
      originalMovement.warehouseId !== movement.warehouseId ||
      originalMovement.storageLocationId !== movement.storageLocationId ||
      originalMovement.stockLotId !== movement.stockLotId)) {
    throw new EnterpriseAccountingError("RETAIL_INVENTORY_RETURN_ORIGIN_MISMATCH", 409);
  }
  const originalIssue = await tx.enterpriseInventoryAccountingEvent.findFirst({
    where: {
      organizationId,
      stockMovementId: originalMovement.id,
      eventType: "ISSUE",
      status: "POSTED",
    },
  });
  if (!originalIssue) throw new EnterpriseAccountingError("RETAIL_ORIGINAL_ISSUE_VALUATION_REQUIRED", 409);
  if (!movement.quantity.isPositive() || movement.quantity.greaterThan(originalIssue.quantity)) {
    throw new EnterpriseAccountingError("RETAIL_INVENTORY_RETURN_QUANTITY_INVALID", 409, {
      returnQuantity: movement.quantity.toFixed(),
      issuedQuantity: originalIssue.quantity.toFixed(),
    });
  }
  const stableKey = idempotencyKey({
    organizationId,
    sourceEntityType: "EnterpriseStockMovement",
    sourceEntityId: movement.id,
    postingEvent: "RETAIL_POS_INVENTORY_RETURN",
    postingVersion: 1,
  });
  let event = await tx.enterpriseInventoryAccountingEvent.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: stableKey } },
  });

  if (!event) {
    const totalCost = money(movement.quantity.times(originalIssue.unitCost));
    await tx.enterpriseInventoryCostLayer.create({
      data: {
        organizationId,
        inventoryItemId: movement.inventoryItemId,
        warehouseId: movement.warehouseId,
        sourceMovementId: movement.id,
        valuationMethod: "WEIGHTED_AVERAGE",
        quantity: movement.quantity,
        remainingQuantity: movement.quantity,
        unitCost: originalIssue.unitCost,
        totalCost,
        currencyCode: originalIssue.currencyCode,
        effectiveAt: movement.occurredAt,
      },
    });
    event = await tx.enterpriseInventoryAccountingEvent.create({
      data: {
        organizationId,
        inventoryItemId: movement.inventoryItemId,
        stockMovementId: movement.id,
        eventType: "RETAIL_RETURN",
        quantity: movement.quantity,
        unitCost: originalIssue.unitCost,
        totalCost,
        currencyCode: originalIssue.currencyCode,
        idempotencyKey: stableKey,
        status: "APPROVED",
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseInventoryAccountingEvent",
      entityId: event.id,
      eventType: "RETAIL_POS_INVENTORY_RETURN",
      summary: `Retail inventory return ${movement.sourceEntityId}:${movement.sourceLineId}`,
      actorUserId,
      toStatus: "APPROVED",
      metadataJson: {
        stockMovementId: movement.id,
        originalStockMovementId: originalMovement.id,
        quantity: movement.quantity.toFixed(),
        unitCost: originalIssue.unitCost.toFixed(),
        totalCost: totalCost.toFixed(),
        currency: originalIssue.currencyCode,
      },
    });
  }

  const posting = await postBusinessEventTx(tx, organizationId, actorUserId, {
    postingEvent: "RETAIL_POS_INVENTORY_RETURN",
    sourceEntityType: "EnterpriseInventoryAccountingEvent",
    sourceEntityId: event.id,
  });
  const postedEvent = event.status === "POSTED" && event.journalEntryId === posting.entry.id
    ? event
    : await tx.enterpriseInventoryAccountingEvent.update({
        where: { id: event.id },
        data: { status: "POSTED", journalEntryId: posting.entry.id },
      });
  return { event: postedEvent, posting };
}

export async function valueRetailInventoryReturn(
  organizationId: string,
  stockMovementId: string,
  actorUserId: string,
) {
  return prisma.$transaction(
    (tx) => valueRetailInventoryReturnTx(tx, organizationId, stockMovementId, actorUserId),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
  );
}

export async function finalizeRetailReturnAccountingTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  returnId: string,
) {
  const retailReturn = await tx.enterpriseRetailReturn.findFirst({
    where: { id: returnId, organizationId, status: "COMPLETED" },
    include: { lines: true },
  });
  if (!retailReturn) throw new EnterpriseAccountingError("RETAIL_POS_RETURN_ACCOUNTING_SOURCE_INVALID", 409);

  // Historical returns may predate atomic POS accounting. Complete the original sale
  // inside the same transaction before using its issue valuation as the return basis.
  await finalizeRetailSaleAccountingTx(tx, organizationId, actorUserId, retailReturn.saleId);

  const returnPosting = await postBusinessEventTx(tx, organizationId, actorUserId, {
    postingEvent: "RETAIL_POS_RETURN_POSTED",
    sourceEntityType: "EnterpriseRetailReturn",
    sourceEntityId: retailReturn.id,
  });
  const inventoryReturnPostings = [];
  for (const line of retailReturn.lines) {
    if (!line.stockMovementId) continue;
    const valuation = await valueRetailInventoryReturnTx(tx, organizationId, line.stockMovementId, actorUserId);
    inventoryReturnPostings.push({
      returnLineId: line.id,
      stockMovementId: line.stockMovementId,
      valuationEventId: valuation.event.id,
      journalEntryId: valuation.posting.entry.id,
      idempotent: valuation.posting.idempotent,
    });
  }
  return {
    returnId: retailReturn.id,
    returnNumber: retailReturn.number,
    returnJournalEntryId: returnPosting.entry.id,
    returnPostingIdempotent: returnPosting.idempotent,
    inventoryReturnPostings,
  };
}

export async function finalizeRetailReturnAccounting(
  organizationId: string,
  actorUserId: string,
  returnId: string,
) {
  return prisma.$transaction(
    (tx) => finalizeRetailReturnAccountingTx(tx, organizationId, actorUserId, returnId),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
  );
}

export async function finalizeRetailSaleReversalAccountingTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  saleId: string,
) {
  const sale = await getRetailSaleAccountingSourceTx(tx, organizationId, saleId);
  if (sale.status !== "REVERSED") throw new EnterpriseAccountingError("RETAIL_POS_REVERSAL_ACCOUNTING_SOURCE_INVALID", 409);

  const originalAccounting = await finalizeRetailSaleAccountingTx(tx, organizationId, actorUserId, sale.id);
  const reversalPosting = await postBusinessEventTx(tx, organizationId, actorUserId, {
    postingEvent: "RETAIL_POS_SALE_REVERSED",
    sourceEntityType: "EnterpriseRetailSale",
    sourceEntityId: sale.id,
  });
  const returnMovements = await getRetailSaleStockMovementsTx(tx, organizationId, sale.id, {
    movementType: "RETURN_IN",
    direction: "IN",
  });
  const inventoryReturnPostings = [];
  for (const movement of returnMovements) {
    const valuation = await valueRetailInventoryReturnTx(tx, organizationId, movement.id, actorUserId);
    inventoryReturnPostings.push({
      stockMovementId: movement.id,
      valuationEventId: valuation.event.id,
      journalEntryId: valuation.posting.entry.id,
      idempotent: valuation.posting.idempotent,
    });
  }
  return {
    originalAccounting,
    reversalJournalEntryId: reversalPosting.entry.id,
    reversalPostingIdempotent: reversalPosting.idempotent,
    inventoryReturnPostings,
  };
}

export async function finalizeRetailSaleReversalAccounting(
  organizationId: string,
  actorUserId: string,
  saleId: string,
) {
  return prisma.$transaction(
    (tx) => finalizeRetailSaleReversalAccountingTx(tx, organizationId, actorUserId, saleId),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 },
  );
}
