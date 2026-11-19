-- Separate withdrawal proof preserves the original independent approval.
ALTER TABLE "EnterpriseInventoryReturnRecoveryAssessment"
 ADD COLUMN "withdrawnAt" TIMESTAMP(3),
 ADD COLUMN "withdrawnByUserId" TEXT,
 ADD COLUMN "withdrawalReason" TEXT;
ALTER TABLE "EnterpriseInventoryReturnRecoveryAssessment" ADD CONSTRAINT "inv_recovery_withdrawal_check"
 CHECK (("withdrawnAt" IS NULL AND "withdrawnByUserId" IS NULL AND "withdrawalReason" IS NULL) OR
 ("status"='CANCELLED' AND "decidedAt" IS NOT NULL AND "withdrawnAt" IS NOT NULL AND "withdrawnAt">="decidedAt"
 AND "withdrawnByUserId" IS NOT NULL AND "withdrawnByUserId"="assessedByUserId"
 AND "withdrawalReason" IS NOT NULL AND length(btrim("withdrawalReason"))>=8));
