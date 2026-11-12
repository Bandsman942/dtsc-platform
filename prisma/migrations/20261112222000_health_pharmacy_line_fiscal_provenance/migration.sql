-- #1124: source-line tax provenance must precede Finance fiscal projection.
-- Additive only; legacy header-only taxes remain blocked from convergence.
ALTER TABLE "HealthMedicalInvoiceItem"
  ADD COLUMN "taxCodeId" TEXT,
  ADD COLUMN "taxRateApplied" DECIMAL(12,8),
  ADD COLUMN "taxJurisdiction" TEXT,
  ADD COLUMN "taxTemplateVersion" TEXT,
  ADD COLUMN "taxEvidenceReference" TEXT,
  ADD COLUMN "taxCalculationMode" TEXT NOT NULL DEFAULT 'NET',
  ADD COLUMN "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxBreakdownJson" JSONB;
ALTER TABLE "PharmacySaleLine"
  ADD COLUMN "taxCodeId" TEXT,
  ADD COLUMN "taxRateApplied" DECIMAL(12,8),
  ADD COLUMN "taxJurisdiction" TEXT,
  ADD COLUMN "taxTemplateVersion" TEXT,
  ADD COLUMN "taxEvidenceReference" TEXT,
  ADD COLUMN "taxCalculationMode" TEXT NOT NULL DEFAULT 'NET',
  ADD COLUMN "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxBreakdownJson" JSONB;
