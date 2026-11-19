-- Additive, no historical backfill and no change to existing quantities or costs.
CREATE TABLE "EnterpriseInventoryAcquisitionCostSupplement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "supplierInvoiceItemId" TEXT NOT NULL,
  "costLayerId" TEXT NOT NULL,
  "receiptAccountingEventId" TEXT NOT NULL,
  "taxLineId" TEXT NOT NULL,
  "invoiceJournalEntryId" TEXT NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "originalUnitCost" DECIMAL(20,6) NOT NULL,
  "originalTotalCost" DECIMAL(20,6) NOT NULL,
  "capitalizedTaxAmount" DECIMAL(20,6) NOT NULL,
  "unitCost" DECIMAL(20,6) NOT NULL,
  "totalCost" DECIMAL(20,6) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "recordedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseInventoryAcquisitionCostSupplement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inv_acq_cost_exact_check" CHECK (
    "quantity" > 0 AND "originalUnitCost" > 0 AND "originalTotalCost" > 0
    AND "capitalizedTaxAmount" > 0 AND "unitCost" > "originalUnitCost"
    AND "quantity" * "originalUnitCost" = "originalTotalCost"
    AND "originalTotalCost" + "capitalizedTaxAmount" = "totalCost"
    AND "quantity" * "unitCost" = "totalCost"
  ),
  CONSTRAINT "inv_acq_cost_invoice_item_fk" FOREIGN KEY ("organizationId","supplierInvoiceItemId") REFERENCES "EnterpriseSupplierInvoiceItem" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inv_acq_cost_layer_fk" FOREIGN KEY ("organizationId","costLayerId") REFERENCES "EnterpriseInventoryCostLayer" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inv_acq_cost_receipt_event_fk" FOREIGN KEY ("organizationId","receiptAccountingEventId") REFERENCES "EnterpriseInventoryAccountingEvent" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inv_acq_cost_tax_line_fk" FOREIGN KEY ("organizationId","taxLineId") REFERENCES "EnterpriseTaxLine" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inv_acq_cost_journal_fk" FOREIGN KEY ("organizationId","invoiceJournalEntryId") REFERENCES "EnterpriseJournalEntry" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inv_acq_cost_org_id_key" ON "EnterpriseInventoryAcquisitionCostSupplement" ("organizationId","id");
CREATE UNIQUE INDEX "inv_acq_cost_invoice_item_key" ON "EnterpriseInventoryAcquisitionCostSupplement" ("organizationId","supplierInvoiceItemId");
CREATE UNIQUE INDEX "inv_acq_cost_layer_key" ON "EnterpriseInventoryAcquisitionCostSupplement" ("organizationId","costLayerId");
CREATE UNIQUE INDEX "inv_acq_cost_receipt_event_key" ON "EnterpriseInventoryAcquisitionCostSupplement" ("organizationId","receiptAccountingEventId");
CREATE UNIQUE INDEX "inv_acq_cost_tax_line_key" ON "EnterpriseInventoryAcquisitionCostSupplement" ("organizationId","taxLineId");
CREATE INDEX "inv_acq_cost_journal_idx" ON "EnterpriseInventoryAcquisitionCostSupplement" ("organizationId","invoiceJournalEntryId");
CREATE INDEX "inv_acq_cost_effective_idx" ON "EnterpriseInventoryAcquisitionCostSupplement" ("organizationId","effectiveAt");
