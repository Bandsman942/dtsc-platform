-- Additive appraisal evidence only; no stock, cost layer, or journal mutation.
CREATE TABLE "EnterpriseInventoryReturnRecoveryAssessment" (
 "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "custodyId" TEXT NOT NULL, "reference" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL', "custodyRevision" INTEGER NOT NULL, "quantity" DECIMAL(20,6) NOT NULL,
 "historicalCostCeiling" DECIMAL(20,6) NOT NULL, "estimatedSellingAmount" DECIMAL(20,6) NOT NULL,
 "completionCost" DECIMAL(20,6) NOT NULL, "sellingCost" DECIMAL(20,6) NOT NULL, "estimatedNetValue" DECIMAL(20,6) NOT NULL,
 "proposedRecoveryAmount" DECIMAL(20,6) NOT NULL, "currencyCode" TEXT NOT NULL, "originalIssueEventId" TEXT NOT NULL,
 "originalIssueJournalId" TEXT NOT NULL, "evidenceReference" TEXT NOT NULL, "findings" TEXT NOT NULL,
 "assessedByUserId" TEXT NOT NULL, "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "decidedAt" TIMESTAMP(3), "revision" INTEGER NOT NULL DEFAULT 1, "idempotencyKey" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "EnterpriseInventoryReturnRecoveryAssessment_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "inv_recovery_state_check" CHECK ("status" IN ('PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED') AND (("status"='PENDING_APPROVAL' AND "decidedAt" IS NULL) OR ("status"<>'PENDING_APPROVAL' AND "decidedAt" IS NOT NULL))),
 CONSTRAINT "inv_recovery_amount_check" CHECK ("quantity">0 AND "historicalCostCeiling">0 AND "estimatedSellingAmount">=0 AND "completionCost">=0 AND "sellingCost">=0 AND "estimatedNetValue"=GREATEST(0,"estimatedSellingAmount"-"completionCost"-"sellingCost") AND "proposedRecoveryAmount"=LEAST("historicalCostCeiling","estimatedNetValue") AND "proposedRecoveryAmount">0),
 CONSTRAINT "inv_recovery_evidence_check" CHECK (length(btrim("evidenceReference"))>=5 AND length(btrim("findings"))>=20 AND "custodyRevision">0 AND "revision">0)
);
CREATE UNIQUE INDEX "inv_recovery_org_id_key" ON "EnterpriseInventoryReturnRecoveryAssessment" ("organizationId","id");
CREATE UNIQUE INDEX "inv_recovery_reference_key" ON "EnterpriseInventoryReturnRecoveryAssessment" ("organizationId","reference");
CREATE UNIQUE INDEX "inv_recovery_idempotency_key" ON "EnterpriseInventoryReturnRecoveryAssessment" ("organizationId","idempotencyKey");
CREATE INDEX "inv_recovery_custody_status_idx" ON "EnterpriseInventoryReturnRecoveryAssessment" ("organizationId","custodyId","status");
CREATE UNIQUE INDEX "inv_recovery_one_live_custody_idx" ON "EnterpriseInventoryReturnRecoveryAssessment" ("organizationId","custodyId") WHERE "status" IN ('PENDING_APPROVAL','APPROVED');
ALTER TABLE "EnterpriseInventoryReturnRecoveryAssessment" ADD CONSTRAINT "inv_recovery_custody_fk" FOREIGN KEY ("organizationId","custodyId") REFERENCES "EnterpriseInventoryReturnCustody" ("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
