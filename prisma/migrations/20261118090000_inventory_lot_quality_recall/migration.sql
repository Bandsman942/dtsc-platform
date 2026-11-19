-- Additive lot quality evidence and permanent recall safety guard.
ALTER TABLE "EnterpriseStockLot" ADD COLUMN "qualityReason" TEXT,
  ADD COLUMN "qualityChangedByUserId" TEXT,
  ADD COLUMN "qualityChangedAt" TIMESTAMP(3),
  ADD COLUMN "recallReference" TEXT;
CREATE INDEX "stock_lot_recall_lookup_idx" ON "EnterpriseStockLot" ("organizationId","inventoryItemId","lotNumber","recallReference");
ALTER TABLE "EnterpriseStockLot" ADD CONSTRAINT "stock_lot_recall_quarantine_check"
  CHECK ("recallReference" IS NULL OR ("status" = 'QUARANTINED' AND "qualityReason" IS NOT NULL AND "qualityChangedByUserId" IS NOT NULL AND "qualityChangedAt" IS NOT NULL));
CREATE FUNCTION dtsc_guard_recalled_stock_lot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."recallReference" IS NOT NULL AND
      (NEW."recallReference" IS DISTINCT FROM OLD."recallReference" OR NEW."status" <> 'QUARANTINED'
       OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
       OR NEW."inventoryItemId" IS DISTINCT FROM OLD."inventoryItemId"
       OR NEW."lotNumber" IS DISTINCT FROM OLD."lotNumber") THEN
      RAISE EXCEPTION 'inventory_lot_recall_guard' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."recallReference" IS NULL AND EXISTS (
    SELECT 1 FROM "EnterpriseStockLot" l WHERE l."organizationId" = NEW."organizationId"
      AND l."inventoryItemId" = NEW."inventoryItemId" AND l."lotNumber" = NEW."lotNumber"
      AND l."recallReference" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'inventory_lot_recall_guard' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stock_lot_recall_guard BEFORE INSERT OR UPDATE ON "EnterpriseStockLot"
FOR EACH ROW EXECUTE FUNCTION dtsc_guard_recalled_stock_lot();
