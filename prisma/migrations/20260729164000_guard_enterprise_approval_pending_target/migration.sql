-- Sprint 6 — keep the simple approval model race-safe.
-- Multi-step approval policies belong to Sprint 9; a target can have at most
-- one active PENDING approval at a time.

CREATE UNIQUE INDEX "EnterpriseApproval_one_pending_per_target_key"
ON "EnterpriseApproval" ("organizationId", "targetEntityType", "targetEntityId")
WHERE "status" = 'PENDING' AND "archivedAt" IS NULL;
