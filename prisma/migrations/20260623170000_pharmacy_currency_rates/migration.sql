CREATE TABLE "PharmacyCurrencyRate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "symbol" TEXT,
  "isBase" BOOLEAN NOT NULL DEFAULT false,
  "rateToBase" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "roundingScale" INTEGER NOT NULL DEFAULT 2,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyCurrencyRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PharmacyCurrencyRate_organizationId_code_key" ON "PharmacyCurrencyRate"("organizationId", "code");
CREATE INDEX "PharmacyCurrencyRate_organizationId_active_idx" ON "PharmacyCurrencyRate"("organizationId", "active");
CREATE INDEX "PharmacyCurrencyRate_organizationId_isBase_idx" ON "PharmacyCurrencyRate"("organizationId", "isBase");

ALTER TABLE "PharmacyPurchaseOrder"
  ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "exchangeRateToBase" DECIMAL(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN "estimatedTotalBase" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "PharmacyReceipt"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "exchangeRateToBase" DECIMAL(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN "totalAmountBase" DECIMAL(14,2);

ALTER TABLE "PharmacySale"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "exchangeRateToBase" DECIMAL(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN "subtotalBase" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "totalAmountBase" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "paidAmountBase" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "remainingAmountBase" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "PharmacyPurchaseOrder"
SET "baseCurrency" = "currency",
    "exchangeRateToBase" = 1,
    "estimatedTotalBase" = "estimatedTotal";

UPDATE "PharmacyReceipt"
SET "totalAmountBase" = "totalAmount"
WHERE "totalAmount" IS NOT NULL;

UPDATE "PharmacySale"
SET "baseCurrency" = "currency",
    "exchangeRateToBase" = 1,
    "subtotalBase" = "subtotal",
    "totalAmountBase" = "totalAmount",
    "paidAmountBase" = "paidAmount",
    "remainingAmountBase" = "remainingAmount";
