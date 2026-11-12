-- #1124: additive fiscal evidence, multi-tax snapshots and credit-note provenance.
-- No historical invoices, amounts or issued documents are recalculated.
ALTER TABLE "EnterpriseSalesInvoiceItem"
  ADD COLUMN "taxEvidenceReference" TEXT,
  ADD COLUMN "taxCalculationMode" TEXT NOT NULL DEFAULT 'NET',
  ADD COLUMN "taxBreakdownJson" JSONB;
ALTER TABLE "EnterpriseSupplierInvoice"
  ADD COLUMN "taxRecoveryVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "taxRecoveryVerifiedByUserId" TEXT;
ALTER TABLE "EnterpriseSupplierInvoiceItem"
  ADD COLUMN "taxRateApplied" DECIMAL(12,8),
  ADD COLUMN "taxJurisdiction" TEXT,
  ADD COLUMN "taxTemplateVersion" TEXT,
  ADD COLUMN "taxEvidenceReference" TEXT,
  ADD COLUMN "taxCalculationMode" TEXT NOT NULL DEFAULT 'NET',
  ADD COLUMN "taxRecoveryRequested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "taxBreakdownJson" JSONB;
ALTER TABLE "EnterpriseSalesCreditNoteItem" ADD COLUMN "sourceInvoiceItemId" TEXT;
ALTER TABLE "EnterpriseSupplierCreditNoteItem"
  ADD COLUMN "sourceInvoiceItemId" TEXT,
  ADD COLUMN "taxRecoveryRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EnterpriseTaxLine"
  ADD COLUMN "applicationOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "basisMode" TEXT NOT NULL DEFAULT 'NET',
  ADD COLUMN "jurisdiction" TEXT,
  ADD COLUMN "taxTreatment" TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "evidenceReference" TEXT,
  ADD COLUMN "templateVersion" TEXT,
  ADD COLUMN "effectiveAt" TIMESTAMP(3);
CREATE INDEX "EnterpriseSalesCreditNoteItem_organizationId_sourceInvoiceItemId_idx" ON "EnterpriseSalesCreditNoteItem"("organizationId", "sourceInvoiceItemId");
CREATE INDEX "EnterpriseSupplierCreditNoteItem_organizationId_sourceInvoiceItemId_idx" ON "EnterpriseSupplierCreditNoteItem"("organizationId", "sourceInvoiceItemId");
CREATE INDEX "EnterpriseSupplierInvoiceItem_organizationId_taxRecoveryRequested_idx" ON "EnterpriseSupplierInvoiceItem"("organizationId", "taxRecoveryRequested");
