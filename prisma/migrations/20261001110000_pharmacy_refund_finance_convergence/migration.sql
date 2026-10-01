-- Hotfix #728: durable Pharmacy refund -> common Finance mapping.
-- No legacy Pharmacy refund rows are rewritten or guessed by this migration.

CREATE TABLE "PharmacyRefundExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pharmacyRefundId" TEXT,
  "pharmacySaleRefundId" TEXT,
  "pharmacySaleId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "salesCreditNoteId" TEXT,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyRefundExtension_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PharmacyRefundExtension_organizationId_id_key"
  ON "PharmacyRefundExtension"("organizationId", "id");
CREATE UNIQUE INDEX "PharmacyRefundExtension_organizationId_pharmacyRefundId_key"
  ON "PharmacyRefundExtension"("organizationId", "pharmacyRefundId");
CREATE UNIQUE INDEX "PharmacyRefundExtension_organizationId_pharmacySaleRefundId_key"
  ON "PharmacyRefundExtension"("organizationId", "pharmacySaleRefundId");
CREATE UNIQUE INDEX "PharmacyRefundExtension_organizationId_paymentId_key"
  ON "PharmacyRefundExtension"("organizationId", "paymentId");
CREATE INDEX "PharmacyRefundExtension_organizationId_pharmacySaleId_idx"
  ON "PharmacyRefundExtension"("organizationId", "pharmacySaleId");
CREATE INDEX "PharmacyRefundExtension_organizationId_salesCreditNoteId_idx"
  ON "PharmacyRefundExtension"("organizationId", "salesCreditNoteId");
CREATE INDEX "PharmacyRefundExtension_organizationId_syncStatus_idx"
  ON "PharmacyRefundExtension"("organizationId", "syncStatus");

ALTER TABLE "PharmacyRefundExtension"
  ADD CONSTRAINT "PharmacyRefundExtension_pharmacyRefundId_fkey"
  FOREIGN KEY ("pharmacyRefundId") REFERENCES "PharmacyRefund"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PharmacyRefundExtension"
  ADD CONSTRAINT "PharmacyRefundExtension_pharmacySaleRefundId_fkey"
  FOREIGN KEY ("pharmacySaleRefundId") REFERENCES "PharmacySaleRefund"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PharmacyRefundExtension"
  ADD CONSTRAINT "PharmacyRefundExtension_pharmacySaleId_fkey"
  FOREIGN KEY ("pharmacySaleId") REFERENCES "PharmacySale"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PharmacyRefundExtension"
  ADD CONSTRAINT "PharmacyRefundExtension_paymentId_fkey"
  FOREIGN KEY ("organizationId", "paymentId")
  REFERENCES "EnterprisePayment"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PharmacyRefundExtension"
  ADD CONSTRAINT "PharmacyRefundExtension_salesCreditNoteId_fkey"
  FOREIGN KEY ("organizationId", "salesCreditNoteId")
  REFERENCES "EnterpriseSalesCreditNote"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
