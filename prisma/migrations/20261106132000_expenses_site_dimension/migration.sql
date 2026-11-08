-- Optional dimension preserves old expenses as unattributed. A shop's expenses
-- may be attributed to a specific site without changing its posting source.
ALTER TABLE "EnterpriseExpense" ADD COLUMN "siteId" TEXT;
CREATE INDEX "EnterpriseExpense_organizationId_siteId_expenseDate_idx"
  ON "EnterpriseExpense"("organizationId", "siteId", "expenseDate");
ALTER TABLE "EnterpriseExpense"
  ADD CONSTRAINT "EnterpriseExpense_organizationId_siteId_fkey"
  FOREIGN KEY ("organizationId", "siteId") REFERENCES "EnterpriseSite"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
