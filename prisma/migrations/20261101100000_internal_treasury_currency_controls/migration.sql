-- Historical accounts must be certified; never backfill arbitrary currencies.
ALTER TABLE "FinancialAccount"
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "reconciliationIssue" TEXT;

CREATE INDEX "FinancialAccount_currency_status_idx"
  ON "FinancialAccount" ("currency", "status");
