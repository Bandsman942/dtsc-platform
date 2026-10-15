-- Additive recovery metadata. Existing runs and action receipts are preserved.
ALTER TABLE "EnterpriseWorkflowRun"
  ADD COLUMN "executionToken" TEXT,
  ADD COLUMN "executionLeaseUntil" TIMESTAMP(3);
CREATE INDEX "EnterpriseWorkflowRun_status_executionLeaseUntil_updatedAt_idx"
  ON "EnterpriseWorkflowRun"("status", "executionLeaseUntil", "updatedAt");
ALTER TABLE "EnterpriseWorkflowActionAttempt" ADD COLUMN "effectProtocol" TEXT;

-- Widen the existing check; no historical rows or statuses are removed.
ALTER TABLE "EnterpriseWorkflowActionAttempt" DROP CONSTRAINT "EnterpriseWorkflowActionAttempt_status_check";
ALTER TABLE "EnterpriseWorkflowActionAttempt" ADD CONSTRAINT "EnterpriseWorkflowActionAttempt_status_check"
  CHECK ("status" IN ('PENDING','RUNNING','SUCCEEDED','FAILED','UNCERTAIN'));
