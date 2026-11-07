-- The canonical invoice and Finance payment remain the sole authorities.
-- These tables preserve boutique/warehouse provenance and stock line links.
CREATE TABLE "EnterpriseRetailInvoiceCheckout" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "salesInvoiceId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "preparedByUserId" TEXT NOT NULL,
  "stockPostedAt" TIMESTAMP(3),
  "stockPostedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseRetailInvoiceCheckout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailInvoiceCheckoutLine" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "checkoutId" TEXT NOT NULL,
  "invoiceItemId" TEXT NOT NULL,
  "inventoryItemId" TEXT,
  "stockLotId" TEXT,
  CONSTRAINT "EnterpriseRetailInvoiceCheckoutLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailInvoiceCheckout_organizationId_id_key" ON "EnterpriseRetailInvoiceCheckout"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailInvoiceCheckout_organizationId_salesInvoice_key" ON "EnterpriseRetailInvoiceCheckout"("organizationId", "salesInvoiceId");
CREATE UNIQUE INDEX "EnterpriseRetailInvoiceCheckout_organizationId_idempotencyK_key" ON "EnterpriseRetailInvoiceCheckout"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseRetailInvoiceCheckout_organizationId_siteId_creat_idx" ON "EnterpriseRetailInvoiceCheckout"("organizationId", "siteId", "createdAt");
CREATE INDEX "EnterpriseRetailInvoiceCheckout_organizationId_warehouseId__idx" ON "EnterpriseRetailInvoiceCheckout"("organizationId", "warehouseId", "stockPostedAt");
CREATE UNIQUE INDEX "EnterpriseRetailInvoiceCheckoutLine_organizationId_id_key" ON "EnterpriseRetailInvoiceCheckoutLine"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailInvoiceCheckoutLine_organizationId_invoiceI_key" ON "EnterpriseRetailInvoiceCheckoutLine"("organizationId", "invoiceItemId");
CREATE INDEX "EnterpriseRetailInvoiceCheckoutLine_organizationId_checkout_idx" ON "EnterpriseRetailInvoiceCheckoutLine"("organizationId", "checkoutId");
CREATE INDEX "EnterpriseRetailInvoiceCheckoutLine_organizationId_inventor_idx" ON "EnterpriseRetailInvoiceCheckoutLine"("organizationId", "inventoryItemId", "stockLotId");

ALTER TABLE "EnterpriseRetailInvoiceCheckout" ADD CONSTRAINT "EnterpriseRetailInvoiceCheckout_organizationId_salesInvoic_fkey" FOREIGN KEY ("organizationId", "salesInvoiceId") REFERENCES "EnterpriseSalesInvoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailInvoiceCheckout" ADD CONSTRAINT "EnterpriseRetailInvoiceCheckout_organizationId_siteId_fkey" FOREIGN KEY ("organizationId", "siteId") REFERENCES "EnterpriseSite"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailInvoiceCheckout" ADD CONSTRAINT "EnterpriseRetailInvoiceCheckout_organizationId_warehouseId_fkey" FOREIGN KEY ("organizationId", "warehouseId") REFERENCES "EnterpriseWarehouse"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailInvoiceCheckoutLine" ADD CONSTRAINT "EnterpriseRetailInvoiceCheckoutLine_organizationId_checkou_fkey" FOREIGN KEY ("organizationId", "checkoutId") REFERENCES "EnterpriseRetailInvoiceCheckout"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailInvoiceCheckoutLine" ADD CONSTRAINT "EnterpriseRetailInvoiceCheckoutLine_organizationId_invoice_fkey" FOREIGN KEY ("organizationId", "invoiceItemId") REFERENCES "EnterpriseSalesInvoiceItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
