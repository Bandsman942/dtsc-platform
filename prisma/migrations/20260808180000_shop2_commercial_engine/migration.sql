-- Shop 2.0 iteration 2: additive pricing conditions, promotions, pricing decisions and partial returns/refunds.

CREATE TABLE "EnterpriseRetailPriceCondition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "catalogPriceId" TEXT NOT NULL,
    "siteId" TEXT,
    "customerBusinessPartyId" TEXT,
    "customerSegmentCode" TEXT,
    "minQuantity" DECIMAL(20,6),
    "maxQuantity" DECIMAL(20,6),
    "channelCode" TEXT NOT NULL DEFAULT 'POS',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseRetailPriceCondition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailPromotion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "promotionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stackMode" TEXT NOT NULL DEFAULT 'EXCLUSIVE',
    "couponCode" TEXT,
    "siteId" TEXT,
    "customerSegmentCode" TEXT,
    "currencyCode" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "conditionsJson" JSONB,
    "actionJson" JSONB NOT NULL,
    "usageLimit" INTEGER,
    "perCustomerLimit" INTEGER,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseRetailPromotion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailPromotionRedemption" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "customerBusinessPartyId" TEXT,
    "couponCode" TEXT,
    "discountAmount" DECIMAL(20,6) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseRetailPromotionRedemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailPricingDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "catalogPriceId" TEXT,
    "quantity" DECIMAL(20,6) NOT NULL,
    "baseUnitPrice" DECIMAL(20,6) NOT NULL,
    "resolvedUnitPrice" DECIMAL(20,6) NOT NULL,
    "discountAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "taxCodeId" TEXT,
    "taxRate" DECIMAL(12,8) NOT NULL DEFAULT 0,
    "taxIncluded" BOOLEAN NOT NULL DEFAULT false,
    "taxAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(20,6) NOT NULL,
    "pricingSource" TEXT NOT NULL,
    "promotionIdsJson" JSONB,
    "contextJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseRetailPricingDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailReturn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "returnType" TEXT NOT NULL DEFAULT 'RETURN',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "reason" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "subtotal" DECIMAL(20,6) NOT NULL,
    "discountTotal" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(20,6) NOT NULL,
    "refundMethod" TEXT NOT NULL,
    "refundFinancialAccountId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "completedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseRetailReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailReturnLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleLineId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitPrice" DECIMAL(20,6) NOT NULL,
    "discountAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(20,6) NOT NULL,
    "stockDisposition" TEXT NOT NULL DEFAULT 'RESTOCK',
    "stockMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseRetailReturnLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailRefund" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "methodType" TEXT NOT NULL,
    "financialAccountId" TEXT,
    "currencyCode" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "reference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseRetailRefund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailPriceCondition_organizationId_id_key" ON "EnterpriseRetailPriceCondition"("organizationId", "id");
CREATE INDEX "EnterpriseRetailPriceCondition_catalogPrice_idx" ON "EnterpriseRetailPriceCondition"("organizationId", "catalogPriceId", "isActive");
CREATE INDEX "EnterpriseRetailPriceCondition_site_channel_idx" ON "EnterpriseRetailPriceCondition"("organizationId", "siteId", "channelCode", "isActive");
CREATE INDEX "EnterpriseRetailPriceCondition_customer_idx" ON "EnterpriseRetailPriceCondition"("organizationId", "customerBusinessPartyId", "isActive");
CREATE INDEX "EnterpriseRetailPriceCondition_segment_idx" ON "EnterpriseRetailPriceCondition"("organizationId", "customerSegmentCode", "isActive");

CREATE UNIQUE INDEX "EnterpriseRetailPromotion_organizationId_id_key" ON "EnterpriseRetailPromotion"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailPromotion_organizationId_code_key" ON "EnterpriseRetailPromotion"("organizationId", "code");
CREATE INDEX "EnterpriseRetailPromotion_status_window_idx" ON "EnterpriseRetailPromotion"("organizationId", "status", "startsAt", "endsAt");
CREATE INDEX "EnterpriseRetailPromotion_coupon_idx" ON "EnterpriseRetailPromotion"("organizationId", "couponCode", "status");
CREATE INDEX "EnterpriseRetailPromotion_site_idx" ON "EnterpriseRetailPromotion"("organizationId", "siteId", "status");

CREATE UNIQUE INDEX "EnterpriseRetailPromotionRedemption_organizationId_id_key" ON "EnterpriseRetailPromotionRedemption"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailPromotionRedemption_idempotency_key" ON "EnterpriseRetailPromotionRedemption"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseRetailPromotionRedemption_promotion_idx" ON "EnterpriseRetailPromotionRedemption"("organizationId", "promotionId", "createdAt");
CREATE INDEX "EnterpriseRetailPromotionRedemption_sale_idx" ON "EnterpriseRetailPromotionRedemption"("organizationId", "saleId");
CREATE INDEX "EnterpriseRetailPromotionRedemption_customer_idx" ON "EnterpriseRetailPromotionRedemption"("organizationId", "customerBusinessPartyId", "createdAt");

CREATE UNIQUE INDEX "EnterpriseRetailPricingDecision_organizationId_id_key" ON "EnterpriseRetailPricingDecision"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailPricingDecision_sale_item_key" ON "EnterpriseRetailPricingDecision"("organizationId", "saleId", "catalogItemId");
CREATE INDEX "EnterpriseRetailPricingDecision_price_idx" ON "EnterpriseRetailPricingDecision"("organizationId", "catalogPriceId", "createdAt");
CREATE INDEX "EnterpriseRetailPricingDecision_item_idx" ON "EnterpriseRetailPricingDecision"("organizationId", "catalogItemId", "createdAt");

CREATE UNIQUE INDEX "EnterpriseRetailReturn_organizationId_id_key" ON "EnterpriseRetailReturn"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailReturn_organizationId_number_key" ON "EnterpriseRetailReturn"("organizationId", "number");
CREATE UNIQUE INDEX "EnterpriseRetailReturn_idempotency_key" ON "EnterpriseRetailReturn"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseRetailReturn_sale_status_idx" ON "EnterpriseRetailReturn"("organizationId", "saleId", "status");
CREATE INDEX "EnterpriseRetailReturn_created_status_idx" ON "EnterpriseRetailReturn"("organizationId", "createdAt", "status");

CREATE UNIQUE INDEX "EnterpriseRetailReturnLine_organizationId_id_key" ON "EnterpriseRetailReturnLine"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailReturnLine_return_saleLine_key" ON "EnterpriseRetailReturnLine"("organizationId", "returnId", "saleLineId");
CREATE INDEX "EnterpriseRetailReturnLine_saleLine_idx" ON "EnterpriseRetailReturnLine"("organizationId", "saleLineId");
CREATE INDEX "EnterpriseRetailReturnLine_catalog_idx" ON "EnterpriseRetailReturnLine"("organizationId", "catalogItemId");

CREATE UNIQUE INDEX "EnterpriseRetailRefund_organizationId_id_key" ON "EnterpriseRetailRefund"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailRefund_idempotency_key" ON "EnterpriseRetailRefund"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseRetailRefund_return_status_idx" ON "EnterpriseRetailRefund"("organizationId", "returnId", "status");
CREATE INDEX "EnterpriseRetailRefund_account_idx" ON "EnterpriseRetailRefund"("organizationId", "financialAccountId", "createdAt");

ALTER TABLE "EnterpriseRetailPriceCondition"
  ADD CONSTRAINT "EnterpriseRetailPriceCondition_catalogPrice_fkey"
  FOREIGN KEY ("organizationId", "catalogPriceId") REFERENCES "EnterpriseCatalogPrice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseRetailPromotionRedemption"
  ADD CONSTRAINT "EnterpriseRetailPromotionRedemption_promotion_fkey"
  FOREIGN KEY ("organizationId", "promotionId") REFERENCES "EnterpriseRetailPromotion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailPromotionRedemption"
  ADD CONSTRAINT "EnterpriseRetailPromotionRedemption_sale_fkey"
  FOREIGN KEY ("organizationId", "saleId") REFERENCES "EnterpriseRetailSale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseRetailPricingDecision"
  ADD CONSTRAINT "EnterpriseRetailPricingDecision_sale_fkey"
  FOREIGN KEY ("organizationId", "saleId") REFERENCES "EnterpriseRetailSale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseRetailReturn"
  ADD CONSTRAINT "EnterpriseRetailReturn_sale_fkey"
  FOREIGN KEY ("organizationId", "saleId") REFERENCES "EnterpriseRetailSale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseRetailReturnLine"
  ADD CONSTRAINT "EnterpriseRetailReturnLine_return_fkey"
  FOREIGN KEY ("organizationId", "returnId") REFERENCES "EnterpriseRetailReturn"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailReturnLine"
  ADD CONSTRAINT "EnterpriseRetailReturnLine_saleLine_fkey"
  FOREIGN KEY ("organizationId", "saleLineId") REFERENCES "EnterpriseRetailSaleLine"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseRetailRefund"
  ADD CONSTRAINT "EnterpriseRetailRefund_return_fkey"
  FOREIGN KEY ("organizationId", "returnId") REFERENCES "EnterpriseRetailReturn"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
