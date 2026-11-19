import { Prisma } from "@prisma/client";
import { ordinaryInventoryHistorySql } from "@/lib/enterprise/accounting/inventory-ordinary-history";
import { assertAcquisitionValuationCutoffTx } from "@/lib/enterprise/accounting/inventory-acquisition-cost-guards";

/**
 * Reconstruct the isolated acquisition-cost lifecycle from immutable source evidence,
 * not from today's remainingQuantity. A proven pool has exactly one receipt cost
 * layer, a posted receipt, a linked posted supplier invoice, and zero or more
 * exact coordinated supplier-return dispatches. Every movement and valuation
 * must be accounted for; transfer, issue, mixed pools and ledger discrepancies
 * do not qualify. The existing fail-closed guard remains authoritative for them.
 *
 * Dates deliberately mean "recognized by cutoff": a backdated document created
 * or posted later cannot retroactively appear in an earlier published statement.
 * Read the proof, guard and result in the SAME RepeatableRead transaction.
 */
export function isolatedAcquisitionHistorySql(organizationId: string, cutoff: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT l.id AS "layerId", l."inventoryItemId", l."warehouseId", l."currencyCode",
      CASE WHEN dates.received <= ${cutoff}
           THEN e.quantity - returns."quantityAt"
           ELSE 0 END AS quantity,
      CASE WHEN dates.received <= ${cutoff}
           THEN s."originalTotalCost"
             + CASE WHEN dates.capitalized <= ${cutoff} THEN s."capitalizedTaxAmount" ELSE 0 END
             - returns."valueAt"
           ELSE 0 END AS value,
      dates.received AS "recognizedAt"
    FROM "EnterpriseInventoryAcquisitionCostSupplement" s
    JOIN "EnterpriseInventoryCostLayer" l ON l."organizationId"=s."organizationId" AND l.id=s."costLayerId"
    JOIN "EnterpriseStockMovement" m ON m."organizationId"=l."organizationId" AND m.id=l."sourceMovementId"
    JOIN "EnterpriseInventoryAccountingEvent" e ON e."organizationId"=s."organizationId" AND e.id=s."receiptAccountingEventId"
    JOIN "EnterpriseJournalEntry" j ON j."organizationId"=e."organizationId" AND j.id=e."journalEntryId"
    JOIN "EnterpriseJournalEntry" ij ON ij."organizationId"=s."organizationId" AND ij.id=s."invoiceJournalEntryId"
    JOIN "EnterpriseSupplierInvoiceItem" ii ON ii."organizationId"=s."organizationId" AND ii.id=s."supplierInvoiceItemId"
    CROSS JOIN LATERAL (
      SELECT GREATEST(l."effectiveAt",l."createdAt",m."occurredAt",m."createdAt",e."createdAt",j."accountingDate",j."postedAt") AS received,
             GREATEST(s."effectiveAt",s."createdAt",ij."accountingDate",ij."postedAt") AS capitalized
    ) dates
    CROSS JOIN LATERAL (
      SELECT COUNT(*) AS count, COALESCE(SUM(r.quantity),0) AS quantity,
        COALESCE(SUM(r."totalCost"),0) AS value,
        COALESCE(SUM(r.quantity) FILTER (WHERE timeline.recognized <= ${cutoff}),0) AS "quantityAt",
        COALESCE(SUM(r."totalCost") FILTER (WHERE timeline.recognized <= ${cutoff}),0) AS "valueAt",
        MIN(timeline.recognized) AS "firstRecognized"
      FROM "EnterpriseSupplierReturnRequest" r
      JOIN "EnterpriseStockMovement" rm ON rm."organizationId"=r."organizationId" AND rm.id=r."dispatchMovementId"
      JOIN "EnterpriseInventoryAccountingEvent" re ON re."organizationId"=r."organizationId" AND re.id=r."dispatchAccountingEventId"
      JOIN "EnterpriseJournalEntry" rj ON rj."organizationId"=re."organizationId" AND rj.id=re."journalEntryId"
      CROSS JOIN LATERAL (
        SELECT GREATEST(r."dispatchedAt",rm."occurredAt",rm."createdAt",re."createdAt",rj."accountingDate",rj."postedAt") AS recognized
      ) timeline
      WHERE r."organizationId"=s."organizationId" AND r."originCostLayerId"=l.id
        AND r."sourceMovementId"=m.id AND r."receiptAccountingEventId"=e.id
        AND r."supplierInvoiceItemId"=ii.id AND r."supplierInvoiceId"=ii."supplierInvoiceId"
        AND r.status IN ('DISPATCHED','RECONCILED') AND r."dispatchedAt" IS NOT NULL
        AND r."inventoryItemId"=l."inventoryItemId" AND r."warehouseId"=l."warehouseId"
        AND r."stockLotId"=m."stockLotId" AND r."storageLocationId" IS NOT DISTINCT FROM m."storageLocationId"
        AND rm."inventoryItemId"=r."inventoryItemId" AND rm."warehouseId"=r."warehouseId"
        AND rm."stockLotId"=r."stockLotId" AND rm."storageLocationId" IS NOT DISTINCT FROM r."storageLocationId"
        AND rm."movementType"='SUPPLIER_RETURN_OUT' AND rm.direction='OUT'
        AND rm."sourceEntityType"='EnterpriseSupplierReturnRequest' AND rm."sourceEntityId"=r.id
        AND re."stockMovementId"=rm.id AND re."inventoryItemId"=r."inventoryItemId"
        AND re."eventType"='SUPPLIER_RETURN' AND re.status='POSTED'
        AND r.quantity>0 AND rm.quantity=r.quantity AND re.quantity=r.quantity
        AND r."currencyCode"=l."currencyCode" AND re."currencyCode"=r."currencyCode"
        AND r."unitCost"=s."unitCost" AND re."unitCost"=r."unitCost"
        AND r."recoverableTaxAmount"=0 AND r."totalCost"=ROUND(r.quantity*r."unitCost",6) AND re."totalCost"=r."totalCost"
        AND rj.status='POSTED' AND rj."postedAt" IS NOT NULL AND rj."reversedAt" IS NULL AND rj."reversalOfEntryId" IS NULL
        AND rj."sourceEntityType"='EnterpriseInventoryAccountingEvent' AND rj."sourceEntityId"=re.id
        AND rj."postingEvent"='INVENTORY_SUPPLIER_RETURN_VALUED' AND rj."postingVersion"=1
        AND rj."functionalCurrencyCode"=r."currencyCode" AND rj."totalDebit"=r."totalCost" AND rj."totalCredit"=r."totalCost"
        AND NOT EXISTS (SELECT 1 FROM "EnterpriseJournalReversal" rev WHERE rev."organizationId"=rj."organizationId" AND rev."originalEntryId"=rj.id)
    ) returns
    WHERE s."organizationId"=${organizationId}
      AND l."warehouseId" IS NOT NULL AND m."warehouseId"=l."warehouseId" AND m."inventoryItemId"=l."inventoryItemId"
      AND m."movementType"='PURCHASE_RECEIPT' AND m.direction='IN' AND m."stockLotId" IS NOT NULL
      AND e."stockMovementId"=m.id AND e."inventoryItemId"=l."inventoryItemId" AND e."eventType"='RECEIPT' AND e.status='POSTED'
      AND l."valuationMethod"='WEIGHTED_AVERAGE' AND l.quantity=s.quantity AND m.quantity=s.quantity AND e.quantity=s.quantity AND s.quantity>0
      AND e."currencyCode"=l."currencyCode" AND s."currencyCode"=l."currencyCode" AND s."unitCost"=l."unitCost" AND s."totalCost"=l."totalCost"
      AND e."unitCost"=s."originalUnitCost" AND e."totalCost"=s."originalTotalCost"
      AND s."capitalizedTaxAmount">0 AND s."originalTotalCost"+s."capitalizedTaxAmount"=s."totalCost"
      AND ROUND(s.quantity*s."unitCost",6)=s."totalCost"
      AND j.status='POSTED' AND j."postedAt" IS NOT NULL AND j."reversedAt" IS NULL AND j."reversalOfEntryId" IS NULL
      AND j."sourceEntityType"='EnterpriseInventoryAccountingEvent' AND j."sourceEntityId"=e.id
      AND j."postingEvent"='INVENTORY_RECEIPT_VALUED' AND j."postingVersion"=1
      AND j."functionalCurrencyCode"=l."currencyCode" AND j."totalDebit"=s."originalTotalCost" AND j."totalCredit"=s."originalTotalCost"
      AND ij.status='POSTED' AND ij."postedAt" IS NOT NULL AND ij."reversedAt" IS NULL AND ij."reversalOfEntryId" IS NULL
      AND ij."sourceEntityType"='EnterpriseSupplierInvoice' AND ij."sourceEntityId"=ii."supplierInvoiceId"
      AND ij."postingEvent"='SUPPLIER_INVOICE_POSTED' AND ij."postingVersion"=1
      AND ij."functionalCurrencyCode"=l."currencyCode" AND ij."totalDebit"=s."totalCost" AND ij."totalCredit"=s."totalCost"
      AND NOT EXISTS (SELECT 1 FROM "EnterpriseJournalReversal" rev WHERE rev."organizationId"=l."organizationId" AND rev."originalEntryId" IN (j.id,ij.id))
      AND dates.received<=dates.capitalized AND (returns."firstRecognized" IS NULL OR returns."firstRecognized">=dates.capitalized)
      AND l."remainingQuantity"=s.quantity-returns.quantity AND l."remainingQuantity">=0
      AND ROUND(l."remainingQuantity"*l."unitCost",6)=s."totalCost"-returns.value
      AND (SELECT COUNT(*) FROM "EnterpriseInventoryCostLayer" other
           WHERE other."organizationId"=l."organizationId" AND other."inventoryItemId"=l."inventoryItemId" AND other."warehouseId"=l."warehouseId")=1
      AND (SELECT COUNT(*) FROM "EnterpriseStockMovement" other
           WHERE other."organizationId"=l."organizationId" AND other."inventoryItemId"=l."inventoryItemId" AND other."warehouseId"=l."warehouseId")=1+returns.count
      AND (SELECT COUNT(*) FROM "EnterpriseInventoryAccountingEvent" oe
           JOIN "EnterpriseStockMovement" om ON om."organizationId"=oe."organizationId" AND om.id=oe."stockMovementId"
           WHERE om."organizationId"=l."organizationId" AND om."inventoryItemId"=l."inventoryItemId" AND om."warehouseId"=l."warehouseId")=1+returns.count
      AND (SELECT COALESCE(SUM(b."quantityOnHand"),0) FROM "EnterpriseInventoryBalance" b
           WHERE b."organizationId"=l."organizationId" AND b."inventoryItemId"=l."inventoryItemId" AND b."warehouseId"=l."warehouseId")=l."remainingQuantity"
  `;
}

/** Shared valuation. Unsupported legacy pools retain explicitly identified
 * current-layer projections, never a claim of verified historical value. */
export async function inventoryValuationAtSqlTx(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">, organizationId: string, cutoff: Date,
): Promise<Prisma.Sql> {
  const verifiedHistory = isolatedAcquisitionHistorySql(organizationId, cutoff);
  await assertAcquisitionValuationCutoffTx(tx, organizationId, cutoff, verifiedHistory);
  return Prisma.sql`
    WITH verified_history AS (${verifiedHistory}), ordinary_history AS (${ordinaryInventoryHistorySql(organizationId, cutoff)})
    SELECT l."inventoryItemId", l."warehouseId", l."currencyCode", l."remainingQuantity" AS quantity,
      l."remainingQuantity"*l."unitCost" AS value, 'CURRENT_LAYER_PROJECTION'::text AS "valuationBasis"
    FROM "EnterpriseInventoryCostLayer" l
    WHERE l."organizationId"=${organizationId} AND l."effectiveAt"<=${cutoff}
      AND NOT EXISTS (SELECT 1 FROM verified_history h WHERE h."layerId"=l.id)
      AND NOT EXISTS (SELECT 1 FROM ordinary_history h WHERE h."inventoryItemId"=l."inventoryItemId" AND h."warehouseId"=l."warehouseId" AND h."currencyCode"=l."currencyCode")
    UNION ALL
    SELECT h."inventoryItemId",h."warehouseId",h."currencyCode",h.quantity,h.value, 'VERIFIED_HISTORY'::text AS "valuationBasis"
    FROM verified_history h WHERE h."recognizedAt"<=${cutoff}
    UNION ALL
    SELECT h."inventoryItemId",h."warehouseId",h."currencyCode",h.quantity,h.value, 'VERIFIED_HISTORY'::text AS "valuationBasis"
    FROM ordinary_history h WHERE h."recognizedAt"<=${cutoff}
  `;
}
