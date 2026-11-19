import { Prisma } from "@prisma/client";

/**
 * Article/warehouse history from posted movements, not mutable layer balances.
 * The pool can contain differently priced receipts; FEFO lot selection does
 * not determine accounting cost. Reconcile the full ledger chronology and
 * current physical/cost quantities before admitting a historical amount.
 * Only ordinary single-currency CUMP pools, without acquisition supplements,
 * unvalued movements, transfers or reversals, qualify for this proof.
 */
export function ordinaryInventoryHistorySql(organizationId: string, cutoff: Date): Prisma.Sql {
  return Prisma.sql`
    WITH layers AS (
      SELECT l.* FROM "EnterpriseInventoryCostLayer" l
      WHERE l."organizationId"=${organizationId} AND l."warehouseId" IS NOT NULL
    ), pools AS (
      SELECT "inventoryItemId","warehouseId",MIN("currencyCode") AS "currencyCode",
        SUM("remainingQuantity") AS quantity, ROUND(SUM("remainingQuantity"*"unitCost"),6) AS value
      FROM layers GROUP BY "inventoryItemId","warehouseId"
      HAVING COUNT(DISTINCT "currencyCode")=1
        AND BOOL_AND("valuationMethod"='WEIGHTED_AVERAGE' AND layers.quantity>0
          AND "remainingQuantity">=0 AND "remainingQuantity"<=layers.quantity AND "unitCost">=0
          AND "totalCost"=ROUND(layers.quantity*"unitCost",6))
    ), movements AS (
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
