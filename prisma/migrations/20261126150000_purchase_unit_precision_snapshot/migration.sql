-- #1228: freeze the unit precision of newly prepared purchase lines.
-- Historical rows deliberately remain NULL; never infer past precision.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE "EnterprisePurchaseItemCatalogLink"
  ADD COLUMN "unitDecimalScale" INTEGER,
  ADD COLUMN "unitCodeSnapshot" TEXT,
  ADD CONSTRAINT "purchase_item_unit_snapshot_ck" CHECK (
    ("unitDecimalScale" IS NULL AND "unitCodeSnapshot" IS NULL)
    OR ("unitDecimalScale" IS NOT NULL AND "unitDecimalScale" BETWEEN 0 AND 6
      AND "unitCodeSnapshot" IS NOT NULL AND length(btrim("unitCodeSnapshot")) > 0
      AND "unitOfMeasureId" IS NOT NULL)
  );
COMMIT;
