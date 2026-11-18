ALTER TABLE "EnterpriseStockAdjustment" ADD COLUMN "lossReason" TEXT;
ALTER TABLE "EnterpriseStockAdjustment" ADD CONSTRAINT "stock_adjustment_loss_reason_check" CHECK ("lossReason" IS NULL OR ("lossReason" IN ('EXPIRY','DAMAGE','RECALL','DESTRUCTION') AND "adjustmentType" = 'OUT' AND "stockLotId" IS NOT NULL));
