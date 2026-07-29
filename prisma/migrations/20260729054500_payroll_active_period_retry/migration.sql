-- Hotfix Sprint 5: keep cancelled/rejected payroll history without reserving the period forever.
-- The previous global unique index guaranteed there are no historical duplicate rows before this change.

CREATE UNIQUE INDEX IF NOT EXISTS "HrcfoPayroll_active_period_key"
  ON "HrcfoPayroll"("employeeId", "periodStart", "periodEnd")
  WHERE "status" NOT IN ('CANCELLED', 'CANCELED', 'REJECTED');

DROP INDEX IF EXISTS "HrcfoPayroll_employeeId_periodStart_periodEnd_key";

CREATE INDEX IF NOT EXISTS "HrcfoPayroll_employeeId_periodStart_periodEnd_idx"
  ON "HrcfoPayroll"("employeeId", "periodStart", "periodEnd");
