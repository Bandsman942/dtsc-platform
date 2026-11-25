-- Evidence only: no backfill, treasury movement, balance update or posting.
ALTER TABLE "EnterpriseCashDiscrepancy" ADD COLUMN "canonicalTreasuryTransactionId" TEXT;
CREATE UNIQUE INDEX "CashVariance_canonical_transaction_key"
  ON "EnterpriseCashDiscrepancy"("organizationId", "canonicalTreasuryTransactionId");
ALTER TABLE "EnterpriseCashDiscrepancy" ADD CONSTRAINT "CashVariance_canonical_transaction_fkey"
  FOREIGN KEY ("organizationId", "canonicalTreasuryTransactionId")
  REFERENCES "EnterpriseTreasuryTransaction"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseCashDiscrepancy" ADD CONSTRAINT "CashVariance_canonical_status_check"
  CHECK (("status" = 'RESOLVED_CANONICAL') = ("canonicalTreasuryTransactionId" IS NOT NULL));
