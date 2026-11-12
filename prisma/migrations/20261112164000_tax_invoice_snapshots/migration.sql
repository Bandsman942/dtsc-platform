-- Retain historically applied rates and jurisdictions on newly created invoice lines.
-- Existing invoices remain untouched (nullable legacy snapshots).
ALTER TABLE "EnterpriseSalesInvoiceItem"
  ADD COLUMN "taxRateApplied" DECIMAL(12, 8),
  ADD COLUMN "taxJurisdiction" TEXT,
  ADD COLUMN "taxTemplateVersion" TEXT;
