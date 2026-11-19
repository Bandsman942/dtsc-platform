import { Prisma } from "@prisma/client";

/** Transfer recognition dates come from immutable movements and posted journals.
 * The IN_TRANSIT record is a location dimension, not a fictitious warehouse.
 * A completed receipt must independently prove its destination layer. */
export function verifiedInventoryTransfersSql(organizationId:string): Prisma.Sql {
  return Prisma.sql`
    SELECT v.id, v."organizationId", v."currencyCode", v.quantity, v."totalCost",
      line."inventoryItemId", t."sourceWarehouseId",t."destinationWarehouseId",
      v."dispatchMovementId",v."receiptMovementId",v."destinationCostLayerId",
      GREATEST(v."createdAt",v."dispatchedAt",dm."createdAt",dm."occurredAt",dj."accountingDate",dj."postedAt") AS "dispatchRecognized",
      CASE WHEN v.status='RECEIVED' THEN GREATEST(v."receivedAt",rm."createdAt",rm."occurredAt",rl."createdAt",rl."effectiveAt",rj."accountingDate",rj."postedAt") END AS "receiptRecognized"
    FROM "EnterpriseInventoryTransferValuation" v
    JOIN "EnterpriseStockTransferLine" line ON line."organizationId"=v."organizationId" AND line.id=v."transferLineId"
    JOIN "EnterpriseStockTransfer" t ON t."organizationId"=line."organizationId" AND t.id=line."stockTransferId"
    JOIN "EnterpriseStockMovement" dm ON dm."organizationId"=v."organizationId" AND dm.id=v."dispatchMovementId"
    JOIN "EnterpriseJournalEntry" dj ON dj."organizationId"=v."organizationId" AND dj.id=v."dispatchJournalEntryId"
    LEFT JOIN "EnterpriseStockMovement" rm ON rm."organizationId"=v."organizationId" AND rm.id=v."receiptMovementId"
    LEFT JOIN "EnterpriseInventoryCostLayer" rl ON rl."organizationId"=v."organizationId" AND rl.id=v."destinationCostLayerId"
    LEFT JOIN "EnterpriseJournalEntry" rj ON rj."organizationId"=v."organizationId" AND rj.id=v."receiptJournalEntryId"
    CROSS JOIN LATERAL (
      SELECT COUNT(*) AS count,COALESCE(SUM(a."transferredQuantity"),0) AS quantity,
        COALESCE(SUM(a."transferredQuantity"*a."unitCost"),0) AS value,
        BOOL_AND(l.id IS NOT NULL AND l."inventoryItemId"=line."inventoryItemId" AND l."warehouseId"=t."sourceWarehouseId"
          AND l."currencyCode"=v."currencyCode" AND l."unitCost"=a."unitCost") AS scoped
      FROM "EnterpriseInventoryTransferCostAllocation" a
      LEFT JOIN "EnterpriseInventoryCostLayer" l ON l."organizationId"=a."organizationId" AND l.id=a."sourceCostLayerId"
      WHERE a."organizationId"=v."organizationId" AND a."valuationId"=v.id
    ) allocation
    WHERE v."organizationId"=${organizationId} AND v.status IN ('IN_TRANSIT','RECEIVED')
      AND t."sourceWarehouseId"<>t."destinationWarehouseId" AND line.quantity=v.quantity
      AND v."dispatchedAt" IS NOT NULL
      AND dm."movementType"='TRANSFER_OUT' AND dm.direction='OUT' AND dm."sourceEntityType"='EnterpriseStockTransfer'
      AND dm."sourceEntityId"=t.id AND dm."sourceLineId"=line.id AND dm.quantity=v.quantity
      AND dm."inventoryItemId"=line."inventoryItemId" AND dm."warehouseId"=t."sourceWarehouseId"
      AND dm."stockLotId" IS NOT DISTINCT FROM line."stockLotId" AND dm."storageLocationId" IS NOT DISTINCT FROM line."sourceLocationId"
      AND allocation.count>0 AND allocation.scoped AND allocation.quantity=v.quantity AND allocation.value=v.quantity*v."unitCost"
      AND v."totalCost"=ROUND(allocation.value,6)
      AND dj.status='POSTED' AND dj."postedAt" IS NOT NULL AND dj."reversedAt" IS NULL AND dj."reversalOfEntryId" IS NULL
      AND dj."sourceEntityType"='EnterpriseInventoryTransferValuation' AND dj."sourceEntityId"=v.id
      AND dj."postingEvent"='INVENTORY_TRANSFER_DISPATCHED' AND dj."postingVersion"=1
      AND dj."functionalCurrencyCode"=v."currencyCode" AND dj."totalDebit"=v."totalCost" AND dj."totalCredit"=v."totalCost"
      AND NOT EXISTS(SELECT 1 FROM "EnterpriseJournalReversal" rev WHERE rev."organizationId"=v."organizationId" AND rev."originalEntryId"=dj.id)
      AND NOT EXISTS(SELECT 1 FROM "EnterpriseInventoryAccountingEvent" legacy WHERE legacy."organizationId"=v."organizationId" AND legacy."stockMovementId"=dm.id)
      AND (v.status='IN_TRANSIT' OR (
        v.status='RECEIVED' AND rm.id IS NOT NULL AND rl.id IS NOT NULL AND rj.id IS NOT NULL
        AND rm."movementType"='TRANSFER_IN' AND rm.direction='IN' AND rm."sourceEntityType"='EnterpriseStockTransfer'
        AND rm."sourceEntityId"=t.id AND rm."sourceLineId"=line.id AND rm.quantity=v.quantity
        AND rm."inventoryItemId"=line."inventoryItemId" AND rm."warehouseId"=t."destinationWarehouseId"
        AND rm."storageLocationId" IS NOT DISTINCT FROM line."destinationLocationId"
        AND rm."occurredAt">=dm."occurredAt" AND v."receivedAt">=v."dispatchedAt"
        AND rl."sourceMovementId"=rm.id AND rl."inventoryItemId"=line."inventoryItemId" AND rl."warehouseId"=rm."warehouseId"
        AND rl.quantity=v.quantity AND rl."unitCost"=v."unitCost" AND rl."totalCost"=v."totalCost" AND rl."currencyCode"=v."currencyCode"
        AND rj.status='POSTED' AND rj."postedAt" IS NOT NULL AND rj."reversedAt" IS NULL AND rj."reversalOfEntryId" IS NULL
        AND rj."sourceEntityType"='EnterpriseInventoryTransferValuation' AND rj."sourceEntityId"=v.id
        AND rj."postingEvent"='INVENTORY_TRANSFER_RECEIVED' AND rj."postingVersion"=1
        AND rj."functionalCurrencyCode"=v."currencyCode" AND rj."totalDebit"=v."totalCost" AND rj."totalCredit"=v."totalCost"
        AND NOT EXISTS(SELECT 1 FROM "EnterpriseJournalReversal" rev WHERE rev."organizationId"=v."organizationId" AND rev."originalEntryId"=rj.id)
        AND NOT EXISTS(SELECT 1 FROM "EnterpriseInventoryAccountingEvent" legacy WHERE legacy."organizationId"=v."organizationId" AND legacy."stockMovementId"=rm.id)
      ))
  `;
}

/**
 * Article/warehouse history from posted movements, not mutable layer balances.
 * The pool can contain differently priced receipts; FEFO lot selection does
 * not determine accounting cost. Reconcile the full ledger chronology and
 * current physical/cost quantities before admitting a historical amount.
 * Only ordinary single-currency CUMP pools, without acquisition supplements,
 * unvalued movements, unsupported transfers or reversals, qualify for this proof.
 */
export function ordinaryInventoryHistorySql(organizationId: string, cutoff: Date, pool?: {inventoryItemId:string;warehouseId:string}): Prisma.Sql {
  return Prisma.sql`
    WITH layers AS (
      SELECT l.* FROM "EnterpriseInventoryCostLayer" l
      WHERE l."organizationId"=${organizationId} AND l."warehouseId" IS NOT NULL
        ${pool?Prisma.sql`AND l."inventoryItemId"=${pool.inventoryItemId} AND l."warehouseId"=${pool.warehouseId}`:Prisma.empty}
    ), pools AS (
      SELECT "inventoryItemId","warehouseId",MIN("currencyCode") AS "currencyCode",
        SUM("remainingQuantity") AS quantity, ROUND(SUM("remainingQuantity"*"unitCost"),6) AS value
      FROM layers GROUP BY "inventoryItemId","warehouseId"
      HAVING COUNT(DISTINCT "currencyCode")=1
        AND BOOL_AND("valuationMethod"='WEIGHTED_AVERAGE' AND layers.quantity>0
          AND "remainingQuantity">=0 AND "remainingQuantity"<=layers.quantity AND "unitCost">=0
          AND "totalCost"=ROUND(layers.quantity*"unitCost",6))
    ), verified_transfers AS (${verifiedInventoryTransfersSql(organizationId)}), movements AS (
      SELECT p."inventoryItemId",p."warehouseId",p."currencyCode",m.id,
        GREATEST(m."occurredAt",m."createdAt",e."createdAt",j."accountingDate",j."postedAt",
          COALESCE(l."effectiveAt",m."occurredAt"),COALESCE(l."createdAt",m."createdAt")) AS recognized,
        CASE WHEN m.direction='IN' THEN e.quantity ELSE -e.quantity END AS quantity,
        CASE WHEN m.direction='IN' THEN e."totalCost" ELSE -e."totalCost" END AS value
      FROM pools p
      JOIN "EnterpriseStockMovement" m ON m."organizationId"=${organizationId}
        AND m."inventoryItemId"=p."inventoryItemId" AND m."warehouseId"=p."warehouseId"
      JOIN "EnterpriseInventoryAccountingEvent" e ON e."organizationId"=m."organizationId"
        AND e."stockMovementId"=m.id AND e."inventoryItemId"=m."inventoryItemId"
      JOIN "EnterpriseJournalEntry" j ON j."organizationId"=e."organizationId" AND j.id=e."journalEntryId"
      LEFT JOIN layers l ON l."sourceMovementId"=m.id
        AND l."inventoryItemId"=p."inventoryItemId" AND l."warehouseId"=p."warehouseId"
      WHERE e.status='POSTED' AND j.status='POSTED' AND j."postedAt" IS NOT NULL
        AND j."reversedAt" IS NULL AND j."reversalOfEntryId" IS NULL
        AND j."sourceEntityType"='EnterpriseInventoryAccountingEvent' AND j."sourceEntityId"=e.id
        AND j."postingVersion"=1 AND j."functionalCurrencyCode"=p."currencyCode"
        AND e."currencyCode"=p."currencyCode" AND e.quantity=m.quantity AND e.quantity>0
        AND e."unitCost">=0 AND e."totalCost"=ROUND(e.quantity*e."unitCost",6)
        AND j."totalDebit"=e."totalCost" AND j."totalCredit"=e."totalCost"
        AND NOT EXISTS (SELECT 1 FROM "EnterpriseJournalReversal" r
          WHERE r."organizationId"=j."organizationId" AND r."originalEntryId"=j.id)
        AND (
          (m.direction='IN' AND l.id IS NOT NULL AND l.quantity=e.quantity AND l."unitCost"=e."unitCost"
            AND l."totalCost"=e."totalCost" AND l."currencyCode"=e."currencyCode"
            AND ((e."eventType"='RECEIPT' AND j."postingEvent"='INVENTORY_RECEIPT_VALUED'
                  AND m."movementType" IN ('PURCHASE_RECEIPT','OPENING_BALANCE'))
              OR (e."eventType"='RETAIL_RETURN' AND j."postingEvent"='RETAIL_POS_INVENTORY_RETURN')
              OR (e."eventType"='CUSTODY_RECOVERY' AND j."postingEvent"='INVENTORY_CUSTODY_RECOVERY_VALUED'
                  AND m."movementType"='CUSTODY_RECOVERY_IN')))
          OR (m.direction='OUT' AND l.id IS NULL AND (
            (e."eventType"='ISSUE' AND j."postingEvent"='INVENTORY_ISSUE_VALUED'
              AND m."movementType" NOT LIKE '%TRANSFER%'
              AND m."movementType" NOT IN ('LOT_RECLASSIFICATION_OUT','SUPPLIER_RETURN_OUT','LOT_WRITE_OFF'))
            OR (e."eventType"='LOSS' AND j."postingEvent"='INVENTORY_LOSS_VALUED' AND m."movementType"='LOT_WRITE_OFF')
            OR (e."eventType"='SUPPLIER_RETURN' AND j."postingEvent"='INVENTORY_SUPPLIER_RETURN_VALUED'
              AND m."movementType"='SUPPLIER_RETURN_OUT' AND EXISTS (
                SELECT 1 FROM "EnterpriseSupplierReturnRequest" r WHERE r."organizationId"=m."organizationId"
                  AND r.id=m."sourceEntityId" AND m."sourceEntityType"='EnterpriseSupplierReturnRequest'
                  AND r."dispatchMovementId"=m.id AND r."dispatchAccountingEventId"=e.id
                  AND r.status IN ('DISPATCHED','RECONCILED') AND r.quantity=e.quantity AND r."totalCost"=e."totalCost"
                  AND r."currencyCode"=e."currencyCode" AND r."inventoryItemId"=m."inventoryItemId"
                  AND r."warehouseId"=m."warehouseId" AND r."stockLotId"=m."stockLotId"
              ))
          ))
        )
        AND (SELECT COUNT(*) FROM "EnterpriseInventoryAccountingEvent" other
          WHERE other."organizationId"=m."organizationId" AND other."stockMovementId"=m.id)=1
      UNION ALL
      SELECT p."inventoryItemId",p."warehouseId",p."currencyCode",v."dispatchMovementId",
        v."dispatchRecognized",-v.quantity,-v."totalCost"
      FROM pools p JOIN verified_transfers v ON v."inventoryItemId"=p."inventoryItemId"
        AND v."sourceWarehouseId"=p."warehouseId" AND v."currencyCode"=p."currencyCode"
      UNION ALL
      SELECT p."inventoryItemId",p."warehouseId",p."currencyCode",v."receiptMovementId",
        v."receiptRecognized",v.quantity,v."totalCost"
      FROM pools p JOIN verified_transfers v ON v."inventoryItemId"=p."inventoryItemId"
        AND v."destinationWarehouseId"=p."warehouseId" AND v."currencyCode"=p."currencyCode"
      WHERE v."receiptRecognized" IS NOT NULL
    ), timeline AS (
      SELECT "inventoryItemId","warehouseId","currencyCode",recognized,
        SUM(quantity) AS quantity,SUM(value) AS value
      FROM movements GROUP BY "inventoryItemId","warehouseId","currencyCode",recognized
    ), running AS (
      SELECT *, SUM(quantity) OVER (PARTITION BY "inventoryItemId","warehouseId","currencyCode" ORDER BY recognized) AS "runningQuantity",
        SUM(value) OVER (PARTITION BY "inventoryItemId","warehouseId","currencyCode" ORDER BY recognized) AS "runningValue"
      FROM timeline
    ), totals AS (
      SELECT "inventoryItemId","warehouseId","currencyCode",MIN(recognized) AS "recognizedAt",
        SUM(quantity) AS quantity,SUM(value) AS value,
        COALESCE(SUM(quantity) FILTER (WHERE recognized<=${cutoff}),0) AS "quantityAt",
        COALESCE(SUM(value) FILTER (WHERE recognized<=${cutoff}),0) AS "valueAt",
        MIN("runningQuantity") AS "minQuantity",MIN("runningValue") AS "minValue",
        BOOL_AND("runningQuantity"<>0 OR "runningValue"=0) AS "zeroBalanced"
      FROM running GROUP BY "inventoryItemId","warehouseId","currencyCode"
    )
    SELECT p."inventoryItemId",p."warehouseId",p."currencyCode",t."quantityAt" AS quantity,t."valueAt" AS value,t."recognizedAt"
    FROM pools p JOIN totals t USING ("inventoryItemId","warehouseId","currencyCode")
    WHERE t.quantity=p.quantity AND t.value=p.value AND t."minQuantity">=0 AND t."minValue">=0 AND t."zeroBalanced"
      AND NOT EXISTS (
        SELECT 1 FROM "EnterpriseInventoryAcquisitionCostSupplement" s JOIN layers l ON l.id=s."costLayerId" AND l."organizationId"=s."organizationId"
        WHERE s."organizationId"=${organizationId} AND l."inventoryItemId"=p."inventoryItemId" AND l."warehouseId"=p."warehouseId"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "EnterpriseStockMovement" m WHERE m."organizationId"=${organizationId}
          AND m."inventoryItemId"=p."inventoryItemId" AND m."warehouseId"=p."warehouseId"
          AND NOT EXISTS (SELECT 1 FROM movements v WHERE v.id=m.id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM layers l WHERE l."inventoryItemId"=p."inventoryItemId" AND l."warehouseId"=p."warehouseId"
          AND NOT EXISTS (SELECT 1 FROM movements v WHERE v.id=l."sourceMovementId" AND v.quantity>0
            AND v."inventoryItemId"=p."inventoryItemId" AND v."warehouseId"=p."warehouseId")
      )
      AND NOT EXISTS (
        SELECT 1 FROM "EnterpriseInventoryBalance" b WHERE b."organizationId"=${organizationId}
          AND b."inventoryItemId"=p."inventoryItemId" AND b."warehouseId"=p."warehouseId" AND b."quantityOnHand"<0
      )
      AND (SELECT COALESCE(SUM(b."quantityOnHand"),0) FROM "EnterpriseInventoryBalance" b
        WHERE b."organizationId"=${organizationId} AND b."inventoryItemId"=p."inventoryItemId" AND b."warehouseId"=p."warehouseId")=p.quantity
  `;
}
