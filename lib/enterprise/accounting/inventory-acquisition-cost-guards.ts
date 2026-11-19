import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

const correctionRequired = () => { throw new EnterpriseAccountingError("INVENTORY_ACQUISITION_COST_DOMAIN_CORRECTION_REQUIRED", 409); };

/** A generic journal reversal/repost cannot unwind acquisition-cost evidence or
 * the downstream CUMP issues. Until a coordinated domain inverse exists,
 * protect the original invoice and every accounting event in the affected
 * article/warehouse pool, even when the original layer is fully consumed. */
export async function assertAcquisitionJournalCorrectionAllowedTx(
  tx: Prisma.TransactionClient, organizationId: string,
  source: { journalId?: string; sourceEntityType: string | null; sourceEntityId: string | null },
) {
  if(source.sourceEntityType==="EnterpriseInventoryTransferValuation") throw new EnterpriseAccountingError("INVENTORY_TRANSFER_DOMAIN_REVERSAL_REQUIRED",409);
  if (source.sourceEntityType === "EnterpriseSupplierInvoice" && source.sourceEntityId) {
    const evidence = await tx.enterpriseInventoryAcquisitionCostSupplement.findFirst({
      where: { organizationId, OR: [
        ...(source.journalId ? [{ invoiceJournalEntryId: source.journalId }] : []),
        { supplierInvoiceItem: { organizationId, supplierInvoiceId: source.sourceEntityId } },
      ] }, select: { id: true },
    });
    if (evidence) return correctionRequired();
  } else if (source.sourceEntityType === "EnterpriseInventoryAccountingEvent" && source.sourceEntityId) {
    const event = await tx.enterpriseInventoryAccountingEvent.findFirst({
      where: { organizationId, id: source.sourceEntityId }, select: { stockMovementId: true },
    });
    if (!event) return;
    const movement = await tx.enterpriseStockMovement.findFirst({
      where: { organizationId, id: event.stockMovementId }, select: { inventoryItemId: true, warehouseId: true },
    });
    const evidence = await tx.enterpriseInventoryAcquisitionCostSupplement.findFirst({
      where: { organizationId, OR: [
        { receiptAccountingEventId: source.sourceEntityId },
        ...(movement ? [{ costLayer: { organizationId, inventoryItemId: movement.inventoryItemId, warehouseId: movement.warehouseId } }] : []),
      ] }, select: { id: true },
    });
    if (evidence) return correctionRequired();
    if(movement && await tx.enterpriseInventoryTransferValuation.findFirst({where:{organizationId,status:{in:["IN_TRANSIT","RECEIVED"]},OR:[
      {dispatchMovement:{inventoryItemId:movement.inventoryItemId,warehouseId:movement.warehouseId}},
      {receiptMovement:{inventoryItemId:movement.inventoryItemId,warehouseId:movement.warehouseId}},
    ]},select:{id:true}})) throw new EnterpriseAccountingError("INVENTORY_TRANSFER_DOMAIN_REVERSAL_REQUIRED",409);
  }
}

/** The live remainingQuantity projection is not a historical movement replay.
 * Before a new historical snapshot or AI read, reject a cutoff that would
 * retroject a cost supplement, or post-cutoff movement/valuation in an affected
 * pool. No published snapshot is modified. Execute this and the aggregate in
 * the same RepeatableRead/Serializable snapshot. A caller may supply the exact isolated history proof inside the same snapshot.
 * Other pools retain their
 * existing valuation contract; this does not certify their historical data. */
export async function assertAcquisitionValuationCutoffTx(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">, organizationId: string, cutoff: Date,
  verifiedHistory?: Prisma.Sql,
) {
  const rows = await tx.$queryRaw<Array<{ blocked: number }>>(Prisma.sql`
    SELECT 1 AS blocked
    FROM "EnterpriseInventoryAcquisitionCostSupplement" s
    JOIN "EnterpriseInventoryCostLayer" l ON l."organizationId" = s."organizationId" AND l.id = s."costLayerId"
    WHERE s."organizationId" = ${organizationId} AND l."effectiveAt" <= ${cutoff}
      ${verifiedHistory ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM (${verifiedHistory}) h WHERE h."layerId"=l.id)` : Prisma.empty}
      AND (
        s."effectiveAt" > ${cutoff} OR s."createdAt" > ${cutoff}
        OR EXISTS (
          SELECT 1 FROM "EnterpriseStockMovement" m
          WHERE m."organizationId" = l."organizationId" AND m."inventoryItemId" = l."inventoryItemId"
            AND m."warehouseId" IS NOT DISTINCT FROM l."warehouseId"
            AND (m."occurredAt" > ${cutoff} OR m."createdAt" > ${cutoff}
              OR EXISTS (
                SELECT 1 FROM "EnterpriseInventoryAccountingEvent" e
                WHERE e."organizationId" = m."organizationId" AND e."stockMovementId" = m.id
                  AND e."createdAt" > ${cutoff}
              ))
        )
        OR EXISTS (
          SELECT 1 FROM "EnterpriseInventoryCostLayer" later
          WHERE later."organizationId" = l."organizationId" AND later."inventoryItemId" = l."inventoryItemId"
            AND later."warehouseId" IS NOT DISTINCT FROM l."warehouseId"
            AND (later."effectiveAt" > ${cutoff} OR later."createdAt" > ${cutoff})
        )
      )
    LIMIT 1
  `);
  if (rows.length) throw new EnterpriseAccountingError("INVENTORY_ACQUISITION_COST_HISTORY_REQUIRED", 409);
}
