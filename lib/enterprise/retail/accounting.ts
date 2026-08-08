import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { idempotencyKey, money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { valueInventoryIssue } from "@/lib/enterprise/accounting/inventory-accounting-service";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";
import { prisma } from "@/lib/prisma";

async function getRetailSaleAccountingSource(organizationId: string, saleId: string) {
  const sale = await prisma.enterpriseRetailSale.findFirst({
    where: { id: saleId, organizationId, status: { in: ["COMPLETED", "REVERSED"] } },
    select: { id: true, number: true, status: true, currencyCode: true },
  });
  if (!sale) throw new EnterpriseAccountingError("RETAIL_POS_SALE_ACCOUNTING_SOURCE_INVALID", 409);
  return sale;
}

async function getRetailSaleStockMovements(
  organizationId: string,
  saleId: string,
  input: { movementType: "SALE_FULFILLMENT" | "RETURN_IN"; direction: "OUT" | "IN" },
) {
  return prisma.enterpriseStockMovement.findMany({
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

async function resolveRetailIssueValuationCurrency(
  organizationId: string,
  movement: { inventoryItemId: string; warehouseId: string },
  saleCurrencyCode: string,
) {
  const currencies = await prisma.enterpriseInventoryCostLayer.findMany({
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

export async function finalizeRetailSaleAccounting(
  organizationId: string,
  actorUserId: string,
  saleId: string,
) {
  const sale = await getRetailSaleAccountingSource(organizationId, saleId);
  const salePosting = await postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "RETAIL_POS_SALE_POSTED",
    sourceEntityType: "EnterpriseRetailSale",
    sourceEntityId: sale.id,
  });
  const stockMovements = await getRetailSaleStockMovements(organizationId, sale.id, {
    movementType: "SALE_FULFILLMENT",
    direction: "OUT",
  });
  const inventoryPostings = [];
  for (const movement of stockMovements) {
    const currencyCode = await resolveRetailIssueValuationCurrency(organizationId, movement, sale.currencyCode);
    const valuation = await valueInventoryIssue(organizationId, movement.id, actorUserId, { currencyCode });
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

async function valueRetailInventoryReturn(
  organizationId: string,
  stockMovementId: string,
  actorUserId: string,
) {
  const event = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseStockMovement" WHERE id = ${stockMovementId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const movement = await tx.enterpriseStockMovement.findFirst({
      where: {
        id: stockMovementId,
        organizationId,
        direction: "IN",
        movementType: "RETURN_IN",
        sourceEntityType: "EnterpriseRetailSale",
      },
    });
    if (!movement?.sourceEntityId || !movement.sourceLineId) {
      throw new EnterpriseAccountingError("RETAIL_INVENTORY_RETURN_MOVEMENT_INVALID", 409);
    }
    const originalMovement = await tx.enterpriseStockMovement.findFirst({
      where: {
        organizationId,
        sourceEntityType: "EnterpriseRetailSale",
        sourceEntityId: movement.sourceEntityId,
        sourceLineId: movement.sourceLineId,
        movementType: "SALE_FULFILLMENT",
        direction: "OUT",
      },
    });
    if (!originalMovement) throw new EnterpriseAccountingError("RETAIL_ORIGINAL_ISSUE_MOVEMENT_REQUIRED", 409);
    const originalIssue = await tx.enterpriseInventoryAccountingEvent.findFirst({
      where: {
        organizationId,
        stockMovementId: originalMovement.id,
        eventType: "ISSUE",
        status: { in: ["APPROVED", "POSTED"] },
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
    const existing = await tx.enterpriseInventoryAccountingEvent.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: stableKey } },
    });
    if (existing) return existing;

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
    const created = await tx.enterpriseInventoryAccountingEvent.create({
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
      entityId: created.id,
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
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });

  const posting = await postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "RETAIL_POS_INVENTORY_RETURN",
    sourceEntityType: "EnterpriseInventoryAccountingEvent",
    sourceEntityId: event.id,
  });
  const updated = await prisma.enterpriseInventoryAccountingEvent.update({
    where: { id: event.id },
    data: { status: "POSTED", journalEntryId: posting.entry.id },
  });
  return { event: updated, posting };
}

export async function finalizeRetailSaleReversalAccounting(
  organizationId: string,
  actorUserId: string,
  saleId: string,
) {
  const sale = await getRetailSaleAccountingSource(organizationId, saleId);
  if (sale.status !== "REVERSED") throw new EnterpriseAccountingError("RETAIL_POS_REVERSAL_ACCOUNTING_SOURCE_INVALID", 409);

  const originalAccounting = await finalizeRetailSaleAccounting(organizationId, actorUserId, sale.id);
  const reversalPosting = await postBusinessEvent(organizationId, actorUserId, {
    postingEvent: "RETAIL_POS_SALE_REVERSED",
    sourceEntityType: "EnterpriseRetailSale",
    sourceEntityId: sale.id,
  });
  const returnMovements = await getRetailSaleStockMovements(organizationId, sale.id, {
    movementType: "RETURN_IN",
    direction: "IN",
  });
  const inventoryReturnPostings = [];
  for (const movement of returnMovements) {
    const valuation = await valueRetailInventoryReturn(organizationId, movement.id, actorUserId);
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