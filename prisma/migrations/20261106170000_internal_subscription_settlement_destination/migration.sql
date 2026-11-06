-- P0 #992: explicit internal DTSC subscription settlement destination.
-- Historical requests stay nullable. No backfill or implicit approval.
ALTER TABLE "ManualSubscriptionPayment" ADD COLUMN "settlementAccountId" TEXT;
CREATE INDEX "ManualSubscriptionPayment_settlementAccountId_status_idx" ON "ManualSubscriptionPayment"("settlementAccountId", "status");
ALTER TABLE "ManualSubscriptionPayment" ADD CONSTRAINT "ManualSubscriptionPayment_settlementAccountId_fkey"
  FOREIGN KEY ("settlementAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
