-- Iteration 4: additive critical referential constraints.
-- Nullable legacy bridge columns remain nullable and no data is deleted.

ALTER TABLE "PharmacyPurchaseExtension"
  ADD CONSTRAINT "PharmacyPurchaseExtension_pharmacyReceiptId_fkey"
  FOREIGN KEY ("pharmacyReceiptId") REFERENCES "PharmacyReceipt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PharmacyPurchaseExtension"
  ADD CONSTRAINT "PharmacyPurchaseExtension_enterpriseReceiptId_fkey"
  FOREIGN KEY ("enterpriseReceiptId") REFERENCES "EnterprisePurchaseReceipt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PharmacyPaymentExtension"
  ADD CONSTRAINT "PharmacyPaymentExtension_pharmacySaleId_fkey"
  FOREIGN KEY ("pharmacySaleId") REFERENCES "PharmacySale"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PharmacyPaymentExtension"
  ADD CONSTRAINT "PharmacyPaymentExtension_pharmacyInvoiceId_fkey"
  FOREIGN KEY ("pharmacyInvoiceId") REFERENCES "PharmacyInvoice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseSectorInventoryEvent"
  ADD CONSTRAINT "EnterpriseSectorInventoryEvent_inventoryItemId_fkey"
  FOREIGN KEY ("organizationId", "inventoryItemId")
  REFERENCES "EnterpriseInventoryItem"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseSectorInventoryEvent"
  ADD CONSTRAINT "EnterpriseSectorInventoryEvent_valuationId_fkey"
  FOREIGN KEY ("organizationId", "valuationId")
  REFERENCES "EnterpriseInventoryAccountingEvent"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseSectorInventoryEvent"
  ADD CONSTRAINT "EnterpriseSectorInventoryEvent_journalEntryId_fkey"
  FOREIGN KEY ("organizationId", "journalEntryId")
  REFERENCES "EnterpriseJournalEntry"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HealthInvoicePayerComponent"
  ADD CONSTRAINT "HealthInvoicePayerComponent_receivableId_fkey"
  FOREIGN KEY ("organizationId", "receivableId")
  REFERENCES "EnterpriseReceivable"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HealthPayerAllocation"
  ADD CONSTRAINT "HealthPayerAllocation_paymentAllocationId_fkey"
  FOREIGN KEY ("organizationId", "paymentAllocationId")
  REFERENCES "EnterprisePaymentAllocation"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
