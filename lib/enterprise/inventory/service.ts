import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { EnterpriseDomainConflictError, EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";
import { assertInventoryApprovalCandidate, assertInventoryApprovalDecision } from "@/lib/enterprise/inventory/approval";
import { readRetailInventoryPolicy } from "@/lib/enterprise/retail/inventory-policy";
import { readActiveRetailInvoiceStockHoldsTx } from "@/lib/enterprise/retail/invoice-stock-holds";
import { requireRetailSiteCapability, retailStaffIsolationIsEnabled } from "@/lib/enterprise/retail/site-access";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import type {
  inventoryCountCreateSchema,
  inventoryCountDecisionSchema,
  stockMovementCreateSchema,
  stockTransferCreateSchema,
  stockTransferDecisionSchema,
} from "@/lib/enterprise/inventory/schemas";
import { prisma } from "@/lib/prisma";
import { lotExpiryDateKey, reservationExactBalanceRemaining, reservationLegacyRemaining, reservationLotRemaining } from "@/lib/enterprise/inventory/lot-allocation";

type StockMovementInput = z.infer<typeof stockMovementCreateSchema>;
type StockTransferCreateInput = z.infer<typeof stockTransferCreateSchema>;
type StockTransferDecisionInput = z.infer<typeof stockTransferDecisionSchema>;
type InventoryCountCreateInput = z.infer<typeof inventoryCountCreateSchema>;
type InventoryCountDecisionInput = z.infer<typeof inventoryCountDecisionSchema>;

// Keep the public Inventory API's error contract while enforcing the Retail
// site guard inside the same transaction as stock mutations.
async function requireTransferSiteAuthority(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  siteId: string | null,
) {
  try {
    await requireRetailSiteCapability(organizationId, actorUserId, siteId, "AUTHORIZE_TRANSFER", tx);
  } catch (error) {
    if (error instanceof EnterpriseRetailError) throw new EnterpriseDomainError(error.code, error.status);
    throw error;
  }
}

/** Guard legacy inventory writes without changing other industries or
 * existing Retail tenants before the opt-in site isolation cutover.
 * This is called inside the same transaction as the stock mutation.
 */
export async function requireInventoryStockAuthorityTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  warehouseId: string,
) {
  const config = await tx.enterpriseRetailConfiguration.findUnique({
    where: { organizationId },
    select: { settingsJson: true },
  });
  if (!retailStaffIsolationIsEnabled(config?.settingsJson)) return;
  const warehouse = await tx.enterpriseWarehouse.findFirst({
    where: { organizationId, id: warehouseId, status: "ACTIVE", archivedAt: null },
    select: { siteId: true },
  });
  if (!warehouse) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
  try {
    await requireRetailSiteCapability(organizationId, actorUserId, warehouse.siteId, "MANAGE_STOCK", tx);
  } catch (error) {
    if (error instanceof EnterpriseRetailError) throw new EnterpriseDomainError(error.code, error.status);
    throw error;
  }
}

function inventoryReference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

async function assertInventoryCoordinates(tx: Prisma.TransactionClient, organizationId: string, input: Pick<StockMovementInput, "inventoryItemId" | "warehouseId" | "storageLocationId" | "stockLotId">, allowUnavailableLot = false) {
  const [inventoryItem, warehouse, storageLocation, stockLot] = await Promise.all([
    tx.enterpriseInventoryItem.findFirst({
      where: { id: input.inventoryItemId, organizationId, status: "ACTIVE", archivedAt: null },
      include: { catalogItem: { select: { id: true, code: true, name: true, trackInventory: true } } },
    }),
    tx.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
    input.storageLocationId
      ? tx.enterpriseStorageLocation.findFirst({ where: { id: input.storageLocationId, organizationId, warehouseId: input.warehouseId, status: "ACTIVE", archivedAt: null }, select: { id: true } })
      : Promise.resolve(null),
    input.stockLotId
      ? tx.enterpriseStockLot.findFirst({ where: { id: input.stockLotId, organizationId, inventoryItemId: input.inventoryItemId, warehouseId: input.warehouseId, status: allowUnavailableLot ? {in:["AVAILABLE","BLOCKED","QUARANTINED"]} : "AVAILABLE", archivedAt: null }, select: { id: true, storageLocationId: true, expiryDate: true } })
      : Promise.resolve(null),
  ]);
  if (!inventoryItem || !inventoryItem.catalogItem.trackInventory) throw new EnterpriseDomainError("INVENTORY_ITEM_NOT_FOUND", 404);
  if (!warehouse) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
  if (input.storageLocationId && !storageLocation) throw new EnterpriseDomainError("STORAGE_LOCATION_NOT_FOUND", 404);
  if (input.stockLotId && !stockLot) throw new EnterpriseDomainError("STOCK_LOT_NOT_FOUND", 404);
  if (inventoryItem.lotTracking && !stockLot) throw new EnterpriseDomainError("STOCK_LOT_REQUIRED_FOR_TRACKED_ITEM", 409);
  if (inventoryItem.expiryTracking && !stockLot?.expiryDate) throw new EnterpriseDomainError("STOCK_EXPIRY_DATE_REQUIRED", 409);
  if (stockLot?.storageLocationId && input.storageLocationId && stockLot.storageLocationId !== input.storageLocationId) throw new EnterpriseDomainError("STOCK_LOT_LOCATION_MISMATCH", 409);
  return { inventoryItem, stockLot };
}

export async function applyStockMovementTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  input: Omit<StockMovementInput, "movementType"> & {movementType: StockMovementInput["movementType"] | "LOT_WRITE_OFF" | "SUPPLIER_RETURN_OUT" | "CUSTODY_RECOVERY_IN"},
  internal?: { consumingRetailInvoiceId?: string; approvedLotWriteOffId?: string; quarantinedTransferReceiptId?: string; approvedSupplierReturnId?: string; approvedRecoveryAssessmentId?: string },
) {
  const recovery=input.movementType==="CUSTODY_RECOVERY_IN";
  if(recovery){
    const id=internal?.approvedRecoveryAssessmentId;
    if(!id||input.sourceEntityType!=="EnterpriseInventoryReturnRecoveryAssessment"||input.sourceEntityId!==id||input.direction!=="IN"||!input.stockLotId)throw new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_PERMISSION_REQUIRED",403);
    const appraisal=await tx.enterpriseInventoryReturnRecoveryAssessment.findFirst({where:{organizationId,id,status:"APPROVED",assessedByUserId:actorUserId,custody:{status:"QUARANTINED"}},include:{custody:{include:{originalMovement:{include:{stockLot:true}}}}}});
    const original=appraisal?.custody.originalMovement,lot=original?.stockLot;
    if(!appraisal||!original||!lot||lot.status!=="AVAILABLE"||lot.recallReference||appraisal.custody.revision!==appraisal.custodyRevision||!appraisal.quantity.equals(input.quantity)||input.sourceLineId!==appraisal.custodyId||original.inventoryItemId!==input.inventoryItemId||original.warehouseId!==input.warehouseId||original.stockLotId!==input.stockLotId||original.storageLocationId!==(input.storageLocationId||null))throw new EnterpriseDomainConflictError("INVENTORY_RETURN_RECOVERY_CONFLICT");
    if(await tx.enterpriseStockLot.count({where:{organizationId,inventoryItemId:original.inventoryItemId,lotNumber:lot.lotNumber,recallReference:{not:null}}}))throw new EnterpriseDomainConflictError("INVENTORY_RETURN_RECOVERY_LOT_UNSAFE");
    await requireInventoryStockAuthorityTx(tx,organizationId,actorUserId,input.warehouseId);
  }
  const supplierReturn = input.movementType === "SUPPLIER_RETURN_OUT";
  if (supplierReturn) {
    const requestId = internal?.approvedSupplierReturnId;
    if (!requestId || input.sourceEntityId !== requestId || input.sourceEntityType !== "EnterpriseSupplierReturnRequest" || input.direction !== "OUT" || !input.stockLotId) throw new EnterpriseDomainError("SUPPLIER_RETURN_DISPATCH_DENIED",403);
    const request = await tx.enterpriseSupplierReturnRequest.findFirst({ where: { organizationId, id: requestId, status: "APPROVED", requestedByUserId: actorUserId } });
    if (!request || request.stockLotId !== input.stockLotId || request.inventoryItemId !== input.inventoryItemId || request.warehouseId !== input.warehouseId || request.storageLocationId !== (input.storageLocationId || null) || !request.quantity.equals(input.quantity)) throw new EnterpriseDomainError("SUPPLIER_RETURN_DISPATCH_DENIED",403);
  }
  const writeOff = input.movementType === "LOT_WRITE_OFF";
  if (writeOff) {
    const approvalId=internal?.approvedLotWriteOffId;
    if (!approvalId || input.sourceEntityId!==approvalId || input.sourceEntityType!=="EnterpriseStockAdjustment" || input.direction!=="OUT" || !input.stockLotId) throw new EnterpriseDomainError("STOCK_LOSS_APPROVAL_REQUIRED",403);
    const adjustment=await tx.enterpriseStockAdjustment.findFirst({where:{organizationId,id:approvalId,status:"PENDING_APPROVAL",approvedByUserId:actorUserId,lossReason:{not:null},adjustmentType:"OUT"}});
    if (!adjustment || adjustment.requestedByUserId===actorUserId || adjustment.stockLotId!==input.stockLotId || adjustment.inventoryItemId!==input.inventoryItemId || adjustment.warehouseId!==input.warehouseId || adjustment.storageLocationId!==(input.storageLocationId||null) || !adjustment.quantity.equals(input.quantity)) throw new EnterpriseDomainError("STOCK_LOSS_APPROVAL_REQUIRED",403);
  }
  const existing = await tx.enterpriseStockMovement.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
  if (existing) return { movement: existing, idempotent: true };
  const isolatedReceipt=Boolean(internal?.quarantinedTransferReceiptId);
  if (isolatedReceipt) {
    const transferId=internal!.quarantinedTransferReceiptId!;
    if(input.sourceEntityType!=="EnterpriseStockTransfer" || input.sourceEntityId!==transferId || input.movementType!=="TRANSFER_IN" || input.direction!=="IN" || !input.stockLotId || !input.sourceLineId) throw new EnterpriseDomainError("STOCK_TRANSFER_ISOLATED_RECEIPT_INVALID",409);
    const transfer=await tx.enterpriseStockTransfer.findFirst({where:{organizationId,id:transferId,status:"IN_TRANSIT",archivedAt:null,destinationWarehouseId:input.warehouseId},include:{lines:{where:{id:input.sourceLineId}},destinationWarehouse:{select:{siteId:true}}}});
    const line=transfer?.lines[0];
    if(!transfer || !line || !line.stockLotId || line.inventoryItemId!==input.inventoryItemId || line.destinationLocationId!==(input.storageLocationId||null) || !line.quantity.equals(input.quantity)) throw new EnterpriseDomainError("STOCK_TRANSFER_ISOLATED_RECEIPT_INVALID",409);
    await requireTransferSiteAuthority(tx,organizationId,actorUserId,transfer.destinationWarehouse.siteId);
    const [source,dest,dispatch]=await Promise.all([
      tx.enterpriseStockLot.findFirst({where:{organizationId,id:line.stockLotId,warehouseId:transfer.sourceWarehouseId,inventoryItemId:line.inventoryItemId}}),
      tx.enterpriseStockLot.findFirst({where:{organizationId,id:input.stockLotId,warehouseId:input.warehouseId,inventoryItemId:line.inventoryItemId,status:{in:["BLOCKED","QUARANTINED"]},archivedAt:null}}),
      tx.enterpriseStockMovement.findFirst({where:{organizationId,sourceEntityType:"EnterpriseStockTransfer",sourceEntityId:transferId,sourceLineId:line.id,movementType:"TRANSFER_OUT",direction:"OUT",warehouseId:transfer.sourceWarehouseId,stockLotId:line.stockLotId,inventoryItemId:line.inventoryItemId,quantity:line.quantity}}),
    ]);
    if(!source || !dest || !dispatch || source.lotNumber!==dest.lotNumber || source.expiryDate?.getTime()!==dest.expiryDate?.getTime() || source.productionDate?.getTime()!==dest.productionDate?.getTime() || (source.recallReference && source.recallReference!==dest.recallReference)) throw new EnterpriseDomainError("STOCK_TRANSFER_ISOLATED_RECEIPT_INVALID",409);
  }
  const { inventoryItem, stockLot } = await assertInventoryCoordinates(tx, organizationId, input, writeOff || isolatedReceipt || supplierReturn);
  if (inventoryItem.expiryTracking && stockLot?.expiryDate && ["SALE_FULFILLMENT", "RETURN_IN", "PRODUCTION_CONSUMPTION", "CUSTODY_RECOVERY_IN"].includes(input.movementType)) {
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
    const components = new Intl.DateTimeFormat("en-CA", { timeZone: organization.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const today = ["year", "month", "day"].map(type => components.find(part => part.type === type)?.value).join("-");
    if (lotExpiryDateKey(stockLot.expiryDate) < today) throw new EnterpriseDomainError("STOCK_LOT_EXPIRED", 409);
  }
  const balance = await tx.enterpriseInventoryBalance.findFirst({ where: { organizationId, inventoryItemId: input.inventoryItemId, warehouseId: input.warehouseId, storageLocationId: input.storageLocationId || null, stockLotId: input.stockLotId || null } });
  const currentQuantity = Number(balance?.quantityOnHand || 0);
  const delta = input.direction === "IN" ? input.quantity : -input.quantity;
  const nextQuantity = currentQuantity + delta;
  // The restricted supplier return uses the exact stored decimal, not a floating-point subtraction.
  const nextBalance = supplierReturn ? new Prisma.Decimal(balance?.quantityOnHand || 0).minus(input.quantity) : recovery ? new Prisma.Decimal(balance?.quantityOnHand || 0).plus(input.quantity) : nextQuantity;
  if (supplierReturn && (!balance || new Prisma.Decimal(nextBalance).lt(0))) throw new EnterpriseDomainError("NEGATIVE_STOCK_FORBIDDEN",409);
  if (nextQuantity < -0.000001 && !inventoryItem.allowNegativeStock) throw new EnterpriseDomainError("NEGATIVE_STOCK_FORBIDDEN", 409);
  if (input.direction === "OUT") {
    // An invoice is not a stock movement until fully paid, but it promises
    // this stock to its customer. Every outbound channel (manual adjustment,
    // transfer, POS, fulfillment) must honor those open promises. The private
    // override is used only when Finance atomically settles that very invoice.
    const holds = await readActiveRetailInvoiceStockHoldsTx(tx, {
      organizationId, warehouseId: input.warehouseId, inventoryItemIds: [input.inventoryItemId],
      excludeSalesInvoiceId: internal?.consumingRetailInvoiceId,
    });
    const held = holds.filter((row) => row.stockLotId === (input.stockLotId || null) || (Boolean(input.stockLotId) && !row.stockLotId))
      .reduce((sum, row) => sum.plus(row.quantity), new Prisma.Decimal(0));
    if (held.greaterThan(0) || inventoryItem.lotTracking || input.stockLotId) {
      const balances = await tx.enterpriseInventoryBalance.findMany({
        where: {
          organizationId, inventoryItemId: input.inventoryItemId, warehouseId: input.warehouseId,
          stockLotId: input.stockLotId || null,
        },
        select: { quantityOnHand: true, quantityReserved: true },
      });
      const physicallyFree = balances.reduce((sum, row) => sum.plus(row.quantityOnHand.minus(row.quantityReserved)), new Prisma.Decimal(0));
      if (held.gt(0) && physicallyFree.minus(input.quantity).lessThan(held)) {
        throw new EnterpriseDomainError("RETAIL_INVOICE_STOCK_HELD", 409);
      }
      if (inventoryItem.lotTracking || input.stockLotId) {
        const reservations = await tx.enterpriseInventoryReservation.findMany({ where: { organizationId, inventoryItemId: input.inventoryItemId, warehouseId: input.warehouseId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { quantity: true, fulfilledQuantity: true, lotAllocations: true, storageLocationId: true } });
        const lotPromised = reservations.reduce((sum, row) => sum.plus(reservationLotRemaining(row, input.stockLotId || null)), new Prisma.Decimal(0));
        const localPromised = reservations.reduce((sum, row) => sum.plus(balance ? reservationExactBalanceRemaining(row, balance.id) : 0).plus(!row.storageLocationId || row.storageLocationId === (input.storageLocationId || null) ? reservationLegacyRemaining(row) : 0), new Prisma.Decimal(0));
        const localFree = new Prisma.Decimal(balance?.quantityOnHand || 0).minus(balance?.quantityReserved || 0).minus(localPromised);
        if (localFree.lt(input.quantity) || physicallyFree.minus(input.quantity).lt(held.plus(lotPromised))) throw new EnterpriseDomainError("INVENTORY_RESERVATION_STOCK_HELD", 409);
      }
    }
  }
  const movement = await tx.enterpriseStockMovement.create({ data: { organizationId, inventoryItemId: input.inventoryItemId, warehouseId: input.warehouseId, storageLocationId: input.storageLocationId || null, stockLotId: input.stockLotId || null, movementType: input.movementType, direction: input.direction, quantity: input.quantity, balanceAfter: nextBalance, sourceEntityType: input.sourceEntityType || null, sourceEntityId: input.sourceEntityId || null, sourceLineId: input.sourceLineId || null, idempotencyKey: input.idempotencyKey, reason: input.reason || null, createdByUserId: actorUserId } });
  if (balance) {
    const updated = await tx.enterpriseInventoryBalance.updateMany({ where: { id: balance.id, organizationId, revision: balance.revision }, data: { quantityOnHand: nextBalance, revision: { increment: 1 } } });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError("INVENTORY_BALANCE_CONFLICT");
  } else {
    await tx.enterpriseInventoryBalance.create({ data: { organizationId, inventoryItemId: input.inventoryItemId, warehouseId: input.warehouseId, storageLocationId: input.storageLocationId || null, stockLotId: input.stockLotId || null, quantityOnHand: nextBalance } });
  }
  await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseInventoryItem", entityId: input.inventoryItemId, eventType: `STOCK_${input.movementType}`, summary: `Mouvement ${input.movementType} de ${input.quantity}`, actorUserId, metadataJson: { movementId: movement.id, warehouseId: input.warehouseId, balanceAfter: nextQuantity } });
  return { movement, idempotent: false };
}

export async function applyEnterpriseStockMovement(organizationId: string, actorUserId: string, input: StockMovementInput) {
  return prisma.$transaction(async (tx) => {
    await requireInventoryStockAuthorityTx(tx, organizationId, actorUserId, input.warehouseId);
    return applyStockMovementTx(tx, organizationId, actorUserId, input);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createEnterpriseStockTransfer(organizationId: string, actorUserId: string, input: StockTransferCreateInput) {
  if (input.sourceWarehouseId === input.destinationWarehouseId) throw new EnterpriseDomainError("TRANSFER_WAREHOUSES_MUST_DIFFER");
  await assertInventoryApprovalCandidate({ organizationId, requesterUserId: actorUserId, approverUserId: input.approverUserId });
  return prisma.$transaction(async (tx) => {
    const [source, destination, approver] = await Promise.all([
      tx.enterpriseWarehouse.findFirst({ where: { id: input.sourceWarehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true, siteId: true } }),
      tx.enterpriseWarehouse.findFirst({ where: { id: input.destinationWarehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
      tx.organizationMember.findFirst({ where: { organizationId, userId: input.approverUserId, status: "ACTIVE", removedAt: null }, select: { id: true } }),
    ]);
    if (!source || !destination) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
    if (!approver) throw new EnterpriseDomainError("APPROVER_NOT_MEMBER", 404);
    await requireTransferSiteAuthority(tx, organizationId, actorUserId, source.siteId);
    for (const line of input.lines) {
      await assertInventoryCoordinates(tx, organizationId, { inventoryItemId: line.inventoryItemId, warehouseId: input.sourceWarehouseId, storageLocationId: line.sourceLocationId, stockLotId: line.stockLotId });
      if (line.destinationLocationId) {
        const destinationLocation = await tx.enterpriseStorageLocation.findFirst({ where: { id: line.destinationLocationId, organizationId, warehouseId: input.destinationWarehouseId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
        if (!destinationLocation) throw new EnterpriseDomainError("DESTINATION_LOCATION_NOT_FOUND", 404);
      }
    }
    const transfer = await tx.enterpriseStockTransfer.create({ data: { organizationId, reference: inventoryReference("TRF"), sourceWarehouseId: input.sourceWarehouseId, destinationWarehouseId: input.destinationWarehouseId, status: "PENDING_APPROVAL", requestedByUserId: actorUserId, approvedByUserId: input.approverUserId, notes: input.notes || null, lines: { create: input.lines.map((line) => ({ ...line })) } }, include: { lines: true } });
    await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseStockTransfer", targetEntityId: transfer.id, requestedByUserId: actorUserId, approverUserId: input.approverUserId } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseStockTransfer", entityId: transfer.id, eventType: "STOCK_TRANSFER_SUBMITTED", summary: `Transfert ${transfer.reference} soumis`, actorUserId, toStatus: "PENDING_APPROVAL" });
    return transfer;
  });
}

async function resolveTransferredLotTx(
  tx: Prisma.TransactionClient,
  transfer: { organizationId: string; destinationWarehouseId: string; id: string; status?: string },
  line: { id: string; inventoryItemId: string; stockLotId: string | null },
  actorUserId: string,
) {
  if (!line.stockLotId) return {id:null,isolated:false};
  const sourceLot = await tx.enterpriseStockLot.findFirst({
    where: { id: line.stockLotId, organizationId: transfer.organizationId, inventoryItemId: line.inventoryItemId },
  });
  if (!sourceLot) throw new EnterpriseDomainError("STOCK_TRANSFER_SOURCE_LOT_NOT_FOUND", 409);
  const existing = await tx.enterpriseStockLot.findFirst({
    where: { organizationId: transfer.organizationId, inventoryItemId: line.inventoryItemId, warehouseId: transfer.destinationWarehouseId, lotNumber: sourceLot.lotNumber, archivedAt: null },
  });
  const inTransit=transfer.status==="IN_TRANSIT";
  const sourceIsolated=sourceLot.status!=="AVAILABLE" || Boolean(sourceLot.recallReference);
  const destinationIsolated=Boolean(existing && existing.status!=="AVAILABLE");
  const isolated=sourceIsolated || destinationIsolated;
  if(isolated && !inTransit) throw new EnterpriseDomainError("STOCK_TRANSFER_DESTINATION_LOT_CONFLICT",409);
  if (existing) {
    if (existing.expiryDate?.toISOString() !== sourceLot.expiryDate?.toISOString()
      || existing.productionDate?.toISOString() !== sourceLot.productionDate?.toISOString()
      || (sourceLot.recallReference && existing.recallReference && sourceLot.recallReference!==existing.recallReference)) {
      throw new EnterpriseDomainError("STOCK_TRANSFER_DESTINATION_LOT_CONFLICT", 409);
    }
    if(sourceIsolated && (!destinationIsolated || (sourceLot.recallReference&&!existing.recallReference))) {
      const changed=await tx.enterpriseStockLot.updateMany({where:{organizationId:transfer.organizationId,id:existing.id,revision:existing.revision},data:{status:"QUARANTINED",qualityReason:sourceLot.qualityReason||"Isolated batch received from transfer "+transfer.id,qualityChangedByUserId:sourceLot.qualityChangedByUserId||actorUserId,qualityChangedAt:sourceLot.qualityChangedAt||new Date(),...(sourceLot.recallReference?{recallReference:sourceLot.recallReference}:{}),revision:{increment:1}}});
      if(changed.count!==1)throw new EnterpriseDomainConflictError();
    }
    return {id:existing.id,isolated};
  }
  const destinationLot = await tx.enterpriseStockLot.create({
    data: {
      organizationId: transfer.organizationId,
      inventoryItemId: line.inventoryItemId,
      warehouseId: transfer.destinationWarehouseId,
      lotNumber: sourceLot.lotNumber,
      productionDate: sourceLot.productionDate,
      expiryDate: sourceLot.expiryDate,
      supplierId: sourceLot.supplierId,
      storageLocationId: null,
      status: isolated ? "QUARANTINED" : "AVAILABLE",
      ...(isolated?{qualityReason:sourceLot.qualityReason||"Isolated batch received from transfer "+transfer.id,qualityChangedByUserId:sourceLot.qualityChangedByUserId||actorUserId,qualityChangedAt:sourceLot.qualityChangedAt||new Date(),recallReference:sourceLot.recallReference}:{}),
      notes: `Lot issu du transfert ${transfer.id}, ligne ${line.id}`,
      createdByUserId: actorUserId,
    },
  });
  return {id:destinationLot.id,isolated};
}

async function receiveTransferLinesTx(
  tx: Prisma.TransactionClient,
  transfer: { organizationId: string; id: string; destinationWarehouseId: string; status?:string; lines: Array<{ id: string; inventoryItemId: string; stockLotId: string | null; destinationLocationId: string | null; quantity: Prisma.Decimal }> },
  actorUserId: string,
  comment?: string | null,
) {
  for (const line of transfer.lines) {
    const destinationLot = await resolveTransferredLotTx(tx, transfer, line, actorUserId);
    const destinationLotId=destinationLot.id;
    await applyStockMovementTx(tx, transfer.organizationId, actorUserId, {
      inventoryItemId: line.inventoryItemId,
      warehouseId: transfer.destinationWarehouseId,
      storageLocationId: line.destinationLocationId,
      stockLotId: destinationLotId,
      movementType: "TRANSFER_IN",
      direction: "IN",
      quantity: Number(line.quantity),
      sourceEntityType: "EnterpriseStockTransfer",
      sourceEntityId: transfer.id,
      sourceLineId: line.id,
      idempotencyKey: `transfer:${transfer.id}:${line.id}:in`,
      reason: comment || null,
    }, destinationLot.isolated?{quarantinedTransferReceiptId:transfer.id}:undefined);
    if(destinationLot.isolated) await publishEnterpriseEvent(tx,{organizationId:transfer.organizationId,entityType:"EnterpriseStockTransfer",entityId:transfer.id,eventType:"STOCK_TRANSFER_RECEIVED_QUARANTINED",summary:"Batch received into quarantine",actorUserId,metadataJson:{lineId:line.id,stockLotId:destinationLotId,warehouseId:transfer.destinationWarehouseId,quantity:line.quantity.toFixed()}});
  }
}

export async function decideEnterpriseStockTransfer(organizationId: string, transferId: string, actorUserId: string, input: StockTransferDecisionInput) {
  const candidate = await prisma.enterpriseStockTransfer.findFirst({ where: { id: transferId, organizationId, status: "PENDING_APPROVAL", archivedAt: null }, select: { requestedByUserId: true, approvedByUserId: true } });
  if (!candidate) throw new EnterpriseDomainError("STOCK_TRANSFER_NOT_FOUND", 404);
  if (!candidate.approvedByUserId) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
  const decision = await assertInventoryApprovalDecision({ organizationId, requesterUserId: candidate.requestedByUserId, approverUserId: candidate.approvedByUserId, actorUserId });
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.enterpriseStockTransfer.findFirst({
      where: { id: transferId, organizationId, status: "PENDING_APPROVAL", archivedAt: null },
      include: { lines: true, sourceWarehouse: { select: { siteId: true } } },
    });
    if (!transfer) throw new EnterpriseDomainError("STOCK_TRANSFER_NOT_FOUND", 404);
    await requireTransferSiteAuthority(tx, organizationId, actorUserId, transfer.sourceWarehouse.siteId);
    if (transfer.approvedByUserId !== actorUserId) throw new EnterpriseDomainError("NOT_TRANSFER_APPROVER", 403);
    const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterpriseStockTransfer", targetEntityId: transfer.id, status: "PENDING", approverUserId: actorUserId } });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
    const decisionComment = input.comment || (decision.selfApprovalOverride ? "SELF_APPROVAL_OVERRIDE" : null);
    if (input.decision === "REJECT") {
      const updated = await tx.enterpriseStockTransfer.updateMany({ where: { id: transfer.id, organizationId, revision: input.revision, status: "PENDING_APPROVAL" }, data: { status: "REJECTED", revision: { increment: 1 } } });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();
      await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "REJECTED", decidedAt: new Date(), decisionComment, revision: { increment: 1 } } });
      await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseStockTransfer", entityId: transfer.id, eventType: "STOCK_TRANSFER_REJECTED", summary: `Transfert ${transfer.reference} rejeté`, actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: "REJECTED", metadataJson: { selfApprovalOverride: decision.selfApprovalOverride } });
      return tx.enterpriseStockTransfer.findUniqueOrThrow({ where: { id: transfer.id }, include: { lines: true } });
    }
    const retailConfig = await tx.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } });
    const confirmedReceipt = Boolean(retailConfig && readRetailInventoryPolicy(retailConfig.settingsJson).transferReception === "CONFIRMED");
    for (const line of transfer.lines) {
      await applyStockMovementTx(tx, organizationId, actorUserId, { inventoryItemId: line.inventoryItemId, warehouseId: transfer.sourceWarehouseId, storageLocationId: line.sourceLocationId, stockLotId: line.stockLotId, movementType: "TRANSFER_OUT", direction: "OUT", quantity: Number(line.quantity), sourceEntityType: "EnterpriseStockTransfer", sourceEntityId: transfer.id, sourceLineId: line.id, idempotencyKey: `transfer:${transfer.id}:${line.id}:out`, reason: input.comment || null });
    }
    if (!confirmedReceipt) await receiveTransferLinesTx(tx, transfer, actorUserId, input.comment);
    const now = new Date();
    const updated = await tx.enterpriseStockTransfer.updateMany({ where: { id: transfer.id, organizationId, revision: input.revision, status: "PENDING_APPROVAL" }, data: { status: confirmedReceipt ? "IN_TRANSIT" : "COMPLETED", approvedAt: now, dispatchedAt: now, receivedAt: confirmedReceipt ? null : now, dispatchedByUserId: actorUserId, receivedByUserId: confirmedReceipt ? null : actorUserId, revision: { increment: 1 } } });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "APPROVED", decidedAt: new Date(), decisionComment, revision: { increment: 1 } } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseStockTransfer", entityId: transfer.id, eventType: confirmedReceipt ? "STOCK_TRANSFER_DISPATCHED" : "STOCK_TRANSFER_COMPLETED", summary: confirmedReceipt ? `Transfert ${transfer.reference} expédié, réception attendue` : `Transfert ${transfer.reference} exécuté`, actorUserId, fromStatus: "PENDING_APPROVAL", toStatus: confirmedReceipt ? "IN_TRANSIT" : "COMPLETED", metadataJson: { selfApprovalOverride: decision.selfApprovalOverride } });
    return tx.enterpriseStockTransfer.findUniqueOrThrow({ where: { id: transfer.id }, include: { lines: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function receiveEnterpriseStockTransfer(organizationId: string, transferId: string, actorUserId: string, revision: number, comment?: string) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.enterpriseStockTransfer.findFirst({
      where: { id: transferId, organizationId, status: "IN_TRANSIT", archivedAt: null },
      include: { lines: true, destinationWarehouse: { select: { siteId: true } } },
    });
    if (!transfer) throw new EnterpriseDomainError("STOCK_TRANSFER_NOT_IN_TRANSIT", 409);
    await requireTransferSiteAuthority(tx, organizationId, actorUserId, transfer.destinationWarehouse.siteId);
    if (transfer.revision !== revision) throw new EnterpriseDomainConflictError("STOCK_TRANSFER_REVISION_CONFLICT");
    await receiveTransferLinesTx(tx, transfer, actorUserId, comment);
    const updated = await tx.enterpriseStockTransfer.updateMany({
      where: { id: transferId, organizationId, status: "IN_TRANSIT", revision },
      data: { status: "COMPLETED", receivedAt: new Date(), receivedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError("STOCK_TRANSFER_REVISION_CONFLICT");
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseStockTransfer", entityId: transfer.id, eventType: "STOCK_TRANSFER_RECEIVED", summary: `Transfert ${transfer.reference} reçu`, actorUserId, fromStatus: "IN_TRANSIT", toStatus: "COMPLETED" });
    return tx.enterpriseStockTransfer.findUniqueOrThrow({ where: { id: transferId }, include: { lines: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createEnterpriseInventoryCount(organizationId: string, actorUserId: string, input: InventoryCountCreateInput) {
  await assertInventoryApprovalCandidate({ organizationId, requesterUserId: actorUserId, approverUserId: input.approverUserId });
  return prisma.$transaction(async (tx) => {
    const [warehouse, approver] = await Promise.all([
      tx.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
      tx.organizationMember.findFirst({ where: { organizationId, userId: input.approverUserId, status: "ACTIVE", removedAt: null }, select: { id: true } }),
    ]);
    if (!warehouse) throw new EnterpriseDomainError("WAREHOUSE_NOT_FOUND", 404);
    if (!approver) throw new EnterpriseDomainError("APPROVER_NOT_MEMBER", 404);
    await requireInventoryStockAuthorityTx(tx, organizationId, actorUserId, input.warehouseId);
    const seen = new Set<string>();
    const lines = [];
    for (const line of input.lines) {
      const key = `${line.inventoryItemId}:${line.stockLotId || ""}`;
      if (seen.has(key)) throw new EnterpriseDomainError("INVENTORY_COUNT_LINE_DUPLICATE");
      seen.add(key);
      await assertInventoryCoordinates(tx, organizationId, { inventoryItemId: line.inventoryItemId, warehouseId: input.warehouseId, storageLocationId: input.storageLocationId, stockLotId: line.stockLotId });
      const balance = await tx.enterpriseInventoryBalance.findFirst({ where: { organizationId, inventoryItemId: line.inventoryItemId, warehouseId: input.warehouseId, storageLocationId: input.storageLocationId || null, stockLotId: line.stockLotId || null } });
      const expectedQuantity = Number(balance?.quantityOnHand || 0);
      lines.push({ inventoryItemId: line.inventoryItemId, stockLotId: line.stockLotId || null, expectedQuantity, countedQuantity: line.countedQuantity, varianceQuantity: line.countedQuantity - expectedQuantity, countedByUserId: actorUserId, countedAt: new Date(), notes: line.notes || null });
    }
    const count = await tx.enterpriseInventoryCount.create({ data: { organizationId, reference: inventoryReference("CNT"), warehouseId: input.warehouseId, storageLocationId: input.storageLocationId || null, status: "SUBMITTED", countType: input.countType, startedAt: new Date(), submittedAt: new Date(), requestedByUserId: actorUserId, approvedByUserId: input.approverUserId, notes: input.notes || null, lines: { create: lines } }, include: { lines: true } });
    await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType: "EnterpriseInventoryCount", targetEntityId: count.id, requestedByUserId: actorUserId, approverUserId: input.approverUserId } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseInventoryCount", entityId: count.id, eventType: "INVENTORY_COUNT_SUBMITTED", summary: `Inventaire ${count.reference} soumis`, actorUserId, toStatus: "SUBMITTED" });
    return count;
  });
}

export async function decideEnterpriseInventoryCount(organizationId: string, countId: string, actorUserId: string, input: InventoryCountDecisionInput) {
  const candidate = await prisma.enterpriseInventoryCount.findFirst({ where: { id: countId, organizationId, status: "SUBMITTED", archivedAt: null }, select: { requestedByUserId: true, approvedByUserId: true } });
  if (!candidate) throw new EnterpriseDomainError("INVENTORY_COUNT_NOT_FOUND", 404);
  if (!candidate.approvedByUserId) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
  const decision = await assertInventoryApprovalDecision({ organizationId, requesterUserId: candidate.requestedByUserId, approverUserId: candidate.approvedByUserId, actorUserId });
  return prisma.$transaction(async (tx) => {
    const count = await tx.enterpriseInventoryCount.findFirst({ where: { id: countId, organizationId, status: "SUBMITTED", archivedAt: null }, include: { lines: true } });
    if (!count) throw new EnterpriseDomainError("INVENTORY_COUNT_NOT_FOUND", 404);
    await requireInventoryStockAuthorityTx(tx, organizationId, actorUserId, count.warehouseId);
    if (count.approvedByUserId !== actorUserId) throw new EnterpriseDomainError("NOT_INVENTORY_COUNT_APPROVER", 403);
    const approval = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType: "EnterpriseInventoryCount", targetEntityId: count.id, status: "PENDING", approverUserId: actorUserId } });
    if (!approval) throw new EnterpriseDomainError("APPROVAL_NOT_FOUND", 404);
    const decisionComment = input.comment || (decision.selfApprovalOverride ? "SELF_APPROVAL_OVERRIDE" : null);
    if (input.decision === "REJECT") {
      const updated = await tx.enterpriseInventoryCount.updateMany({ where: { id: count.id, organizationId, revision: input.revision, status: "SUBMITTED" }, data: { status: "REJECTED", revision: { increment: 1 } } });
      if (updated.count !== 1) throw new EnterpriseDomainConflictError();
      await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "REJECTED", decidedAt: new Date(), decisionComment, revision: { increment: 1 } } });
      await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseInventoryCount", entityId: count.id, eventType: "INVENTORY_COUNT_REJECTED", summary: `Inventaire ${count.reference} rejeté`, actorUserId, fromStatus: "SUBMITTED", toStatus: "REJECTED", metadataJson: { selfApprovalOverride: decision.selfApprovalOverride } });
      return tx.enterpriseInventoryCount.findUniqueOrThrow({ where: { id: count.id }, include: { lines: true } });
    }
    for (const line of count.lines) {
      const variance = Number(line.varianceQuantity || 0);
      if (Math.abs(variance) < 0.000001) continue;
      await applyStockMovementTx(tx, organizationId, actorUserId, { inventoryItemId: line.inventoryItemId, warehouseId: count.warehouseId, storageLocationId: count.storageLocationId, stockLotId: line.stockLotId, movementType: "COUNT_CORRECTION", direction: variance > 0 ? "IN" : "OUT", quantity: Math.abs(variance), sourceEntityType: "EnterpriseInventoryCount", sourceEntityId: count.id, sourceLineId: line.id, idempotencyKey: `inventory-count:${count.id}:${line.id}`, reason: input.comment || `Correction inventaire ${count.reference}` });
    }
    const updated = await tx.enterpriseInventoryCount.updateMany({ where: { id: count.id, organizationId, revision: input.revision, status: "SUBMITTED" }, data: { status: "COMPLETED", approvedAt: new Date(), completedAt: new Date(), revision: { increment: 1 } } });
    if (updated.count !== 1) throw new EnterpriseDomainConflictError();
    await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "APPROVED", decidedAt: new Date(), decisionComment, revision: { increment: 1 } } });
    await publishEnterpriseEvent(tx, { organizationId, entityType: "EnterpriseInventoryCount", entityId: count.id, eventType: "INVENTORY_COUNT_COMPLETED", summary: `Inventaire ${count.reference} appliqué`, actorUserId, fromStatus: "SUBMITTED", toStatus: "COMPLETED", metadataJson: { selfApprovalOverride: decision.selfApprovalOverride } });
    return tx.enterpriseInventoryCount.findUniqueOrThrow({ where: { id: count.id }, include: { lines: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
