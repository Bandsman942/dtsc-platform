-- Hotfix #758: user-facing labels for fiscal masters.
-- Additive and nullable for historical compatibility.

ALTER TABLE "EnterpriseFiscalYear" ADD COLUMN "label" TEXT;
ALTER TABLE "EnterpriseFiscalPeriod" ADD COLUMN "label" TEXT;
