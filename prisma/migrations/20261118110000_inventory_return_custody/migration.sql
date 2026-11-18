-- Inspected non-sellable physical returns: separate custody, not saleable stock.
CREATE TABLE "EnterpriseInventoryReturnCustody" (
 "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "returnLineId" TEXT NOT NULL,
 "originalMovementId" TEXT NOT NULL, "quantity" DECIMAL(20,6) NOT NULL,
 "disposition" TEXT NOT NULL, "status" TEXT NOT NULL,
 "inspectedByUserId" TEXT NOT NULL, "inspectedAt" TIMESTAMP(3) NOT NULL, "inspectionNotes" TEXT,
 "registeredByUserId" TEXT NOT NULL, "disposalRequestedByUserId" TEXT,
 "disposalRequestedAt" TIMESTAMP(3), "disposalReason" TEXT,
 "disposedByUserId" TEXT, "disposedAt" TIMESTAMP(3), "disposalEvidence" TEXT,
 "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "EnterpriseInventoryReturnCustody_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "inv_return_custody_quantity_check" CHECK ("quantity" > 0),
 CONSTRAINT "inv_return_custody_disposition_check" CHECK ("disposition" IN ('QUARANTINE','DISPOSE')),
 CONSTRAINT "inv_return_custody_status_check" CHECK (
 "status" IN ('QUARANTINED','DISPOSAL_PENDING','DISPOSED') AND
 ("status" = 'QUARANTINED' OR ("disposalRequestedByUserId" IS NOT NULL AND "disposalRequestedAt" IS NOT NULL AND "disposalReason" IS NOT NULL)) AND
 ("status" <> 'DISPOSED' OR ("disposedByUserId" IS NOT NULL AND "disposedAt" IS NOT NULL AND "disposalEvidence" IS NOT NULL AND "disposedByUserId" <> "disposalRequestedByUserId"))
 )
);
CREATE UNIQUE INDEX "inv_return_custody_org_id_key" ON "EnterpriseInventoryReturnCustody" ("organizationId","id");
CREATE UNIQUE INDEX "inv_return_custody_source_key" ON "EnterpriseInventoryReturnCustody" ("organizationId","returnLineId","originalMovementId");
CREATE INDEX "inv_return_custody_status_idx" ON "EnterpriseInventoryReturnCustody" ("organizationId","status","createdAt");
CREATE INDEX "inv_return_custody_movement_idx" ON "EnterpriseInventoryReturnCustody" ("organizationId","originalMovementId");
ALTER TABLE "EnterpriseInventoryReturnCustody" ADD CONSTRAINT "inv_return_custody_line_fk" FOREIGN KEY ("organizationId","returnLineId") REFERENCES "EnterpriseRetailInvoiceReturnLine" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseInventoryReturnCustody" ADD CONSTRAINT "inv_return_custody_movement_fk" FOREIGN KEY ("organizationId","originalMovementId") REFERENCES "EnterpriseStockMovement" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
