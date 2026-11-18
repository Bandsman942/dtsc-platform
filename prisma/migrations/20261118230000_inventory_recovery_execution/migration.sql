-- Additive execution evidence; no backfill or historical journal mutation.
ALTER TABLE "EnterpriseInventoryReturnRecoveryAssessment"
 ADD COLUMN "executedAt" TIMESTAMP(3), ADD COLUMN "executedByUserId" TEXT,
 ADD COLUMN "releaseEvidence" TEXT, ADD COLUMN "recoveryMovementId" TEXT,
 ADD COLUMN "recoveryAccountingEventId" TEXT, ADD COLUMN "recoveryJournalEntryId" TEXT;
ALTER TABLE "EnterpriseInventoryReturnRecoveryAssessment" DROP CONSTRAINT "inv_recovery_state_check";
ALTER TABLE "EnterpriseInventoryReturnRecoveryAssessment" ADD CONSTRAINT "inv_recovery_state_check"
 CHECK ("status" IN ('PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED','EXECUTED') AND (("status"='PENDING_APPROVAL' AND "decidedAt" IS NULL) OR ("status"<>'PENDING_APPROVAL' AND "decidedAt" IS NOT NULL)));
ALTER TABLE "EnterpriseInventoryReturnRecoveryAssessment" ADD CONSTRAINT "inv_recovery_execution_check"
 CHECK (("status"='EXECUTED' AND "executedAt" IS NOT NULL AND "executedAt">="decidedAt" AND "executedByUserId" IS NOT NULL AND "executedByUserId"="assessedByUserId"
 AND "releaseEvidence" IS NOT NULL AND length(btrim("releaseEvidence"))>=8 AND "recoveryMovementId" IS NOT NULL AND "recoveryAccountingEventId" IS NOT NULL AND "recoveryJournalEntryId" IS NOT NULL)
 OR ("status"<>'EXECUTED' AND "executedAt" IS NULL AND "executedByUserId" IS NULL AND "releaseEvidence" IS NULL AND "recoveryMovementId" IS NULL AND "recoveryAccountingEventId" IS NULL AND "recoveryJournalEntryId" IS NULL));
CREATE UNIQUE INDEX "inv_recovery_movement_key" ON "EnterpriseInventoryReturnRecoveryAssessment" ("organizationId","recoveryMovementId");
CREATE UNIQUE INDEX "inv_recovery_event_key" ON "EnterpriseInventoryReturnRecoveryAssessment" ("organizationId","recoveryAccountingEventId");
CREATE UNIQUE INDEX "inv_recovery_journal_key" ON "EnterpriseInventoryReturnRecoveryAssessment" ("organizationId","recoveryJournalEntryId");
DROP INDEX "inv_recovery_one_live_custody_idx";
CREATE UNIQUE INDEX "inv_recovery_one_live_custody_idx" ON "EnterpriseInventoryReturnRecoveryAssessment" ("organizationId","custodyId") WHERE "status" IN ('PENDING_APPROVAL','APPROVED','EXECUTED');
ALTER TABLE "EnterpriseInventoryReturnCustody" DROP CONSTRAINT "inv_return_custody_status_check";
ALTER TABLE "EnterpriseInventoryReturnCustody" ADD CONSTRAINT "inv_return_custody_status_check" CHECK (
 "status" IN ('QUARANTINED','DISPOSAL_PENDING','DISPOSED','RECOVERED') AND
 ("status" NOT IN ('DISPOSAL_PENDING','DISPOSED') OR ("disposalRequestedByUserId" IS NOT NULL AND "disposalRequestedAt" IS NOT NULL AND "disposalReason" IS NOT NULL)) AND
 ("status" <> 'DISPOSED' OR ("disposedByUserId" IS NOT NULL AND "disposedAt" IS NOT NULL AND "disposalEvidence" IS NOT NULL AND "disposedByUserId" <> "disposalRequestedByUserId")) AND
 ("status" <> 'RECOVERED' OR ("disposition"='QUARANTINE' AND "disposedAt" IS NULL AND "disposalRequestedAt" IS NULL))
);
