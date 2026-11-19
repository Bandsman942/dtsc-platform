-- Additive evidence only; never fabricate historical cost, move inventory,
-- create an accounting entry or change an already posted journal.
-- Historical inventory migration omitted the composite Prisma key.
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseStockTransferLine_organizationId_id_key"
  ON "EnterpriseStockTransferLine" ("organizationId","id");
CREATE TABLE "EnterpriseInventoryTransferValuation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "transferLineId" TEXT NOT NULL,
  "dispatchMovementId" TEXT NOT NULL,
  "receiptMovementId" TEXT,
  "destinationCostLayerId" TEXT,
  "dispatchJournalEntryId" TEXT,
  "receiptJournalEntryId" TEXT,
  "currencyCode" TEXT NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "unitCost" DECIMAL(20,6) NOT NULL,
  "totalCost" DECIMAL(20,6) NOT NULL,
  "sourceQuantityBefore" DECIMAL(20,6) NOT NULL,
  "sourceQuantityAfter" DECIMAL(20,6) NOT NULL,
  "sourceValueBefore" DECIMAL(20,6) NOT NULL,
  "sourceValueAfter" DECIMAL(20,6) NOT NULL,
  "destinationQuantityBefore" DECIMAL(20,6),
  "destinationQuantityAfter" DECIMAL(20,6),
  "destinationValueBefore" DECIMAL(20,6),
  "destinationValueAfter" DECIMAL(20,6),
  "status" TEXT NOT NULL DEFAULT 'PREPARED',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "preparedByUserId" TEXT NOT NULL,
  "receivedByUserId" TEXT,
  "dispatchedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseInventoryTransferValuation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inv_transfer_value_amount_ck" CHECK (
    "quantity">0 AND "quantity"=ROUND("quantity",3) AND "unitCost">0 AND "totalCost">0
    AND "totalCost"=ROUND("quantity"*"unitCost",6)
    AND "sourceQuantityAfter">=0 AND "sourceValueAfter">=0
    AND "sourceQuantityBefore"="sourceQuantityAfter"+"quantity"
    AND "sourceValueBefore"="sourceValueAfter"+"totalCost"
    AND "revision">0 AND "currencyCode" ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT "inv_transfer_value_state_ck" CHECK (
    (
      "status"='PREPARED' AND "dispatchJournalEntryId" IS NULL AND "dispatchedAt" IS NULL
      OR "status" IN ('IN_TRANSIT','RECEIVED') AND "dispatchJournalEntryId" IS NOT NULL AND "dispatchedAt" IS NOT NULL
    )
    AND (
      "status" IN ('PREPARED','IN_TRANSIT')
      AND "receiptMovementId" IS NULL AND "destinationCostLayerId" IS NULL
      AND "receiptJournalEntryId" IS NULL AND "receivedAt" IS NULL AND "receivedByUserId" IS NULL
      AND "destinationQuantityBefore" IS NULL AND "destinationQuantityAfter" IS NULL
      AND "destinationValueBefore" IS NULL AND "destinationValueAfter" IS NULL
      OR "status"='RECEIVED'
      AND "receiptMovementId" IS NOT NULL AND "receiptMovementId"<>"dispatchMovementId"
      AND "destinationCostLayerId" IS NOT NULL AND "receiptJournalEntryId" IS NOT NULL
      AND "receiptJournalEntryId"<>"dispatchJournalEntryId"
      AND "receivedAt" IS NOT NULL AND "receivedAt">="dispatchedAt" AND "receivedByUserId" IS NOT NULL
      AND "destinationQuantityBefore" IS NOT NULL AND "destinationQuantityAfter" IS NOT NULL
      AND "destinationValueBefore" IS NOT NULL AND "destinationValueAfter" IS NOT NULL
      AND "destinationQuantityBefore">=0 AND "destinationValueBefore">=0
      AND "destinationQuantityAfter"="destinationQuantityBefore"+"quantity"
      AND "destinationValueAfter"="destinationValueBefore"+"totalCost"
    )
  )
);

CREATE TABLE "EnterpriseInventoryTransferCostAllocation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "valuationId" TEXT NOT NULL,
  "sourceCostLayerId" TEXT NOT NULL,
  "quantityBefore" DECIMAL(20,6) NOT NULL,
  "remainingQuantity" DECIMAL(20,6) NOT NULL,
  "transferredQuantity" DECIMAL(20,6) NOT NULL,
  "unitCost" DECIMAL(20,6) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseInventoryTransferCostAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inv_transfer_alloc_amount_ck" CHECK (
    "remainingQuantity">=0 AND "transferredQuantity">0 AND "unitCost">0
    AND "quantityBefore"="remainingQuantity"+"transferredQuantity"
  )
);

CREATE UNIQUE INDEX "inv_transfer_value_org_id_key" ON "EnterpriseInventoryTransferValuation" ("organizationId","id");
CREATE UNIQUE INDEX "inv_transfer_value_line_key" ON "EnterpriseInventoryTransferValuation" ("organizationId","transferLineId");
CREATE UNIQUE INDEX "inv_transfer_value_dispatch_key" ON "EnterpriseInventoryTransferValuation" ("organizationId","dispatchMovementId");
CREATE UNIQUE INDEX "inv_transfer_value_receipt_key" ON "EnterpriseInventoryTransferValuation" ("organizationId","receiptMovementId");
CREATE UNIQUE INDEX "inv_transfer_value_dest_layer_key" ON "EnterpriseInventoryTransferValuation" ("organizationId","destinationCostLayerId");
CREATE UNIQUE INDEX "inv_transfer_value_dispatch_journal_key" ON "EnterpriseInventoryTransferValuation" ("organizationId","dispatchJournalEntryId");
CREATE UNIQUE INDEX "inv_transfer_value_receipt_journal_key" ON "EnterpriseInventoryTransferValuation" ("organizationId","receiptJournalEntryId");
CREATE INDEX "inv_transfer_value_transit_idx" ON "EnterpriseInventoryTransferValuation" ("organizationId","status","dispatchedAt");
CREATE UNIQUE INDEX "inv_transfer_alloc_value_layer_key" ON "EnterpriseInventoryTransferCostAllocation" ("organizationId","valuationId","sourceCostLayerId");
CREATE INDEX "inv_transfer_alloc_layer_idx" ON "EnterpriseInventoryTransferCostAllocation" ("organizationId","sourceCostLayerId");

ALTER TABLE "EnterpriseInventoryTransferValuation" ADD CONSTRAINT "inv_transfer_value_line_fk" FOREIGN KEY ("organizationId","transferLineId") REFERENCES "EnterpriseStockTransferLine"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseInventoryTransferValuation" ADD CONSTRAINT "inv_transfer_value_dispatch_fk" FOREIGN KEY ("organizationId","dispatchMovementId") REFERENCES "EnterpriseStockMovement"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseInventoryTransferValuation" ADD CONSTRAINT "inv_transfer_value_receipt_fk" FOREIGN KEY ("organizationId","receiptMovementId") REFERENCES "EnterpriseStockMovement"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseInventoryTransferValuation" ADD CONSTRAINT "inv_transfer_value_dest_layer_fk" FOREIGN KEY ("organizationId","destinationCostLayerId") REFERENCES "EnterpriseInventoryCostLayer"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseInventoryTransferValuation" ADD CONSTRAINT "inv_transfer_value_dispatch_journal_fk" FOREIGN KEY ("organizationId","dispatchJournalEntryId") REFERENCES "EnterpriseJournalEntry"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseInventoryTransferValuation" ADD CONSTRAINT "inv_transfer_value_receipt_journal_fk" FOREIGN KEY ("organizationId","receiptJournalEntryId") REFERENCES "EnterpriseJournalEntry"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseInventoryTransferCostAllocation" ADD CONSTRAINT "inv_transfer_alloc_value_fk" FOREIGN KEY ("organizationId","valuationId") REFERENCES "EnterpriseInventoryTransferValuation"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseInventoryTransferCostAllocation" ADD CONSTRAINT "inv_transfer_alloc_layer_fk" FOREIGN KEY ("organizationId","sourceCostLayerId") REFERENCES "EnterpriseInventoryCostLayer"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
