-- Keep the original approval immutable. Cancellation before any dispatch
-- is a separate business action; legacy pending cancellations remain valid.
ALTER TABLE "EnterpriseSupplierReturnRequest"
  ADD COLUMN "cancelledAfterApprovalAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAfterApprovalByUserId" TEXT,
  ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "EnterpriseSupplierReturnRequest" ADD CONSTRAINT "supplier_return_approved_withdrawal_check"
  CHECK (("cancelledAfterApprovalAt" IS NULL AND "cancelledAfterApprovalByUserId" IS NULL AND "cancellationReason" IS NULL)
    OR ("status" = 'CANCELLED' AND "decidedAt" IS NOT NULL AND "cancelledAfterApprovalAt" IS NOT NULL
      AND "cancelledAfterApprovalByUserId" = "requestedByUserId" AND "cancelledAfterApprovalByUserId" IS NOT NULL
      AND "cancellationReason" IS NOT NULL AND length(btrim("cancellationReason")) >= 8
      AND "cancelledAfterApprovalAt" >= "decidedAt"));
